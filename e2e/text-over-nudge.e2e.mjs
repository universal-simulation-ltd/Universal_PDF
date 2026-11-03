// Two placement fixes (James, 2026-11-03):
//
//   • "When text is selected and then clicking the page, place the text
//     instead of selecting another item e.g. signature." With the Text tool in
//     hand, a click on a signature (an image annotation), a box or a mark puts
//     a new text box THERE, and the Text tool stays armed. A click on existing
//     text still selects it (and drops to Select), as before.
//   • "Allow the keyboard arrows to move selected items e.g. text pixel by
//     pixel for exact placement." An arrow moves the selection one SCREEN
//     pixel (Shift: ten), whatever the zoom; a run of presses is one undo.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:text-over-nudge      # in another terminal
//
// Negative control (2026-11-03, run): with `&& !textThrough` taken out of the
// pointerdown hit test in AnnotationLayer, the "text lands on the signature"
// checks go red.

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
  doc.addPage([595, 842]).drawText('Sign here', { x: 60, y: 740, size: 18, font })
  return Buffer.from(await doc.save())
}

// A small opaque PNG, so the signature has a hit area Konva can find.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYGD4z8DAwMAAAA0AAQ0iK9oAAAAASUVORK5CYII='

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

await page.setInputFiles('input[type=file]', { name: 'sign.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

const pageCanvas = page.locator('[data-page-index="0"] canvas').first()
const pageBox = await pageCanvas.boundingBox()
const state = () =>
  page.evaluate(() => {
    const s = window.__stores.ann.getState()
    return {
      tool: s.tool,
      selectedId: s.selectedId,
      selectedIds: s.selectedIds,
      scale: s.viewScale,
      past: s.past.length,
      annotations: s.annotations.map((a) => ({ id: a.id, type: a.type, x: a.x, y: a.y, points: a.points }))
    }
  })

// A signature: an image annotation, 160 x 60 page units at (100, 200).
await page.evaluate((src) => {
  const s = window.__stores.ann.getState()
  s.add({ id: 'sig-1', pageIndex: 0, type: 'image', x: 100, y: 200, width: 160, height: 60, src })
  s.setSelected(null)
  s.setTool('text')
}, PNG)
await page.waitForTimeout(400)

const before = await state()
const k = before.scale
// The middle of the signature, in screen pixels.
const sx = pageBox.x + (100 + 80) * k
const sy = pageBox.y + (200 + 30) * k

console.log('\nwith Text in hand, a click on a signature places text there')
await page.mouse.click(Math.round(sx), Math.round(sy))
await page.waitForTimeout(500)
const afterClick = await state()
const placed = afterClick.annotations.find((a) => a.type === 'text')
check('a text box was added', !!placed, JSON.stringify(afterClick.annotations))
check(
  'where the click was, on top of the signature',
  !!placed && Math.abs(placed.x - 180) < 2 && Math.abs(placed.y - 230) < 2,
  placed && `${placed.x},${placed.y}`
)
check('the signature was not selected', afterClick.selectedId !== 'sig-1', afterClick.selectedId)
check('the Text tool is still in hand', afterClick.tool === 'text', afterClick.tool)

// Type something, then Enter to keep it (Escape would cancel the edit).
await page.keyboard.type('Jo Bloggs')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await page.evaluate(() => window.__stores.ann.getState().setTool('text'))

console.log('\nbut a click on existing text still selects that text')
const typed = (await state()).annotations.find((a) => a.type === 'text')
const textCount = (await state()).annotations.filter((a) => a.type === 'text').length
// A couple of pixels into the box from its top-left corner.
await page.mouse.click(Math.round(pageBox.x + typed.x * k + 6), Math.round(pageBox.y + typed.y * k + 6))
await page.waitForTimeout(500)
const onText = await state()
check(
  'no second text box',
  onText.annotations.filter((a) => a.type === 'text').length === textCount,
  JSON.stringify(onText.annotations)
)
check('the text is selected', onText.selectedId === typed.id, onText.selectedId)

console.log('\narrow keys move the selection one screen pixel')
await page.evaluate(() => {
  const s = window.__stores.ann.getState()
  s.setTool('select')
  s.setSelected('sig-1')
})
await page.waitForTimeout(200)
const start = await state()
const sig0 = start.annotations.find((a) => a.id === 'sig-1')
const trRect = () =>
  page.evaluate(() => {
    const stage = window.Konva.stages.find((st) => st.findOne('#sig-1'))
    const tr = stage?.findOne('Transformer')
    return tr && tr.nodes().length ? tr.getClientRect() : null
  })
const trBefore = await trRect()
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(150)
const nudged = await state()
const sig1 = nudged.annotations.find((a) => a.id === 'sig-1')
check(
  'right 2 px, down 1 px',
  Math.abs((sig1.x - sig0.x) * k - 2) < 0.01 && Math.abs((sig1.y - sig0.y) * k - 1) < 0.01,
  `moved ${(sig1.x - sig0.x) * k}, ${(sig1.y - sig0.y) * k} px`
)
await page.keyboard.press('Shift+ArrowLeft')
await page.waitForTimeout(150)
const shifted = (await state()).annotations.find((a) => a.id === 'sig-1')
// The selection handles follow: the Transformer moved as far as the item did (+2, +1, then Shift -10).
const trAfter = await trRect()
check(
  'the selection handles moved with it',
  !!trBefore && !!trAfter && Math.abs(trAfter.x - trBefore.x + 8) < 0.5 && Math.abs(trAfter.y - trBefore.y - 1) < 0.5,
  JSON.stringify({ trBefore, trAfter })
)
check('Shift moves ten', Math.abs((sig1.x - shifted.x) * k - 10) < 0.01, `${(sig1.x - shifted.x) * k} px`)
check('the four presses are one undo step', (await state()).past === start.past + 1, `${start.past} → ${(await state()).past}`)

await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await page.waitForTimeout(200)
const undone = (await state()).annotations.find((a) => a.id === 'sig-1')
check('one undo puts it back', undone.x === sig0.x && undone.y === sig0.y, `${undone.x},${undone.y}`)

console.log('\na pen stroke moves too, and nothing moves with nothing selected')
await page.evaluate(() => {
  const s = window.__stores.ann.getState()
  s.add({ id: 'ink-1', pageIndex: 0, type: 'draw', points: [10, 10, 50, 50], color: '#000', strokeWidth: 2 })
})
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(150)
const ink = (await state()).annotations.find((a) => a.id === 'ink-1')
check('the stroke went up one pixel', Math.abs((10 - ink.points[1]) * k - 1) < 0.01, JSON.stringify(ink.points))
await page.evaluate(() => window.__stores.ann.getState().setSelected(null))
const idle = await state()
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(150)
check(
  'nothing selected: nothing moved',
  JSON.stringify((await state()).annotations) === JSON.stringify(idle.annotations)
)

console.log('\nan arrow typed inside a text box moves the caret, not the box')
await page.evaluate((id) => {
  const s = window.__stores.ann.getState()
  s.setSelected(id)
}, typed.id)
await page.mouse.dblclick(Math.round(pageBox.x + typed.x * k + 6), Math.round(pageBox.y + typed.y * k + 6))
await page.waitForTimeout(300)
const editing = await state()
const t0 = editing.annotations.find((a) => a.id === typed.id)
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(150)
const t1 = (await state()).annotations.find((a) => a.id === typed.id)
check('the box stayed put', t0.x === t1.x && t0.y === t1.y, `${t0.x},${t0.y} → ${t1.x},${t1.y}`)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
