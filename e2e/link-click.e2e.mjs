// A PDF's own hyperlinks are clickable in the viewer.
//
//   npm run build && mkdir -p srv && cp -r dist srv/pdf
//   python -m http.server 5174 --directory srv   # PDF's own registry port
//   E2E_BASE_URL=http://localhost:5174/pdf/ npm run test:link-click
//
// What is pinned (owner, 2026-09-04: "universal pdf - links don't seem to be
// clickable?"):
//
//   • An external URI link opens — in a NEW TAB, at the URL the PDF names, so
//     the click can never discard the document the reader has open.
//   • An internal link (a /GoTo destination) scrolls to the page it names.
//   • A `javascript:` URI is NOT rendered as a link at all. The URL comes out
//     of the file, so a hostile PDF must not be able to run in the app's own
//     origin — where the user's document is.
//   • Link boxes go inert while a DRAWING tool is active, so a highlight
//     dragged across a hyperlink still draws.
//   • …and are live again under Select.
//
// Negative control (2026-09-04, run): with <LinkLayer> removed from PdfPage,
// the boxes/popup/page-jump checks go red and the javascript: check stays green
// for the wrong reason — which is why it is paired with the count of boxes that
// DO render.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const TARGET = 'https://example.com/universal-pdf/link-target'

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

// A two-page PDF carrying three link annotations on page 1. pdf-lib has no API
// for these, so they are written the same way export.ts writes the app's own —
// a /Link annot with either a URI action or an explicit destination.
async function testPdf() {
  const { PDFDocument, PDFName, PDFString, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([595, 842])
  const p2 = doc.addPage([595, 842])
  p1.drawText('Visit the site', { x: 60, y: 760, size: 20, font })
  p1.drawText('Jump to page two', { x: 60, y: 700, size: 20, font })
  p1.drawText('Do not run this', { x: 60, y: 640, size: 20, font })
  p2.drawText('This is page two.', { x: 60, y: 400, size: 20, font })

  const annots = []
  function addLink(rect, extra) {
    annots.push(doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], ...extra
    })))
  }
  const uri = (u) => ({ A: doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(u) }) })

  addLink([58, 756, 200, 782], uri(TARGET))
  // Explicit destination: [pageRef, /XYZ, left, top, zoom].
  addLink([58, 696, 230, 722], {
    Dest: doc.context.obj([p2.ref, PDFName.of('XYZ'), null, null, null])
  })
  addLink([58, 636, 210, 662], uri('javascript:window.__pwned=1'))

  p1.node.set(PDFName.of('Annots'), doc.context.obj(annots))
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })

// Keep the click off the real internet: the assertion is the URL the popup was
// pointed at, not what lives there.
await context.route('https://example.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<title>target</title>ok' })
)

const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — serve the build first.`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'links.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForSelector('[data-pdf-link]', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(600)

const boxes = page.locator('[data-page-index="0"] [data-pdf-link]')

console.log('')
console.log("The page's links are there")
const targets = await boxes.evaluateAll((els) => els.map((e) => e.dataset.pdfLink))
check('both followable links render, and only those two', targets.length === 2, `got ${JSON.stringify(targets)}`)
check('the javascript: URI is refused', !targets.some((t) => (t ?? '').startsWith('javascript:')), JSON.stringify(targets))
check('the external link points where the PDF says', targets.includes(TARGET), JSON.stringify(targets))

console.log('')
console.log('Following an external link')
let popupUrl = ''
try {
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    page.locator(`[data-pdf-link="${TARGET}"]`).click()
  ])
  await popup.waitForLoadState('domcontentloaded').catch(() => {})
  popupUrl = popup.url()
  await popup.close()
} catch (e) {
  popupUrl = `no popup (${e.message.split('\n')[0]})`
}
check('opens the URL in a new tab', popupUrl === TARGET, popupUrl)
check(
  'and leaves the document open on the same tab',
  !page.isClosed() && (await page.locator('[data-page-index="0"]').count()) === 1
)

console.log('')
console.log('Following an internal link')
await page.evaluate(() => {
  document.querySelector('[data-page-index="0"]')?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(400)
// Tolerant on purpose: if the box isn't there at all (the negative control),
// this has to report a red check rather than throw the run away before the
// remaining ones have said anything.
await page.locator('[data-pdf-link="page:2"]').click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(1500)
const onScreen = await page.evaluate(() => {
  const el = document.querySelector('[data-page-index="1"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, vh: window.innerHeight }
})
check(
  'scrolls page 2 into view',
  !!onScreen && onScreen.top < onScreen.vh * 0.5 && onScreen.bottom > 0,
  JSON.stringify(onScreen)
)

console.log('')
console.log('Drawing still beats navigating')
await page.evaluate(() => {
  document.querySelector('[data-page-index="0"]')?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(400)
const pe = () =>
  page
    .locator(`[data-pdf-link="${TARGET}"]`)
    .evaluate((el) => getComputedStyle(el).pointerEvents, undefined, { timeout: 5000 })
    .catch(() => 'no such box')
check('live under Select', (await pe()) === 'auto')
await page.click('button[title^="Highlighter"]:visible')
await page.waitForTimeout(300)
check('inert under the Highlighter', (await pe()) === 'none')

await browser.close()

console.log('')
if (failures.length) {
  console.error(`${failures.length} check(s) failed:`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
