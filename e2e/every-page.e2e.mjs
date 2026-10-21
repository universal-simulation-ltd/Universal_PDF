// "Put on every page" on a placed signature, stamp or picture.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:every-page:e2e       # in another terminal
//
// What is pinned (James, 2026-10-18: "on signatures and stamps give the option
// to place them on every page (they could pick a draft stamp etc)"):
//
//   • A selected picture/stamp/signature has "Put on every page" (not on a
//     one-page document); a tap copies it to every other page and says so.
//   • Copies keep their distance from the nearest edges on a page of another
//     size (the arithmetic is scripts/everyPage.test.mjs).
//   • The original stays selected; once it is on every page the button
//     becomes "Take off the other pages" (a no-entry sign over it, James,
//     2026-10-19), which takes every copy but this one off — in one undo step.
//     It still does after the original is moved (2026-10-22).
//   • ONE undo takes every copy away.
//   • Export: the stamp is on every page of the file.

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
doc.addPage([595, 842]) // A4
doc.addPage([612, 792]) // Letter
doc.addPage([595, 842])
const pdf = Buffer.from(await doc.save())
const one = await PDFDocument.create()
one.addPage([595, 842])
const onePdf = Buffer.from(await one.save())

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
// A solid red block, standing in for a DRAFT stamp.
const STAMP = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 240
  c.height = 80
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(0, 0, 240, 80)
  return c.toDataURL('image/png')
})
const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const images = async () => (await store('return s.annotations')).filter((a) => a.type === 'image')
const btn = page.getByRole('button', { name: 'Put on every page' })

console.log('\nthree pages, the middle one Letter')
await page.setInputFiles('input[type=file]', { name: 'three.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForFunction(async () => (await import('/src/stores/pdfStore.ts')).usePdfStore.getState().numPages === 3, null, { timeout: 30000 })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(500)
// Bottom right of page 1: 30 from the right, 50 from the bottom.
await store('s.resetDocument(); s.add({ id: "st", type: "image", pageIndex: 0, x: 595 - 30 - 120, y: 842 - 50 - 40, width: 120, height: 40, src: arg }); s.setSelected("st")', STAMP)
await page.waitForTimeout(300)
check('a selected stamp has Put on every page', (await btn.count()) === 1, json({ imgs: (await images()).map((a) => [a.id, a.pageIndex]), sel: await store('return s.selectedId'), del: await page.getByRole('button', { name: 'Delete selected object' }).count(), pages: await page.evaluate(async () => (await import('/src/stores/pdfStore.ts')).usePdfStore.getState().numPages) }))
await btn.click()
await page.waitForTimeout(500)
let imgs = await images()
check('a copy on each other page', json(imgs.map((a) => a.pageIndex).sort()) === '[0,1,2]', json(imgs))
const onLetter = imgs.find((a) => a.pageIndex === 1)
check('…the same distance from the bottom-right corner on the Letter page', onLetter && Math.abs(612 - (onLetter.x + 120) - 30) < 0.5 && Math.abs(792 - (onLetter.y + 40) - 50) < 0.5, json(onLetter))
check('it says how many pages it added to', (await page.getByRole('status').filter({ hasText: 'Added to 2 more pages' }).count()) === 1)
check('the original stays selected', (await store('return s.selectedId')) === 'st')
await page.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'every-page.png') })
const off = page.getByRole('button', { name: 'Take off the other pages' })
check('once on every page, the button offers to take them off instead', (await off.count()) === 1 && (await btn.count()) === 0)

// James, 2026-10-22: moving the original must not lose the "take off" button.
console.log('\nmoving the original')
await store('s.update("st", { x: 60, y: 120 })')
await page.waitForTimeout(300)
check('moved, it still offers to take the copies off', (await off.count()) === 1 && (await btn.count()) === 0)
await store('s.undo(); s.setSelected("st")')
await page.waitForTimeout(200)

console.log('\nexport')
const out = await page.evaluate(
  async ({ src, annotations }) => {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
    const out = await buildAnnotatedPdfBytes(bytes.buffer, annotations, 1)
    const d = await openPdf(out.slice()).promise
    const res = []
    for (let i = 1; i <= d.numPages; i++) {
      const p = await d.getPage(i)
      const vp = p.getViewport({ scale: 1 })
      const c = document.createElement('canvas')
      c.width = vp.width
      c.height = vp.height
      const ctx = c.getContext('2d')
      await p.render({ canvasContext: ctx, viewport: vp }).promise
      const a = annotations.find((x) => x.pageIndex === i - 1)
      res.push([...ctx.getImageData(Math.round(a.x + 60), Math.round(a.y + 20), 1, 1).data.slice(0, 3)])
    }
    void d.destroy()
    return res
  },
  { src: pdf.toString('base64'), annotations: await images() },
)
check('the stamp is on every page of the file', out.length === 3 && out.every((px) => px[0] > 200 && px[1] < 60 && px[2] < 60), json(out))

console.log('\ntaking it off the other pages')
await off.click()
await page.waitForTimeout(400)
check('every copy but this one goes', json((await images()).map((a) => [a.id, a.pageIndex])) === '[["st",0]]', json(await images()))
check('it says how many pages it took it off', (await page.getByRole('status').filter({ hasText: 'Taken off 2 other pages' }).count()) === 1)
check('the original is still selected, and the button offers to add again', (await store('return s.selectedId')) === 'st' && (await btn.count()) === 1)
await store('s.undo()')
await page.waitForTimeout(200)
check('one undo puts them all back', json((await images()).map((a) => a.pageIndex).sort()) === '[0,1,2]', json(await images()))

console.log('\nundo')
await store('s.undo()')
await page.waitForTimeout(200)
check('one undo takes every copy away', json((await images()).map((a) => a.pageIndex)) === '[0]', json(await images()))

console.log('\na one-page document')
{
  const p1 = await context.newPage()
  await p1.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
  await p1.setInputFiles('input[type=file]', { name: 'one.pdf', mimeType: 'application/pdf', buffer: onePdf })
  await p1.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await p1.waitForTimeout(500)
  await p1.evaluate(async (src) => {
    const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
    const s = useAnnotationStore.getState()
    s.add({ id: 'st1', type: 'image', pageIndex: 0, x: 40, y: 30, width: 120, height: 40, src })
    s.setSelected('st1')
  }, STAMP)
  await p1.waitForTimeout(300)
  check('has no Put on every page', (await p1.getByRole('button', { name: 'Delete selected object' }).count()) === 1 && (await p1.getByRole('button', { name: 'Put on every page' }).count()) === 0)
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
