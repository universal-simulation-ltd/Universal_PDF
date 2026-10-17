// Page numbers at the foot of every page.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:page-numbers:e2e     # in another terminal
//
// What is pinned (James, 2026-10-18: "page numbers"):
//
//   • Actions → Advanced → Page numbers opens the dialog: Left / Centre /
//     Right, "1" or "Page 1 of 3".
//   • Add puts a number on every page, at the foot, set the chosen way; they
//     are in the exported file as text.
//   • Move a page and the numbers follow the page order (and the count).
//   • A number retyped by hand is left as it was.
//   • The dialog again: Update re-does them all; Remove takes them all off,
//     and one Undo brings them back.
//
// The arithmetic is scripts/pageNumbers.test.mjs.

import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
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
const json = (v) => JSON.stringify(v)

const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.create()
doc.addPage([595, 842])
doc.addPage([612, 792])
doc.addPage([595, 842])
const pdf = Buffer.from(await doc.save())

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await context.addInitScript(() => window.localStorage.setItem('universal:mock_session', 'james'))
try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.setInputFiles('input[type=file]', { name: 'three.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForFunction(async () => (await import('/src/stores/pdfStore.ts')).usePdfStore.getState().numPages === 3, null, { timeout: 30000 })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(500)
const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const numbers = async () => (await store('return s.annotations')).filter((a) => a.pageNumber).sort((a, b) => a.pageIndex - b.pageIndex)
const textW = (a) => page.evaluate(async (a) => (await import('/src/lib/textLayout.ts')).textBoxSize(a).width, a)

console.log('\nthe dialog')
await page.getByRole('button', { name: 'Actions' }).first().click()
await page.getByRole('button', { name: 'Advanced' }).click()
const row = page.getByText('Page numbers', { exact: true })
check('Actions → Advanced has Page numbers', (await row.count()) >= 1)
await row.first().click()
const dialog = page.getByRole('dialog', { name: 'Page numbers' })
await dialog.waitFor({ timeout: 5000 })
check('it opens the dialog', (await dialog.count()) === 1)
check('Centre and "1" are picked to start with', (await dialog.getByRole('button', { name: 'Centre' }).getAttribute('aria-pressed')) === 'true' && (await dialog.getByRole('button', { name: '1', exact: true }).getAttribute('aria-pressed')) === 'true')
await dialog.getByRole('button', { name: 'Right' }).click()
await dialog.getByRole('button', { name: 'Page 1 of 3' }).click()
await page.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'page-numbers-dialog.png') })
await dialog.getByRole('button', { name: 'Add page numbers' }).click()
await page.waitForTimeout(400)
check('Add closes the dialog', (await dialog.count()) === 0)

console.log('\nthe numbers')
let ns = await numbers()
check('one on every page, worded as chosen', json(ns.map((a) => [a.pageIndex, a.text])) === json([[0, 'Page 1 of 3'], [1, 'Page 2 of 3'], [2, 'Page 3 of 3']]), json(ns))
{
  const letter = ns[1]
  const w = await textW(letter)
  check('set right, 36pt in from the edge of ITS page (Letter)', Math.abs(letter.x + w - (612 - 36)) < 0.5, json({ x: letter.x, w }))
  check('…and 36pt up from the foot', Math.abs(letter.y + letter.fontSize * 1.25 - (792 - 36)) < 0.5, json(letter))
}
await page.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'page-numbers.png') })

console.log('\nexport')
const out = await page.evaluate(
  async ({ src, annotations }) => {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
    const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
    const d = await openPdf(out.slice()).promise
    const res = []
    for (let i = 1; i <= d.numPages; i++) {
      const p = await d.getPage(i)
      const vp = p.getViewport({ scale: 1 })
      const items = (await p.getTextContent()).items.filter((it) => it.str.trim())
      res.push({ text: items.map((it) => it.str).join(' '), y: items.length ? vp.convertToViewportPoint(items[0].transform[4], items[0].transform[5])[1] : null, h: vp.height })
    }
    void d.destroy()
    return res
  },
  { src: pdf.toString('base64'), annotations: await store('return s.annotations') },
)
check('each page of the file says its number', json(out.map((p) => p.text)) === json(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']), json(out))
check('…at the foot', out.every((p) => p.y > p.h - 50 && p.y < p.h - 30), json(out))

console.log('\nmoving a page')
// Page 3 to the front, as the page organiser does it.
await store('s.remapPages(new Map([[0, 1], [1, 2], [2, 0]]))')
await page.waitForTimeout(300)
ns = await numbers()
check('the numbers follow the new order', json(ns.map((a) => [a.pageIndex, a.text])) === json([[0, 'Page 1 of 3'], [1, 'Page 2 of 3'], [2, 'Page 3 of 3']]), json(ns))
{
  const onLetter = ns[2] // the Letter page is now third
  const w = await textW(onLetter)
  check('…each still set right on its page', Math.abs(onLetter.x + w - (612 - 36)) < 0.5, json({ x: onLetter.x, w }))
}

console.log('\na number retyped by hand')
await store('s.update(arg, { text: "Cover" })', ns[0].id)
await page.waitForTimeout(300)
check('is left as it was', (await numbers())[0].text === 'Cover')

console.log('\nUpdate and Remove')
await page.getByRole('button', { name: 'Actions' }).first().click()
if ((await page.getByText('Page numbers', { exact: true }).count()) === 0) await page.getByRole('button', { name: 'Advanced' }).click()
await page.getByText('Page numbers', { exact: true }).first().click()
await dialog.waitFor({ timeout: 5000 })
check('the dialog remembers how they were set', (await dialog.getByRole('button', { name: 'Right' }).getAttribute('aria-pressed')) === 'true' && (await dialog.getByRole('button', { name: 'Page 1 of 3' }).getAttribute('aria-pressed')) === 'true')
await dialog.getByRole('button', { name: 'Left' }).click()
await dialog.getByRole('button', { name: '1', exact: true }).click()
await dialog.getByRole('button', { name: 'Update page numbers' }).click()
await page.waitForTimeout(400)
ns = await numbers()
check('Update re-does them all (the retyped one too)', json(ns.map((a) => [a.text, a.x])) === json([['1', 36], ['2', 36], ['3', 36]]), json(ns))
await page.getByRole('button', { name: 'Actions' }).first().click()
if ((await page.getByText('Page numbers', { exact: true }).count()) === 0) await page.getByRole('button', { name: 'Advanced' }).click()
await page.getByText('Page numbers', { exact: true }).first().click()
await dialog.waitFor({ timeout: 5000 })
await dialog.getByRole('button', { name: 'Remove' }).click()
await page.waitForTimeout(300)
check('Remove takes them all off', (await numbers()).length === 0)
await store('s.undo()')
await page.waitForTimeout(300)
check('one Undo brings them all back', (await numbers()).length === 3)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
