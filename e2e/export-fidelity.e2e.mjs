// What the export writes, checked in the BYTES it produces — for the export
// bugs fixed together on 2026-10-01:
//
//   • rotated pages — annotations landed on the wrong edge, turned sideways;
//   • cropped pages — offset, and redacted ones stretched over the MediaBox;
//   • the reader's own marks under a redaction box were printed ON TOP of it;
//   • Turkish (ş ğ ı) in a form field failed every export, and in a text box
//     was folded to s g i;
//   • checkboxes, dropdowns and clearing a pre-filled field were dropped;
//   • WebP and GIF pictures failed the export ("SOI not found");
//   • a link under a redaction box survived it.
//
//   ./scripts/preview.sh        # or any dev server — Universal PDF is :5174
//   npm run test:export-fidelity
//
// It drives `buildAnnotatedPdfBytes` directly inside the app's own page (so
// the real pdf.js worker, canvas, fonts and fallback-font fetch are all in
// play), then re-opens each result with pdf.js and reads back pixels, text and
// link annotations. A UI test would only prove that a button was pressed.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Sibling repos that carry a Playwright install. See office-import.e2e.mjs.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      // next candidate
    }
  }
  console.error('No usable Playwright found — see office-import.e2e.mjs.')
  process.exit(2)
}

// ── Fixtures, built here with pdf-lib ────────────────────────────────────────

async function rotatedPage() {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792]).setRotation(degrees(90))
  return pdf.save()
}

async function croppedPage() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  page.setCropBox(100, 100, 400, 500)
  return pdf.save()
}

async function textPage(text) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  page.drawText(text, { x: 50, y: 700, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) })
  return pdf.save()
}

async function formPage() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const form = pdf.getForm()
  form.createTextField('name').addToPage(page, { x: 50, y: 700, width: 300, height: 24 })
  const pre = form.createTextField('pre')
  pre.setText('OLDVALUE')
  pre.addToPage(page, { x: 50, y: 650, width: 300, height: 24 })
  form.createCheckBox('agree').addToPage(page, { x: 50, y: 600, width: 30, height: 30, backgroundColor: rgb(1, 1, 1) })
  const dd = form.createDropdown('colour')
  dd.addOptions(['Red', 'Blue'])
  dd.addToPage(page, { x: 50, y: 550, width: 200, height: 24 })
  return pdf.save()
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64')

// ── Run ──────────────────────────────────────────────────────────────────────

const fixtures = {
  rotated: b64(await rotatedPage()),
  cropped: b64(await croppedPage()),
  text: b64(await textPage('PUBLIC TEXT')),
  form: b64(await formPage()),
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const page = await browser.newPage()
await page.goto(BASE)

const results = await page.evaluate(async (fx) => {
  const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
  const { pdfjsLib } = await import('/src/lib/pdfjs.ts')
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  const buf = (s) => bytes(s).buffer

  async function open(out) {
    const doc = await pdfjsLib.getDocument({ data: out.slice() }).promise
    const p = await doc.getPage(1)
    const viewport = p.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await p.render({ canvasContext: ctx, viewport }).promise
    const text = (await p.getTextContent()).items.map((i) => i.str).join(' ')
    const links = (await p.getAnnotations()).filter((a) => a.subtype === 'Link').map((a) => a.url)
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    // How many clearly dark pixels a box holds — for marks too thin to hit
    // with one sample, like a checkbox's tick.
    const dark = (x, y, w, h) => {
      const d = ctx.getImageData(x, y, w, h).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) n++
      return n
    }
    return { width: viewport.width, height: viewport.height, text, links, px, dark }
  }
  const isRed = ([r, g, b]) => r > 200 && g < 60 && b < 60
  const isWhite = ([r, g, b]) => r > 240 && g > 240 && b > 240
  const isBlack = ([r, g, b]) => r < 40 && g < 40 && b < 40
  const red = (x, y, w, h) => ({ id: crypto.randomUUID(), pageIndex: 0, type: 'rect', x, y, width: w, height: h, color: '#ff0000', filled: true })
  const text = (x, y, t, extra = {}) => ({ id: crypto.randomUUID(), pageIndex: 0, type: 'text', x, y, text: t, color: '#000000', fontSize: 14, ...extra })
  const redact = (x, y, w, h) => ({ id: crypto.randomUUID(), pageIndex: 0, type: 'redact', x, y, width: w, height: h })

  const out = []
  const check = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })
  const attempt = async (name, fn) => {
    try {
      await fn()
    } catch (e) {
      out.push({ name, ok: false, detail: String(e && e.message || e) })
    }
  }

  await attempt('rotated page', async () => {
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.rotated), [red(20, 20, 100, 60)], 1))
    check('rotated: view is 792×612', r.width === 792 && r.height === 612, `${r.width}×${r.height}`)
    check('rotated: mark is at the top-left the reader saw', isRed(r.px(70, 50)), r.px(70, 50))
    check('rotated: and not at the top-right', isWhite(r.px(792 - 70, 50)), r.px(792 - 70, 50))
    // Past the unrotated width (612): used to fall off the page entirely.
    const far = await open(await buildAnnotatedPdfBytes(buf(fx.rotated), [red(700, 500, 60, 60)], 1))
    check('rotated: mark beyond x=612 is still on the page', isRed(far.px(730, 530)), far.px(730, 530))
  })

  await attempt('cropped page', async () => {
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.cropped), [red(10, 10, 50, 50)], 1))
    check('cropped: view is the CropBox', r.width === 400 && r.height === 500, `${r.width}×${r.height}`)
    check('cropped: mark where it was placed', isRed(r.px(35, 35)), r.px(35, 35))
    const red2 = await open(await buildAnnotatedPdfBytes(buf(fx.cropped), [redact(200, 200, 50, 50), red(10, 10, 50, 50)], 1))
    check('cropped + redacted: page keeps the CropBox size', red2.width === 400 && red2.height === 500, `${red2.width}×${red2.height}`)
    check('cropped + redacted: box where it was placed', isBlack(red2.px(225, 225)), red2.px(225, 225))
  })

  await attempt('rotated + redacted', async () => {
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.rotated), [redact(20, 20, 100, 60), red(400, 400, 50, 50)], 1))
    check('rotated + redacted: not squashed into portrait', r.width === 792 && r.height === 612, `${r.width}×${r.height}`)
    check('rotated + redacted: box at the top-left the reader saw', isBlack(r.px(70, 50)), r.px(70, 50))
  })

  await attempt('marks under a redaction', async () => {
    const anns = [
      text(50, 50, 'SECRETID123'),
      redact(40, 40, 300, 40),
      text(50, 300, 'AFTERBOX'),
    ]
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.text), anns, 1))
    check('redact: a mark under the box is gone from the text', !r.text.includes('SECRETID123'), r.text)
    check('redact: and is black where it was', isBlack(r.px(60, 58)), r.px(60, 58))
    check('redact: a mark placed after the box stays on top', r.text.includes('AFTERBOX'), r.text)
  })

  await attempt('links and redaction', async () => {
    const link = (x, y, href) => text(x, y, '', { runs: [{ text: 'click here', link: href }] })
    const anns = [link(50, 50, 'https://covered.example/'), link(50, 400, 'https://kept.example/'), redact(40, 40, 300, 40)]
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.text), anns, 1))
    check('links: one under a redaction box is dropped', !r.links.some((u) => u && u.includes('covered')), JSON.stringify(r.links))
    check('links: one elsewhere is kept', r.links.some((u) => u && u.includes('kept')), JSON.stringify(r.links))
    const rot = await open(await buildAnnotatedPdfBytes(buf(fx.rotated), [link(500, 300, 'https://rotated.example/')], 1))
    check('links: kept on a rotated page', rot.links.some((u) => u && u.includes('rotated')), JSON.stringify(rot.links))
  })

  await attempt('Turkish', async () => {
    const f = await open(await buildAnnotatedPdfBytes(buf(fx.form), [], 1, [{ pageIndex: 0, fieldName: 'name', value: 'Şişli Iğdır ılık' }]))
    check('Turkish form field: exports, letters intact', f.text.includes('Şişli') && f.text.includes('ılık'), f.text)
    const t = await open(await buildAnnotatedPdfBytes(buf(fx.text), [text(50, 100, 'Işık ğüş')], 1))
    check('Turkish text box: ı and ş survive', t.text.includes('Işık') && t.text.includes('ğüş'), t.text)
    const g = await open(await buildAnnotatedPdfBytes(buf(fx.text), [text(50, 100, 'Привет Γειά')], 1))
    check('Cyrillic + Greek text box', g.text.includes('Привет') && g.text.includes('Γειά'), g.text)
  })

  await attempt('form widgets', async () => {
    const values = [
      { pageIndex: 0, fieldName: 'agree', value: 'Yes' },
      { pageIndex: 0, fieldName: 'colour', value: 'Blue' },
      { pageIndex: 0, fieldName: 'pre', value: '' },
    ]
    const r = await open(await buildAnnotatedPdfBytes(buf(fx.form), [], 1, values))
    check('dropdown: the chosen option is written', r.text.includes('Blue'), r.text)
    check('clearing a pre-filled field clears it', !r.text.includes('OLDVALUE'), r.text)
    // The 30×30 box at (50, 600), inset past its border → view (55, 792-625).
    const blank = await open(await buildAnnotatedPdfBytes(buf(fx.form), [], 1, [{ pageIndex: 0, fieldName: 'agree', value: 'Off' }]))
    const ticked = r.dark(55, 792 - 625, 20, 20)
    const unticked = blank.dark(55, 792 - 625, 20, 20)
    check('checkbox: ticked in the output', ticked > unticked + 10, { ticked, unticked })
    const un = await open(await buildAnnotatedPdfBytes(buf(fx.form), [], 1, [{ pageIndex: 0, fieldName: 'pre', value: 'NEWVALUE' }]))
    check('text field: typed value replaces the old one', un.text.includes('NEWVALUE') && !un.text.includes('OLDVALUE'), un.text)
  })

  await attempt('pictures', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 40
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 40, 40)
    const webp = canvas.toDataURL('image/webp')
    check('fixture really is WebP', webp.startsWith('data:image/webp'))
    const pic = (src) => ({ id: crypto.randomUUID(), pageIndex: 0, type: 'image', x: 100, y: 100, width: 80, height: 80, src })
    const w = await open(await buildAnnotatedPdfBytes(buf(fx.text), [pic(webp)], 1))
    check('WebP picture exports', isRed(w.px(140, 140)), w.px(140, 140))
    // 1×1 GIF (red).
    const gif = 'data:image/gif;base64,R0lGODlhAQABAPAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='
    const g = await open(await buildAnnotatedPdfBytes(buf(fx.text), [pic(gif)], 1))
    check('GIF picture exports', isRed(g.px(140, 140)), g.px(140, 140))
    // A PNG labelled as JPEG must still embed — the bytes decide, not the label.
    canvas.getContext('2d')
    const png = canvas.toDataURL('image/png').replace('image/png', 'image/jpeg')
    const p = await open(await buildAnnotatedPdfBytes(buf(fx.text), [pic(png)], 1))
    check('mislabelled PNG exports', isRed(p.px(140, 140)), p.px(140, 140))
  })

  return out
}, fixtures)

await browser.close()

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : `  -> ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}`}`)
}
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
