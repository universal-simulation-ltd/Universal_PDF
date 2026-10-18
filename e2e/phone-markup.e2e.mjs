// The phone's Mark up, after James's first go on the iPhone (2026-10-18).
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:phone-markup         # in another terminal
//
// The phone screens, in a browser at iPhone size (`?app`). What is pinned:
//
//   • Typing never zooms the web view: the phone screens add maximum-scale=1.
//   • The next page's edge shows beside the one being read.
//   • The tool row scrolls to Signature, Picture and QR code, and the way back
//     is a "‹ Done" on the left.
//   • Black out is drawn like the highlighter: one 'stroke' redaction whose box
//     hugs the ink, and export blacks out the stroke and not the rest of its box.
//   • A new sticky note is at most 30% of the page across, and stays on the
//     page when placed near its edge.
//   • The page's Colour pill stands down while the sheet is open (the sheet
//     carries the colour and width), and the sheet's width repaints the
//     selected highlight.
//   • Form-field names fit their boxes.
//   • The Signed moment waits for the signature to be let go of.
//   • The bar's third tool is Share (Sign is in Mark up's row now).
//   • QR code is a page of its own, and its link box is not focused on arrival.
//   • Text and notes get a choice of three fonts.
//   • A note being typed on takes its words with it when it is dragged.
//   • "Back to my desk" from a moment puts the moment away before the save
//     prompt, which used to open underneath it.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

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

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await keepAppModuleUrls(context)
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

const mod = (path, src, arg) =>
  page.evaluate(
    async ({ path, src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', 'arg', src)(m, arg)
    },
    { path, src, arg },
  )
const store = (src, arg) => mod('/src/stores/annotationStore.ts', `const s = m.useAnnotationStore.getState(); ${src}`, arg)
const annotations = () => store('return s.annotations')

await page.getByText('Try with example PDF').click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(1200)

console.log('\nthe web view never zooms in on typing')
{
  const content = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content ?? '')
  check('viewport has maximum-scale=1', /maximum-scale=1/.test(content), content)
}

console.log('\nthe next page shows at the edge')
{
  const box = await page.locator('[data-page-index="1"]').first().boundingBox()
  check('page 2 starts on screen', !!box && box.x < 393 - 8, json(box))
  const one = await page.locator('[data-page-index="0"]').first().boundingBox()
  check('page 1 is whole on screen', !!one && one.x >= 0 && one.x + one.width <= 393, json(one))
}

console.log('\nform-field names fit their boxes')
{
  const over = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('[data-page-index="1"] [role="button"][title]')) {
      const span = el.querySelector('span')
      if (!span) continue
      const box = el.getBoundingClientRect()
      const fs = parseFloat(getComputedStyle(span).fontSize)
      if (fs > box.height) out.push({ fs, h: box.height })
    }
    return out
  })
  check('no field name is taller than its box', over.length === 0, json(over))
}

console.log('\nMark up: the way back, and the tools further along the row')
await page.getByRole('button', { name: 'Mark up' }).click()
await page.waitForTimeout(500)
{
  check('a "Done" back link on the left', (await page.getByRole('button', { name: 'Done' }).count()) === 1)
  for (const name of ['Signature', 'Picture', 'QR code']) {
    check(`the row has ${name}`, (await page.getByRole('button', { name, exact: true }).count()) === 1)
  }
  const row = await page.evaluate(() => {
    const g = document.querySelector('section [role="group"]')
    return g ? { scroll: g.scrollWidth, client: g.clientWidth } : null
  })
  check('the row scrolls', !!row && row.scroll > row.client + 40, json(row))
}

const pageBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
async function stroke(points) {
  await page.mouse.move(pageBox.x + points[0][0], pageBox.y + points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(pageBox.x + x, pageBox.y + y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(350)
}

console.log('\nBlack out is drawn like the highlighter')
{
  await store('s.resetDocument()')
  await page.getByRole('button', { name: 'Black out', exact: true }).click()
  await stroke([[60, 120], [120, 121], [180, 119], [240, 120]])
  const all = await annotations()
  const r = all.find((a) => a.type === 'redact')
  check('one redaction', all.length === 1 && !!r, json(all))
  check('…a stroke', r?.shape === 'stroke' && Array.isArray(r.points) && r.points.length >= 4, json(r))
  check('…its path in fractions of its box', !!r && r.points.every((v) => v >= -0.001 && v <= 1.001), json(r?.points))
  check('…its box no taller than the stroke and a little wobble', !!r && r.height < r.strokeWidth * 1.4, json(r && { h: r.height, w: r.strokeWidth }))
  const toFill = await page.locator('button[aria-label]').filter({ hasText: '🪣' }).count()
  check('no "back to a box" bucket on a stroke', toFill === 0)
}

console.log('\n…and export blacks out the stroke alone')
{
  const { PDFDocument } = await import('pdf-lib')
  const blank = await PDFDocument.create()
  blank.addPage([595, 842])
  const blankB64 = Buffer.from(await blank.save()).toString('base64')
  const px = await page.evaluate(async (b64) => {
    const imp = globalThis.__appImport ?? ((p) => import(p))
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const { buildAnnotatedPdfBytes } = await imp('/src/lib/export.ts')
    const { openPdf } = await imp('/src/lib/pdfjs.ts')
    // A diagonal stroke corner to corner of a 200-unit box.
    const r = { id: 'r', pageIndex: 0, type: 'redact', x: 100, y: 100, width: 200, height: 200, fill: '#000000', shape: 'stroke', points: [0.05, 0.05, 0.95, 0.95], strokeWidth: 20 }
    const out = await buildAnnotatedPdfBytes(bytes.buffer, [r], 1)
    const doc = await openPdf(out).promise
    const p = await doc.getPage(1)
    const vp = p.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    const at = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]
    const res = { onStroke: at(200, 200), offStroke: at(280, 120) }
    void doc.destroy()
    return res
  }, blankB64)
  check('export: black on the stroke', px.onStroke.every((c) => c < 60), json(px.onStroke))
  check('export: the rest of its box is left alone', px.offStroke.every((c) => c > 200), json(px.offStroke))
}

console.log('\na new sticky note is a sensible size, and on the page')
{
  await store('s.resetDocument()')
  await page.getByRole('button', { name: 'Note', exact: true }).click()
  await page.mouse.click(pageBox.x + pageBox.width - 6, pageBox.y + 150)
  await page.waitForTimeout(500)
  await page.keyboard.type('Hi')
  await page.mouse.click(pageBox.x + 20, pageBox.y + pageBox.height - 20)
  await page.waitForTimeout(400)
  const n = (await annotations()).find((a) => a.type === 'text' && a.note)
  const geo = await mod('/src/stores/annotationStore.ts', 'return m.useAnnotationStore.getState().viewScale')
  const pageW = pageBox.width / geo
  check('a note was placed', !!n, json(await annotations()))
  check('…no more than 30% of the page across', !!n && n.wrapWidth <= pageW * 0.3 + 0.5, json(n && { w: n.wrapWidth, pageW }))
  check('…and wholly on the page', !!n && n.x >= 0 && n.x + n.wrapWidth <= pageW + 0.5, json(n && { x: n.x, w: n.wrapWidth, pageW }))
}

console.log('\nthe sheet carries a selected highlight\'s colour and width')
{
  await store('s.resetDocument()')
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  await stroke([[60, 300], [150, 300], [240, 300]])
  const h = (await annotations()).find((a) => a.type === 'draw')
  check('the highlight is selected', !!h && (await store('return s.selectedId')) === h.id)
  check('the page shows no Colour pill of its own', (await page.getByText('Highlighter size').count()) === 0)
  const before = h.strokeWidth
  await page.locator('section input[type="range"]').evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, '36')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  const after = (await annotations()).find((a) => a.id === h.id)
  check('the width slider repaints it', after.strokeWidth > before * 1.5, json({ before, after: after.strokeWidth }))
}

console.log('\nthe Signed moment waits until the signature is let go of')
{
  await store('s.resetDocument()')
  await mod('/src/native/nav.ts', 'm.useNav.getState().setAwaitingSignature(true)')
  await store(
    "s.add({ id: 'sig1', pageIndex: 0, type: 'image', x: 100, y: 200, width: 120, height: 50, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', sig: true }); s.setSelected('sig1')",
  )
  await page.waitForTimeout(700)
  const screens1 = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('not on landing', !screens1.includes('signed'), json(screens1))
  await store("s.update('sig1', { x: 140 })")
  await page.waitForTimeout(500)
  const screens2 = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('not while it is moved', !screens2.includes('signed'), json(screens2))
  await store('s.setSelected(null)')
  await page.waitForTimeout(600)
  const screens3 = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('on letting it go', screens3.includes('signed'), json(screens3))
}

console.log('\nthe bar is Fill · Mark up · Share · Pages')
{
  // Off the Signed moment the last check left up, and out of Mark up.
  await mod('/src/native/nav.ts', 'm.useNav.getState().clearScreens(); m.useNav.getState().closeSheet()')
  await page.waitForTimeout(400)
  const bar = page.locator('nav[aria-label="Tools"]')
  check('Share is in the bar', (await bar.getByRole('button', { name: 'Share' }).count()) === 1)
  check('Sign is not', (await bar.getByRole('button', { name: 'Sign' }).count()) === 0)
  await bar.getByRole('button', { name: 'Share' }).click()
  await page.waitForTimeout(400)
  const screens = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('…and opens the Share page', screens.includes('share'), json(screens))
  await mod('/src/native/nav.ts', 'm.useNav.getState().clearScreens()')
  await page.waitForTimeout(400)
}

console.log('\nQR code is a page of its own, and the keyboard waits')
{
  await store('s.resetDocument()')
  await page.getByRole('button', { name: 'Mark up' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'QR code', exact: true }).click()
  await page.waitForTimeout(600)
  const screens = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('the QR page is open', screens.includes('qr'), json(screens))
  check('no website dialog', (await page.locator('#qr-data').count()) === 0)
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  check('nothing typed into is focused', focused !== 'INPUT' && focused !== 'TEXTAREA', focused)
  await page.getByLabel('Where it takes them').fill('https://unisim.co.uk')
  await page.waitForTimeout(900)
  check('the code is drawn as you type', (await page.getByAltText('QR code for https://unisim.co.uk').count()) === 1)
  await page.getByRole('button', { name: 'Put it on the page' }).click()
  // The full-size code takes a moment to draw.
  for (let i = 0; i < 40; i++) {
    const now = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
    if (!now.includes('qr')) break
    await page.waitForTimeout(250)
  }
  const armed = await store('return { tool: s.tool, qr: !!s.uploadedImageQr }')
  check('the code is in hand to place', armed.tool === 'image' && armed.qr, json(armed))
  const after = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('…back on the document', !after.includes('qr'), json(after))
  const open = await mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().qrOpen')
  check('…and the request is over', open === false)
  await store("s.setUploadedImageSrc(null); s.setTool('select')")
}

console.log('\ntext gets a choice of font')
{
  await store('s.resetDocument()')
  await mod('/src/native/nav.ts', "m.useNav.getState().openSheet('markup')")
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.waitForTimeout(300)
  const fonts = await page.locator('section button').filter({ hasText: /^Aa/ }).count()
  check('three fonts', fonts === 3, String(fonts))
  await page.locator('section button').filter({ hasText: /^AaSerif/ }).click()
  check('Serif is the next text\'s font', (await store('return s.fontFamily')) === 'serif')
  await store('s.setFontFamily("sans")')
}

console.log('\na note being typed on takes its words with it when dragged')
{
  await store('s.resetDocument()')
  await page.getByRole('button', { name: 'Note', exact: true }).click()
  await page.mouse.click(pageBox.x + 60, pageBox.y + 200)
  await page.waitForTimeout(600)
  await page.keyboard.type('Move me')
  const before = await page.locator('.upd-text-editor').boundingBox()
  const n = (await annotations()).find((a) => a.type === 'text' && a.note)
  const k = await store('return s.viewScale')
  // A FINGER on the card's left margin, a quarter of the way down — clear of
  // the words (the editor) and of the resize handles. (A mouse press would end the typing: in a desktop
  // browser a press on the canvas blurs the editor. A touch, as on the
  // phone, does not.)
  const gx = Math.round(pageBox.x + n.x * k + 2)
  const gy = Math.round(pageBox.y + (n.y + n.wrapWidth * 0.25) * k)
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', gx, gy)
  for (let i = 1; i <= 6; i++) await touch('touchMove', gx + (40 * i) / 6, gy + (30 * i) / 6)
  await page.waitForTimeout(150)
  const during = await page.locator('.upd-text-editor').boundingBox().catch(() => null)
  await touch('touchEnd', gx + 40, gy + 30)
  await page.waitForTimeout(400)
  const moved = (await annotations()).find((a) => a.id === n.id)
  check('the note was dragged', !!moved && Math.abs((moved.x - n.x) * k - 40) < 6, json(moved && { dx: (moved.x - n.x) * k, dy: (moved.y - n.y) * k }))
  check('the editor is still open while dragged', !!before && !!during, json({ before, during }))
  if (before && during) check('…and moved with the card', Math.abs(during.x - before.x - 40) < 6 && Math.abs(during.y - before.y - 30) < 6, json({ dx: during.x - before.x, dy: during.y - before.y }))
  await page.mouse.click(pageBox.x + 20, pageBox.y + pageBox.height - 20)
  await page.waitForTimeout(300)
}

console.log('\n"Back to my desk" on the Smaller moment shows the save prompt on top')
{
  // An amendment, so leaving asks first.
  await store("s.add({ id: 'tick1', pageIndex: 0, type: 'tick', x: 50, y: 50, size: 20, color: '#000000' }); s.setSelected(null)")
  await mod('/src/native/nav.ts', "m.useNav.getState().closeSheet(); m.useNav.getState().push('smaller')")
  await page.waitForTimeout(400)
  await mod('/src/native/DocumentScreen.tsx', 'm.leaveDocument()')
  await page.waitForTimeout(500)
  const screens = await mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
  check('the moment is put away first', !screens.includes('smaller'), json(screens))
  const pending = await mod('/src/stores/exitGuard.ts', 'return !!m.useExitGuard.getState().pending')
  check('the save prompt is up', pending)
  await mod('/src/stores/exitGuard.ts', 'm.useExitGuard.getState().cancel()')
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
