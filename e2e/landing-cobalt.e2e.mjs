// The "highlighter + blue" landing and toolbar (2026-10-12, from James's
// canvas) — the parts that are behaviour rather than paint:
//
//   ./scripts/preview.sh        # or `npx vite --port 5174`
//   npm run test:landing        # in another terminal
//
// What is pinned:
//
//   • The card is down to the drop circle and ONE row: "Try with example PDF"
//     and "More tools". No separate Compress pill, no "or", no tick list.
//   • Compress lives under More tools, first — and still does both jobs: one
//     file gives the single result, several give the batch.
//   • The tick list moved behind the "?" at the end of the privacy note: a
//     popover on a computer, a bottom sheet on a phone. It closes on ×,
//     Escape and a click outside, keeps Tab inside it, and hands focus back.
//   • The toolbar's "+" badges became corner notches — still buttons, still
//     named "Open … options", so every way into a tool's menu still works:
//     the notch, clicking the picked tool again, and press-and-hold.
//
// Env: BASE (default http://localhost:5174/)

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]
let pw = null
for (const rel of PLAYWRIGHT_CANDIDATES) {
  try {
    const mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    const probe = await mod.chromium.launch()
    await probe.close()
    pw = mod
    break
  } catch { /* try the next one */ }
}
if (!pw) {
  console.error('No Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
    failures.push(label)
  }
}

// A real, tiny PDF for the compress picker.
const { PDFDocument } = await import('pdf-lib')
async function makePdf(label) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 200])
  page.drawText(label, { x: 20, y: 100, size: 18 })
  return { name: `${label}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) }
}

const b = await pw.chromium.launch()

// ── Desktop landing ─────────────────────────────────────────────────────────
console.log('\nthe card: the drop circle and one row')
let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
let page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(BASE)
await page.waitForSelector('text=Try with example PDF')

check('"Try with example PDF" is there', await page.locator('button:has-text("Try with example PDF")').isVisible())
check('"More tools" is there', await page.locator('button[aria-controls="pdf-advanced-options"]').isVisible())
check('no Compress button until More tools is opened',
  (await page.locator('button:has-text("Compress PDF(s)")').count()) === 0)
check('no tick list on the card', (await page.locator('text=Sign PDF for free').count()) === 0)
check('the headline has its highlighter stroke',
  (await page.locator('h1 .pdf-highlighter').count()) === 1)
check('and the full stop is outside it', await page.evaluate(() => {
  const h1 = document.querySelector('h1')
  const em = h1?.querySelector('.pdf-highlighter')?.parentElement
  return !!em && !em.textContent.includes('.') && h1.textContent.trim().endsWith('.')
}))

// ── The "?" popover ─────────────────────────────────────────────────────────
console.log('\nthe "?" at the end of the privacy note')
const help = page.locator('button[aria-haspopup="dialog"][aria-label^="What"]')
check('the "?" is there', await help.isVisible())
await help.click()
const dialog = page.locator('[role="dialog"]:has-text("All free, nothing hidden")')
check('it opens "All free, nothing hidden"', await dialog.isVisible())
check('with all nine lines', (await dialog.locator('li').count()) === 9, await dialog.locator('li').count())
check('as a popover, not a sheet', (await dialog.evaluate((el) => getComputedStyle(el).position)) === 'absolute')
check('focus moved into it', await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
await page.keyboard.press('Tab')
await page.keyboard.press('Tab')
check('Tab stays inside it', await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
await page.keyboard.press('Escape')
check('Escape closes it', (await dialog.count()) === 0)
check('and focus is back on the "?"', await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'dialog'))
await help.click()
await page.mouse.click(200, 850)
check('a click outside closes it', (await dialog.count()) === 0)
await help.click()
await dialog.locator('button[aria-label="Close"]').click()
check('× closes it', (await dialog.count()) === 0)

// ── Compress under More tools ───────────────────────────────────────────────
console.log('\nCompress is the first of More tools, single and batch')
await page.click('button[aria-controls="pdf-advanced-options"]')
const first = page.locator('#pdf-advanced-options > button').first()
check('Compress is the first item', ((await first.textContent()) ?? '').includes('Compress PDF(s)'), await first.textContent())

let chooser = page.waitForEvent('filechooser')
await first.click()
await (await chooser).setFiles([await makePdf('one')])
await page.waitForSelector('text=Compression result', { timeout: 30000 }).catch(() => {})
check('one file → the single result', await page.locator('text=Compression result').isVisible())
await page.locator('button[aria-label="Close"]').first().click()
await page.waitForTimeout(300)

if (!(await page.locator('#pdf-advanced-options').count())) await page.click('button[aria-controls="pdf-advanced-options"]')
chooser = page.waitForEvent('filechooser')
await page.locator('#pdf-advanced-options > button').first().click()
await (await chooser).setFiles([await makePdf('two'), await makePdf('three')])
await page.waitForSelector('text=Compress 2 files', { timeout: 30000 }).catch(() => {})
check('two files → the batch', await page.locator('text=Compress 2 files').isVisible())
await ctx.close()

// ── Phone: the sheet ────────────────────────────────────────────────────────
console.log('\non a phone the list is a bottom sheet')
ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
page = await ctx.newPage()
await page.goto(BASE)
await page.waitForSelector('text=Try with example PDF')
await page.locator('button[aria-haspopup="dialog"][aria-label^="What"]').click()
const sheet = page.locator('[role="dialog"]:has-text("All free, nothing hidden")')
check('it opens', await sheet.isVisible())
const box = await sheet.boundingBox()
check('pinned to the bottom, full width', box && Math.abs(box.y + box.height - 844) < 2 && box.width >= 389, box)
await page.keyboard.press('Escape')
check('Escape closes it', (await sheet.count()) === 0)
await ctx.close()

// ── Toolbar notches ─────────────────────────────────────────────────────────
console.log('\nthe toolbar: every way into a tool\'s menu still works')
ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
page = await ctx.newPage()
await page.goto(BASE)
await page.click('text=Try with example PDF')
await page.waitForSelector('[data-page-index="0"]', { timeout: 30000 })
await page.waitForTimeout(500)
const panel = page.locator('[data-toolbar-panel]')

check('no "+" badges left', (await page.locator('header button:text-is("+"), .bg-slate-900 button:text-is("+")').count()) === 0)
await page.click('button[aria-label="Open text options"]:visible')
check('the Text notch opens its options, as the "+" did', (await panel.count()) === 1)
await page.keyboard.press('Escape')

const text = page.locator('button[title^="Add text"]:visible')
await text.click()
check('picking Text lights it cobalt', ((await text.getAttribute('class')) ?? '').includes('bg-cobalt'))
check('with the highlighter stroke under it', (await text.locator('.pdf-highlighter').count()) === 1)
check('and no options yet', (await panel.count()) === 0)
await text.click()
check('clicking the picked tool again opens them', (await panel.count()) === 1)
await page.keyboard.press('Escape')

const pen = page.locator('button[aria-label="Free draw"]:visible')
const pb = await pen.boundingBox()
await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2)
await page.mouse.down()
await page.waitForTimeout(700)
await page.mouse.up()
check('press-and-hold opens the drawing tools', (await panel.count()) === 1)
await page.keyboard.press('Escape')

await page.click('button[aria-label="Open colours"]:visible')
check('the swatches\' notch opens the colours', (await panel.count()) === 1)
await page.keyboard.press('Escape')
await ctx.close()

// ── Phone toolbar ───────────────────────────────────────────────────────────
console.log('\nthe phone\'s bottom bar has the same notch')
ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
page = await ctx.newPage()
await page.goto(BASE)
await page.click('text=Try with example PDF')
await page.waitForSelector('[data-page-index="0"]', { timeout: 30000 })
await page.waitForTimeout(500)
await page.locator('nav button[aria-label="Open drawing tools"]').click()
check('the Draw notch opens the drawing panel', await page.locator('button[title="Tick"]:visible').count() > 0)
await ctx.close()

await b.close()
check('no page errors', errors.length === 0, errors)
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed')
process.exit(failures.length ? 1 : 0)
