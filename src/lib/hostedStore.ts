import {
  consumeHostedUpload,
  refundHostedUpload,
  HOSTED_BUCKET,
} from '@unisim/sdk'
import { buildAnnotatedPdfBytes } from './export'
import { signRequestPdfPath, personalSignRequestPdfPath, hostedPdfPathCandidates, newObjectId, SIGN_PRODUCT } from './hostedPaths'
import { useAnnotationStore } from '../stores/annotationStore'
import { useFormStore } from '../stores/formStore'
import { usePdfStore } from '../stores/pdfStore'
import { getT } from '../i18n'

// The one PDF Universal PDF stores online: the copy a "Send to sign" request
// needs so its recipient can open it. Free for everyone (migration 0227, its
// own 'pdf_sign' budget). There is no general online backup any more — James,
// 2026-10-03: "we don't want to be a file hoster when they have so many other
// free choices for that". Local storage (the IndexedDB recents) and the
// downloadable backup file are the ways to keep a PDF.

type Supabase = Parameters<typeof consumeHostedUpload>[0]

// Annotations are baked at scale 1.0 on export, so we store the same flattened
// bytes the user would download — their drawn work travels with the file.
const EXPORT_SCALE = 1.0

/** Build the current PDF (annotations + form values baked in) as bytes — the
 *  same flattened output the user would download. Exported so "Send to sign"
 *  can attach the identical bytes to its email. */
export async function currentPdfBytes(): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { sourceBytes, fileName } = usePdfStore.getState()
  if (!sourceBytes) throw new Error(getT()('lib.no_pdf_open'))
  const annotations = useAnnotationStore.getState().annotations
  const formValues = useFormStore.getState().values
  const bytes = await buildAnnotatedPdfBytes(sourceBytes.slice(0), annotations, EXPORT_SCALE, formValues)
  return { bytes, fileName: fileName ?? 'document.pdf' }
}

export interface StoreResult {
  ok: boolean
  error?: string
  /** The hosted_uploads ledger id — "Send to sign" mints its request against
   *  this. Present on a successful store. */
  uploadId?: string
  storagePath?: string
  fileName?: string
}

/** Store the current PDF online for a sign request. Records the ledger row
 *  first, then uploads; if the upload fails the row is removed again so no
 *  entry is left pointing at nothing. `owner` is the signed-in user's org (the
 *  path segment that drives RLS) or, with no company, the user themselves —
 *  a personal copy (migration 0228). */
export async function storeForSignRequest(
  supabase: Supabase,
  owner: { orgId: string } | { userId: string },
): Promise<StoreResult> {
  const { bytes, fileName } = await currentPdfBytes()

  // ⚠️ NAME THE OBJECT FIRST. `hosted_uploads` grants members SELECT and
  // nothing else (0041), so the path cannot be filled in after the row exists —
  // that is how every old backup ended up filed as `pending`. See
  // `hostedPaths.ts` for the full write-up.
  const path = 'orgId' in owner
    ? signRequestPdfPath(owner.orgId, newObjectId(), fileName)
    : personalSignRequestPdfPath(owner.userId, newObjectId(), fileName)

  // 1) Record the ledger row (the RPC files it under the caller's primary org,
  //    or as personal when they have none).
  const consumed = await consumeHostedUpload(supabase, {
    product: SIGN_PRODUCT,
    storagePath: path,
    fileName,
    sizeBytes: bytes.byteLength,
  })
  if (!consumed.ok || !consumed.upload_id) {
    return { ok: false, error: consumed.error ?? getT()('lib.hosted_reserve_failed') }
  }

  // 2) Upload to hosted-uploads/<org>/pdf_sign/… or personal/<user>/pdf_sign/…
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const { error: upErr } = await supabase.storage
    .from(HOSTED_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })

  if (upErr) {
    await refundHostedUpload(supabase, consumed.upload_id)
    return { ok: false, error: upErr.message }
  }

  return { ok: true, uploadId: consumed.upload_id, storagePath: path, fileName }
}

/** Remove what a revoked sign request had stored: the copy it was sent with
 *  and, if one party had already signed, the signed copy. Best-effort and
 *  called AFTER the request row is gone — a leftover file is a tidy-up miss,
 *  but a request whose document vanished first would greet its recipient with
 *  "no longer stored".
 *
 *  `signedCopyPath` must be read before the request row is deleted; the
 *  upload's ledger row outlives it (the foreign key only nulls). */
export async function removeSignRequestFiles(
  supabase: Supabase,
  uploadId: string | null,
  signedCopyPath: string | null,
): Promise<void> {
  const paths: string[] = []
  if (signedCopyPath) paths.push(signedCopyPath)
  if (uploadId) {
    const { data: row } = await supabase
      .from('hosted_uploads')
      .select('id, org_id, storage_path, file_name')
      .eq('id', uploadId)
      .maybeSingle()
    // Every path the bytes could be under: requests made before 0227 were
    // stored as `pdf`, and the oldest of those were filed as `pending`. A
    // personal row (no company, 0228) has only ever had its recorded path.
    if (row?.org_id) paths.push(...hostedPdfPathCandidates(row))
    else if (row?.storage_path) paths.push(row.storage_path)
  }
  if (paths.length > 0) await supabase.storage.from(HOSTED_BUCKET).remove(paths)
  if (uploadId) await refundHostedUpload(supabase, uploadId)
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
  if (error || !data) throw new Error(error?.message ?? getT()('lib.hosted_signed_download_failed'))
  const base = (docName ?? 'document.pdf').replace(/\.pdf$/i, '')
  const file = new File([data], `${base}-signed.pdf`, { type: 'application/pdf' })
  await usePdfStore.getState().loadFile(file)
}
