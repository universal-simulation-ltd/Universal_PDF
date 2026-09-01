// The export dialog's Preview — "How the exported PDF will look", and whether
// it does.
//
//   ./scripts/preview.sh      # Universal PDF is :5174
//   npm run test:preview      # in another terminal
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// Reported 2026-09-01: "the preview is showing me a really low quality version
// that doesn't match the final export". Two separate faults, and only the
// second one is about quality:
//
//   1. RESOLUTION. `PreviewPage` set `canvas.width/height` to the viewport
//      size and nothing else, so the backing store was 1.2 device pixels per
//      PDF point on a screen displaying 2.4 — a half-resolution bitmap
//      stretched to twice its size. Every preview on every retina screen (so:
//      every Mac, every phone) was blurry, and the file it was previewing was
//      not. Fixed by rendering at `layerPixelRatio` and setting the CSS size
//      separately.
//
//   2. CONTENT. `LivePreview` called `buildAnnotatedPdfBytes` WITHOUT the form
//      values, which `ExportModal` has always passed. A filled form therefore
//      previewed blank — the dialog's own caption made a claim about the
//      export that was false for the one document type where a preview earns
//      its place.
//
// Negative control (2026-09-01, run): pinning `ratio` back to 1 and dropping
// `formValues` from the `buildAnnotatedPdfBytes` call — i.e. the code as it was
// — turns exactly two checks red, one per fault, and leaves the rest green.
//
// ⚠️ The resolution check is a MEASUREMENT, not a screenshot: it compares the
// canvas's backing store with its CSS box at a known `deviceScaleFactor`. A
// screenshot diff would go red on font hinting and tell you nothing about why.
// The content check reads the PDF the preview's own Download button hands out,
// because that is the only thing that proves the bytes on screen were built
// from what the user typed.

import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
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
      // Imported but cannot launch — try the next.
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

async function waitReady(page, timeout = 120000) {
  await page
    .locator('text=/Building export…|Compressing…/')
    .first()
    .waitFor({ state: 'detached', timeout })
    .catch(() => {})
}

// The preview overlay is the LAST `fixed inset-0 z-50` in the document — the
// export dialog uses the same shape, and querySelector would hand back the
// viewer's own canvases instead. Getting this wrong reports the VIEWER's
// resolution, which was never broken, and the suite passes against the bug.
const PREVIEW_CANVAS = `(() => {
  const overlays = [...document.querySelectorAll('div.fixed.inset-0.z-50')]
  const overlay = overlays[overlays.length - 1]
  return overlay ? overlay.querySelector('canvas') : null
})()`

const TYPED = 'Marguerite Danforth-Vale'
const FIELD = 'signerName'

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
// ⚠️ 2, deliberately. At the default 1 the two viewports coincide and the
// whole bug is invisible — a run on a non-retina screen cannot see it, which
// is presumably how it survived this long.
const DPR = 2
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: DPR,
  acceptDownloads: true,
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.sh).`)
  await browser.close()
  process.exit(2)
}

console.log('\nThe export dialog’s Preview')

// A one-page PDF carrying a single AcroForm text field, built with the app's
// own pdf-lib so there is no fixture to keep in step.
const srcB64 = await page.evaluate(async (field) => {
  const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pg = doc.addPage([595, 842])
  pg.drawText('Signed by:', { x: 60, y: 700, size: 14, font })
  const form = doc.getForm()
  const tf = form.createTextField(field)
  tf.addToPage(pg, { x: 150, y: 690, width: 300, height: 24 })
  const bytes = await doc.save()
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}, FIELD)

await page.setInputFiles('input[type=file]', {
  name: 'formy.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(srcB64, 'base64'),
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })

// ── 1. Type into the form field ─────────────────────────────────────────────

const fieldBox = page.getByText(FIELD, { exact: true }).first()
const foundField = await fieldBox
  .waitFor({ state: 'visible', timeout: 30000 })
  .then(() => true)
  .catch(() => false)
check('the form field is offered for filling', foundField)
if (foundField) {
  await fieldBox.click()
  await page.keyboard.type(TYPED)
  await page.keyboard.press('Tab')
}

// ── 2. Open the preview ─────────────────────────────────────────────────────

await page.getByRole('button', { name: /export/i }).first().click()
await page.waitForSelector('text=Export PDF', { timeout: 15000 })
await waitReady(page)
await page.getByRole('button', { name: /^Preview$/ }).click()

await page
  .locator('text=How the exported PDF will look')
  .first()
  .waitFor({ timeout: 30000 })
  .catch(() => {})

// The canvas is sized inside an async render, so poll rather than sample.
let metrics = null
for (let i = 0; i < 120; i++) {
  metrics = await page.evaluate(`(() => {
    const c = ${PREVIEW_CANVAS}
    if (!c || !c.width) return null
    const r = c.getBoundingClientRect()
    return { backing: [c.width, c.height], css: [r.width, r.height] }
  })()`)
  if (metrics) break
  await page.waitForTimeout(500)
}

console.log('\n  The bitmap behind the page')
check('the preview renders a page at all', metrics !== null)
if (metrics) {
  const ratio = metrics.backing[0] / metrics.css[0]
  // ⚠️ `>= DPR`, not `> 1`. Before the fix the ratio was exactly 1, so `> 1`
  // would go green on a half-hearted 1.5× as readily as on a correct one —
  // and half-hearted is what the report was about.
  check(
    `the backing store matches the screen (${ratio.toFixed(2)}× at devicePixelRatio ${DPR})`,
    ratio >= DPR - 0.01,
    JSON.stringify(metrics),
  )
  // The other half of the same fix: the CSS box must NOT have grown with the
  // backing store. Setting `width`/`height` alone would pass the ratio check
  // by rendering the page at twice its size.
  check(
    'and the page is still displayed at its own size',
    Math.abs(metrics.css[0] - 595 * 1.2) < 2,
    `css width ${metrics.css[0]}`,
  )
}

// ── 3. The bytes it is previewing ───────────────────────────────────────────

console.log('\n  What the preview is a preview OF')
const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
await page.getByRole('button', { name: /^Download$/ }).click()
const download = await downloadPromise
const path = await download.path()
const bytes = fs.readFileSync(path)

const text = await page.evaluate(async (b64) => {
  const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
  const bin = atob(b64)
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  const doc = await pdfjsLib.getDocument({ data }).promise
  const p = await doc.getPage(1)
  return (await p.getTextContent()).items.map((i) => i.str).join(' ')
}, bytes.toString('base64'))

check(
  'the previewed document carries what was typed into the form',
  text.includes(TYPED),
  `pdf.js read ${JSON.stringify(text.slice(0, 120))}`,
)

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
