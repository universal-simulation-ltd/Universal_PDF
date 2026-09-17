#!/usr/bin/env node
// Regenerates the App Store and Google Play images for Universal PDF.
//
//   npm run build:mobile                  # the bundle the iOS/Android shells load
//   node store-assets/generate.mjs        # every screen, every device
//   node store-assets/generate.mjs 03     # only screens whose name starts 03
//   DEVICE=iphone node store-assets/generate.mjs
//   LOCALE=fr-FR node store-assets/generate.mjs   # raw/fr-FR/<device>/, the app in French
//
// Needs Playwright's Chromium. It is not a dependency of this repo, so either
// `npm i --no-save playwright && npx playwright install chromium`, or point
// PLAYWRIGHT at an existing copy's index.mjs.
//
// The screens are the real app: dist/ is served to the browser through
// Playwright's request routing (no local server, no port), at each store
// device's viewport and pixel ratio, and driven like a person would drive it.
// Nothing off-app is loaded.
//
// The sample document is built here with pdf-lib: an application form for an
// invented allotment society, with real AcroForm fields, filled in through the
// app's own form layer. Every name, address and number on it is made up (the
// phone number is from Ofcom's range reserved for fiction).
//
// Output (committed): the real captures, raw/iphone (1320x2580), raw/ipad
// (2064x2664) and raw/android (1080x2172). The UNI·SIM store kit frames them
// into the store screenshots in out/, drawing the status bar and home
// indicator they leave out. store.json says which capture each screen shows,
// strings/en-GB.json every word on it:
//
//   node ../../Docs_UNI_SIM/store-kit/build.mjs store-assets
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dist = path.join(root, 'dist')
const { chromium } = await import(
  process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright'
)

// Each device's screen less the status bar and home indicator the store kit
// draws (its layouts.mjs, CLASSES[…].insets): iPhone 17 Pro Max 956 pt less
// 62 + 34, iPad 13" 1376 pt less 24 + 20, an Android phone 780 dp less 32 + 24.
const DEVICES = [
  { key: 'iphone', dir: 'raw/iphone', width: 440, height: 860, dpr: 3 },
  { key: 'ipad', dir: 'raw/ipad', width: 1032, height: 1332, dpr: 2 },
  { key: 'android', dir: 'raw/android', width: 360, height: 724, dpr: 3 },
]
const ORIGIN = 'https://app.test'
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.bcmap': 'application/octet-stream',
}

// ── The sample document ────────────────────────────────────────────────────
const A4 = [595.28, 841.89]
// Where things are, in PDF points (origin bottom-left), so the script can tap them.
const AT = {
  rulesLine: { x0: 40, x1: 470, y: 713 },
  signature: { x: 185, y: 262 },
  note: { x: 300, y: 490 },
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
  text('Plots are let for twelve months from 1 March. Tenants agree to keep at least three-', 40, 710)
  text('quarters of the plot in cultivation, to keep shared paths clear, and to use the water', 40, 695)
  text('butts rather than the mains taps between May and September.', 40, 680)

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

// ── Driving the editor ─────────────────────────────────────────────────────
const desktop = (dev) => dev.key === 'ipad' // lg and up gets the desktop toolbar

async function open(page, pdf) {
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'Allotment-plot-application.pdf', mimeType: 'application/pdf', buffer: pdf,
  })
  await page.locator('[data-page-index="0"] canvas').first().waitFor({ timeout: 30000 })
  await page.getByText('Loading PDF…').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)
}
async function pageBox(page) {
  return page.locator('[data-page-index="0"] canvas').first().boundingBox()
}
/** PDF points → the screen point over them. */
async function at(page, x, y) {
  const box = await pageBox(page)
  const s = box.width / A4[0]
  return { x: box.x + x * s, y: box.y + (A4[1] - y) * s }
}
async function fill(page) {
  for (const [name, , , , value] of FIELDS) {
    const cell = page.locator(`[title="Click to fill: ${name}"]`).first()
    await cell.scrollIntoViewIfNeeded()
    await cell.click()
    await page.keyboard.type(value)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(120)
  }
}
async function scrollTo(page, x, y) {
  // Bring a spot on the page into the middle of the viewer.
  const p = await at(page, x, y)
  const vh = page.viewportSize().height
  await page.mouse.move(page.viewportSize().width / 2, vh / 2)
  await page.mouse.wheel(0, p.y - vh / 2)
  await page.waitForTimeout(600)
}
async function drawShape(page, dev, title) {
  if (desktop(dev)) {
    await page.locator('button[title^="Free draw"]').first().click()
    await page.waitForTimeout(250)
    await page.locator('button[title^="Free draw"]').first().click()
  } else {
    // The small "+" on the Draw button opens its panel.
    await page.locator('nav button:text-is("+")').nth(1).click()
  }
  await page.waitForTimeout(300)
  await page.locator(`button[title="${title}"]`).last().click()
  await page.waitForTimeout(250)
  if (!desktop(dev)) await page.locator('nav button:text-is("+")').nth(1).click().catch(() => {})
  await page.waitForTimeout(250)
}
async function tap(page, x, y) {
  const p = await at(page, x, y)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(400)
}
async function signature(page, dev) {
  // The phone toolbar's Sign is a labelled button; the aria-label one is the
  // desktop toolbar's, which is display:none below lg.
  await page.locator(desktop(dev) ? 'button[aria-label="Sign"]' : 'nav button:has-text("Sign")').first().click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("+ Draw new")').first().click()
  const pad = page.locator('.fixed.inset-0 canvas').first()
  await pad.waitFor()
  // On a narrow phone the pad's name field takes focus as the dialog opens,
  // and the first drag would only blur it while the layout settles — losing
  // the stroke. Let it settle, drop the focus, then measure the pad.
  await page.waitForTimeout(600)
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur())
  await page.waitForTimeout(300)
  const b = await pad.boundingBox()
  // A looping, joined-up line (a prolate trochoid), then a flick underneath.
  const pts = []
  // The loop step is smaller than the loop, so each turn crosses itself.
  for (let t = 0; t <= Math.PI * 11; t += 0.06) {
    pts.push([0.12 + t * 0.02 - 0.045 * Math.sin(t), 0.5 - 0.19 * Math.cos(t) * (0.75 + 0.25 * Math.sin(t / 2.3))])
  }
  await page.mouse.move(b.x + pts[0][0] * b.width, b.y + pts[0][1] * b.height)
  await page.mouse.down()
  for (const [x, y] of pts) await page.mouse.move(b.x + x * b.width, b.y + y * b.height)
  await page.mouse.up()
  await page.mouse.move(b.x + 0.14 * b.width, b.y + 0.82 * b.height)
  await page.mouse.down()
  for (let i = 0; i <= 20; i++) await page.mouse.move(b.x + (0.14 + i * 0.035) * b.width, b.y + (0.82 - i * 0.006) * b.height)
  await page.mouse.up()
  await page.waitForTimeout(400)
}
async function deselect(page, dev) {
  // Back to the Select tool (which also commits a text box being typed in —
  // Escape would throw it away), then a tap on an empty part of the page, so
  // nothing is left selected with its handles and colour bar showing.
  await page.locator(desktop(dev) ? 'button[title^="Select / move"]' : 'nav.fixed button').first().click().catch(() => {})
  await page.waitForTimeout(300)
  await tap(page, 520, 330)
  await page.waitForTimeout(300)
}

const SCREENS = {
  // First open.
  async '01-start'(page) {
    await page.waitForTimeout(600)
  },
  // A form, filled in on the page.
  async '02-fill-form'(page, { pdf, dev }) {
    await open(page, pdf)
    await fill(page)
    await deselect(page, dev)
    await scrollTo(page, 300, 540)
  },
  // Drawing a signature.
  async '03-draw-signature'(page, { pdf, dev }) {
    await open(page, pdf)
    await fill(page)
    await signature(page, dev)
  },
  // …placed on the line.
  async '04-signed'(page, { pdf, dev }) {
    await open(page, pdf)
    await fill(page)
    await scrollTo(page, 300, 330)
    await signature(page, dev)
    await page.locator('.fixed.inset-0 button:has-text("Save")').first().click()
    // Let the pad close before the tap, or the tap lands on its backdrop.
    await page.locator('.fixed.inset-0 canvas').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(900)
    // A placed signature is centred on the tap, so aim a little above the line.
    // The tool is armed once the placement hint is up. On a phone that card
    // sits over the page, and a tap on it is not a tap on the page, so it is
    // put away first with its own "Don't show again" (this browser is thrown
    // away after the shot, so nothing is remembered).
    const hint = page.locator('[data-placement-hint]').first()
    await hint.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
    const never = hint.getByRole('button', { name: /Don.t show again/ })
    if (await never.count()) {
      await never.first().click()
      await page.waitForTimeout(400)
    }
    await tap(page, AT.signature.x, AT.signature.y + 16)
    await page.waitForTimeout(500)
    await page.waitForTimeout(600)
    await deselect(page, dev)
    await scrollTo(page, 300, 330)
  },
  // Marking it up: a highlight and a typed note.
  async '05-annotate'(page, { pdf, dev }) {
    await open(page, pdf)
    await fill(page)
    // The note first, so it keeps the text tool's own colour rather than the
    // highlighter's, in the empty space beside a heading.
    await page.locator(desktop(dev) ? 'button[title^="Add text"]' : 'nav.fixed button:has-text("Text")').first().click()
    await page.waitForTimeout(300)
    await tap(page, AT.note.x, AT.note.y)
    await page.keyboard.type('Plot 14, please')
    await page.waitForTimeout(300)
    await deselect(page, dev)
    if (desktop(dev)) await page.locator('button[title^="Highlighter"]').first().click()
    else await drawShape(page, dev, 'Highlighter')
    const a = await at(page, AT.rulesLine.x0, AT.rulesLine.y)
    const b = await at(page, AT.rulesLine.x1, AT.rulesLine.y)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    for (let i = 1; i <= 24; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 24, a.y)
    await page.mouse.up()
    await page.waitForTimeout(400)
    await deselect(page, dev)
    await scrollTo(page, 300, 600)
  },
  // The other tools, from the start screen.
  async '06-more-tools'(page) {
    await page.getByLabel('Show advanced options').first().click()
    await page.waitForTimeout(800)
  },
}

// ── Running them ───────────────────────────────────────────────────────────
function pngInfo(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colourType: buf[25] }
}

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

// The store locale being captured, and the app language it shows. The app is
// DRIVEN in English either way — every selector above is an English label — and
// switched to LOCALE's language just before the capture (window.__pdfSetLanguage,
// see <I18nRoot>). en-GB keeps writing to raw/<device>/, as before.
const LOCALE = process.env.LOCALE || 'en-GB'
const APP_LANGUAGE = {
  'en-GB': 'en-gb', 'fr-FR': 'fr', 'es-ES': 'es', 'it-IT': 'it', 'de-DE': 'de',
  'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT', 'tr-TR': 'tr',
}[LOCALE]
if (!APP_LANGUAGE) throw new Error(`No app language for LOCALE=${LOCALE}`)
const rawDir = (dev) => (LOCALE === 'en-GB' ? dev.dir : dev.dir.replace(/^raw\//, `raw/${LOCALE}/`))

const only = process.argv.slice(2)
const devices = DEVICES.filter((d) => !process.env.DEVICE || process.env.DEVICE.split(',').includes(d.key))
const browser = await chromium.launch()
const pdf = await samplePdf()
let bad = 0
for (const dev of devices) {
  await mkdir(path.join(here, rawDir(dev)), { recursive: true })
  for (const [name, run] of Object.entries(SCREENS)) {
    if (only.length && !only.some((p) => name.startsWith(p))) continue
    const ctx = await browser.newContext({
      viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr,
      isMobile: true, hasTouch: true, colorScheme: 'light', locale: LOCALE,
    })
    // The one-off "welcome" toast a phone sees on its first document: dismissed,
    // as it would be after the first open, so it doesn't sit over the page.
    await ctx.addInitScript(() => {
      try { localStorage.setItem('universal-pdf-mobile-welcome-dismissed', '1') } catch {}
      // Start in English whatever the browser locale: the script's selectors are English.
      try { localStorage.setItem('universal:language', 'en-gb') } catch {}
      // The start screen's "Download it for offline use — Windows · macOS ·
      // Android · iPhone" row is for the website. It is below the fold on a
      // phone but in full view on an iPad, and a store screenshot of the app
      // should not offer other platforms' builds. Hidden for the picture only.
      document.addEventListener('DOMContentLoaded', () => {
        const css = document.createElement('style')
        css.textContent = 'section[aria-labelledby="get-the-app"]{display:none!important}'
        document.head.appendChild(css)
      })
    })
    await serve(ctx)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(`${ORIGIN}/index.html`)
    await page.waitForTimeout(1200)
    try {
      await run(page, { dev, pdf })
    } catch (err) {
      console.error(`FAIL ${rawDir(dev)}/${name}: ${err.message.split('\n')[0]}`)
      bad++
    }
    if (APP_LANGUAGE !== 'en-gb') {
      await page.evaluate((l) => window.__pdfSetLanguage?.(l), APP_LANGUAGE)
      await page.waitForTimeout(500)
    }
    const buf = await page.screenshot()
    await writeFile(path.join(here, rawDir(dev), `${name}.png`), buf)
    const { w, h, colourType } = pngInfo(buf)
    const ok = w === dev.width * dev.dpr && h === dev.height * dev.dpr && colourType === 2
    if (!ok) bad++
    console.log(`${ok ? 'OK ' : 'BAD'} ${rawDir(dev)}/${name}.png ${w}x${h}${colourType === 2 ? '' : ' has alpha'}${errors.length ? ` (page errors: ${errors.length})` : ''}`)
    await ctx.close()
  }
}
await browser.close()
if (bad) {
  console.error(`${bad} problem(s) — check the output above`)
  process.exit(1)
}
