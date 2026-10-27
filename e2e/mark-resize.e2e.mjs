// A tick or cross placed on the page has to be resizable from its corners.
//
//   ./scripts/preview.ps1             # or preview.sh — Universal PDF is :5174
//   npm run test:mark-resize          # in another terminal
//
// What is pinned (owner, 2026-10-27): "i can't seem to change the size of the
// X" — a selected ✗ showed the rotate handle and nothing else, because tick
// and cross were missing from `isResizable`. The corners now scale the mark,
// kept square (it has one size, not a width and a height), and the new size is
// what is stored.
//
// Negative control, run 2026-10-27: tick and cross out of isResizable — the
// corner handle check goes red (no anchors, so the drag checks never run).

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
  doc.addPage([595, 842]).drawText('I have no close relationships', { x: 60, y: 740, size: 14, font })
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.addInitScript(() => {
  try { localStorage.setItem('unisim:default-view:pdf:page-scroll', 'vertical') } catch { /* no storage */ }
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — serve the build first.`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'marks.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

// The cross is a Group of two Lines; its id is on the Group. Its on-screen
// size is the Group's client rect (stroke included), which is what a person sees.
const crossBox = () =>
  page.evaluate(() => {
    const K = window.Konva
    for (const stage of K.stages) {
      for (const g of stage.find('Group')) {
        const lines = g.getChildren((n) => n.getClassName() === 'Line')
        if (!g.id() || lines.length !== 2) continue
        const r = g.getClientRect()
        return { id: g.id(), width: r.width, height: r.height }
      }
    }
    return null
  })

const anchorAt = (name) =>
  page.evaluate((n) => {
    const K = window.Konva
    for (const stage of K.stages) {
      const tr = stage.findOne('Transformer')
      if (!tr) continue
      const a = tr.findOne('.' + n)
      if (!a || !a.isVisible()) continue
      const box = a.getClientRect()
      const rect = stage.container().getBoundingClientRect()
      return { x: rect.x + box.x + box.width / 2, y: rect.y + box.y + box.height / 2 }
    }
    return null
  }, name)

const pageCanvas = page.locator('[data-page-index="0"] canvas').first()
const pageBox = await pageCanvas.boundingBox()
const at = { x: Math.round(pageBox.x + 200), y: Math.round(pageBox.y + 260) }

console.log('\na cross is placed and selected')
const crossButton = page.locator('button[aria-label="Cross"]:visible').first()
if (!(await crossButton.count())) {
  await page.locator('button[aria-label="Open drawing tools"]:visible').first().click()
  await page.waitForTimeout(250)
}
await crossButton.click()
await page.waitForTimeout(250)
await page.mouse.click(at.x, at.y)
await page.waitForTimeout(400)
const placed = await crossBox()
check('the cross landed on the page', !!placed, JSON.stringify(placed))

await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.locator('button[title^="Select"]:visible').first().click().catch(() => {})
await page.waitForTimeout(200)
await page.mouse.click(at.x, at.y)
await page.waitForTimeout(400)

const corner = await anchorAt('bottom-right')
check('the selected cross has a corner handle', !!corner, JSON.stringify(corner))

if (corner && placed) {
  console.log('\nand dragging the corner outwards makes it bigger, and keeps it square')
  await page.mouse.move(Math.round(corner.x), Math.round(corner.y))
  await page.mouse.down()
  await page.mouse.move(Math.round(corner.x + 40), Math.round(corner.y + 40), { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const grown = await crossBox()
  check('the cross got bigger', grown && grown.width > placed.width + 20, `${placed.width} -> ${grown?.width}`)
  check(
    'and is still square',
    grown && Math.abs(grown.width - grown.height) < 1,
    `${grown?.width} x ${grown?.height}`,
  )
  // The size has to be stored, not just a Konva scale left on the node: a
  // stored size means the group's scale is back to 1.
  const scale = await page.evaluate((id) => {
    const K = window.Konva
    for (const stage of K.stages) {
      const g = stage.findOne('#' + id)
      if (g) return { x: g.scaleX(), y: g.scaleY() }
    }
    return null
  }, grown?.id)
  check('the new size is the stored size, not a stretch', scale && scale.x === 1 && scale.y === 1, JSON.stringify(scale))
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
