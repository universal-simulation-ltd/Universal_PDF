// Folding a sticky note down to its icon, and opening it again.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:note-fold            # in another terminal
//
// What is pinned here (James, 2026-10-18: "Add a button to minimise the sticky
// note we already have so they can click it to open / close"):
//
//   • A note's pill has "Minimise the note"; it folds the note to a small icon
//     at the card's top-left and lets go of the selection.
//   • The icon is on the page in the note's paper; a folded note has no pill.
//   • A click on the icon opens the note again, words and card as they were.
//   • A drag on the icon moves it without opening it.
//   • Export: a folded note is a REAL PDF sticky note (/Text) carrying the
//     words, with an icon that renders; its words are not printed on the page.
//
// Writes screenshots to $SHOTS (default: the OS temp dir).

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

const SHOTS = process.env.SHOTS ?? tmpdir()
const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.create()
doc.addPage([595, 842])
const pdf = Buffer.from(await doc.save())

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
  window.localStorage.removeItem('universal-pdf-tool-prefs')
})
try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.setInputFiles('input[type=file]', { name: 'review.pdf', mimeType: 'application/pdf', buffer: pdf })
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
const json = (v) => JSON.stringify(v)
const canvasBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const k = canvasBox.width / 595
const sx = (x) => Math.round(canvasBox.x + x * k)
const sy = (y) => Math.round(canvasBox.y + y * k)
const notes = async () => (await store('return s.annotations')).filter((a) => a.type === 'text' && a.note)
// The pastel of the highlighter's yellow (#eab308) at 30%: rgb(249, 232, 181).
const PAPER = [249, 232, 181]
const near = (px, want, tol = 6) => px && want.every((c, i) => Math.abs(px[i] - c) <= tol)
// What the page's annotation canvas shows at a page point.
const inkAt = (x, y) =>
  page.evaluate(
    ({ x, y }) => {
      for (const c of document.querySelectorAll('[data-page-index="0"] .konvajs-content canvas')) {
        const kk = c.width / 595
        const d = c.getContext('2d').getImageData(Math.round(x * kk), Math.round(y * kk), 1, 1).data
        if (d[3] > 200) return [d[0], d[1], d[2]]
      }
      return null
    },
    { x, y },
  )
const commitEditor = async () => {
  // Leaving the editor commits it, the way a click elsewhere does. (A blur,
  // not a click on a toolbar button: that would also change the tool.)
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(300)
}

console.log('\na note to fold')
await page.getByRole('button', { name: 'Sticky note', exact: true }).first().click()
await page.mouse.click(sx(100), sy(150))
await page.waitForTimeout(300)
await page.keyboard.type('Ask Sam about the figures')
await page.evaluate(() => document.activeElement?.blur())
await page.waitForTimeout(300)
let [n] = await notes()
check('a note with words', n?.text === 'Ask Sam about the figures', json(n))
const card = { x: n.x, y: n.y, w: n.wrapWidth }

console.log('\nMinimise')
await store('s.setSelected(arg)', n.id)
await page.waitForTimeout(200)
const minBtn = page.getByRole('button', { name: 'Minimise the note' })
check('the note\'s pill has Minimise', (await minBtn.count()) === 1)
await minBtn.click()
await page.waitForTimeout(300)
;[n] = await notes()
check('it folds the note, keeping its words and place', n.noteFolded === true && n.text === 'Ask Sam about the figures' && n.x === card.x && n.y === card.y, json(n))
check('…and lets go of it, so no pill is left floating', (await store('return s.selectedIds.length')) === 0 && (await minBtn.count()) === 0)
check('the icon is on the page in the note\'s paper', near(await inkAt(card.x + 5, card.y + 5), PAPER), json(await inkAt(card.x + 5, card.y + 5)))
check('…and the card is gone from where it was', (await inkAt(card.x + card.w - 10, card.y + 60)) === null, json(await inkAt(card.x + card.w - 10, card.y + 60)))
await page.screenshot({ path: join(SHOTS, 'note-folded.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 420, height: 360 } })

console.log('\nmoving the icon')
await page.mouse.move(sx(card.x + 6), sy(card.y + 6))
await page.mouse.down()
await page.mouse.move(sx(card.x + 30), sy(card.y + 30), { steps: 5 })
await page.mouse.move(sx(card.x + 66), sy(card.y + 46), { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(400)
;[n] = await notes()
check('a drag moves the icon', Math.abs(n.x - card.x - 60) < 3 && Math.abs(n.y - card.y - 40) < 3, json([n.x, n.y]))
check('…without opening it', n.noteFolded === true)
check('a folded note has no text pill even when selected', (await minBtn.count()) === 0)

console.log('\nexport of a folded note')
const out = await page.evaluate(
  async ({ src, annotations }) => {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
    const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
    const d = await openPdf(out.slice()).promise
    const p = await d.getPage(1)
    const vp = p.getViewport({ scale: 1 })
    const annots = (await p.getAnnotations()).map((a) => ({ subtype: a.annotationType, type: a.subtype, contents: a.contentsObj?.str ?? a.contents, rect: a.rect }))
    const text = (await p.getTextContent()).items.map((it) => it.str).join(' ')
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    const a = annotations[0]
    const px = [...ctx.getImageData(Math.round(a.x + 2), Math.round(a.y + 9), 1, 1).data.slice(0, 3)] // plain paper, left of the "writing"
    void d.destroy()
    return { annots, text, px, png: canvas.toDataURL('image/png') }
  },
  { src: pdf.toString('base64'), annotations: await notes() },
)
writeFileSync(join(SHOTS, 'note-folded-export.png'), Buffer.from(out.png.split(',')[1], 'base64'))
const sticky = out.annots.find((a) => a.type === 'Text')
check('the file has a real PDF sticky note', !!sticky, json(out.annots))
check('…carrying the note\'s words', sticky?.contents === 'Ask Sam about the figures', json(sticky))
check('…at the icon (y up: 842 − y)', sticky && Math.abs(sticky.rect[0] - n.x) < 1 && Math.abs(sticky.rect[3] - (842 - n.y)) < 1, json({ rect: sticky?.rect, n: [n.x, n.y] }))
check('its icon renders, in the note\'s paper', near(out.px, PAPER), json(out.px))
check('the words are not printed on the page', !out.text.includes('Ask Sam'), out.text)

console.log('\nopening it again')
await store('s.setSelected(null)')
await page.mouse.click(sx(n.x + 6), sy(n.y + 6))
await page.waitForTimeout(300)
;[n] = await notes()
check('a click on the icon opens the note', !n.noteFolded, json(n))
check('…with its card and words as they were', n.text === 'Ask Sam about the figures' && n.wrapWidth === card.w, json(n))
check('the card is back on the page', near(await inkAt(n.x + card.w - 8, n.y + 8), PAPER), json(await inkAt(n.x + card.w - 8, n.y + 8)))
check('the pill offers Minimise again', (await minBtn.count()) === 1)
await page.screenshot({ path: join(SHOTS, 'note-reopened.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 420, height: 360 } })

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
