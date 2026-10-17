// Sticky notes hanging over the page edge.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:note-overhang        # in another terminal
//
// What is pinned (James, 2026-10-18: "Could we show sticky notes over pages?"
// — and, asked what the saved file should do: "hang over, fold to icon"):
//
//   • A note past the page's edge shows past it, over the gap, on top.
//   • Only the part outside the page is the overlay: inside the page, presses
//     still reach the note on the page itself.
//   • A press on the overhang drags the note.
//   • Export: a note hanging over is saved as a folded PDF sticky note at the
//     edge (its words in it, no card printed); a note wholly on its page is
//     printed as a card, as before.

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
const json = (v) => JSON.stringify(v)

const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.create()
doc.addPage([595, 842])
doc.addPage([595, 842])
const pdf = Buffer.from(await doc.save())

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await context.addInitScript(() => window.localStorage.setItem('universal:mock_session', 'james'))
try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.setInputFiles('input[type=file]', { name: 'two.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)
const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const note = async () => (await store('return s.annotations')).find((a) => a.id === 'n')
const box = await page.locator('[data-page-index="0"]').boundingBox()
const k = box.width / 595
const cx = (x) => box.x + x * k
const cy = (y) => box.y + y * k
// What the screen shows at a client point.
const pixel = async (x, y) => {
  const png = (await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })).toString('base64')
  return page.evaluate(async (png) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, png)
}
const PAPER = await page.evaluate(async () => (await import('/src/lib/textLayout.ts')).notePaper('#a855f7'))
const paperRgb = [1, 3, 5].map((i) => parseInt(PAPER.slice(i, i + 2), 16))
const near = (px, want, tol = 8) => px && want.every((c, i) => Math.abs(px[i] - c) <= tol)

console.log('\na note over the right edge')
// 180pt wide from x 480: 65pt of it past the edge.
await store('s.add({ id: "n", type: "text", pageIndex: 0, x: 480, y: 200, text: "Hanging over the edge", color: "#1f2937", fontSize: 14, note: "#a855f7", wrapWidth: 180 }); s.setSelected(null)')
await page.waitForTimeout(500)
check('the part past the edge is drawn', (await page.locator('[data-note-overhang="n"]').count()) === 1)
const gapX = cx(595) + 20
const midY = cy(260)
check('…visible over the gap, in the note\'s paper', near(await pixel(gapX, midY), paperRgb), json({ got: await pixel(gapX, midY), want: paperRgb }))
check('…and on top there', await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.dataset?.noteOverhang === 'n', { x: gapX, y: midY }))
check('inside the page, presses still reach the page\'s own layer', await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.dataset?.noteOverhang, { x: cx(500), y: midY }))
await page.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'note-overhang.png') })

console.log('\ndragging it by the overhang')
await page.mouse.move(gapX, midY)
await page.mouse.down()
await page.mouse.move(gapX - 40, midY, { steps: 5 })
await page.mouse.move(gapX - 140 * k, midY, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(500)
let n = await note()
check('a press on the overhang drags the note', Math.abs(n.x - (480 - 140)) < 3 && Math.abs(n.y - 200) < 3, json([n.x, n.y]))
check('…and it is selected', (await store('return s.selectedId')) === 'n')
check('wholly on the page, nothing is drawn outside it', (await page.locator('[data-note-overhang]').count()) === 0)

console.log('\nexport')
const exportPage1 = (annotations) =>
  page.evaluate(
    async ({ src, annotations }) => {
      const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
      const { openPdf } = await import('/src/lib/pdfjs.ts')
      const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
      const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
      const d = await openPdf(out.slice()).promise
      const p = await d.getPage(1)
      const annots = (await p.getAnnotations()).map((a) => ({ type: a.subtype, contents: a.contentsObj?.str, rect: a.rect }))
      const text = (await p.getTextContent()).items.map((it) => it.str).join(' ')
      void d.destroy()
      return { annots, text }
    },
    { src: pdf.toString('base64'), annotations },
  )
const inside = await exportPage1([n])
check('a note wholly on its page is printed as a card', inside.text.includes('Hanging') && !inside.annots.some((a) => a.type === 'Text'), json(inside))
await store('s.update("n", { x: 480 })')
const over = await exportPage1([await note()])
const sticky = over.annots.find((a) => a.type === 'Text')
check('a note hanging over is saved as a folded sticky note', !!sticky && sticky.contents === 'Hanging over the edge', json(over.annots))
check('…at its corner, on the page', sticky && Math.abs(sticky.rect[0] - 480) < 1 && sticky.rect[2] <= 595 + 0.5 && Math.abs(sticky.rect[3] - (842 - 200)) < 1, json(sticky?.rect))
check('…and no card is printed', !over.text.includes('Hanging'), over.text)
check('the editor still has it open, not folded', !(await note()).noteFolded)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
