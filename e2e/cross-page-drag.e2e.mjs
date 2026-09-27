// Dragging a placed item from one page onto another, browser-level.
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:cross-page-drag     # in another terminal
//
// James, 2026-09-27: "was unable to drag a signature placement from one page to
// another". Every page is its own Konva stage, so a dragged item could not leave
// its page's canvas — it vanished at the edge and, dropped on the next page,
// was committed off the bottom of the page it started on. What is pinned:
//
//   • Past its page's edge the dragged item is still visible, as a copy
//     floating over the document.
//   • Dropped over another page it MOVES there: it is drawn on that page's
//     stage, gone from the first, and lands where the pointer let go.
//   • Dropped back on its own page it moves as it always did.
//
// Negative control (2026-09-27, run): against the AnnotationLayer before the
// fix, 7 checks go red — no floating copy, and the code stays on page 1 at
// y=946, below the foot of an 842-high page, which is the bug as reported.
//
// A QR code stands in for the signature: both are placed images and take the
// same drag path, and the QR is armed without drawing on a pad.

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
  for (const n of [1, 2]) {
    const page = doc.addPage([595, 842])
    page.drawText(`Page ${n}`, { x: 60, y: 780, size: 20, font })
  }
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'two-pages.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="1"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

// Placed images per page, with where each one sits in page units.
async function placedImages() {
  return page.evaluate(() => {
    const out = {}
    for (const st of window.Konva?.stages ?? []) {
      const host = st.container().closest('[data-page-index]')
      if (!host) continue
      out[host.dataset.pageIndex] = st
        .find('Image')
        .filter((i) => !!i.id())
        .map((i) => ({ id: i.id(), x: i.x(), y: i.y(), w: i.width(), h: i.height() }))
    }
    return out
  })
}
const box = (i) => page.locator(`[data-page-index="${i}"] canvas`).first().boundingBox()

// Bring the join between the two pages into the middle of the window.
await page.mouse.move(700, 450)
await page.mouse.wheel(0, 500)
await page.waitForTimeout(700)
let p0 = await box(0)
let p1 = await box(1)
check('both pages are on screen', p0.y + p0.height > 200 && p1.y < 800, `page 1 ends ${p0.y + p0.height}, page 2 starts ${p1.y}`)

// ── Place a QR code near the foot of page 1 ─────────────────────────────────
await page.click('button[title="Add a QR code"]')
await page.waitForSelector('h2:has-text("Add a QR code")', { timeout: 5000 })
await page.fill('input[placeholder="https://example.com"]', 'https://unisim.co.uk')
await page.waitForTimeout(900)
await page.click('button:has-text("Add to page")')
await page.waitForTimeout(800)
const placeAt = { x: p0.x + p0.width * 0.5, y: p0.y + p0.height - 150 }
await page.mouse.move(placeAt.x, placeAt.y, { steps: 4 })
await page.mouse.click(placeAt.x, placeAt.y)
await page.waitForTimeout(800)
let placed = await placedImages()
check('the QR code lands on page 1', (placed['0'] ?? []).length === 1, JSON.stringify(placed))
const qr = placed['0'][0]

await page.click('button[title^="Select"]:visible')
await page.waitForTimeout(300)

// ── Drag it onto page 2 ─────────────────────────────────────────────────────
console.log('\na placed item dragged onto the next page moves there')
p0 = await box(0)
p1 = await box(1)
const grab = { x: placeAt.x, y: placeAt.y }
const drop = { x: p1.x + p1.width * 0.4, y: p1.y + 180 }
await page.mouse.move(grab.x, grab.y)
await page.mouse.down()
await page.mouse.move(grab.x, grab.y + 20, { steps: 3 })
await page.mouse.move(drop.x, drop.y, { steps: 12 })
await page.waitForTimeout(200)
const ghost = await page.evaluate(() => {
  const img = [...document.body.querySelectorAll(':scope > img.fixed')].find((i) => i.src.startsWith('data:'))
  if (!img) return null
  const r = img.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
})
check('mid-drag, past its page, the item is still drawn', !!ghost, 'no floating copy over the document')
check(
  'and it is drawn under the pointer, over page 2',
  !!ghost && ghost.cy > p1.y && Math.abs(ghost.cx - drop.x) < 60 && Math.abs(ghost.cy - drop.y) < 60,
  ghost && `copy centred at ${Math.round(ghost.cx)},${Math.round(ghost.cy)}, pointer at ${Math.round(drop.x)},${Math.round(drop.y)}`,
)
await page.mouse.up()
await page.waitForTimeout(800)

placed = await placedImages()
check('it is gone from page 1', (placed['0'] ?? []).length === 0, JSON.stringify(placed))
check('and drawn on page 2', (placed['1'] ?? []).length === 1, JSON.stringify(placed))
const moved = (placed['1'] ?? [])[0]
check('it is the same item, not a copy', !!moved && moved.id === qr.id)
const scale = p1.width / 595
if (moved) {
  const cx = p1.x + (moved.x + moved.w / 2) * scale
  const cy = p1.y + (moved.y + moved.h / 2) * scale
  check(
    'and it sits where the pointer let go',
    Math.abs(cx - drop.x) < 30 && Math.abs(cy - drop.y) < 30,
    `centre ${Math.round(cx)},${Math.round(cy)} vs drop ${Math.round(drop.x)},${Math.round(drop.y)}`,
  )
}
check(
  'the floating copy is gone once it lands',
  (await page.evaluate(() => [...document.body.querySelectorAll(':scope > img.fixed')].filter((i) => i.src.startsWith('data:')).length)) === 0,
)

// ── And a move within one page still works ──────────────────────────────────
console.log('\na drag that stays on its page moves as before')
const from = { x: drop.x, y: drop.y }
const to = { x: drop.x + 120, y: drop.y + 80 }
await page.mouse.move(from.x, from.y)
await page.mouse.down()
await page.mouse.move(to.x, to.y, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(600)
placed = await placedImages()
const again = (placed['1'] ?? [])[0]
check('still on page 2', (placed['1'] ?? []).length === 1 && (placed['0'] ?? []).length === 0, JSON.stringify(placed))
if (again && moved) {
  check(
    'moved by the drag',
    Math.abs((again.x - moved.x) * scale - 120) < 6 && Math.abs((again.y - moved.y) * scale - 80) < 6,
    `moved ${Math.round((again.x - moved.x) * scale)},${Math.round((again.y - moved.y) * scale)}`,
  )
}

// ── Undo puts it back on page 1 in one step ─────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await page.waitForTimeout(600)
placed = await placedImages()
check('two undos take it back to page 1', (placed['0'] ?? []).length === 1 && (placed['1'] ?? []).length === 0, JSON.stringify(placed))

await browser.close()

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
