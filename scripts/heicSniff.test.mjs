// HEIC by its bytes — what a file IS, when what it's called cannot be trusted.
//
//   npm run test:heic-sniff
//
// Runs under Node's type-stripping, so `heicSniff.ts` is imported directly. It
// is a leaf module with no imports precisely so this works: `convert.ts`, which
// uses it, drags in pdf-lib and pdf.js and could never be loaded here.
//
// Why the bytes at all. On Android the picker hands the page a display name
// that may carry no extension (`1000012345`) and a MIME from whichever app owns
// the file — usually right, sometimes `image/*`, sometimes
// `application/octet-stream`. Get both wrong and a HEIC skips the HEIC branch
// in `imagesToPdf`, reaches `fileToPngBytes`, and fails there with "Could not
// decode" — in an app that looks like it already handles HEIC.
//
// ⚠️ This does NOT test the decode. `heic-to` is the only thing that can answer
// for that, and a generated HEIC does not test HEIC (see the HEIC section of
// Docs_UNI_SIM/landmines.md). Header shapes only.
//
// Negative controls (2026-09-04, both run): dropping the AVIF exclusion reddens
// the two avif cases; accepting any `ftyp` reddens the MP4.

import { heicByName, heicFromBytes } from '../src/lib/heicSniff.ts'

let failed = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} → ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

/** An ISO-BMFF head: a box length, `ftyp`, a major brand, then compatibles. */
const ftyp = (major, ...compatible) => {
  const brands = [major, ...compatible].join('')
  const head = `\0\0\0${String.fromCharCode(8 + brands.length)}ftyp${brands}`
  return Uint8Array.from(head, (c) => c.charCodeAt(0))
}
const bytes = (...nums) => Uint8Array.from(nums)

// ── What a phone writes ────────────────────────────────────────────────────
check('iPhone capture', heicFromBytes(ftyp('heic', 'mif1', 'MiHB', 'MiHE', 'MiPr', 'miaf', 'tmap')), true)
for (const brand of ['heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']) {
  check(`brand ${brand}`, heicFromBytes(ftyp(brand)), true)
}
// Samsung leads with the container brand and only says `heic` further down.
check('generic major brand', heicFromBytes(ftyp('mif1', 'heic')), true)

// ── What must be left alone ────────────────────────────────────────────────
check('AVIF', heicFromBytes(ftyp('avif', 'mif1', 'miaf')), false)
check('AVIF sequence', heicFromBytes(ftyp('avis', 'avif', 'msf1')), false)
check('MP4', heicFromBytes(ftyp('isom', 'iso2', 'avc1', 'mp41')), false)
check('JPEG', heicFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1)), false)
check('PNG', heicFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)), false)
check('WebP', heicFromBytes(Uint8Array.from('RIFF\0\0\0\0WEBPVP8 ', (c) => c.charCodeAt(0))), false)

// ── Too short to hold a header: answer, don't throw ────────────────────────
check('empty', heicFromBytes(bytes()), false)
check('truncated', heicFromBytes(bytes(0, 0, 0, 24, 0x66, 0x74)), false)

// ── The name half, which still carries Windows ─────────────────────────────
check('.HEIC with no MIME', heicByName(new File([], 'photo.HEIC')), true)
check('an ordinary JPEG', heicByName(new File([], 'photo.jpg', { type: 'image/jpeg' })), false)
check('what Android hands over', heicByName(new File([], '1000012345', { type: 'image/*' })), false)

console.log(failed === 0 ? '\nall passed' : `\n${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
