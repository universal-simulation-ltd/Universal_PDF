import {
  consumeHostedUpload,
  refundHostedUpload,
  HOSTED_BUCKET,
  type HostedUpload,
} from '@unisim/sdk'
import { buildAnnotatedPdfBytes } from './export'
import { hostedPdfPath, hostedPdfPathCandidates, newObjectId } from './hostedPaths'
import { useAnnotationStore } from '../stores/annotationStore'
import { useFormStore } from '../stores/formStore'
import { usePdfStore } from '../stores/pdfStore'

// "Hosted by UNI·SIM" cloud storage for Universal PDF. Local storage (the
// IndexedDB recents) stays free + temporary; hosting keeps a PDF online against
// the user's Universal ID for one token (subscriptions.credits), refunded on
// delete. Backend: migration 0041 + the @unisim/sdk hosted helpers.

type Supabase = Parameters<typeof consumeHostedUpload>[0]

// Annotations are baked at scale 1.0 on export, so we store the same flattened
// bytes the user would download — their drawn work travels with the file.
const EXPORT_SCALE = 1.0

/** Build the current PDF (annotations + form values baked in) as bytes — the
 *  same flattened output the user would download. Exported so "Send to sign"
 *  can attach the identical bytes to its email. */
export async function currentPdfBytes(): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { sourceBytes, fileName } = usePdfStore.getState()
  if (!sourceBytes) throw new Error('No PDF is open.')
  const annotations = useAnnotationStore.getState().annotations
  const formValues = useFormStore.getState().values
  const bytes = await buildAnnotatedPdfBytes(sourceBytes.slice(0), annotations, EXPORT_SCALE, formValues)
  return { bytes, fileName: fileName ?? 'document.pdf' }
}

export interface StoreResult {
  ok: boolean
  error?: string
  creditsRemaining?: number
  /** The hosted_uploads ledger id — "Send to sign" mints its request against
   *  this. Present on a successful store. */
  uploadId?: string
  storagePath?: string
  fileName?: string
}

/** Spend one token and store the current PDF in the cloud. Reserves the token
 *  first (so the wallet can't be over-spent), then uploads; if the upload fails
 *  the token is refunded so the user is never charged for a file that isn't
 *  there. `orgId` is the signed-in user's org (path segment that drives RLS). */
export async function storeCurrentPdf(supabase: Supabase, orgId: string): Promise<StoreResult> {
  const { bytes, fileName } = await currentPdfBytes()

  // ⚠️ NAME THE OBJECT FIRST. This used to reserve the row with a placeholder
  // `storagePath: 'pending'`, upload, then UPDATE the row with the real path —
  // and that update silently did nothing on every account that isn't the
  // platform admin, because `hosted_uploads` grants members SELECT and nothing
  // else (0041). So the ledger kept saying `pending`, the dialog listed a
  // backup, and opening it asked storage for an object named `pending`:
  // "Object not found", for a file that had uploaded perfectly. See
  // `hostedPaths.ts` for the full write-up and the legacy recovery.
  //
  // A client-side object id removes the round trip the RLS was blocking: the
  // path is known before the token is reserved, so the RPC records the truth
  // at insert time and there is no second write to fail.
  const path = hostedPdfPath(orgId, newObjectId(), fileName)

  // 1) Reserve the token + ledger row (the RPC charges the caller's primary org).
  const consumed = await consumeHostedUpload(supabase, {
    product: 'pdf',
    storagePath: path,
    fileName,
    sizeBytes: bytes.byteLength,
  })
  if (!consumed.ok || !consumed.upload_id) {
    return { ok: false, error: consumed.error ?? 'Could not reserve a token.' }
  }

  // 2) Upload to hosted-uploads/<org>/pdf/<object_id>-<stem>.pdf
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const { error: upErr } = await supabase.storage
    .from(HOSTED_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })

  if (upErr) {
    // Roll the token back so a failed upload never costs the user.
    await refundHostedUpload(supabase, consumed.upload_id)
    return { ok: false, error: upErr.message }
  }

  return {
    ok: true,
    creditsRemaining: consumed.credits,
    uploadId: consumed.upload_id,
    storagePath: path,
    fileName,
  }
}

/** Delete a hosted PDF (storage object first, then the ledger row + token
 *  refund). Idempotent — a missing row still refunds nothing extra.
 *
 *  Removes EVERY path the bytes could be under, not just the one the ledger
 *  names: a legacy row says `pending`, so deleting only that would refund the
 *  token and leave the real 50 MB object orphaned in the bucket forever, with
 *  the row that pointed at it gone. */
export async function deleteHostedPdf(supabase: Supabase, upload: HostedUpload): Promise<StoreResult> {
  // Remove the objects under the member-delete policy; ignore a "not found" so
  // a half-deleted upload can still be cleared.
  await supabase.storage.from(HOSTED_BUCKET).remove(hostedPdfPathCandidates(upload))
  const res = await refundHostedUpload(supabase, upload.id)
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not refund the token.' }
  return { ok: true, creditsRemaining: res.credits }
}

/** Open a signed copy filed by a sign-request recipient (it lives under
 *  …/pdf/signed/… with no hosted_uploads ledger row — it rides on the original
 *  upload's token). The sender is an org member, so the bucket's member-read
 *  policy allows the download. */
export async function openSignedCopy(
  supabase: Supabase,
  storagePath: string,
  docName?: string | null,
): Promise<void> {
  const { data, error } = await supabase.storage.from(HOSTED_BUCKET).download(storagePath)
  if (error || !data) throw new Error(error?.message ?? 'Could not download the signed PDF.')
  const base = (docName ?? 'document.pdf').replace(/\.pdf$/i, '')
  const file = new File([data], `${base}-signed.pdf`, { type: 'application/pdf' })
  await usePdfStore.getState().loadFile(file)
}

/**
 * Thrown when a listed backup has no object behind it anywhere we know to look.
 *
 * A distinct type so the dialog can answer honestly — name the file, say the
 * upload never completed, and offer to clear the entry and take the token back
 * — instead of surfacing storage's bare "Object not found", which reads like
 * the app has lost the user's document.
 */
export class HostedObjectMissingError extends Error {
  readonly fileName: string
  constructor(fileName: string) {
    super(`"${fileName}" is listed as backed up, but there is no file behind it.`)
    this.name = 'HostedObjectMissingError'
    this.fileName = fileName
  }
}

/**
 * Open a hosted PDF back into the editor (download → loadFile).
 *
 * Tries every candidate path in turn (see `hostedPdfPathCandidates`), so the
 * backups the old three-step store flow filed as `pending` still open: their
 * bytes are in the bucket under the name the uploader used, which is fully
 * recoverable from the row itself. Only when nothing is there does this throw
 * — as `HostedObjectMissingError`, so the caller can offer the cleanup.
 */
export async function openHostedPdf(supabase: Supabase, upload: HostedUpload): Promise<void> {
  const name = upload.file_name ?? 'document.pdf'
  let lastError: string | null = null

  for (const path of hostedPdfPathCandidates(upload)) {
    const { data, error } = await supabase.storage.from(HOSTED_BUCKET).download(path)
    if (data && !error) {
      const file = new File([data], name, { type: 'application/pdf' })
      await usePdfStore.getState().loadFile(file)
      return
    }
    lastError = error?.message ?? null
  }

  // Every candidate missed. Distinguish "not there" from "could not ask" — a
  // dropped connection or an expired session must NOT be reported as a dead
  // backup, or the user is invited to delete a document that is perfectly fine.
  if (lastError && !/not.?found|does not exist|404/i.test(lastError)) {
    throw new Error(lastError)
  }
  throw new HostedObjectMissingError(name)
}
