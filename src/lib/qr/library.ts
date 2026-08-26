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

import { DEFAULT_DESIGN, type QrDesign } from './design'

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

