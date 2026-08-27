// Where Universal QR's account saves actually live — as this app has to
// reconstruct them.
//
// ⚠️ THIS FILE MIRRORS `Universal_QR/src/lib/hostedPaths.ts` AND MUST NOT DRIFT
// FROM IT. Universal QR names these objects; this app only reads them. If the
// two formulas disagree by one character, every QR saved in the other app goes
// missing from this one's shelf — and it goes missing SILENTLY, because the
// loader drops an upload it cannot fetch rather than failing loudly (a stale
// row must not empty the whole shelf).
//
// ⚠️ Do NOT reuse `safeStem` from `hostedPaths.ts` here, however similar it
// looks. That one slugs: lowercase, non-alphanumerics collapsed to hyphens —
// correct for a PDF backup and WRONG for a QR save, whose filename was already
// slugged by the other app before it ever became a path. Using it would rebuild
// a path that never existed, and the repair below would quietly do nothing.
//
// THE BUG THIS REPAIRS. `hosted_uploads` (migration 0041) grants members `for
// select` only — there is no member UPDATE policy anywhere in 0041–0127,
// deliberately, because the consume/refund RPCs are meant to be the only
// writers. Every app's store flow nevertheless finished with an `UPDATE
// hosted_uploads SET storage_path = …`, which matches zero rows under RLS.
// PostgREST answers that with a contented "0 rows updated", nobody read the
// result, and so every saved QR's ledger row kept `storage_path = 'pending'`.
// The bytes were in the bucket the whole time, under a name the ledger never
// learned.
//
// Kept import-free so `scripts/hostedPath.test.mjs` can load it under Node's
// type-stripping.

/** The `qr` segment of every Universal QR object path. */
export const QR_PRODUCT = 'qr'

/** The placeholder the old three-step flow filed rows under. */
export const PENDING_PATH = 'pending'

/**
 * The object-name stem: the filename with its extension dropped, and nothing
 * else. Byte-for-byte Universal QR's `stemOf`, including the `'qr-code'`
 * fallback — see the warning above about why this is not `safeStem`.
 */
export function qrStemOf(fileName: string | null | undefined): string {
  return (fileName ?? '').replace(/\.[^.]+$/, '') || 'qr-code'
}

/** `hosted-uploads/<org_id>/qr/<object_id>-<stem>.png`. */
export function hostedQrPath(
  orgId: string,
  objectId: string,
  fileName: string | null | undefined,
): string {
  return `${orgId}/${QR_PRODUCT}/${objectId}-${qrStemOf(fileName)}.png`
}

/**
 * The design sidecar beside a saved QR. It is what lets this app adopt an
 * account save as a fully EDITABLE design rather than a flat image, so it has
 * to follow every candidate rather than only the recorded path.
 */
export function qrSidecarPath(objectPath: string): string {
  return `${objectPath}.json`
}

/**
 * True when a ledger row's `storage_path` can be handed to storage as-is.
 *
 * The org id matters as much as the `pending` check: every storage policy on
 * the bucket reads `storage.foldername(name)[1]` and tests `is_org_member`, so
 * a path not rooted at the row's own org fails the read policy as well as being
 * absent.
 */
export function isUsableStoragePath(
  path: string | null | undefined,
  orgId: string | null | undefined,
): boolean {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (!trimmed || trimmed === PENDING_PATH) return false
  if (!orgId) return false
  return trimmed.startsWith(`${orgId}/`)
}

/** The fields of a `hosted_uploads` row this module needs. */
export interface HostedQrUploadRef {
  id: string
  org_id: string
  storage_path: string | null
  file_name: string | null
}

/**
 * Every place this save's bytes could be, best guess first: what the ledger
 * records, then — for the `pending` rows the old flow left behind — the path
 * the uploader would have used, rebuilt from the row's own id and name.
 *
 * De-duplicated, so a healthy row yields exactly one candidate.
 */
export function hostedQrPathCandidates(upload: HostedQrUploadRef): string[] {
  const out: string[] = []
  const recorded = upload.storage_path?.trim()
  if (isUsableStoragePath(recorded, upload.org_id) && recorded) out.push(recorded)
  const legacy = hostedQrPath(upload.org_id, upload.id, upload.file_name)
  if (!out.includes(legacy)) out.push(legacy)
  return out
}
