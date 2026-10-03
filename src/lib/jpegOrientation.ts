/**
 * A phone photo's "which way up" — and a JPEG with the turn baked in.
 *
 * A phone camera saves the sensor's pixels as they came off it, sideways for a
 * portrait shot, and writes an EXIF Orientation tag saying how to turn them.
 * Every browser honours the tag on screen, so the editor shows the photo
 * upright. pdf-lib's `embedJpg` copies the bytes verbatim and a PDF has no
 * notion of EXIF, so the exported page drew the raw sideways pixels squeezed
 * into the upright box (James, 2026-10-03: a portrait iPhone photo came out
 * turned 90° and stretched in the export, upright in the editor).
 *
 * `jpegOrientation` reads the tag (1 = already upright, also the answer when
 * there is no tag); `uprightJpeg` redraws a turned photo the right way up,
 * through the same `createImageBitmap(…, 'from-image')` scan.ts decodes with,
 * and hands back the original bytes untouched when there is nothing to turn.
 *
 * It is a leaf: no imports, so its unit test can load it under Node's
 * type-stripping (`npm run test:jpeg-orientation`).
 */

/** JPEG quality for a redrawn photo — the photo was already JPEG; keep it close. */
const UPRIGHT_QUALITY = 0.92

/** EXIF Orientation (1–8) of a JPEG; 1 when it is not a JPEG or carries no tag. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 2
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return 1
    const marker = bytes[pos + 1]
    // Start of scan / end of image: the metadata segments are all behind us.
    if (marker === 0xda || marker === 0xd9) return 1
    const len = view.getUint16(pos + 2)
    const body = pos + 4
    if (
      marker === 0xe1 &&
      len >= 8 &&
      bytes[body] === 0x45 && bytes[body + 1] === 0x78 && bytes[body + 2] === 0x69 &&
      bytes[body + 3] === 0x66 && bytes[body + 4] === 0 && bytes[body + 5] === 0
    ) {
      return tiffOrientation(view, body + 6, Math.min(bytes.length, pos + 2 + len))
    }
    pos += 2 + len
  }
  return 1
}

function tiffOrientation(view: DataView, tiff: number, end: number): number {
  if (tiff + 8 > end) return 1
  const order = view.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4d4d) return 1
  const le = order === 0x4949
  const ifd = tiff + view.getUint32(tiff + 4, le)
  if (ifd + 2 > end) return 1
  const count = view.getUint16(ifd, le)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return 1
    if (view.getUint16(entry, le) === 0x0112) {
      const v = view.getUint16(entry + 8, le)
      return v >= 1 && v <= 8 ? v : 1
    }
  }
  return 1
}

/**
 * The JPEG the right way up: the original bytes when it already is, otherwise
 * redrawn with the EXIF turn applied (the new JPEG carries no tag, so nothing
 * downstream can turn it twice).
 */
export async function uprightJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  if (jpegOrientation(bytes) === 1) return bytes
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }), {
    imageOrientation: 'from-image',
  })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', UPRIGHT_QUALITY)
    )
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}
