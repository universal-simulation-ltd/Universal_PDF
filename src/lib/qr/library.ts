// Your saved Universal QR codes, read straight out of the browser.
//
// Universal QR keeps the codes you design in localStorage under
// `unisim.qr.designs.v1` — the whole design plus a thumbnail, nothing on a
// server (its `src/lib/localDesigns.ts`). Universal PDF and Universal QR are
// served from the SAME ORIGIN in production — opensource.unisim.co.uk/pdf and
// /qr, both behind the opensource-portal Worker — so that store is simply
// readable from here. No account, no API, no round trip: open the QR dialog and
// the codes you designed next door are already listed.
//
// READ ONLY, deliberately. This app never writes to that key: it is another
// app's store, capped at 12 entries, and quietly evicting someone's saved
// design because they added a QR to a PDF would be a bad trade.
//
// The origin is not guaranteed — pdf.unisim.co.uk and the Electron build are
// different origins with their own (empty) localStorage — so the dialog also
// takes Universal QR's `.uniqr.json` backup file, which works anywhere.

import { HOSTED_BUCKET, useUniversal, type HostedUpload } from '@unisim/sdk'
import { hostedQrPathCandidates, qrSidecarPath } from '../hostedQrPaths'
import { DEFAULT_DESIGN, type QrDesign } from './design'
import { renderQrPng } from './render'

/** Universal QR's saved-designs key. Matching it is the whole trick — keep it
 *  in step with that app's `localDesigns.ts` if it ever versions up. */
const DESIGNS_KEY = 'unisim.qr.designs.v1'

export const UNIVERSAL_QR_URL = 'https://opensource.unisim.co.uk/qr'

export interface SavedQrDesign {
  id: string
  name: string
  /** The full design — restored verbatim, including any uploaded centre logo. */
  design: QrDesign
  /** Small PNG data URL rendered by Universal QR at save time. */
  thumbnail: string
  createdAt: string
}

/** Merge a stored design over the current defaults rather than trusting it
 *  whole. A design saved before a field existed comes back missing it, and the
 *  renderer looks `frameShape` up in a table — an undefined there is NaN
 *  geometry and a blank code, not a cosmetic difference. */
function hydrate(config: unknown): QrDesign {
  return { ...DEFAULT_DESIGN, ...(config as Partial<QrDesign>) }
}

/** The QR codes saved in Universal QR on this device, newest first. Returns an
 *  empty list on a different origin, in private mode, or with storage disabled —
 *  never throws. */
export function loadSavedQrDesigns(): SavedQrDesign[] {
  try {
    const raw = localStorage.getItem(DESIGNS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !!(d as { config?: unknown }).config)
      .map((d, i) => ({
        id: typeof d.id === 'string' ? d.id : `qr_${i}`,
        name: typeof d.name === 'string' ? d.name : '',
        design: hydrate(d.config),
        thumbnail: typeof d.thumbnail === 'string' ? d.thumbnail : '',
        createdAt: typeof d.createdAt === 'string' ? d.createdAt : ''
      }))
      .filter((d) => !!d.design.data)
  } catch {
    return []
  }
}

// ── Account saves ────────────────────────────────────────────────────────────
// Universal QR can also save a code to a signed-in Universal ID (its "Back up
// this QR code" dialog — hosted_uploads, product 'qr'). Each save is a PNG in
// the hosted bucket, and saves made since 2026-08-26 carry the full design as
// a `<png-path>.json` sidecar. With the sidecar the code comes in editable,
// exactly like a local save; without it (older saves) all we have is the
// rendered PNG, which can still be placed as a plain image.

type Supabase = ReturnType<typeof useUniversal>['supabase']

export interface HostedQrDesign {
  id: string
  name: string
  /** The full design when the save carries its sidecar; null for a PNG-only
   *  legacy save, which places as a flat image instead. */
  design: QrDesign | null
  /** PNG data URL for a design-less save — the image that gets placed. */
  png: string | null
  /** Small data URL for the shelf chip (rendered locally when the design is
   *  known, the stored PNG itself otherwise). */
  thumbnail: string
  createdAt: string
}

const THUMB_SIZE = 160

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })
}

/** Resolve the account's saved QR codes into shelf entries. Each upload is
 *  fetched independently and a failing one is simply dropped — a stale ledger
 *  row or a missing object must not empty the whole shelf. */
export async function loadHostedQrDesigns(
  supabase: Supabase,
  uploads: HostedUpload[],
): Promise<HostedQrDesign[]> {
  const entries = await Promise.all(
    uploads.map(async (u): Promise<HostedQrDesign | null> => {
      try {
        // ⚠️ Not `u.storage_path` directly. Saves made before 2026-08-27 have
        // `storage_path = 'pending'` on the row — an UPDATE that RLS silently
        // refused, see hostedQrPaths.ts — while the bytes sit in the bucket
        // under a name derivable from the row itself. Asking for the recorded
        // path alone made every one of those saves vanish from this shelf, and
        // vanish QUIETLY: the catch below drops an upload it cannot fetch, so
        // there was no error to notice, just a code that was never listed.
        const candidates = hostedQrPathCandidates(u)

        for (const path of candidates) {
          const sidecar = await supabase.storage.from(HOSTED_BUCKET).download(qrSidecarPath(path))
          if (!sidecar.error && sidecar.data) {
            const design = { ...DEFAULT_DESIGN, ...(JSON.parse(await sidecar.data.text()) as Partial<QrDesign>) }
            if (design.data) {
              return {
                id: u.id,
                name: design.name || u.file_name || '',
                design,
                png: null,
                thumbnail: await renderQrPng(design, THUMB_SIZE),
                createdAt: u.created_at,
              }
            }
          }
        }

        // No (usable) sidecar anywhere — fall back to the stored PNG itself.
        // Tried across the same candidates: a legacy row has no usable sidecar
        // AND no usable PNG at the recorded path, so giving up here would lose
        // exactly the saves this is meant to recover.
        for (const path of candidates) {
          const pngRes = await supabase.storage.from(HOSTED_BUCKET).download(path)
          if (pngRes.error || !pngRes.data) continue
          const png = await blobToDataUrl(pngRes.data)
          return {
            id: u.id,
            name: (u.file_name ?? '').replace(/\.[^.]+$/, ''),
            design: null,
            png,
            thumbnail: png,
            createdAt: u.created_at,
          }
        }
        return null
      } catch {
        return null
      }
    }),
  )
  return entries.filter((e): e is HostedQrDesign => e !== null)
}

