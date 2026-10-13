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
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
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
  // Leaving the editor commits it, the way a click elsewhere does.
  await page.getByRole('button', { name: 'Select', exact: false }).first().click()
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

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
