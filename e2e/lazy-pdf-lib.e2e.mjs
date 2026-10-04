// pdf-lib loads when it is needed, not at start-up — and the one thing that
// needs it on OPEN still works.
//
//   npm run dev
//   npm run test:lazy-pdf-lib
//
// What is pinned (James, 2026-10-04: "Lazy pdf-lib: make it load only on
// first edit or export, if it can be done safely given the signature-field
// load path"):
//
//   • The landing page never fetches pdf-lib.
//   • Opening a PDF that carries "Sign here" boxes from an earlier export
//     still brings them back — the signature-field load path, which reads a
//     catalog key only pdf-lib can (pdf-lib packs the catalog into a
//     compressed object stream by default, so no byte scan could find it).
//     That is why opening a document loads pdf-lib in the background; see
//     `readEmbeddedSigFields` in stores/pdfStore.ts.

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

async function sigFieldPdf() {
  const { PDFDocument, PDFHexString, PDFName, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Sign in the box below.', { x: 60, y: 760, size: 20, font })
  doc.catalog.set(
    PDFName.of('UPDFSigFields'),
    PDFHexString.fromText(JSON.stringify([{ id: 'f1', pageIndex: 0, x: 60, y: 200, width: 220, height: 70, requireName: false }])),
  )
  // The default save: object streams on, so the catalog is compressed.
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
const requests = []
page.on('request', (r) => requests.push(r.url()))
const pdfLibRequested = () => requests.some((u) => /\/pdf-lib(\.js|\/)|deps\/pdf-lib/.test(u))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

console.log('\nstart-up')
await page.waitForTimeout(1500)
check('the landing page did not fetch pdf-lib', !pdfLibRequested(), requests.filter((u) => /pdf-lib/.test(u)).join(', '))

console.log('\nopening a PDF with "Sign here" boxes from an earlier export')
const pdf = await sigFieldPdf()
check('the fixture keeps its catalog in a compressed object stream', !pdf.includes(Buffer.from('UPDFSigFields')))
await page.setInputFiles('input[type=file]', { name: 'boxes.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
let boxes = 0
for (let i = 0; i < 40 && boxes === 0; i++) {
  await page.waitForTimeout(250)
  boxes = await page.evaluate(async () => {
    const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
    return useAnnotationStore.getState().annotations.filter((a) => a.type === 'sigfield').length
  })
}
check('the box comes back', boxes === 1, `${boxes} sigfield(s)`)
check('which is what fetched pdf-lib', pdfLibRequested())

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
