// A "Sign here" box's extras: the "Please sign here" label above it and the
// Name: / Date: fill-in fields under it — and Send for signature waiting for a
// box.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:sigfield-extras      # in another terminal
//
// What is pinned here (James, 2026-10-13: the box's caption "Sign here • Name •
// Date" was cut off in the exported file; "just put 'Please sign here' above
// the box", one switch for name and date — "I have a distributor contract and
// it already has name and date fields separately" — and one for the label):
//
//   • Request tab: "Request name and date" and "“Please sign here” label"
//     switches; no "Ask for name" / "Ask for date". Both start off.
//   • Send for signature is disabled until an unsigned box is on the page.
//   • A box placed with both switches on carries `details` and `label`.
//   • Export: the box is the signature field with NO words inside it; the
//     label is page text just above it; "Name:" / "Date:" are page text under
//     it, each beside a real text field, in the places lib/sigFieldLayout says.
//   • Both switches off: no label, no text fields.
//   • A /Rotate 90 page: the fields land where the reader sees them.
//
// Writes before/after screenshots to $SHOTS (default: the OS temp dir).

import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const SHOTS = process.env.SHOTS ?? tmpdir()

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
      const probe = await mod[process.env.E2E_BROWSER || 'chromium'].launch()
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

const { PDFDocument, degrees } = await import('pdf-lib')
async function testPdf() {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  // Page 2 is portrait paper turned on its side: seen as 842 × 595.
  doc.addPage([595, 842]).setRotation(degrees(90))
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright[process.env.E2E_BROWSER || 'chromium'].launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

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

await page.setInputFiles('input[type=file]', { name: 'contract.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const sigStore = (fn) =>
  page.evaluate(async (src) => {
    const { useSignatureStore } = await import('/src/stores/signatureStore.ts')
    // eslint-disable-next-line no-new-func
    return new Function('s', src)(useSignatureStore.getState())
  }, fn)
const json = (v) => JSON.stringify(v)
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

// Export through the app's own path, then read the result back with pdf.js:
// every text item and widget, in the reader's view of each page (y down).
async function exportAndRead(annotations) {
  return page.evaluate(
    async ({ src, annotations }) => {
      const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
      const { openPdf } = await import('/src/lib/pdfjs.ts')
      const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
      const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
      const doc = await openPdf(out.slice()).promise
      const pages = []
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i)
        const vp = p.getViewport({ scale: 1 })
        const text = (await p.getTextContent()).items
          .filter((it) => it.str.trim())
          .map((it) => {
            const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
            return { str: it.str, x, baseline: y }
          })
        const widgets = (await p.getAnnotations())
          .filter((a) => a.subtype === 'Widget')
          .map((a) => {
            const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect)
            return {
              type: a.fieldType,
              name: a.fieldName,
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            }
          })
        pages.push({ text, widgets })
      }
      // Rendered page 1 for the record.
      const p1 = await doc.getPage(1)
      const vp1 = p1.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = vp1.width
      canvas.height = vp1.height
      await p1.render({ canvasContext: canvas.getContext('2d'), viewport: vp1, annotationMode: 1 }).promise
      void doc.destroy()
      return { pages, png: canvas.toDataURL('image/png'), b64: btoa(String.fromCharCode(...out)) }
    },
    { src: pdf.toString('base64'), annotations },
  )
}

// ── The Request tab ──────────────────────────────────────────────────────────
console.log('\nthe Request tab')
await store('s.resetDocument(); s.setTool("select")')
await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: 'Request', exact: true }).first().click()
await page.waitForTimeout(250)
const details = page.getByLabel('Request name and date')
const label = page.getByLabel('“Please sign here” label')
check('a "Request name and date" switch', (await details.count()) === 1)
check('a "Please sign here" label switch', (await label.count()) === 1)
check('no "Ask for name" / "Ask for date"', (await page.getByText('Ask for name').count()) + (await page.getByText('Ask for date').count()) === 0)
check('both start off', !(await details.isChecked()) && !(await label.isChecked()))
const send = page.getByRole('button', { name: 'Send for signature' }).first()
check('Send for signature is disabled with no box on the page', await send.isDisabled())
check('…and says why', (await page.getByText('Place a signature box first').count()) > 0)
await page.screenshot({ path: join(SHOTS, 'sigfield-request-tab-empty.png') })

await details.check({ force: true })
await label.check({ force: true })
check('the switches reach the store', json(await sigStore('return [s.requestDetails, s.requestLabel]')) === '[true,true]')

// Place a box the way the menu does: arm the tool, sweep a rectangle.
await page.getByRole('button', { name: 'Place signature box' }).click()
await page.waitForTimeout(250)
const canvasBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const k = canvasBox.width / 595
const sx = (x) => Math.round(canvasBox.x + x * k)
const sy = (y) => Math.round(canvasBox.y + y * k)
await page.mouse.move(sx(100), sy(300))
await page.mouse.down()
await page.mouse.move(sx(200), sy(330), { steps: 5 })
await page.mouse.move(sx(300), sy(360), { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(400)
const placed = (await store('return s.annotations')).filter((a) => a.type === 'sigfield')
check('one box placed, carrying details and label', placed.length === 1 && placed[0].details === true && placed[0].label === true && !placed[0].requireName && !placed[0].requireDate, json(placed))
// The "Click again to sign" pill is opaque orange at the box's centre; the box's
// own tint is nearly clear.
const hintInk = () =>
  page.evaluate(() => {
    let n = 0
    for (const c of document.querySelectorAll('[data-page-index="0"] .konvajs-content canvas')) {
      const k = c.width / 595
      const d = c.getContext('2d').getImageData(Math.round(160 * k), Math.round(325 * k), Math.round(80 * k), Math.round(10 * k)).data
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 2] < 80) n++
    }
    return n
  })
check('the new box is selected straight away', (await store('return s.selectedId')) === placed[0]?.id)
check('…and shows "Click again to sign" without clicking off and back', (await hintInk()) > 50, String(await hintInk()))
await page.locator('[data-page-index="0"]').screenshot({ path: join(SHOTS, 'sigfield-armed.png') })
// The selection frame hugs the BOX: its bottom-right handle at the box's
// corner (300, 360), not down at the bottom of the Name / Date rows (~402),
// where it went while the rows were part of the box's group.
const handleInk = (x, y) =>
  page.evaluate(
    ({ x, y }) => {
      let n = 0
      for (const c of document.querySelectorAll('[data-page-index="0"] .konvajs-content canvas')) {
        const k = c.width / 595
        const r = Math.round(6 * k)
        const d = c.getContext('2d').getImageData(Math.round(x * k) - r, Math.round(y * k) - r, 2 * r, 2 * r).data
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] < 170 && d[i + 2] < 90) n++
      }
      return n
    },
    { x, y },
  )
check('the resize handles sit on the box, not round the label and rows', (await handleInk(300, 360)) > 0 && (await handleInk(300, 402)) === 0, `${await handleInk(300, 360)} / ${await handleInk(300, 402)}`)
await store('s.setSelected(null)')
await page.waitForTimeout(250)
await page.locator('[data-page-index="0"]').screenshot({ path: join(SHOTS, 'sigfield-editor.png') })
// Where the editor drew the extras: ink in the page's annotation canvases in a
// band of page space. (It once laid them out as if every box sat at the top
// of the page, so the label went UNDER the box.)
const inkIn = (y1, y2) =>
  page.evaluate(
    ({ y1, y2 }) => {
      let n = 0
      for (const c of document.querySelectorAll('[data-page-index="0"] .konvajs-content canvas')) {
        const k = c.width / 595
        const ctx = c.getContext('2d')
        const d = ctx.getImageData(Math.round(100 * k), Math.round(y1 * k), Math.round(100 * k), Math.max(1, Math.round((y2 - y1) * k))).data
        for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++
      }
      return n
    },
    { y1, y2 },
  )
check('editor: the label is drawn above the box', (await inkIn(286, 298)) > 20)
check('editor: the Name: row is drawn under the box', (await inkIn(367, 381)) > 20)

await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: 'Request', exact: true }).first().click()
await page.waitForTimeout(250)
check('Send for signature is enabled once a box is on the page', await send.isEnabled())
await page.keyboard.press('Escape')

// ── Export ───────────────────────────────────────────────────────────────────
// The layout lib/sigFieldLayout gives a 200 × 60 box at (100, 300), English:
// label top 300 - 4 - 10 = 286; rows from 360 + 6 = 366, 16 high, 4 apart;
// the words' column ceil(5 × 10 × 0.55) + 6 = 34, so fields at x 134, 166 wide.
const box = { id: 'b1', pageIndex: 0, type: 'sigfield', x: 100, y: 300, width: 200, height: 60 }

console.log('\nexport with both switches on')
{
  const r = await exportAndRead([{ ...box, details: true, label: true }])
  const { text, widgets } = r.pages[0]
  await page.evaluate(() => 0)
  const sig = widgets.filter((w) => w.type === 'Sig')
  const tx = widgets.filter((w) => w.type === 'Tx')
  check('one signature field, at the box', sig.length === 1 && near(sig[0].x, 100) && near(sig[0].y, 300) && near(sig[0].width, 200) && near(sig[0].height, 60), json(sig))
  const inside = text.filter((t) => t.x >= 100 && t.x <= 300 && t.baseline > 300 && t.baseline < 360)
  check('no words inside the box', inside.length === 0, json(inside))
  const lab = text.find((t) => t.str.includes('Please sign here'))
  check('"Please sign here" just above the box', lab && near(lab.x, 100) && near(lab.baseline, 294, 2), json(lab))
  const name = text.find((t) => t.str.trim() === 'Name:')
  const date = text.find((t) => t.str.trim() === 'Date:')
  check('"Name:" under the box', name && near(name.x, 100) && near(name.baseline, 377, 2), json(name))
  check('"Date:" under that', date && near(date.x, 100) && near(date.baseline, 397, 2), json(date))
  const nf = tx.find((w) => /Name$/.test(w.name))
  const df = tx.find((w) => /Date$/.test(w.name))
  check('a Name text field beside "Name:"', nf && near(nf.x, 134) && near(nf.y, 366) && near(nf.width, 166) && near(nf.height, 16), json(tx))
  check('a Date text field beside "Date:"', df && near(df.x, 134) && near(df.y, 386) && near(df.width, 166) && near(df.height, 16), json(tx))
  // The fields are real ones: pdf-lib reads them back by name.
  const doc = await PDFDocument.load(Buffer.from(r.b64, 'base64'))
  const names = doc.getForm().getFields().map((f) => f.getName())
  check('the form lists the signature field and both text fields', names.length === 3 && names.some((n) => /_Name$/.test(n)) && names.some((n) => /_Date$/.test(n)), json(names))
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(SHOTS, 'sigfield-export.png'), Buffer.from(r.png.split(',')[1], 'base64'))
  writeFileSync(join(SHOTS, 'sigfield-export.pdf'), Buffer.from(r.b64, 'base64'))
}

console.log('\nexport with both switches off')
{
  const r = await exportAndRead([box])
  const { text, widgets } = r.pages[0]
  check('just the signature field', widgets.length === 1 && widgets[0].type === 'Sig', json(widgets))
  check('no words at all', text.length === 0, json(text))
}

console.log('\nexport on a page turned on its side')
{
  // On the rotated page, seen as 842 wide × 595 high.
  const r = await exportAndRead([{ ...box, pageIndex: 1, x: 400, y: 200, details: true, label: true }])
  const { text, widgets } = r.pages[1]
  const sig = widgets.find((w) => w.type === 'Sig')
  const nf = widgets.find((w) => w.type === 'Tx' && /Name$/.test(w.name))
  const df = widgets.find((w) => w.type === 'Tx' && /Date$/.test(w.name))
  check('the box where the reader sees it', sig && near(sig.x, 400) && near(sig.y, 200) && near(sig.width, 200) && near(sig.height, 60), json(sig))
  check('the Name field under it, as the reader sees it', nf && near(nf.x, 434) && near(nf.y, 266) && near(nf.width, 166) && near(nf.height, 16), json(nf))
  check('the Date field under that', df && near(df.x, 434) && near(df.y, 286) && near(df.width, 166) && near(df.height, 16), json(df))
  const lab = text.find((t) => t.str.includes('Please sign here'))
  check('the label above the box', lab && near(lab.x, 400) && near(lab.baseline, 194, 2), json(lab))
}

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
