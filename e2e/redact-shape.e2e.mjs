// Every way of turning a drawn box or circle into a redaction keeps its shape.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:redact-shape         # in another terminal
//
// Sibling of redact-circle.e2e.mjs (the floating "Redact this area" button).
// What is pinned here (James, 2026-10-13: "redact not working to fill a circle
// shape" — he was on the two other ways in, and both gave a SQUARE):
//
//   • The bucket on a circle → "Redact instead" in its warning: an ellipse
//     redaction, black inside the circle and white in its square's corner.
//   • The Redact tool, tapped INSIDE an unfilled circle or on its outline:
//     like a fill bucket, the circle itself becomes an ellipse redaction, and
//     no extra box is dropped. (Before, the tap SELECTED the circle and dropped
//     to the Select tool, leaving only the bucket's square way on.)
//   • The same tap on a box: an ordinary box redaction of its bounds.
//   • Two overlapping circles: the topmost one is taken.
//   • A tap on empty page still drops the default box (unchanged), and a
//     sweep that starts inside a circle draws the rectangle swept, leaving the
//     circle (it used to grab and drag the circle).
//   • Each conversion is ONE undo step back to the shape (it was remove + add,
//     two steps, so one undo left nothing at all).
//
// Negative control (run 2026-10-13): with AnnotationLayer.tsx put back to its
// pre-fix form, 13 checks go red — "Redact instead" gives a plain box and
// exports a black corner, every undo leaves nothing, every Redact-tool tap on
// a shape just selects it, and the sweep drags the circle. The empty-page tap
// stays green, as it should.

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

const PAGE_W = 595
async function testPdf() {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([PAGE_W, 842])
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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

await page.setInputFiles('input[type=file]', { name: 'shapes.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

const canvasBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const k = canvasBox.width / PAGE_W
// Page units → screen pixels.
const sx = (x) => Math.round(canvasBox.x + x * k)
const sy = (y) => Math.round(canvasBox.y + y * k)

const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const annotations = () => store('return s.annotations')
const reset = () => store('s.resetDocument(); s.setTool("select")')
// The shapes, put straight into the store: what is under test is what a tap
// does to them, not how they were drawn.
const put = (items) => store('for (const a of arg) s.add(a); s.setSelected(null)', items)
// Exactly what Actions → Redact → Free draw does (FileMenu.tsx).
const armRedact = () => store('s.setSelected(null); s.setColor("#000000"); s.setTool("redact")')
const undo = () => store('s.undo()')

async function tap(x, y) {
  await page.mouse.move(sx(x), sy(y))
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(350)
}

async function exportPixels(r) {
  return page.evaluate(
    async ({ src, r }) => {
      const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
      const { openPdf } = await import('/src/lib/pdfjs.ts')
      const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
      const out = await buildAnnotatedPdfBytes(bytes.buffer, [r], 1)
      const doc = await openPdf(out).promise
      const p = await doc.getPage(1)
      const vp = p.getViewport({ scale: 1 })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      await p.render({ canvasContext: ctx, viewport: vp }).promise
      const at = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]
      const res = {
        centre: at(r.x + r.width / 2, r.y + r.height / 2),
        // 10% in from the corner of the square: inside the box, outside the curve.
        corner: at(r.x + r.width * 0.1, r.y + r.height * 0.1),
      }
      void doc.destroy()
      return res
    },
    { src: pdf.toString('base64'), r },
  )
}
const dark = (px) => px.every((c) => c < 60)
const light = (px) => px.every((c) => c > 200)

const circle = (id, x, y, d) => ({ id, pageIndex: 0, type: 'ellipse', x, y, width: d, height: d, color: '#e11d48' })
const sameBox = (a, b) => a && b && ['x', 'y', 'width', 'height'].every((p) => Math.abs(a[p] - b[p]) < 0.01)
const json = (v) => JSON.stringify(v)

// ── The bucket's "Redact instead" ────────────────────────────────────────────
console.log('\nbucket → "Redact instead" on a circle keeps it a circle')
{
  await reset()
  const c = circle('c1', 150, 200, 160)
  await put([c])
  await store('s.setSelected(arg)', 'c1')
  await page.waitForTimeout(250)
  check('the circle is selected', (await store('return s.selectedId')) === 'c1')
  await page.locator('button[title="Fill with active colour"]').first().click()
  await page.waitForTimeout(300)
  const redactInstead = page.getByRole('button', { name: 'Redact instead' })
  check('the fill warning offers "Redact instead"', (await redactInstead.count()) > 0)
  await redactInstead.click()
  await page.waitForTimeout(350)
  const after = await annotations()
  const r = after.find((a) => a.type === 'redact')
  check('the circle became one redaction', after.length === 1 && !!r, json(after))
  check('…an ellipse, not its square', r?.shape === 'ellipse', json(r))
  check('…over the same box', sameBox(r, c), json(r))
  if (r) {
    const px = await exportPixels(r)
    check('export: black inside the circle', dark(px.centre), json(px.centre))
    check('export: the corner of its square is left alone', light(px.corner), json(px.corner))
  }
  await undo()
  const back = await annotations()
  check('one undo brings the circle back', back.length === 1 && back[0].type === 'ellipse' && back[0].id === 'c1', json(back))
}

console.log('\nthe "Redact this area" button is one undo step too')
{
  await reset()
  await put([circle('c0', 150, 200, 160)])
  await store('s.setSelected(arg)', 'c0')
  await page.waitForTimeout(250)
  await page.locator('button[aria-label="Redact this area"]').first().click()
  await page.waitForTimeout(350)
  const after = await annotations()
  check('the button made an ellipse redaction', after.length === 1 && after[0].shape === 'ellipse', json(after))
  await undo()
  const back = await annotations()
  check('one undo brings the circle back', back.length === 1 && back[0].id === 'c0', json(back))
}

// ── The Redact tool, tapped inside an unfilled circle ────────────────────────
console.log('\nthe Redact tool tapped inside a circle redacts the circle')
{
  await reset()
  const c = circle('c2', 150, 200, 160)
  await put([c])
  await armRedact()
  await tap(c.x + c.width / 2, c.y + c.height / 2)
  const after = await annotations()
  const reds = after.filter((a) => a.type === 'redact')
  check('exactly one redaction, and no circle left', after.length === 1 && reds.length === 1, json(after))
  check('…an ellipse redaction', reds[0]?.shape === 'ellipse', json(reds[0]))
  check('…of the circle itself, not a box at the tap', sameBox(reds[0], c), json(reds[0]))
  if (reds[0]) {
    const px = await exportPixels(reds[0])
    check('export: black inside the circle', dark(px.centre), json(px.centre))
    check('export: the corner of its square is left alone', light(px.corner), json(px.corner))
  }
  check('the Redact tool stays armed', (await store('return s.tool')) === 'redact')
  await undo()
  const back = await annotations()
  check('one undo brings the circle back', back.length === 1 && back[0].id === 'c2', json(back))
}

console.log('\nthe Redact tool tapped on a circle\'s outline redacts the circle too')
{
  await reset()
  const c = circle('c3', 150, 200, 160)
  await put([c])
  await armRedact()
  await tap(c.x + 1, c.y + c.height / 2)
  const after = await annotations()
  check(
    'one ellipse redaction of the circle',
    after.length === 1 && after[0].type === 'redact' && after[0].shape === 'ellipse' && sameBox(after[0], c),
    json(after),
  )
}

console.log('\nthe Redact tool tapped inside a box redacts the box')
{
  await reset()
  const b = { id: 'b1', pageIndex: 0, type: 'rect', x: 120, y: 300, width: 200, height: 90, color: '#2563eb' }
  await put([b])
  await armRedact()
  await tap(b.x + 40, b.y + 30)
  const after = await annotations()
  check(
    'one box redaction of its bounds',
    after.length === 1 && after[0].type === 'redact' && !after[0].shape && sameBox(after[0], b),
    json(after),
  )
}

console.log('\noverlapping circles: the topmost is taken')
{
  await reset()
  const under = circle('under', 150, 200, 160)
  const over = circle('over', 230, 200, 160)
  await put([under, over])
  await armRedact()
  await tap(270, 280) // inside both
  const after = await annotations()
  const r = after.find((a) => a.type === 'redact')
  check(
    'the top circle became the redaction, the lower one is untouched',
    after.length === 2 && after.some((a) => a.id === 'under' && a.type === 'ellipse') && sameBox(r, over),
    json(after),
  )
}

// ── Unchanged ────────────────────────────────────────────────────────────────
console.log('\na tap on empty page drops a box, a sweep draws a rectangle')
{
  await reset()
  await armRedact()
  await tap(300, 650)
  const after = await annotations()
  check(
    'a tap on empty page drops one default box',
    after.length === 1 && after[0].type === 'redact' && !after[0].shape && Math.abs(after[0].width - 72) < 0.01 && Math.abs(after[0].height - 16) < 0.01,
    json(after),
  )

  await reset()
  const c = circle('c4', 150, 200, 160)
  await put([c])
  await armRedact()
  await page.mouse.move(sx(200), sy(250))
  await page.mouse.down()
  await page.mouse.move(sx(260), sy(290), { steps: 6 })
  await page.mouse.move(sx(320), sy(330), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(350)
  const swept = await annotations()
  const r = swept.find((a) => a.type === 'redact')
  check(
    'a sweep starting inside a circle draws the rectangle swept, and leaves the circle',
    swept.length === 2 && swept.some((a) => a.id === 'c4' && a.type === 'ellipse') && r && !r.shape && Math.abs(r.width - 120) < 2 && Math.abs(r.height - 80) < 2,
    json(swept),
  )
}

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
