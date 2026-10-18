// Snap to align (James, 2026-10-18: "add snap to align so that you can easily
// align items e.g. your name and date ... on the signature").
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:snap-align           # in another terminal
//
// A dragged mark's left / centre / right and top / middle / bottom catch the
// same lines of the other marks on its page (and the page's centre) within a
// few pixels, and a pink guide shows each line caught while it is dragged.
// With a mouse on the website: a touch in a desktop browser's phone emulation
// is taken as a scroll, so the phone suite can't drive it.

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

async function testPdf() {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await keepAppModuleUrls(context)
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.setInputFiles('input[type=file]', { name: 'snap.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

const store = (src, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(m.useAnnotationStore.getState(), arg)
    },
    { src, arg },
  )
const json = (v) => JSON.stringify(v)
const canvas = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const k = await store('return s.viewScale')
const guideCount = () => page.locator('[data-page-index="0"] div[style*="236, 72, 153"]').count()

async function drag(id, dx, dy) {
  const b = (await store('return s.annotations')).find((a) => a.id === id)
  const gx = canvas.x + (b.x + b.width / 2) * k
  const gy = canvas.y + (b.y + b.height / 2) * k
  await page.mouse.move(gx, gy)
  await page.mouse.down()
  await page.mouse.move(gx + dx, gy + dy, { steps: 10 })
  await page.waitForTimeout(120)
  const guides = await guideCount()
  await page.mouse.up()
  await page.waitForTimeout(400)
  return { guides, after: (await store('return s.annotations')).find((a) => a.id === id) }
}

const put = () =>
  store("s.resetDocument(); s.add({ id: 'A', pageIndex: 0, type: 'rect', x: 100, y: 200, width: 160, height: 40, color: '#2353c9', filled: true }); s.add({ id: 'B', pageIndex: 0, type: 'rect', x: 140, y: 320, width: 80, height: 30, color: '#16a34a', filled: true }); s.setSelected(null); s.setTool('select')")

console.log('\na dragged box catches the left edge of another')
{
  await put()
  await page.waitForTimeout(300)
  // B's left edge to 3px short of A's.
  const { guides, after } = await drag('B', -(40 * k) + 3, 20)
  check('its left edge snapped onto the other\'s', Math.abs(after.x - 100) < 0.6, json({ x: after.x }))
  check('a guide showed while it was dragged', guides > 0, String(guides))
  check('the guides go once it is let go', (await guideCount()) === 0)
}

console.log('\n…and the centre')
{
  await put()
  await page.waitForTimeout(300)
  // B's centre (180) to 3px past A's (180) — start it off-centre first.
  await store("s.update('B', { x: 160 })")
  await page.waitForTimeout(200)
  const { after } = await drag('B', -(20 * k) - 3, 20)
  check('its centre snapped onto the other\'s', Math.abs(after.x + after.width / 2 - 180) < 0.6, json({ centre: after.x + after.width / 2 }))
}

console.log('\nfar from any line it moves freely')
{
  await put()
  await page.waitForTimeout(300)
  const { guides, after } = await drag('B', 47 * k, 61 * k)
  check('no snap', Math.abs(after.x - 187) < 1.5 && Math.abs(after.y - 381) < 1.5, json({ x: after.x, y: after.y }))
  check('no guide', guides === 0, String(guides))
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
