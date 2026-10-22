// "Separate lines" (was "Separate click") — the signature pad's placement
// control, browser-level.
//
//   ./scripts/preview.ps1            # or preview.sh — Universal PDF is :5174
//   npm run test:separate            # in another terminal
//
// What is pinned, both halves of the same owner report (2026-08-29: "it's
// activated option only when date is switched (should be details and/or date)
// and then when placing it doesn't do it on a separate click anyway"):
//
//   • The control is LIVE as soon as "Add your details" is on, with nothing
//     typed. It used to need a name typed over the "Signed by: " seed, so it
//     appeared to belong to the date switch alone.
//   • Choosing "Separate lines" actually places separately WHEN THERE ARE
//     DETAILS. It used to bail silently (`&& !wantDetails`) and bake the lot,
//     so the control did nothing and said nothing about doing nothing.
//   • One piece per line, date LAST, all of them placed under the signature by
//     the same drop (2026-10-22; until then each needed a click of its own),
//     lined up with the ink; the tool goes straight back to Select.
//   • Each line still drags on its own, and one undo takes the lot.
//
// Negative control (2026-08-29, run): `git stash`-ing the three source files
// back turns three of these six red — the details gate, "stays armed", and the
// click count (queue emptied after 0, i.e. everything baked).

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
  page.drawText('Separate placement test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

// Signed in before boot, the way the other suites do it — the pad itself does
// not need an account, but the app's chrome is the same in both tests this way.
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

await page.setInputFiles('input[type=file]', { name: 'sep.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(500)

// ── Open the pad and draw something ─────────────────────────────────────────
await page.click('button[aria-label="Sign"]')
await page.click('button:has-text("+ Draw new")')
await page.waitForSelector('button:has-text("Advanced options")', { timeout: 5000 })

// The pad's drawing surface is the first canvas inside the dialog. A few
// strokes so `lines` is non-empty and Save produces real ink.
const pad_dialog = page.locator('div.fixed.inset-0:has-text("Advanced options")').first()
const pad = page.locator('.fixed.inset-0 canvas').first()
const padBox = await pad.boundingBox()
await page.mouse.move(padBox.x + 60, padBox.y + padBox.height * 0.6)
await page.mouse.down()
for (const dx of [40, 80, 120, 160]) {
  await page.mouse.move(padBox.x + 60 + dx, padBox.y + padBox.height * (dx % 80 ? 0.45 : 0.7))
}
await page.mouse.up()
await page.waitForTimeout(200)

await page.click('button:has-text("Advanced options")')
await page.waitForTimeout(250)

// ── 1. The gate: details alone must light the control ───────────────────────
// The wrapper carries `pointer-events-none` while inert, which is also what
// actually stops the buttons working — so the assertion reads the real gate
// rather than a lookalike.
const placementBlock = page.locator('div:has(> div:text-is("When placed"))').last()
const isLive = async () => {
  const cls = (await placementBlock.getAttribute('class')) ?? ''
  return !cls.includes('pointer-events-none')
}

console.log('\nthe "When placed" control follows the switches')
check('it starts inert with both switches off', !(await isLive()))

await page.click('label:has-text("Add your details")')
await page.waitForTimeout(200)
check('"Add your details" alone makes it live (nothing typed yet)', await isLive())

await page.click('label:has-text("Add your details")')
await page.waitForTimeout(200)
await page.click('label:has-text("Add date")')
await page.waitForTimeout(200)
check('"Add date" alone makes it live too', await isLive())

// ── 2. Separate placement with details actually places separately ───────────
await page.click('label:has-text("Add your details")')
await page.waitForTimeout(200)
const details = page.locator('textarea[aria-label="Details to show under the signature"]')
await details.fill(['Jane Smith', 'Head of Testing', 'jane@example.com'].join('\n'))
await page.waitForTimeout(200)

await page.click('button:has-text("Separate lines")')
await page.waitForTimeout(150)
// ⚠️ Scoped to the pad. A bare `button:has-text("Save")` also matches the
// MOBILE toolbar's Save, which is in the DOM at every viewport and merely
// hidden — Playwright picks it first and then waits for a button that will
// never be visible.
await pad_dialog.locator('button:has-text("Save")').click()
await page.waitForTimeout(800)

const selectActive = async () =>
  ((await page.locator('button[title^="Select / move"]').first().getAttribute('class')) ?? '').includes(
    'bg-cobalt'
  )
const annots = () =>
  page.evaluate(async () => (await import('/src/stores/annotationStore.ts')).useAnnotationStore.getState().annotations)

// Dropping the signature puts every line under it at once (James, 2026-10-22:
// "automatically place it underneath the signature once the signature
// location is picked. Allow the user to click and drag them individually
// still"). It used to take a click per line.
// ⚠️ Top third of the page: PlacementHint's live buttons sit dead centre.
const pageCanvas = page.locator('[data-page-index="0"] canvas').first()
const pageBox = await pageCanvas.boundingBox()
console.log('\none drop places the signature and every line under it')
await page.mouse.click(pageBox.x + 200, pageBox.y + 150)
await page.waitForTimeout(400)
const all = await annots()
const img = all.find((a) => a.type === 'image')
const lines = all.filter((a) => a.type === 'text')
check('the signature and four lines (name, 2 details, date)', !!img && lines.length === 4, JSON.stringify(all.map((a) => [a.type, a.text])))
check('the detail lines are there, in order', lines[1]?.text === 'Head of Testing' && lines[2]?.text === 'jane@example.com', JSON.stringify(lines.map((l) => l.text)))
check('the date is last', /\d{4}/.test(lines[3]?.text ?? ''), lines[3]?.text)
check('every line starts under the ink, lined up with it', !!img && lines.every((l) => l.y >= img.y + img.height && Math.abs(l.x - img.x) < 0.01), JSON.stringify({ img, lines }))
check('the tool is back to Select straight away', await selectActive())

console.log('\neach line still drags on its own')
const scale = pageBox.width / 595
const second = lines[1]
const from = { x: pageBox.x + (second.x + 10) * scale, y: pageBox.y + (second.y + second.fontSize * 0.5) * scale }
await page.mouse.click(from.x, from.y)
await page.waitForTimeout(250)
await page.mouse.move(from.x, from.y)
await page.mouse.down()
await page.mouse.move(from.x + 40, from.y + 30, { steps: 8 })
await page.mouse.move(from.x + 80, from.y + 60, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const after = await annots()
const moved = after.find((a) => a.id === second.id)
const others = after.filter((a) => a.id !== second.id)
check('the dragged line moved', moved && (Math.abs(moved.x - second.x) > 5 || Math.abs(moved.y - second.y) > 5), JSON.stringify({ before: second, after: moved }))
check('nothing else moved', others.every((o) => { const b = all.find((x) => x.id === o.id); return b && b.x === o.x && b.y === o.y }))

console.log('\nundo')
await page.evaluate(async () => {
  const s = (await import('/src/stores/annotationStore.ts')).useAnnotationStore.getState()
  s.undo()
  s.undo()
})
await page.waitForTimeout(200)
check('undoing the drag, then one more undo, takes the signature and its lines away together', (await annots()).length === 0, JSON.stringify(await annots()))

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
