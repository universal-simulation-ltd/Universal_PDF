// A single tap with the Line tool has to leave a line behind.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:line-tap             # in another terminal
//
// What is pinned (owner, 2026-09-05: "when selecting the line draw tool and
// then single tapping as opposed to tap and drag then show a generic line so
// they can stretch it from the points. A few ppl have clicked once and thought
// it wasn't working"):
//
//   • A click that never moves used to produce NOTHING. Both points of the
//     two-point stroke were the same point, `Math.hypot(...) > 4` threw it
//     away, and the page was left exactly as it was — indistinguishable from a
//     dead tool. It now drops a default-length horizontal line centred on the
//     tap (TAP_LINE_LENGTH_PX in AnnotationLayer).
//   • The line is auto-selected, so its two endpoint grabbers are already on
//     it — that is the "stretch it from the points" half of the ask, and it is
//     checked by actually dragging one and watching the endpoint follow.
//   • A real drag must still draw exactly the line that was swept out, not the
//     starter. That is the regression this fix could most easily cause, so it
//     gets its own case.
//
// Reads Konva's scene graph rather than pixels: the annotations live on a
// canvas, so there is no DOM node to measure.
//
// Negative control (2026-09-05, run): with the `dragged ? ... : tapLinePoints`
// branch reverted to the old `if (Math.hypot(...) > 4)` guard, the four tap
// checks go red and the drag case stays green — the shape of the report.

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
  page.drawText('Sign here:', { x: 60, y: 700, size: 18, font })
  return Buffer.from(await doc.save())
}

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

await page.setInputFiles('input[type=file]', { name: 'line.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

// Every straight line on the page, in stage (screen) pixels, plus the endpoint
// grabbers Konva is showing. A line annotation is a two-point Konva Line
// carrying an annotation id; the preview stroke drawn mid-gesture has none.
const linesOn = (target) =>
  target.evaluate(() => {
    const K = window.Konva
    if (!K || !K.stages) return { error: 'no Konva global on window' }
    for (const stage of K.stages) {
      const scale = stage.scaleX() || 1
      const found = stage
        .find('Line')
        .filter((l) => !!l.id() && (l.points() || []).length === 4)
      if (found.length === 0) continue
      const round = (n) => Math.round(n * 100) / 100
      return {
        scale,
        anchors: stage.find('Rect').filter((r) => r.name() === 'lineAnchor').length,
        lines: found.map((l) => {
          const [x1, y1, x2, y2] = l.points()
          return {
            id: l.id(),
            x1: round(x1 * scale),
            y1: round(y1 * scale),
            x2: round(x2 * scale),
            y2: round(y2 * scale),
            length: round(Math.hypot(x2 - x1, y2 - y1) * scale),
          }
        }),
      }
    }
    return { error: 'no straight line on any stage', lines: [], anchors: 0 }
  })

const lines = () => linesOn(page)

// ── Arm the Line tool ───────────────────────────────────────────────────────
// The shapes live in the draw tool's options panel: the first click selects
// Free draw, the second opens the panel underneath it. It has to be redone for
// every line, because placing one auto-selects it and the toolbar closes the
// panel so it doesn't cover the line's own stroke/snap controls.
const drawBtn = page.locator('button[title^="Free draw"]:visible').first()
async function armLine() {
  const lineBtn = page.locator('button[title="Line"]:visible').first()
  for (let attempt = 0; attempt < 3 && !(await lineBtn.count()); attempt++) {
    await drawBtn.click()
    await page.waitForTimeout(250)
  }
  if (!(await lineBtn.count())) return false
  await lineBtn.click()
  await page.waitForTimeout(300)
  return true
}
check('the Line tool is reachable', await armLine())

const pageCanvas = page.locator('[data-page-index="0"] canvas').first()
const pageBox = await pageCanvas.boundingBox()

// ── One tap, no drag ────────────────────────────────────────────────────────
console.log('\na single tap with the Line tool leaves a line you can stretch')
const tapX = Math.round(pageBox.x + pageBox.width / 2)
const tapY = Math.round(pageBox.y + 200)
await page.mouse.move(tapX, tapY)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(400)

const tapped = await lines()
check('a line landed on the page', !tapped.error && tapped.lines.length === 1, tapped.error ?? JSON.stringify(tapped.lines))
const starter = tapped.lines?.[0]
// 140 display pixels (TAP_LINE_LENGTH_PX), capped against the page — an A4
// page at this viewport is nowhere near the cap, so the full length is used.
check(
  'it is long enough to see',
  !!starter && starter.length > 100 && starter.length < 200,
  starter && `length ${starter.length}px`
)
check(
  'it is horizontal, centred on the tap',
  !!starter &&
    Math.abs(starter.y1 - starter.y2) < 0.5 &&
    Math.abs((starter.x1 + starter.x2) / 2 - (tapX - pageBox.x)) < 2 &&
    Math.abs(starter.y1 - (tapY - pageBox.y)) < 2,
  starter && JSON.stringify(starter)
)
check('and both endpoint grabbers are on it', tapped.anchors === 2, `${tapped.anchors} grabber(s)`)

// ── Stretch it from a point ─────────────────────────────────────────────────
// Guarded rather than assumed: with the fix reverted there is no line to
// stretch, and the run has to REPORT that, not crash out before the drag case.
console.log('\nand the grabbers really do move the ends')
if (!starter) {
  check('the dragged end followed the pointer', false, 'no line was placed to stretch')
  check('and the other end stayed put', false, 'no line was placed to stretch')
} else {
const rightEndX = pageBox.x + starter.x2
const rightEndY = pageBox.y + starter.y2
await page.mouse.move(rightEndX, rightEndY)
await page.mouse.down()
await page.mouse.move(rightEndX + 60, rightEndY + 40, { steps: 5 })
await page.mouse.move(rightEndX + 140, rightEndY + 90, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)

const stretched = await lines()
const after = stretched.lines?.find((l) => l.id === starter.id)
check(
  'the dragged end followed the pointer',
  !!after && Math.abs(after.x2 - (starter.x2 + 140)) < 12 && Math.abs(after.y2 - (starter.y2 + 90)) < 12,
  after && JSON.stringify(after)
)
check(
  'and the other end stayed put',
  !!after && Math.abs(after.x1 - starter.x1) < 1 && Math.abs(after.y1 - starter.y1) < 1,
  after && JSON.stringify(after)
)
}

// ── A real drag is unchanged ────────────────────────────────────────────────
// The starter must not hijack a deliberate sweep — that is the regression this
// change could most easily introduce.
console.log('\na dragged line is still exactly the line that was swept out')
check('the Line tool can be re-armed', await armLine())
const dragStartX = Math.round(pageBox.x + 80)
const dragStartY = Math.round(pageBox.y + 420)
await page.mouse.move(dragStartX, dragStartY)
await page.mouse.down()
await page.mouse.move(dragStartX + 120, dragStartY + 40, { steps: 5 })
await page.mouse.move(dragStartX + 260, dragStartY + 90, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)

const drawn = await lines()
const swept = drawn.lines?.find((l) => Math.abs(l.y1 - (dragStartY - pageBox.y)) < 3 && Math.abs(l.x1 - (dragStartX - pageBox.x)) < 3)
check('the swept line is on the page', !!swept, JSON.stringify(drawn.lines))
check(
  'and it ends where the pointer was lifted, not at a default length',
  !!swept &&
    Math.abs(swept.x2 - (dragStartX - pageBox.x + 260)) < 3 &&
    Math.abs(swept.y2 - (dragStartY - pageBox.y + 90)) < 3,
  swept && JSON.stringify(swept)
)

// ── The reported gesture: a real finger tap ─────────────────────────────────
// Everything above is a mouse. The report is about TAPPING, and touch takes a
// different route into the app (a coarse pointer, `touchAction: none` on the
// drawing tools, pointerType 'touch'), so the same claim is made again with a
// touchscreen rather than assumed to carry over.
console.log('\nand the same is true of a finger tap, not just a mouse click')
const touchContext = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  hasTouch: true,
})
const touchPage = await touchContext.newPage()
touchPage.on('pageerror', (e) => failures.push('page error (touch): ' + e.message))
await touchContext.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})
await touchPage.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
await touchPage.setInputFiles('input[type=file]', { name: 'line.pdf', mimeType: 'application/pdf', buffer: pdf })
await touchPage.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await touchPage.waitForTimeout(600)

const touchDrawBtn = touchPage.locator('button[title^="Free draw"]:visible').first()
const touchLineBtn = touchPage.locator('button[title="Line"]:visible').first()
for (let attempt = 0; attempt < 3 && !(await touchLineBtn.count()); attempt++) {
  await touchDrawBtn.click()
  await touchPage.waitForTimeout(250)
}
check('the Line tool is reachable on a touch device', (await touchLineBtn.count()) > 0)
await touchLineBtn.click()
await touchPage.waitForTimeout(300)

const touchBox = await touchPage.locator('[data-page-index="0"] canvas').first().boundingBox()
await touchPage.touchscreen.tap(Math.round(touchBox.x + touchBox.width / 2), Math.round(touchBox.y + 200))
await touchPage.waitForTimeout(400)

const tappedByFinger = await linesOn(touchPage)
check(
  'one finger tap leaves one line',
  !tappedByFinger.error && tappedByFinger.lines.length === 1,
  tappedByFinger.error ?? JSON.stringify(tappedByFinger.lines)
)
check(
  'with its grabbers ready to stretch it',
  tappedByFinger.anchors === 2,
  `${tappedByFinger.anchors} grabber(s)`
)

await browser.close()

console.log('')
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`)
  for (const f of failures) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
