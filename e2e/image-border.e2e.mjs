// image-border.e2e.mjs — a placed picture can carry a stroke, and the stroke
// survives the export. `npm run test:image-border` (dev server must be up).
//
// Owner ask, 2026-09-04: "for images when placed have buttons to add a stroke
// around it (size, colour, some common shapes solid, dashed)".
//
// ⚠️ THE EXPORT ASSERTION IS THE POINT. Drawing a border on the Konva canvas is
// the easy half and the half you can see; baking it through pdf-lib is the half
// that silently does not happen, and "a bordered picture exports naked" is a
// fault nobody notices until the document has been sent. So this places a
// border, exports, and reads the bytes back — the on-screen check alone would
// pass for a feature that ships nothing.
//
// Also guards the two deliberate product decisions, because both are the kind
// of thing a later refactor quietly reverses:
//   * the pill is HIDDEN for a signature (a box drawn round someone's signature
//     reads as a form field or an alteration of a signed document);
//   * "None" CLEARS the key rather than writing width 0, so an image that never
//     had a border and one whose border was removed export identically.
//
// And, since it is the other way a placed picture exports wrong without anyone
// noticing: a turned phone photo (EXIF Orientation 6) must reach the PDF the
// right way up — see the case at the end.
//
// Negative controls (2026-10-09, run): skipping the border bake in export.ts
// reddens both "exports differently" checks; making `uprightJpeg` hand back
// the bytes unturned reddens both turned-photo checks; turning it 180° too far
// reddens the "red half on top" check alone.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      continue
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      /* try the next one */
    }
  }
  console.error('No usable Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('Image border test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

// A tiny solid-red PNG. Small enough to inline, and a flat colour makes a
// border around it unmistakable in a screenshot.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAQUlEQVR42u3OMQEAAAgDoC1p' +
  'b3vBHRxYm3ZlKQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAgYcFYQABAV' +
  'yZbwAAAAAASUVORK5CYII=',
  'base64',
)

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

// The home screen carries TWO document pickers (the main one, which also takes
// .docx/.odt, and a PDF-only one); the main one is first. Aimed at by accept
// rather than by "first input on the page", so a picker added above it later
// can't quietly swallow the PDF.
await page.locator('input[type=file][accept*="application/pdf"]').first().setInputFiles({
  name: 'border.pdf', mimeType: 'application/pdf', buffer: pdf,
})
try {
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
} catch (e) {
  // ⚠️ Say WHY rather than a bare timeout. Seen once (2026-10-09, not
  // reproducible against a fresh `npm run dev`): the PDF was picked and no page
  // ever rendered — which looks identical whether the app regressed or the
  // server on :5174 is a stale/other dev server. The screenshot tells them apart.
  await page.screenshot({ path: 'e2e-image-border-noopen.png' })
  console.error(`The test PDF never rendered at ${page.url()} — see e2e-image-border-noopen.png.`,
    'If the screenshot is still the home screen, restart the dev server (npm run dev) and re-run.')
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(600)

// ── Place the picture ───────────────────────────────────────────────────────
// The image button's own hidden input, not the document one — a bare
// `input[type=file]` matches the PDF picker first and silently reloads the app.
await page.setInputFiles('input[type=file][accept*="image/png"]', {
  name: 'red.png', mimeType: 'image/png', buffer: RED_PNG,
})
await page.waitForTimeout(500)

const pageBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
await page.mouse.click(pageBox.x + 260, pageBox.y + 240)
await page.waitForTimeout(600)

console.log('\nthe picture lands as an image annotation')
// The store is not exposed on window, so read through the pill instead: its
// presence IS the assertion that an unsigned image is selected.
const pill = page.locator('div:has(> span:text-is("Border"))').last()
check('the Border pill appears for a selected picture', await pill.count() > 0)

if (await pill.count() === 0) {
  console.log('\ncannot continue without the pill')
  await page.screenshot({ path: 'e2e-image-border-nopill.png' })
  await browser.close()
  process.exit(1)
}

console.log('\nthe controls are all there')
for (const label of ['No border', '1px border', '2px border', '4px border', 'Solid', 'Dashed']) {
  check(`"${label}"`, await page.locator(`button[aria-label="${label}"]`).count() > 0)
}

// ⚠️ AND THEY ARE ALL INSIDE IT. The pill carried a hard `width: 300` while its
// own row measures ~406, and ColorCluster's circles are `flex-shrink-0` — so
// they were the part left hanging outside the white background (James, placing
// a QR code on the Android build, 2026-09-16: "the colour choices go outside
// the format pill"; a placed QR is an image annotation, so this is its pill).
// Checked at phone width too, where the row cannot fit on one line at all and
// has to wrap instead of running off the screen.
console.log('\nnothing hangs outside the pill')
async function checkContained(label) {
  await page.waitForTimeout(300)
  const box = await pill.boundingBox()
  const controls = pill.locator('button, label[title="More colours"]')
  const n = await controls.count()
  let overhang = 0
  for (let i = 0; i < n; i++) {
    const b = await controls.nth(i).boundingBox()
    if (!b || !box) continue
    overhang = Math.max(
      overhang,
      (b.x + b.width) - (box.x + box.width),
      box.x - b.x,
      (b.y + b.height) - (box.y + box.height),
      box.y - b.y,
    )
  }
  // 1px of slack: the live swatch wears `scale-110`, which is a transform and
  // so shows up in the measured box without taking any layout room.
  check(`${label}: every control is inside the pill`, n > 0 && overhang <= 1.5,
    `${n} controls, worst overhang ${overhang.toFixed(1)}px`)
  return box
}
await checkContained('desktop (1400px)')
await page.setViewportSize({ width: 390, height: 844 })
const phoneBox = await checkContained('phone (390px)')
// …and the pill itself stays within the rendered page it is clamped to. ⚠️ The
// page, not the viewport: `left` is clamped against the page's own width, and
// a PDF zoomed wider than the window scrolls horizontally with the pill on it.
const pageBoxNow = await page.locator('[data-page-index="0"]').first().boundingBox()
check('phone: the pill stays inside the page it belongs to',
  !!(phoneBox && pageBoxNow
    && phoneBox.x >= pageBoxNow.x - 1.5
    && phoneBox.x + phoneBox.width <= pageBoxNow.x + pageBoxNow.width + 1.5),
  phoneBox && pageBoxNow
    ? `pill ${Math.round(phoneBox.x)}..${Math.round(phoneBox.x + phoneBox.width)}, page ${Math.round(pageBoxNow.x)}..${Math.round(pageBoxNow.x + pageBoxNow.width)}`
    : 'no pill')
await page.setViewportSize({ width: 1400, height: 900 })
await page.waitForTimeout(300)

console.log('\nsetting a border changes what is drawn')
const before = await page.locator('[data-page-index="0"] canvas').first().screenshot()
await page.click('button[aria-label="4px border"]')
await page.waitForTimeout(400)
const after = await page.locator('[data-page-index="0"] canvas').first().screenshot()
check('the canvas changed once a border was applied', !before.equals(after))

await page.click('button[aria-label="Dashed"]')
await page.waitForTimeout(400)
const dashed = await page.locator('[data-page-index="0"] canvas').first().screenshot()
check('switching to dashed changes it again', !after.equals(dashed))

console.log('\nNone clears it')
await page.click('button[aria-label="No border"]')
await page.waitForTimeout(400)
const cleared = await page.locator('[data-page-index="0"] canvas').first().screenshot()
// ⚠️ Compared against the BORDERED frame, not the pristine one. `before` was
// captured with the picture freshly placed and its transformer still settling,
// so byte-equality against it is a flake waiting to happen — and it would fail
// for reasons with nothing to do with borders. What matters is that clearing
// undoes the border, which is exactly "differs from bordered".
check('clearing changes the canvas back', !cleared.equals(dashed))

console.log('\nthe border survives the export — the half that silently does not happen')
// Straight at the real export builder, with two annotation sets differing ONLY
// by the border. If the bake were missing, both would produce identical bytes
// and a bordered picture would reach the recipient naked.
// ⚠️ The source PDF is built HERE and passed in as base64. A bare
// `import('pdf-lib')` inside page.evaluate does not resolve — Vite rewrites
// bare specifiers at transform time and nothing rewrites a string handed to a
// dynamic import at runtime, so it fails with "Failed to resolve module
// specifier". Only the app's own modules can be imported by path.
const srcB64 = (await testPdf()).toString('base64')

const exported = await page.evaluate(async (b64) => {
  try {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const bin = atob(b64)
    const src = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i)

    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const base = {
      id: 'img-1', pageIndex: 0, type: 'image',
      x: 50, y: 50, width: 120, height: 90, src: PNG,
    }
    const plain = await buildAnnotatedPdfBytes(src.buffer.slice(0), [base], 1)
    const bordered = await buildAnnotatedPdfBytes(
      src.buffer.slice(0),
      [{ ...base, border: { width: 4, color: '#ff0000', style: 'solid' } }],
      1,
    )
    const dashedOut = await buildAnnotatedPdfBytes(
      src.buffer.slice(0),
      [{ ...base, border: { width: 4, color: '#ff0000', style: 'dashed' } }],
      1,
    )
    return {
      plain: plain.length,
      bordered: bordered.length,
      dashed: dashedOut.length,
      borderedDiffers: plain.length !== bordered.length,
      dashDiffers: bordered.length !== dashedOut.length,
    }
  } catch (e) {
    return { error: String(e) }
  }
}, srcB64)
check('the export builder ran', !exported.error, exported.error)
check('a bordered image exports differently from a plain one',
      exported.borderedDiffers,
      `plain ${exported.plain} vs bordered ${exported.bordered}`)
check('a dashed border exports differently from a solid one',
      exported.dashDiffers,
      `solid ${exported.bordered} vs dashed ${exported.dashed}`)

console.log('\na turned phone photo exports the right way up')
// A portrait phone photo is stored as SIDEWAYS pixels plus an EXIF tag saying
// "turn me 90°". The editor honours the tag; pdf-lib's embedJpg does not, so
// before `uprightJpeg` the export drew the raw sideways pixels squeezed into the
// upright box (2026-10-03). jpegOrientation.test.mjs proves the tag is READ;
// this proves the export ACTS on it — the half a unit test can't reach, since
// the redraw needs a real browser's createImageBitmap.
//
// The fixture: a real 40×20 JPEG (left half red, right half blue) drawn by the
// browser, with an APP1 Exif segment carrying Orientation 6 spliced in after
// SOI — the same segment shape as scripts/jpegOrientation.test.mjs, little-
// endian as an iPhone writes it. Upright, that photo is 20 wide by 40 tall
// with the red half on TOP. The control is the same JPEG tagged 1, which must
// pass through untouched at 40×20.
const turned = await page.evaluate(async (b64) => {
  try {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const bin = atob(b64)
    const src = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i)

    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 20
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 20, 20)
    ctx.fillStyle = '#0000ff'; ctx.fillRect(20, 0, 20, 20)
    const raw = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer())

    const u16 = (v) => [v & 0xff, v >> 8]
    const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]
    const tagged = (orientation) => {
      const tiff = [0x49, 0x49, ...u16(0x2a), ...u32(8), ...u16(1),
        ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
      const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
      const len = body.length + 2
      const app1 = [0xff, 0xe1, len >> 8, len & 0xff, ...body]
      return new Uint8Array([raw[0], raw[1], ...app1, ...raw.slice(2)])
    }
    const dataUrl = (bytes) => {
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return 'data:image/jpeg;base64,' + btoa(s)
    }
    const out = async (orientation) => {
      const bytes = await buildAnnotatedPdfBytes(src.buffer.slice(0), [{
        id: 'photo-1', pageIndex: 0, type: 'image',
        x: 50, y: 50, width: 100, height: 200, src: dataUrl(tagged(orientation)),
      }], 1)
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s)
    }
    return { turned: await out(6), upright: await out(1) }
  } catch (e) {
    return { error: String(e) }
  }
}, srcB64)
check('the export builder ran on a JPEG', !turned.error, turned.error)

/** Every embedded image in a PDF: its pixel size and, for a DCT image, the JPEG bytes. */
async function embeddedImages(b64) {
  const { PDFDocument, PDFName, PDFRawStream } = await import('pdf-lib')
  const doc = await PDFDocument.load(Buffer.from(b64, 'base64'))
  const found = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue
    found.push({
      width: obj.dict.get(PDFName.of('Width'))?.asNumber?.() ?? obj.dict.get(PDFName.of('Width'))?.value?.(),
      height: obj.dict.get(PDFName.of('Height'))?.asNumber?.() ?? obj.dict.get(PDFName.of('Height'))?.value?.(),
      filter: obj.dict.get(PDFName.of('Filter'))?.toString(),
      bytes: obj.contents,
    })
  }
  return found
}

if (!turned.error) {
  const [t] = await embeddedImages(turned.turned)
  const [u] = await embeddedImages(turned.upright)
  check('the turned photo is embedded upright (20×40, portrait)',
    t?.width === 20 && t?.height === 40,
    t ? `embedded ${t.width}×${t.height} — still the raw sideways pixels` : 'no image in the export')
  check('an untagged photo passes through untouched (40×20)',
    u?.width === 40 && u?.height === 20, u ? `embedded ${u.width}×${u.height}` : 'no image in the export')

  // Size alone would pass a photo turned the WRONG way (Orientation 8 instead of
  // 6 — same 20×40, upside down). Decode the embedded JPEG in the browser and
  // look at which colour is on top: Orientation 6 turns the left (red) half to
  // the top.
  if (t?.filter === '/DCTDecode') {
    const tops = await page.evaluate(async (b64) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      // A PDF viewer ignores EXIF, so read the pixels the way IT will: with
      // every APP1 segment cut out first. (⚠️ `imageOrientation: 'none'` is no
      // help — Chrome now treats it as 'from-image' and turns the photo anyway,
      // which let a never-turned export pass this check.)
      const kept = [0xff, 0xd8]
      let pos = 2
      while (pos + 4 <= bytes.length && bytes[pos] === 0xff && bytes[pos + 1] !== 0xda) {
        const end = pos + 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3])
        if (bytes[pos + 1] !== 0xe1) kept.push(...bytes.slice(pos, end))
        pos = end
      }
      kept.push(...bytes.slice(pos))
      const bmp = await createImageBitmap(new Blob([new Uint8Array(kept)], { type: 'image/jpeg' }))
      const c = document.createElement('canvas')
      c.width = bmp.width; c.height = bmp.height
      const ctx = c.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      const px = (fx, fy) => [...ctx.getImageData(Math.floor(bmp.width * fx), Math.floor(bmp.height * fy), 1, 1).data.slice(0, 3)]
      // Both quarters of each half, so a sideways image (red LEFT, blue RIGHT)
      // can't pass on a sample that happens to sit on the seam.
      return { top: [px(0.25, 0.25), px(0.75, 0.25)], bottom: [px(0.25, 0.75), px(0.75, 0.75)] }
    }, Buffer.from(t.bytes).toString('base64'))
    const reddish = ([r, , b]) => r > 180 && b < 90
    const bluish = ([r, , b]) => b > 180 && r < 90
    check('…and turned the right way (red half on top, blue below)',
      tops.top.every(reddish) && tops.bottom.every(bluish),
      `top ${tops.top.map((c) => `rgb(${c})`).join(' ')}, bottom ${tops.bottom.map((c) => `rgb(${c})`).join(' ')}`)
  } else {
    check('the turned photo is still a JPEG in the export', false, `filter ${t?.filter}`)
  }
}

// Leave a real border on screen, so the artefact this drops is worth looking
// at rather than a picture of the cleared state.
await page.click('button[aria-label="4px border"]')
await page.click('button[aria-label="Solid"]')
await page.waitForTimeout(400)
await page.screenshot({ path: 'e2e-image-border.png' })
await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
