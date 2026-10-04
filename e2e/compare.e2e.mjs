// Compare two PDFs — side by side, overlay, and word by word.
//
//   npm run dev                       # or serve a build; set E2E_BASE_URL
//   npm run test:compare:e2e
//
// What is pinned (James, 2026-10-04: "Compare two PDFs: a visual diff: side by
// side plus an overlay highlighting changed pixels per page; a text diff where
// both have text layers; built on the shared pdf.js worker"):
//
//   • Actions ▸ Advanced ▸ Compare with another PDF compares the open document
//     with one picked in the dialog.
//   • The page scan lists exactly the pages that differ (here: 2, where a
//     figure changed, and 3, which only the second document has).
//   • Overlay says an unchanged page is identical and paints a changed one.
//   • Text shows the removed and added words, and says when there's no text.
//   • No new pdf.js worker: the documents go through the app's shared one.

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

async function makePdf(pages) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const lines of pages) {
    const page = doc.addPage([595, 842])
    lines.forEach((l, i) => page.drawText(l, { x: 60, y: 760 - i * 30, size: 18, font }))
  }
  return Buffer.from(await doc.save())
}

const p1 = ['Tenancy agreement', 'Between the landlord and the tenant.']
const first = await makePdf([p1, ['The tenant shall pay rent of £900 monthly.', 'Notice period: one month.']])
const second = await makePdf([
  p1,
  ['The tenant shall pay rent of £950 monthly in advance.', 'Notice period: one month.'],
  ['Schedule of contents', 'One sofa, two chairs.'],
])
const scan = await (async () => {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  page.drawRectangle({ x: 60, y: 700, width: 300, height: 40 })
  return Buffer.from(await doc.save())
})()

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
const workers = []
page.on('worker', (w) => workers.push(w.url()))

try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'lease-v1.pdf', mimeType: 'application/pdf', buffer: first })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)
const workersBefore = workers.filter((u) => /pdf\.worker/.test(u)).length

console.log('\nopening Compare from the Actions menu')
await page.hover('button[aria-label*="Profil"]')
await page.waitForTimeout(400)
await page.locator('button[aria-haspopup="true"][aria-expanded]').filter({ hasText: 'Advanced' }).first().click()
await page.waitForTimeout(200)
await page.locator('text=Compare with another PDF').first().click()
await page.waitForSelector('[data-compare-dialog]', { timeout: 10000 })
check('the dialog opens and names the open document', /lease-v1\.pdf/.test(await page.locator('[data-compare-dialog]').innerText()))
await page.setInputFiles('[data-compare-input]', { name: 'lease-v2.pdf', mimeType: 'application/pdf', buffer: second })
await page.waitForSelector('[data-compare-changed]', { timeout: 20000 }).catch(() => {})
await page.waitForFunction(() => !/Comparing pages/.test(document.querySelector('[data-compare-summary]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {})
const changed = await page.locator('[data-compare-changed]').evaluateAll((els) => els.map((e) => e.dataset.compareChanged))
check('the scan lists exactly pages 2 and 3 as changed', JSON.stringify(changed) === '["2","3"]', JSON.stringify(changed))
check('it counts pages across the longer document', /of 3/.test(await page.locator('[data-compare-page]').innerText()))

console.log('\nside by side')
await page.waitForFunction(() => document.querySelectorAll('[data-compare-side] canvas').length === 2, null, { timeout: 10000 }).catch(() => {})
check('page 1 of both is drawn', (await page.locator('[data-compare-side] canvas').count()) === 2)
await page.locator('[data-compare-changed="3"]').click()
await page.waitForTimeout(800)
check('page 3, which only the second has, says so for the first', /No page 3/.test(await page.locator('[data-compare-side]').innerText()))
await page.screenshot({ path: join(HERE, '..', 'e2e-compare-side.png') })

console.log('\noverlay')
await page.click('[data-compare-mode="overlay"]')
await page.locator('[data-compare-changed="2"]').click()
await page.waitForSelector('[data-compare-ratio]', { timeout: 10000 })
await page.waitForTimeout(500)
const r2 = Number(await page.locator('[data-compare-ratio]').getAttribute('data-compare-ratio'))
check('a changed page reports changed pixels', r2 > 0 && r2 < 0.05, String(r2))
const colours = await page.evaluate(() => {
  const c = document.querySelector('[data-compare-overlay] canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let red = 0
  let green = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === 220 && d[i + 1] === 38) red++
    if (d[i] === 22 && d[i + 1] === 163) green++
  }
  return { red, green }
})
check('removed ink is red and added ink green', colours.red > 0 && colours.green > 0, JSON.stringify(colours))
await page.screenshot({ path: join(HERE, '..', 'e2e-compare-overlay.png') })
await page.click('button[aria-label="Previous page"]')
await page.waitForTimeout(800)
check(
  'an unchanged page says it is identical',
  Number(await page.locator('[data-compare-ratio]').getAttribute('data-compare-ratio')) === 0 &&
    /identical/.test(await page.locator('[data-compare-overlay]').innerText()),
)

console.log('\ntext')
await page.click('[data-compare-mode="text"]')
await page.waitForSelector('[data-compare-text]', { timeout: 15000 })
const dels = await page.locator('[data-diff="delete"]').allInnerTexts()
const ins = await page.locator('[data-diff="insert"]').allInnerTexts()
check('£900 shows as removed', dels.join(' ').includes('£900'), JSON.stringify(dels))
check('£950 and "in advance." show as added', ins.join(' ').includes('£950') && ins.join(' ').includes('in advance.'), JSON.stringify(ins))
check('the new page’s words show as added', ins.join(' ').includes('Schedule of contents'), JSON.stringify(ins))
await page.screenshot({ path: join(HERE, '..', 'e2e-compare-text.png') })

console.log('\na PDF with no text')
await page.locator('button', { hasText: 'Choose a different PDF' }).click({ trial: true }).catch(() => {})
await page.setInputFiles('[data-compare-input]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: scan })
await page.waitForTimeout(800)
await page.click('[data-compare-mode="text"]').catch(() => {})
await page.waitForSelector('[data-compare-text]', { timeout: 15000 }).catch(() => {})
check('text mode explains it needs text in both', (await page.locator('[data-compare-text="none"]').count()) === 1)

check(
  'no extra pdf.js worker was started',
  workers.filter((u) => /pdf\.worker/.test(u)).length === workersBefore,
  JSON.stringify(workers),
)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Escape closes it', (await page.locator('[data-compare-dialog]').count()) === 0)

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
