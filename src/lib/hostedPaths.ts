// Object paths for "Hosted by UNI·SIM" PDFs — and the repair for the ones the
// old flow filed under a name that was never real.
//
// ⚠️ THE LANDMINE THIS MODULE EXISTS FOR. `hosted_uploads` (migration 0041) has
// RLS enabled and grants members exactly ONE policy: `for select`. There is no
// member UPDATE policy anywhere in 0041–0127 — deliberately, because the
// consume/refund RPCs are meant to be the only writers. But the client's store
// flow was written as three steps:
//
//   1. consumeHostedUpload({ storagePath: 'pending' })   ← reserves the token
//   2. upload the bytes to `<org>/pdf/<upload_id>-<stem>.pdf`
//   3. UPDATE hosted_uploads SET storage_path = <the real path>
//
// Step 3 matches no rows under RLS. PostgREST answers that with a perfectly
// happy "0 rows updated", the call site never looked at the result, and so
// EVERY hosted PDF's ledger row kept `storage_path = 'pending'`. The list in
// the Back up dialog reads the ledger, so the backup shows up; opening it asks
// storage for an object literally named `pending`, which does not exist and
// never did — "Object not found", against a file that is sitting safely in the
// bucket the whole time. ("Send to sign" broke the same way: the Edge Function
// mints its signed URL from the same column.)
//
// So this module does two things:
//
//   * `hostedPdfPath` names the object BEFORE the token is reserved, so the
//     ledger records the truth at insert time and step 3 disappears; and
//   * `hostedPdfPathCandidates` rebuilds where a legacy row's bytes actually
//     went. The old path was fully determined by data still on the row —
//     `<org_id>/pdf/<id>-<safeStem(file_name)>.pdf` — so a 'pending' row is
//     recoverable, not lost. That is why the fix opens old backups instead of
//     only apologising for them.
//
// Kept free of imports on purpose: `scripts/hostedPath.test.mjs` loads it under
// Node's type-stripping, which cannot resolve the SDK or the stores.

/** The `pdf` segment of every Universal PDF object path. */
export const HOSTED_PRODUCT = 'pdf'

/** The placeholder the old three-step flow filed rows under. */
export const PENDING_PATH = 'pending'

/**
 * Slug for the object name. Byte-for-byte the `safeStem` the store flow has
 * always used — changing it would break the legacy path reconstruction above,
 * which is the only reason old backups can be opened at all.
 */
export function safeStem(name: string | null | undefined): string {
  const base = (name ?? 'document').replace(/\.pdf$/i, '')
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug || 'document'
}

/**
 * A unique object id, generated on the client so the path can be known before
 * the ledger row exists.
 *
 * ⚠️ Not `crypto.randomUUID()` on its own. That one is gated on a secure
 * context, and the packaged desktop app loads its renderer over `file://` —
 * where Chromium does grant it today, but where a single Electron or CSP change
 * would turn "back up this PDF" into a thrown TypeError. `getRandomValues` has
 * no such gate, so it is the fallback rather than the other way round.
 */
export function newObjectId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // fall through
    }
  }
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`
}

/**
 * Where a hosted PDF lives: `hosted-uploads/<org_id>/pdf/<object_id>-<stem>.pdf`.
 *
 * The first segment MUST be the org id — every storage policy on the bucket
 * (0041, re-cut in 0093) reads it as `storage.foldername(name)[1]` and checks
 * `is_org_member(…)`. A path without it, `pending` being the obvious example,
 * fails the read policy as well as being absent, which is the second reason the
 * old rows could never be opened.
 */
export function hostedPdfPath(orgId: string, objectId: string, fileName: string | null | undefined): string {
  return `${orgId}/${HOSTED_PRODUCT}/${objectId}-${safeStem(fileName)}.pdf`
}

/**
 * True when a ledger row's `storage_path` can be handed to storage as-is:
 * non-empty, not the `pending` placeholder, and rooted at the row's own org so
 * the bucket's member-read policy will allow it.
 */
export function isUsableStoragePath(path: string | null | undefined, orgId: string | null | undefined): boolean {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (!trimmed || trimmed === PENDING_PATH) return false
  if (!orgId) return false
  return trimmed.startsWith(`${orgId}/`)
}

/** The fields of a `hosted_uploads` row this module needs. */
export interface HostedUploadRef {
  id: string
  org_id: string
  storage_path: string | null
  file_name: string | null
}

/**
 * Every place this upload's bytes could be, best guess first: the path the
 * ledger records, then — for the 'pending' rows the old flow left behind — the
 * path the uploader would have used, rebuilt from the row's own id and name.
 *
 * De-duplicated, so a healthy row yields exactly one candidate and callers can
 * treat "all of them missed" as a genuine miss.
 */
export function hostedPdfPathCandidates(upload: HostedUploadRef): string[] {
  const out: string[] = []
  const recorded = upload.storage_path?.trim()
  if (isUsableStoragePath(recorded, upload.org_id) && recorded) out.push(recorded)
  const legacy = hostedPdfPath(upload.org_id, upload.id, upload.file_name)
  if (!out.includes(legacy)) out.push(legacy)
  return out
}
