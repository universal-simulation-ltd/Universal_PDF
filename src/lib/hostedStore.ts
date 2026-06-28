import {
  consumeHostedUpload,
  refundHostedUpload,
  HOSTED_BUCKET,
  type HostedUpload,
} from '@unisim/sdk'
import { buildAnnotatedPdfBytes } from './export'
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

function safeStem(name: string | null): string {
  const base = (name ?? 'document').replace(/\.pdf$/i, '')
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug || 'document'
}

/** Build the current PDF (annotations + form values baked in) as bytes. */
async function currentPdfBytes(): Promise<{ bytes: Uint8Array; fileName: string }> {
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
}

/** Spend one token and store the current PDF in the cloud. Reserves the token
 *  first (so the wallet can't be over-spent), then uploads; if the upload fails
 *  the token is refunded so the user is never charged for a file that isn't
 *  there. `orgId` is the signed-in user's org (path segment that drives RLS). */
export async function storeCurrentPdf(supabase: Supabase, orgId: string): Promise<StoreResult> {
  const { bytes, fileName } = await currentPdfBytes()

  // 1) Reserve the token + ledger row (the RPC charges the caller's primary org).
  const consumed = await consumeHostedUpload(supabase, {
    product: 'pdf',
    // Filled in below once we know the upload id — but the RPC records the path
    // we pass, so build it from a client id that we reuse for the object name.
    storagePath: 'pending',
    fileName,
    sizeBytes: bytes.byteLength,
  })
  if (!consumed.ok || !consumed.upload_id) {
    return { ok: false, error: consumed.error ?? 'Could not reserve a token.' }
  }

  // 2) Upload to hosted-uploads/<org>/pdf/<upload_id>-<stem>.pdf
  const path = `${orgId}/pdf/${consumed.upload_id}-${safeStem(fileName)}.pdf`
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const { error: upErr } = await supabase.storage
    .from(HOSTED_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })

  if (upErr) {
    // Roll the token back so a failed upload never costs the user.
    await refundHostedUpload(supabase, consumed.upload_id)
    return { ok: false, error: upErr.message }
  }

  // 3) Point the ledger row at the real object path.
  await supabase.from('hosted_uploads').update({ storage_path: path }).eq('id', consumed.upload_id)

  return { ok: true, creditsRemaining: consumed.credits }
}

/** Delete a hosted PDF (storage object first, then the ledger row + token
 *  refund). Idempotent — a missing row still refunds nothing extra. */
export async function deleteHostedPdf(supabase: Supabase, upload: HostedUpload): Promise<StoreResult> {
  // Remove the object under the member-delete policy; ignore a "not found" so a
  // half-deleted upload can still be cleared.
  await supabase.storage.from(HOSTED_BUCKET).remove([upload.storage_path])
  const res = await refundHostedUpload(supabase, upload.id)
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not refund the token.' }
  return { ok: true, creditsRemaining: res.credits }
}

/** Open a hosted PDF back into the editor (download → loadFile). */
export async function openHostedPdf(supabase: Supabase, upload: HostedUpload): Promise<void> {
  const { data, error } = await supabase.storage.from(HOSTED_BUCKET).download(upload.storage_path)
  if (error || !data) throw new Error(error?.message ?? 'Could not download the PDF.')
  const name = upload.file_name ?? 'document.pdf'
  const file = new File([data], name, { type: 'application/pdf' })
  await usePdfStore.getState().loadFile(file)
}
