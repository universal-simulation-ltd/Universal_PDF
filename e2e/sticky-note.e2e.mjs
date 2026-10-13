// Sticky notes: a pastel card in the current colour, typed on, kept, exported.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:sticky-note          # in another terminal
//
// What is pinned here (James, 2026-10-13: "a 'Sticky note' … where you place a
// coloured sticky note in a pastel version of the colour selected and can type
// on it"; it sits beside the highlighter and shares its colours):
//
//   • The Sticky note button arms the tool in the highlighter's first colour,
//     and the colour bar shows the highlighter's pair.
//   • A tap drops a note with the editor open; what is typed is kept, in dark
//     ink on a pastel card of that colour.
//   • Placing a note goes back to Select, and the whole card (not just its
//     words) can be dragged ("unable to click and drag the post-it to place
//     it").
//   • A note left empty stays (a text box left empty goes).
//   • A colour picked with a note selected recolours the card, not the ink.
//   • Export: the card is in the file, pastel, with the words inside it.
//   • Centre and Fit on its pill ("center text and fit text to the square …
//     you should see immediately in preview so it's not different when you
//     click away"): the words are centred and sized to fill the card WHILE
//     being typed, and stay exactly there when the editor closes; more words
//     shrink, the card keeps its size; the export matches.
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

console.log('\nthe Sticky note button')
const noteBtn = page.getByRole('button', { name: 'Sticky note', exact: true }).first()
check('there is a Sticky note button', (await noteBtn.count()) === 1)
await noteBtn.click()
await page.waitForTimeout(200)
check('it arms the note tool in the highlighter\'s first colour', json(await store('return [s.tool, s.color]')) === json(['note', '#eab308']))
const bar = page.locator('button[aria-label="Open colours"]').first().locator('xpath=..')
check('the colour bar shows the highlighter\'s pair', (await bar.getByRole('button', { name: 'Yellow' }).count()) === 1 && (await bar.getByRole('button', { name: 'Green' }).count()) === 1)

console.log('\nplacing and typing')
await page.mouse.click(sx(100), sy(150))
await page.waitForTimeout(300)
const editor = page.locator('[contenteditable="true"]')
check('a tap opens the editor on a new note', (await editor.count()) === 1 && (await notes()).length === 1)
check('…and goes back to Select, so it can be dragged', (await store('return s.tool')) === 'select')
await page.keyboard.type('Check this figure against the appendix')
await page.screenshot({ path: join(SHOTS, 'sticky-note-typing.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 500, height: 400 } })
await commitEditor()
let [n] = await notes()
check('what was typed is kept', n?.text === 'Check this figure against the appendix', json(n))
check('dark ink on a note of the colour it was made in', n?.color === '#1f2937' && n?.note === '#eab308', json(n))
check('the card is pastel on the page', near(await inkAt(n.x + n.wrapWidth - 6, n.y + 6), PAPER), json(await inkAt(n.x + n.wrapWidth - 6, n.y + 6)))
await page.screenshot({ path: join(SHOTS, 'sticky-note-editor.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 500, height: 400 } })

console.log('\nmoving a note into place')
{
  const before = (await notes())[0]
  // From the blank lower part of the card, where there are no words to grab.
  await page.mouse.move(sx(before.x + 40), sy(before.y + 110))
  await page.mouse.down()
  await page.mouse.move(sx(before.x + 80), sy(before.y + 150), { steps: 6 })
  await page.mouse.move(sx(before.x + 140), sy(before.y + 210), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = (await notes())[0]
  check('a drag on the card moves the note', Math.abs(after.x - before.x - 100) < 3 && Math.abs(after.y - before.y - 100) < 3, json({ before: [before.x, before.y], after: [after.x, after.y] }))
  await store('s.update(arg.id, { x: arg.x, y: arg.y }); s.setSelected(null)', before)
}

console.log('\nan empty note stays')
await noteBtn.click()
await page.mouse.click(sx(320), sy(420))
await page.waitForTimeout(300)
await commitEditor()
check('a note left empty is kept', (await notes()).length === 2, json(await notes()))

console.log('\nrecolouring a note')
await store('s.setSelected(arg)', n.id)
await page.waitForTimeout(200)
await store('s.setColor("#2563eb")')
;[n] = await notes()
check('the card takes the colour; the ink stays dark', n.note === '#2563eb' && n.color === '#1f2937', json(n))
check('its pill offers the highlighter\'s colours, not black and white', (await page.getByRole('button', { name: '#16A34A' }).count()) === 1 && (await page.locator('[data-pill-swatch][aria-label="Black"]').count()) === 0)
await page.getByRole('button', { name: '#16A34A' }).click()
await page.waitForTimeout(200)
;[n] = await notes()
check('…and a tap on one recolours the card', n.note === '#16a34a' && n.color === '#1f2937', json(n))
await store('s.setColor("#eab308"); s.setSelected(null)')

console.log('\nexport')
const ann = (await store('return s.annotations')).filter((a) => a.note && a.text)
const out = await page.evaluate(
  async ({ src, annotations }) => {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
    const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
    const d = await openPdf(out.slice()).promise
    const p = await d.getPage(1)
    const vp = p.getViewport({ scale: 1 })
    const text = (await p.getTextContent()).items
      .filter((it) => it.str.trim())
      .map((it) => {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
        return { str: it.str, x, baseline: y }
      })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    const a = annotations[0]
    const px = [...ctx.getImageData(Math.round(a.x + a.wrapWidth - 6), Math.round(a.y + 6), 1, 1).data.slice(0, 3)]
    void d.destroy()
    return { text, px, png: canvas.toDataURL('image/png') }
  },
  { src: pdf.toString('base64'), annotations: ann },
)
writeFileSync(join(SHOTS, 'sticky-note-export.png'), Buffer.from(out.png.split(',')[1], 'base64'))
const a0 = ann[0]
check('the card is in the file, pastel', near(out.px, PAPER), json(out.px))
const words = out.text.filter((t) => /Check|appendix|figure/.test(t.str))
check('the words are in the file', words.length > 0, json(out.text))
check('…inside the card, clear of its edge', words.every((t) => t.x >= a0.x + 5 && t.x < a0.x + a0.wrapWidth && t.baseline > a0.y + 5), json({ words, a0 }))

console.log('\nCentre and Fit')
// Where the words are, in page points: on the canvas, the dark ink inside a
// note's card; in the editor, the box the browser lays the typed text out in.
const canvasInk = (r) =>
  page.evaluate(
    ({ r }) => {
      let box = null
      for (const c of document.querySelectorAll('[data-page-index="0"] .konvajs-content canvas')) {
        const kk = c.width / 595
        const x0 = Math.round(r.x * kk), y0 = Math.round(r.y * kk), w = Math.round(r.width * kk), h = Math.round(r.height * kk)
        const d = c.getContext('2d').getImageData(x0, y0, w, h).data
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            if (d[i + 3] > 200 && d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 120) {
              const px = (x0 + x) / kk, py = (y0 + y) / kk
              box = box ? { x1: Math.min(box.x1, px), y1: Math.min(box.y1, py), x2: Math.max(box.x2, px), y2: Math.max(box.y2, py) } : { x1: px, y1: py, x2: px, y2: py }
            }
          }
      }
      return box
    },
    { r },
  )
// The same measure for both states: a real screenshot of the page, its dark
// pixels inside `r` (page points). While typing, the letters are the browser's
// (the editor); after, they're the canvas's — so this is what the eye sees.
const shotInk = async (r) => {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ({ png, r }) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + png
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const dpr = img.width / window.innerWidth
      const pg = document.querySelector('[data-page-index="0"] canvas').getBoundingClientRect()
      const k = pg.width / 595
      const x0 = Math.round((pg.left + r.x * k) * dpr), y0 = Math.round((pg.top + r.y * k) * dpr)
      const w = Math.round(r.width * k * dpr), h = Math.round(r.height * k * dpr)
      const d = ctx.getImageData(x0, y0, w, h).data
      let box = null
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 120) {
            const px = (x0 + x) / dpr / k - pg.left / k, py = (y0 + y) / dpr / k - pg.top / k
            box = box ? { x1: Math.min(box.x1, px), y1: Math.min(box.y1, py), x2: Math.max(box.x2, px), y2: Math.max(box.y2, py) } : { x1: px, y1: py, x2: px, y2: py }
          }
        }
      return box
    },
    { png, r },
  )
}
const editorFontPx = () =>
  page.evaluate(() => {
    const el = document.querySelector('[contenteditable="true"]')
    const pg = document.querySelector('[data-page-index="0"] canvas').getBoundingClientRect()
    return parseFloat(getComputedStyle(el).fontSize) / (pg.width / 595)
  })
await store('s.resetDocument(); s.setTool("select")')
await noteBtn.click()
await page.mouse.click(sx(80), sy(120))
await page.waitForTimeout(300)
const centreBtn = page.getByRole('button', { name: 'Centre the words' })
const fitBtn = page.getByRole('button', { name: 'Fit the words to the note' })
check('a note\'s pill has Centre and Fit', (await centreBtn.count()) === 1 && (await fitBtn.count()) === 1)
await centreBtn.click()
await fitBtn.click()
await page.waitForTimeout(150)
check('both can be switched on while typing, and the editor stays open', (await editor.count()) === 1)
await page.keyboard.type('Hi')
await page.waitForTimeout(200)
let [fn] = await notes()
const card = { x: fn.x, y: fn.y, width: fn.wrapWidth, height: fn.wrapWidth * 0.8 }
const fontWhileTyping = await editorFontPx()
check('Fit: a couple of words are big while still being typed', fontWhileTyping > 14 * 3, String(fontWhileTyping))
// The editor's dashed outline is orange, not dark, so it isn't counted.
const ed = await shotInk(card)
await commitEditor()
;[fn] = await notes()
check('the words were kept, centred and fitted', fn.text === 'Hi' && fn.noteCentre && fn.noteFit, json(fn))
const ink = await shotInk(card)
const cx = (b) => (b.x1 + b.x2) / 2
const cy = (b) => (b.y1 + b.y2) / 2
check('Centre: the words sit in the middle of the card, across and down', ink && Math.abs(cx(ink) - (card.x + card.width / 2)) < 4 && Math.abs(cy(ink) - (card.y + card.height / 2)) < 6, json({ ink, card }))
// The editor's box is the line box (taller than the ink), so compare middles
// and widths: what was typed is where it now stays, at the same size.
const same = (p, q, tol) => p && q && ['x1', 'y1', 'x2', 'y2'].every((e) => Math.abs(p[e] - q[e]) < tol)
check('nothing moves when the editor closes', same(ink, ed, 2), json({ ink, ed }))
await page.screenshot({ path: join(SHOTS, 'sticky-note-fit-short.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 420, height: 360 } })

// More words: smaller, still inside the card, which keeps its size.
await page.mouse.dblclick(sx(card.x + card.width / 2), sy(card.y + card.height / 2))
await page.waitForTimeout(300)
await page.keyboard.press('End')
await page.keyboard.type(' there, please check the totals on page four before Friday')
await page.waitForTimeout(200)
const font2 = await editorFontPx()
check('Fit: more words get smaller as they are typed', font2 < fontWhileTyping - 5, json({ before: fontWhileTyping, after: font2 }))
// A margin round the card to catch words spilling over — but not as far as
// the floating pill, which sits ~11pt under the card.
const wide = { ...card, x: card.x - 6, y: card.y - 6, width: card.width + 12, height: card.height + 9 }
const ed2 = await shotInk(wide)
check('…and stay inside the card while being typed', ed2 && ed2.x1 >= card.x && ed2.x2 <= card.x + card.width && ed2.y2 <= card.y + card.height, json({ ed2, card }))
await commitEditor()
;[fn] = await notes()
const ink2 = await shotInk(wide)
check('the card keeps its size', Math.abs(fn.wrapWidth - card.width) < 0.01, json(fn))
check('the words fit inside it on the page', ink2 && ink2.x1 >= card.x && ink2.x2 <= card.x + card.width && ink2.y2 <= card.y + card.height, json({ ink2, card }))
check('nothing moves when the editor closes (longer text)', same(ink2, ed2, 2), json({ ink2, ed2 }))
await page.screenshot({ path: join(SHOTS, 'sticky-note-fit-long.png'), clip: { x: canvasBox.x, y: canvasBox.y, width: 420, height: 360 } })
const fitted = await page.evaluate(async (a) => (await import('/src/lib/textLayout.ts')).noteLayout(a).fontSize, fn)
check('the next note starts centred and fitted, as the last one was', json(await page.evaluate(async () => { const { useToolPrefs } = await import('/src/stores/toolPrefsStore.ts'); const p = useToolPrefs.getState(); return [p.noteCentre, p.noteFit] })) === '[true,true]')

console.log('\nexport of a fitted, centred note')
{
  const outFit = await page.evaluate(
    async ({ src, annotations }) => {
      const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
      const { openPdf } = await import('/src/lib/pdfjs.ts')
      const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
      const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
      const d = await openPdf(out.slice()).promise
      const p = await d.getPage(1)
      const vp = p.getViewport({ scale: 1 })
      const items = (await p.getTextContent()).items.filter((it) => it.str.trim())
      const res = items.map((it) => {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
        return { str: it.str, x, baseline: y, size: Math.hypot(it.transform[2], it.transform[3]), width: it.width }
      })
      void d.destroy()
      return res
    },
    { src: pdf.toString('base64'), annotations: [fn] },
  )
  check('the words bake at the fitted size', outFit.length > 0 && outFit.every((t) => Math.abs(t.size - fitted) < 0.6), json({ fitted, sizes: outFit.map((t) => t.size) }))
  // pdf.js hands back words; a line is the words on one baseline.
  const lines = Object.values(Object.groupBy(outFit, (t) => Math.round(t.baseline)))
  const mids = lines.map((ws) => (Math.min(...ws.map((w) => w.x)) + Math.max(...ws.map((w) => w.x + w.width))) / 2)
  check('…each line centred on the card', lines.length > 1 && mids.every((m) => Math.abs(m - (card.x + card.width / 2)) < 4), json({ mids, centre: card.x + card.width / 2 }))
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
