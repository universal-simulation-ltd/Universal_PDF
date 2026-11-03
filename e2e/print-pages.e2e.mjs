// Which pages to print (James, 2026-11-03: "on the print popup and advanced
// give the choice for which pages to print").
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:print-pages          # in another terminal
//
// The Export dialog's Print and Advanced export's Print (new) both send only
// the pages chosen: All, This page, or a typed range. Advanced's Download cuts
// the file to the same pages. The bytes handed to the printer are caught at
// URL.createObjectURL and their pages counted with pdf-lib.
//
// Negative control (2026-11-03, run): with `doPrint` in ExportModal printing
// `annotated` whatever the choice, the Export "1 page" / "pages 2 and 4" checks
// go red.

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

const { PDFDocument, StandardFonts } = await import('pdf-lib')
async function testPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 5; i++) doc.addPage([595, 842]).drawText(`Page ${i}`, { x: 60, y: 740, size: 28, font })
  return Buffer.from(await doc.save())
}
// The text on each page of a printed file, by page — "Page 2", "Page 4".
async function pagesOf(b64) {
  const doc = await PDFDocument.load(Buffer.from(b64, 'base64'))
  return doc.getPageCount()
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
  // Catch every PDF handed to the printer, and keep the print frame from
  // printing (or falling back to a new tab).
  window.__printed = []
  const make = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (blob) => {
    if (blob && blob.type === 'application/pdf') {
      blob.arrayBuffer().then((buf) => {
        let s = ''
        const u = new Uint8Array(buf)
        for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
        window.__printed.push(btoa(s))
      })
    }
    return make(blob)
  }
  window.open = () => null
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get() {
      const w = desc.get.call(this)
      return w && { focus() {}, print() {} }
    }
  })
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'five.pdf', mimeType: 'application/pdf', buffer: await testPdf() })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

async function lastPrinted(before) {
  for (let i = 0; i < 40; i++) {
    const all = await page.evaluate(() => window.__printed)
    if (all.length > before) return all[all.length - 1]
    await page.waitForTimeout(150)
  }
  return null
}
const printedCount = () => page.evaluate(() => window.__printed.length)

async function openExport() {
  await page.getByRole('button', { name: /export/i }).first().click()
  await page.waitForSelector('text=Export PDF', { timeout: 15000 })
  await page.waitForSelector('[data-pages-picker]', { timeout: 30000 })
}
const printBtn = () => page.getByRole('button', { name: 'Print', exact: true }).last()

console.log('\nthe Export dialog asks which pages to print')
await openExport()
check('a "Pages to print" choice is there', (await page.getByRole('radiogroup', { name: 'Pages to print' }).count()) === 1)

let n = await printedCount()
await printBtn().click()
let got = await lastPrinted(n)
check('All prints all five', got && (await pagesOf(got)) === 5, got && `${await pagesOf(got)} pages`)

await page.getByRole('radio', { name: 'This page' }).click()
n = await printedCount()
await printBtn().click()
got = await lastPrinted(n)
check('This page prints 1 page', got && (await pagesOf(got)) === 1, got && `${await pagesOf(got)} pages`)

await page.getByRole('radio', { name: 'Choose' }).click()
const field = page.getByRole('textbox', { name: 'Pages to print' })
await field.fill('9')
check('a page the file does not have is refused', await printBtn().isDisabled())
check('and says why', (await page.getByText('Pages 1 to 5 only').count()) === 1)
await field.fill('2, 4')
n = await printedCount()
await printBtn().click()
got = await lastPrinted(n)
check('"2, 4" prints pages 2 and 4', got && (await pagesOf(got)) === 2, got && `${await pagesOf(got)} pages`)

console.log('\nand so does Advanced export, for its file and its new Print')
await page.keyboard.press('Escape')
await page.evaluate(() => window.__stores.pdf.getState().setAdvancedExportOpen(true))
await page.waitForSelector('[data-pages-picker]', { timeout: 30000 })
await page.getByRole('radio', { name: 'Choose' }).click()
await page.getByRole('textbox', { name: 'Pages' }).fill('1-3')
n = await printedCount()
await printBtn().click()
got = await lastPrinted(n)
check('Print sends pages 1-3', got && (await pagesOf(got)) === 3, got && `${await pagesOf(got)} pages`)
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.getByRole('button', { name: /^.?\s*Download/ }).last().click()
])
const path = await download.path()
const { readFileSync } = await import('node:fs')
const saved = await PDFDocument.load(readFileSync(path))
check('Download saves pages 1-3', saved.getPageCount() === 3, `${saved.getPageCount()} pages`)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
