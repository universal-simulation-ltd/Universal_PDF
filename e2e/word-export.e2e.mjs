// Export to Word: a PDF's text as an editable .docx.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:word-export          # in another terminal
//
// What is pinned (James, 2026-10-18: Word export, Word only):
//
//   • Actions → Advanced → Export to Word opens the dialog; Export saves a
//     .docx named after the PDF.
//   • Read back with the suite's own Word reader (@unisim/doc readDocx), the
//     file has the title as a heading, wrapped lines as whole paragraphs, the
//     bold phrase in bold, the list as typed, and a page break per page.
//   • A blank (scan-like) page comes across as a picture, and the dialog says
//     so.
//   • ⚠️ A redacted word is NOT in the Word file: it converts the document as
//     exported, not the original — so a page with a redaction (flattened on
//     export) comes across as a picture, and the dialog says why.
//
// The paragraph and heading rules are scripts/pdfToDocx.test.mjs.

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

// A short report: a title, a heading, two wrapped paragraphs (one with a bold
// phrase and a secret word to redact), a bullet list; page 2 text; page 3 a
// grey box and no text, like a scan.
const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
const doc = await PDFDocument.create()
const reg = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const p1 = doc.addPage([595, 842])
let y = 780
const line = (pg, parts, size = 11, x = 72) => {
  let cx = x
  for (const [text, font] of parts) {
    pg.drawText(text, { x: cx, y, size, font })
    cx += font.widthOfTextAtSize(text, size)
  }
  y -= size * 1.35
}
line(p1, [['Quarterly Report', bold]], 24)
y -= 10
line(p1, [['Summary', bold]], 16)
y -= 4
line(p1, [['Sales grew in every region this quarter, and the new ', reg]])
line(p1, [['shop opened on time. The ', reg], ['main driver', bold], [' was repeat custom.', reg]])
y -= 11
line(p1, [['The supplier code is ZEBRA42 and must stay private.', reg]])
const secretY = y + 11 * 1.35
y -= 11
line(p1, [['• Hire two more staff', reg]])
line(p1, [['• Open on Sundays', reg]])
const p2 = doc.addPage([595, 842])
y = 780
line(p2, [['Next Steps', bold]], 16)
line(p2, [['Review the figures again in January.', reg]])
const p3 = doc.addPage([595, 842])
p3.drawRectangle({ x: 100, y: 300, width: 395, height: 300, color: rgb(0.6, 0.6, 0.6) })
const pdf = Buffer.from(await doc.save())

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
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
await page.setInputFiles('input[type=file]', { name: 'report.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForFunction(async () => (await import('/src/stores/pdfStore.ts')).usePdfStore.getState().numPages === 3, null, { timeout: 30000 })
await page.waitForTimeout(500)
const { readFileSync } = await import('node:fs')
const dialog = page.getByRole('dialog', { name: 'Export to Word' })
// Actions → Advanced → Export to Word → Export; the saved file and what the
// dialog said afterwards.
async function exportToWord(first) {
  await page.getByRole('button', { name: 'Actions' }).first().click()
  if ((await page.getByText('Export to Word', { exact: true }).count()) === 0) await page.getByRole('button', { name: 'Advanced' }).click()
  const row = page.getByText('Export to Word', { exact: true })
  if (first) check('Actions → Advanced has Export to Word', (await row.count()) >= 1)
  await row.first().click()
  await dialog.waitFor({ timeout: 5000 })
  if (first) check('it opens the dialog, saying what comes across', (await dialog.getByText('columns, tables and pictures').count()) === 1)
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    dialog.getByRole('button', { name: 'Export to Word' }).click(),
  ])
  await dialog.getByText('Your Word document is ready.').waitFor({ timeout: 30000 })
  const said = await dialog.getByRole('status').innerText()
  if (first) await page.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'word-export.png') })
  await dialog.getByRole('button', { name: 'Done' }).click()
  return { name: download.suggestedFilename(), docx: readFileSync(await download.path()), said }
}

console.log('\nthe dialog')
const first = await exportToWord(true)
check('it saves report.docx', first.name === 'report.docx', first.name)
check('…and says the scanned page came across as a picture', first.said.includes('1 page had no text to copy'), first.said)
const docx = first.docx
writeFileSync(join(process.env.SHOTS ?? tmpdir(), 'word-export.docx'), docx)

console.log('\nthe Word file, read back by @unisim/doc')
const back = await page.evaluate(async (b64) => {
  const { readDocx } = await import('/node_modules/@unisim/doc/dist/index.js')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const rich = await readDocx(new File([bytes], 'report.docx'))
  return rich.blocks.map((b) => ({ kind: b.kind, level: b.level, text: (b.runs ?? []).map((r) => r.text).join(''), bold: (b.runs ?? []).filter((r) => r.bold).map((r) => r.text) }))
}, docx.toString('base64'))
const texts = back.map((b) => b.text)
check('the title is a level-1 heading', back.some((b) => b.kind === 'heading' && b.level === 1 && b.text === 'Quarterly Report'), json(back))
check('"Summary" and "Next Steps" are level-2 headings', ['Summary', 'Next Steps'].every((t) => back.some((b) => b.kind === 'heading' && b.level === 2 && b.text === t)), json(back))
check('wrapped lines are one paragraph', texts.includes('Sales grew in every region this quarter, and the new shop opened on time. The main driver was repeat custom.'), json(texts))
check('the bold phrase is bold', back.some((b) => b.bold.includes('main driver')), json(back))
check('the list keeps its bullets', texts.includes('• Hire two more staff') && texts.includes('• Open on Sundays'), json(texts))
check('page 2\'s text is there', texts.includes('Review the figures again in January.'), json(texts))
check('the scanned page is a picture', back.some((b) => b.kind === 'image'), json(back.map((b) => b.kind)))
check('a page break between pages', back.filter((b) => b.kind === 'pagebreak').length >= 2, json(back.map((b) => b.kind)))
check('(without a redaction, the supplier code is there)', texts.some((t) => t.includes('ZEBRA42')), json(texts))

console.log('\nwith a redaction')
// Redact "ZEBRA42" (the whole line, to be sure of it): 842 − baseline − ascent.
await page.evaluate(async (top) => {
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  useAnnotationStore.getState().add({ id: 'r1', type: 'redact', pageIndex: 0, x: 60, y: top - 4, width: 400, height: 20, fill: 'black' })
}, 842 - secretY - 11)

const second = await exportToWord(false)
const backR = await page.evaluate(async (b64) => {
  const { readDocx } = await import('/node_modules/@unisim/doc/dist/index.js')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const rich = await readDocx(new File([bytes], 'report.docx'))
  return rich.blocks.map((b) => ({ kind: b.kind, text: (b.runs ?? []).map((r) => r.text).join('') }))
}, second.docx.toString('base64'))
check('⚠️ the redacted word is NOT in the file', !second.docx.toString('latin1').includes('ZEBRA42') && !backR.some((b) => b.text.includes('ZEBRA42')), json(backR))
check('the redacted page comes across as a picture', backR[1]?.kind === 'image' || backR[0]?.kind === 'image', json(backR.map((b) => b.kind)))
check('…and the dialog says why', second.said.includes('2 pages had no text to copy (scans, or pages with a redaction)'), second.said)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
