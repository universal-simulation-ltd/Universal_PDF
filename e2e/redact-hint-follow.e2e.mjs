// The redaction caption has to travel with its box.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:redact-hint          # in another terminal
//
// What is pinned (owner, 2026-09-01: "when filling with redact then moving the
// box the text 'this will be…' doesn't move with the box"):
//
//   • "This will be redacted on export" is drawn as a SIBLING of the redaction
//     Rect, not a child — `common` carries the Transformer ref and the resize
//     handler reads width()/height() off that node, which a Group does not
//     report. So nothing carries the caption along when Konva drags the Rect,
//     and the store (where its x/y come from) is only written on dragend.
//   • The assertions are taken MID-GESTURE, with the mouse still down. Checking
//     only after the drop would pass on the broken build too — the commit
//     re-renders the caption at the new x/y, so the bug is invisible once the
//     finger lifts.
//   • A resize is the same failure with a different gesture, so the Transformer
//     anchor is dragged too.
//
// Reads Konva's scene graph rather than pixels: the caption lives on a canvas,
// so there is no DOM node to measure, and a pixel diff could not tell the
// caption apart from the black box it sits on.
//
// Negative control (2026-09-01, run): with the `onTransform` /
// `syncRedactHint` wiring taken back out of AnnotationLayer, the two
// mid-gesture checks go red and the after-the-drop ones stay green — which is
// exactly the shape of the reported bug.

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
  page.drawText('Sensitive: 07700 900123', { x: 60, y: 700, size: 18, font })
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

await page.setInputFiles('input[type=file]', { name: 'redact.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

// The live geometry of the redaction box and of its caption, straight out of
// Konva. Both are read from the same Layer, so plain x/y are comparable.
const geometry = () =>
  page.evaluate(() => {
    const K = window.Konva
    if (!K || !K.stages) return { error: 'no Konva global on window' }
    for (const stage of K.stages) {
      const hint = stage
        .find('Text')
        .find((t) => t.text() === 'This will be redacted on export')
      if (!hint) continue
      // The redaction Rect is the only one on the page carrying an annotation
      // id (Transformer chrome is anonymous).
      const box = stage
        .find('Rect')
        .find((r) => !!r.id() && r.fill() === '#000000')
      if (!box) return { error: 'caption found but no redaction Rect beside it' }
      const round = (n) => Math.round(n * 100) / 100
      return {
        box: {
          x: round(box.x()),
          y: round(box.y()),
          width: round(box.width() * box.scaleX()),
          height: round(box.height() * box.scaleY()),
        },
        hint: {
          x: round(hint.x()),
          y: round(hint.y()),
          width: round(hint.width()),
          height: round(hint.height()),
        },
      }
    }
    return { error: 'no redaction caption on any stage' }
  })

// The caption is inset 4pt from the box's left edge, flush with its top, and
// 8pt narrower — see the `redact` case in AnnotationLayer.
function aligned(g) {
  if (!g || g.error) return false
  return (
    Math.abs(g.hint.x - (g.box.x + 4)) < 0.75 &&
    Math.abs(g.hint.y - g.box.y) < 0.75 &&
    Math.abs(g.hint.width - (g.box.width - 8)) < 1.5 &&
    Math.abs(g.hint.height - g.box.height) < 1.5
  )
}
const describe = (g) =>
  g?.error ? g.error : `box ${JSON.stringify(g.box)} vs caption ${JSON.stringify(g.hint)}`

// ── Draw a redaction wide enough to carry the caption ───────────────────────
// It only renders above 118×14 in page units; anything smaller is a bare box.
console.log('\na free-drawn redaction carries the caption')
// ⚠️ Two traps in getting to the tool. The Actions dropdown opens on HOVER and
// the "Redact" click re-renders it out from under the pointer, so the panel is
// usually gone by the time the submenu would be readable — hence the loop:
// hover the pill again and the submenu is found already open. And the count has
// to be checked BEFORE clicking "Redact", because that button is a toggle and a
// second click closes the submenu the first one opened.
const freeDraw = page.locator('button:has-text("Free draw")')
for (let attempt = 0; attempt < 4; attempt++) {
  await page.hover('button[aria-label$="Profile"]')
  await page.waitForTimeout(500)
  if (await freeDraw.count()) break
  const redactRow = page.locator('button:has-text("Redact")').first()
  if (!(await redactRow.count())) continue
  await redactRow.click()
  await page.waitForTimeout(400)
  if (await freeDraw.count()) break
}
check('the Redact submenu opened', (await freeDraw.count()) > 0)
await freeDraw.hover()
await freeDraw.click()
await page.waitForTimeout(300)

const pageCanvas = page.locator('[data-page-index="0"] canvas').first()
const pageBox = await pageCanvas.boundingBox()
const startX = pageBox.x + 60
const startY = pageBox.y + 140

await page.mouse.move(startX, startY)
await page.mouse.down()
await page.mouse.move(startX + 150, startY + 20, { steps: 4 })
await page.mouse.move(startX + 320, startY + 64, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(400)

const drawn = await geometry()
check('the caption is on the page', !drawn.error, drawn.error)
check('and sits inside the box it belongs to', aligned(drawn), describe(drawn))

// ── Move it ─────────────────────────────────────────────────────────────────
console.log('\nthe caption travels with the box while it is being dragged')
await page.locator('button[title^="Select / move"]:visible').first().click()
await page.waitForTimeout(250)

const grabX = startX + 160
const grabY = startY + 32
await page.mouse.move(grabX, grabY)
await page.mouse.down()
await page.mouse.move(grabX + 40, grabY + 30, { steps: 5 })
await page.mouse.move(grabX + 180, grabY + 150, { steps: 10 })
await page.waitForTimeout(120)

const midDrag = await geometry()
const moved = !midDrag.error && Math.abs(midDrag.box.x - drawn.box.x) > 40
check('the box really is somewhere else mid-drag', moved, describe(midDrag))
check('the caption came with it', aligned(midDrag), describe(midDrag))

await page.mouse.up()
await page.waitForTimeout(400)
const dropped = await geometry()
check('and it is still aligned once dropped', aligned(dropped), describe(dropped))

// ── Resize it ───────────────────────────────────────────────────────────────
// Same failure, different gesture: a Transformer resize scales the Rect live
// and only commits the new size on transformend.
console.log('\nand it keeps up while the box is being resized')
const before = await geometry()
const scale = await page.evaluate(() => {
  const K = window.Konva
  const st = (K.stages || []).find((s) => s.find('Text').some((t) => t.text() === 'This will be redacted on export'))
  return st ? st.scaleX() : 1
})
// Bottom-right corner of the box, in screen pixels.
const cornerX = pageBox.x + (before.box.x + before.box.width) * scale
const cornerY = pageBox.y + (before.box.y + before.box.height) * scale
await page.mouse.move(cornerX, cornerY)
await page.mouse.down()
await page.mouse.move(cornerX + 60, cornerY + 40, { steps: 6 })
await page.mouse.move(cornerX + 140, cornerY + 90, { steps: 8 })
await page.waitForTimeout(120)

const midResize = await geometry()
const grew = !midResize.error && midResize.box.width > before.box.width + 20
check('the box really is bigger mid-resize', grew, describe(midResize))
check('the caption grew with it', aligned(midResize), describe(midResize))

await page.mouse.up()
await page.waitForTimeout(400)
const resized = await geometry()
check('and stays aligned after the resize commits', aligned(resized), describe(resized))

await browser.close()

console.log('')
if (failures.length) {
  console.log(`${failures.length} failed:`)
  for (const f of failures) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
