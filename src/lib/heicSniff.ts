/**
 * Is this file a HEIC, judged by what it IS rather than what it's called?
 *
 * The name and the MIME type answer on a desktop and neither is dependable on a
 * phone. Android's picker hands the page a display name that may carry no
 * extension at all (`1000012345`) and a MIME from whichever app owns the file:
 * usually right, sometimes `image/*`, sometimes `application/octet-stream`. Get
 * both wrong and a HEIC walks past the check into `createImageBitmap` and dies
 * there — the exact failure the HEIC branch exists to prevent, in an app that
 * looks like it already handles HEIC. (Windows is the mirror image: a `.heic`
 * off a phone has no MIME at all there, which is why the name still counts.)
 *
 * ⚠️ **This file is a byte-identical copy in Universal Converter, Compress and
 * PDF**, and the same function lives inline in Universal Family
 * (`src/lib/media.ts`) and Universal Images (`src/lib/imageResize.ts`). Fix one,
 * fix all five — the suite has one HEIC pattern on purpose. The long version is
 * the HEIC section of `Docs_UNI_SIM/landmines.md`.
 *
 * It is a leaf: no imports, so its unit test can load it under Node's
 * type-stripping without dragging a browser module in behind it.
 */

const HEIC_EXT_RE = /\.(heic|heif)$/i
const HEIC_MIME = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/** What the file SAYS it is — right on a desktop, a coin toss on a phone. */
export function heicByName(file: File): boolean {
  return HEIC_MIME.has(file.type.toLowerCase()) || HEIC_EXT_RE.test(file.name)
}

/**
 * What the file's first bytes say it is.
 *
 * HEIC is an ISO-BMFF file: a `ftyp` box at offset 4, a major brand at 8, then a
 * list of compatible brands. Two things the brand list will catch you out on:
 * Samsung's "high efficiency" pictures lead with the container brand `mif1` and
 * only say `heic` further down, and **AVIF shares the container** — which every
 * browser decodes natively, so it is excluded rather than sent on a slow, lossy
 * round-trip through libheif for a picture that was about to be drawn for free.
 *
 * `bytes` is the head of the file; 32 covers the usual compatible-brand list.
 */
export function heicFromBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)))
  if (ascii(4, 8) !== 'ftyp') return false
  const brands = new Set<string>()
  for (let at = 8; at + 4 <= bytes.length; at += 4) brands.add(ascii(at, at + 4))
  if (brands.has('avif') || brands.has('avis')) return false
  for (const brand of ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']) {
    if (brands.has(brand)) return true
  }
  return false
}

/**
 * The head of a file, or a refusal that says it could not be read at all.
 *
 * That distinction is the point of reading it here. On Android a photo picked
 * out of Google Photos can be a placeholder for something that still lives in
 * the cloud and was never downloaded — every read of it fails, and a
 * decode-shaped message then blames a picture that is perfectly fine.
 */
export async function headOf(file: File, n = 32): Promise<Uint8Array> {
  if (file.size === 0) {
    throw new Error(`${file.name} came through empty — try adding it again`)
  }
  try {
    return new Uint8Array(await file.slice(0, n).arrayBuffer())
  } catch {
    throw new Error(
      `${file.name} could not be read from this device — if it lives in the cloud, open it in your photos app first so it downloads`,
    )
  }
}

/** Name first because it costs nothing; bytes when the name won't say. */
export async function isHeicFile(file: File): Promise<boolean> {
  return heicByName(file) || heicFromBytes(await headOf(file))
}
