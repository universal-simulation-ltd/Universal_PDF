// EXIF Orientation read straight off a JPEG's bytes.
//
//   npm run test:jpeg-orientation
//
// Why it exists: a portrait phone photo is stored sideways with an EXIF tag
// saying "turn me". The editor (a browser) honours it; pdf-lib's embedJpg does
// not, so the export drew the photo turned 90° and stretched (2026-10-03).
// `uprightJpeg` redraws only when this says the photo is turned — so this has
// to find the tag in both byte orders, past other segments, and say 1 for
// anything it can't read rather than turning a photo that wasn't asked to be.
//
// Negative control (2026-10-03, run): always returning 1 reddens every
// "→ 6/3/8" case below.

import { jpegOrientation } from '../src/lib/jpegOrientation.ts'

let failed = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} → ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

const u16 = (v, le) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff])
const u32 = (v, le) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])

/** APP1 Exif segment whose IFD0 holds `tags` ([tag, value] shorts). */
function app1(tags, le) {
  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a, le), ...u32(8, le), ...u16(tags.length, le)]
  for (const [tag, v] of tags) tiff.push(...u16(tag, le), ...u16(3, le), ...u32(1, le), ...u16(v, le), 0, 0)
  tiff.push(...u32(0, le))
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  return [0xff, 0xe1, ...u16(body.length + 2, false), ...body]
}
const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
const sos = [0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9]
const jpeg = (...segs) => new Uint8Array([0xff, 0xd8, ...segs.flat(), ...sos])

check('little-endian (iPhone) orientation 6', jpegOrientation(jpeg(app1([[0x0112, 6]], true))), 6)
check('big-endian orientation 6', jpegOrientation(jpeg(app1([[0x0112, 6]], false))), 6)
check('after a JFIF APP0 segment, orientation 3', jpegOrientation(jpeg(app0, app1([[0x0112, 3]], true))), 3)
check('tag not first in IFD0, orientation 8', jpegOrientation(jpeg(app1([[0x010f, 1], [0x0112, 8]], false))), 8)
check('orientation 1 stays 1', jpegOrientation(jpeg(app1([[0x0112, 1]], true))), 1)
check('Exif with no orientation tag', jpegOrientation(jpeg(app1([[0x010f, 1]], true))), 1)
check('no Exif at all', jpegOrientation(jpeg(app0)), 1)
check('out-of-range value', jpegOrientation(jpeg(app1([[0x0112, 42]], true))), 1)
check('a PNG', jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 1)
check('truncated Exif', jpegOrientation(new Uint8Array(jpeg(app1([[0x0112, 6]], true)).slice(0, 20))), 1)
check('empty', jpegOrientation(new Uint8Array()), 1)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall passed')
