#!/usr/bin/env node
// The App Store app preview for Universal PDF: 15–30 s of the real app, 886×1920.
//
//   npm run build:mobile                    # the bundle the iOS shell loads
//   node store-assets/preview.mjs           # → store-assets/out/en-GB/preview/iphone-01.mp4
//   node store-assets/preview.mjs --stills  # and PNG stills beside it, to look at
//   DIST=/elsewhere/dist node store-assets/preview.mjs   # a bundle built elsewhere
//
// The recorder, the status bar and the encoding are the UNI·SIM store kit's
// (Docs_UNI_SIM/store-kit/preview.mjs). The app is served from dist/ as
// generate.mjs serves it, and driven in English. The document is the same
// invented allotment-society form generate.mjs draws for the screenshots:
// every name, address and number on it is made up (the phone number is from
// Ofcom's range reserved for fiction).
//
// The story: the form is open; its fields are typed into on the page, a line
// is highlighted, a signature is drawn and put on the line, and the filled,
// signed form is held to the end.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dist = process.env.DIST ? path.resolve(process.env.DIST) : path.join(root, 'dist')
const kit = await import(pathToFileURL(path.resolve(root, '../../Docs_UNI_SIM/store-kit/preview.mjs')).href)
const { IPHONE, playwright, prepare, record, stills, tap, hold } = kit

const ORIGIN = 'https://app.test'
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.bcmap': 'application/octet-stream',
}

// ── The sample document (generate.mjs's, in English) ───────────────────────
const A4 = [595.28, 841.89]
// Where things are, in PDF points (origin bottom-left), so the script can tap them.
const AT = {
  rulesLine: { x0: 38, x1: 345, y: 390 },
  signature: { x: 185, y: 262 },
}
const FIELDS = [
  // name, x, y, w, value
  ['Full name', 40, 600, 515, 'Sam Taylor'],
  ['Address', 40, 552, 360, '14 Mill Lane, Hexley'],
  ['Postcode', 415, 552, 140, 'RV7 3QT'],
  ['Email', 40, 504, 300, 'sam.taylor@example.com'],
  ['Phone', 355, 504, 200, '07700 900123'],
  ['Plot size', 40, 422, 250, 'Half plot (125 m²)'],
  ['Start date', 305, 422, 250, '1 March 2027'],
  ['Date', 355, 262, 200, '14 September 2026'],
]

async function samplePdf() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Allotment plot application')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage(A4)
  const green = rgb(0.18, 0.4, 0.23), ink = rgb(0.12, 0.14, 0.16), grey = rgb(0.4, 0.44, 0.48), line = rgb(0.78, 0.8, 0.82)
  const text = (s, x, y, size = 10.5, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color })

  page.drawRectangle({ x: 0, y: 766, width: A4[0], height: 76, color: green })
  page.drawCircle({ x: 62, y: 804, size: 20, color: rgb(0.62, 0.81, 0.42) })
  text('RA', 51, 799, 13, bold, green)
  text('Riverside Allotment Society', 96, 810, 20, bold, rgb(1, 1, 1))
  text('Application for a plot  ·  2026–27 season', 96, 790, 11, font, rgb(0.86, 0.93, 0.86))

  text('About the plots', 40, 736, 13, bold, green)
  ;[
    'Plots are let for twelve months from 1 March. Tenants agree to keep at least three-',
    'quarters of the plot in cultivation, to keep shared paths clear, and to use the water',
    'butts rather than the mains taps between May and September.',
  ].forEach((l, i) => text(l, 40, 710 - 15 * i))

  text('Your details', 40, 648, 13, bold, green)
  const form = pdf.getForm()
  for (const [name, x, y, w] of FIELDS) {
    text(name, x, y + 30, 9, bold, grey)
    const f = form.createTextField(name)
    f.addToPage(page, { x, y, width: w, height: 24, borderColor: line, borderWidth: 1, backgroundColor: rgb(1, 1, 1) })
  }

  text('The plot you would like', 40, 470, 13, bold, green)
  page.drawRectangle({ x: 40, y: 384, width: 12, height: 12, borderColor: grey, borderWidth: 1 })
  text('I have read the allotment rules and agree to keep them.', 60, 386)
  page.drawRectangle({ x: 40, y: 362, width: 12, height: 12, borderColor: grey, borderWidth: 1 })
  text('Please add me to the seed swap mailing list.', 60, 364)

  text('Signature', 40, 326, 13, bold, green)
  text('Signed by the applicant', 40, 250, 9, bold, grey)
  page.drawLine({ start: { x: 40, y: 262 }, end: { x: 330, y: 262 }, thickness: 1, color: ink })

  page.drawLine({ start: { x: 40, y: 96 }, end: { x: 555, y: 96 }, thickness: 0.5, color: line })
  text('Return this form to the plot secretary, Riverside Allotment Society, Mill Lane, Hexley.', 40, 78, 9, font, grey)
  text('Page 1 of 1', 505, 60, 9, bold, grey)
  return Buffer.from(await pdf.save())
}

// ── Serving the app ────────────────────────────────────────────────────────
async function serve(ctx) {
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) return route.abort()
    let p = decodeURIComponent(url.pathname)
    if (p.endsWith('/')) p += 'index.html'
    try {
      const file = path.join(dist, p)
      await route.fulfill({ body: await readFile(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
    } catch {
      await route.fulfill({ status: 404, body: '' })
    }
  })
}

const { chromium } = await playwright()
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...IPHONE, locale: 'en-GB' })
await ctx.addInitScript(() => {
  try {
    // The phone's one-off welcome toast, and the "tap where it goes" card the
    // signature tool shows, as they are once someone has seen them.
    localStorage.setItem('universal-pdf-mobile-welcome-dismissed', '1')
    localStorage.setItem('unisim:prefs:pdf', JSON.stringify({ placementHintDismissed: true }))
    localStorage.setItem('universal:language', 'en-gb')
  } catch {}
})
await serve(ctx)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await prepare(page)
await page.goto(`${ORIGIN}/index.html`)
await page.waitForTimeout(1500)

// ── Helpers on the page ────────────────────────────────────────────────────
const sheet = page.locator('[data-page-index="0"] canvas').first()
/** PDF points → the screen point over them. */
async function at(x, y) {
  const box = await sheet.boundingBox()
  const s = box.width / A4[0]
  return { x: box.x + x * s, y: box.y + (A4[1] - y) * s }
}
const nav = (label) => page.locator(`nav.fixed button:has-text("${label}")`).first()
async function fillField(name, value) {
  await tap(page, page.locator(`[title="Click to fill: ${name}"]`).first(), { after: 200 })
  await typeIn(value, 40)
  await page.keyboard.press('Enter')
  await hold(page, 220)
}
// The machine recording this may be busy, and every Playwright call is a
// round trip, so a stroke or a word sent one point or key per call plays back
// at whatever speed the machine had. These two run inside the page on its own
// clock instead: the same pointer events and text input a finger and the
// keyboard give, paced by real time, so a busy machine drops frames rather
// than slowing the film down.

/** Type into the focused field, a letter every `ms`. */
async function typeIn(text, ms) {
  await page.evaluate(async ({ text, ms }) => {
    const t0 = performance.now()
    for (let i = 0; i < text.length; i++) {
      const wait = t0 + i * ms - performance.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      document.execCommand('insertText', false, text[i])
    }
  }, { text, ms })
}
/** A finger dragged through points (screen coordinates) over `ms`. */
async function stroke(points, ms) {
  await page.evaluate(async ({ points, ms }) => {
    const target = document.elementFromPoint(points[0][0], points[0][1])
    const fire = (type, [x, y]) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, button: 0, pressure: type === 'pointerup' ? 0 : 0.5,
    }))
    fire('pointerdown', points[0])
    const t0 = performance.now()
    let sent = 1
    await new Promise((done) => {
      const step = (now) => {
        const upTo = Math.min(points.length, 1 + Math.floor(((now - t0) / ms) * (points.length - 1)))
        for (; sent < upTo; sent++) fire('pointermove', points[sent])
        if (sent < points.length) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
    fire('pointerup', points[points.length - 1])
  }, { points, ms })
}
async function deselect() {
  await tap(page, nav('Select'), { after: 250 })
  await tap(page, await at(520, 330), { after: 300 })
}

// Before the camera rolls: the blank form, open and settled.
await page.locator('input[type=file]').first().setInputFiles({
  name: 'Allotment-plot-application.pdf', mimeType: 'application/pdf', buffer: await samplePdf(),
})
await sheet.waitFor({ timeout: 30000 })
await page.getByText('Loading PDF…').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1800)

const out = path.join(here, 'out/en-GB/preview/iphone-01.mp4')
await record(page, async () => {
  // Typed straight into the form's own fields.
  for (const [name, , , , value] of FIELDS) await fillField(name, value)
  await deselect()

  // A highlight across the line that matters.
  await tap(page, page.locator('nav button:text-is("+")').nth(1), { after: 450 })
  await tap(page, page.locator('button[title="Highlighter"]').last(), { after: 300 })
  await page.locator('nav button:text-is("+")').nth(1).click().catch(() => {})
  await hold(page, 250)
  const a = await at(AT.rulesLine.x0, AT.rulesLine.y), b = await at(AT.rulesLine.x1, AT.rulesLine.y)
  await stroke(Array.from({ length: 41 }, (_, i) => [a.x + ((b.x - a.x) * i) / 40, a.y]), 700)
  await hold(page, 400)
  await deselect()

  // A signature, drawn with a finger…
  await tap(page, nav('Sign'), { after: 500 })
  await tap(page, page.locator('button:has-text("+ Draw new")').first(), { after: 700 })
  const pad = page.locator('.fixed.inset-0 canvas').first()
  await pad.waitFor()
  await page.evaluate(() => document.activeElement?.blur?.())
  await hold(page, 250)
  const p = await pad.boundingBox()
  const loops = []
  for (let t = 0; t <= Math.PI * 11; t += 0.05) {
    loops.push([p.x + (0.12 + t * 0.02 - 0.045 * Math.sin(t)) * p.width,
      p.y + (0.5 - 0.19 * Math.cos(t) * (0.75 + 0.25 * Math.sin(t / 2.3))) * p.height])
  }
  await stroke(loops, 2000)
  await stroke(Array.from({ length: 21 }, (_, i) => [p.x + (0.14 + i * 0.035) * p.width, p.y + (0.82 - i * 0.006) * p.height]), 350)
  await hold(page, 500)
  await tap(page, page.locator('.fixed.inset-0 button:has-text("Save")').first(), { after: 300 })
  await pad.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  await hold(page, 500)

  // …and put on the line. A placed signature is centred on the tap.
  await tap(page, await at(AT.signature.x, AT.signature.y + 16), { after: 700 })
  await deselect()
}, { out, tail: 3200 })

if (errors.length) console.warn(`page errors: ${errors.join(' | ')}`)
if (process.argv.includes('--stills')) console.log((await stills(out, [1, 3, 6, 10, 14, 18, 22])).join('\n'))
await browser.close()
