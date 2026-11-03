// The website's Pages list (James, 2026-11-03):
//
//   • "have a refresh button on the pages tab to update the thumbnails with
//     new annotations" — ↻ in the list's header redraws the thumbnails from an
//     annotated copy, and keeps doing so after the pages change.
//   • "like the mobile app need an option to rotate the page from portrait to
//     landscape 90'c all the way round" — ↻ on each thumbnail stages a quarter
//     turn clockwise; four come back to none; the ✓ bar applies it.
//   • "when deleting a page ask do not warn again for deleting" — the delete
//     question is the app's own, with a "Don't ask again" tick that sets Tune
//     this app ▸ "Don't confirm page deletes".
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:pages-panel          # in another terminal
//
// Negative control (2026-11-03, run): with `thumbDoc ?? doc` in PageNavigator
// put back to `doc`, the two "box shows on the thumbnail" checks go red.

import { dirname, join } from 'node:path'
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

const { PDFDocument } = await import('pdf-lib')
async function testPdf() {
  const doc = await PDFDocument.create()
  for (let i = 0; i < 3; i++) doc.addPage([595, 842])
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'three.pdf', mimeType: 'application/pdf', buffer: await testPdf() })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)
await page.evaluate(() => window.__stores.pdf.getState().setPageNavOpen(true))
await page.waitForSelector('[data-thumb-page="0"] img', { timeout: 30000 })

// How dark the middle of a page's thumbnail is (0 white … 255 black), and its shape.
const thumbInfo = (i) =>
  page.evaluate(async (i) => {
    const img = document.querySelector(`[data-thumb-page="${i}"] img`)
    if (!img) return null
    await img.decode().catch(() => {})
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(Math.floor(c.width / 2) - 2, Math.floor(c.height / 2) - 2, 4, 4).data
    let sum = 0
    for (let k = 0; k < d.length; k += 4) sum += 255 - (d[k] + d[k + 1] + d[k + 2]) / 3
    return { dark: sum / 16, w: img.naturalWidth, h: img.naturalHeight, src: img.src.slice(-40) }
  }, i)
const waitFor = async (fn, ms = 15000) => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await page.waitForTimeout(200)
  }
}

console.log('\nRefresh puts annotations on the thumbnails')
// A black box over the middle of page 1.
await page.evaluate(() => {
  const s = window.__stores.ann.getState()
  s.add({ id: 'box-1', pageIndex: 0, type: 'redact', x: 150, y: 300, width: 300, height: 250, fill: '#000000' })
  s.setSelected(null)
})
await page.waitForTimeout(300)
const before = await thumbInfo(0)
check('before: the thumbnail is the plain page', before && before.dark < 20, JSON.stringify(before))
await page.getByRole('button', { name: 'Refresh thumbnails' }).click()
const after = await waitFor(async () => {
  const v = await thumbInfo(0)
  return v && v.dark > 200 ? v : null
})
check('after Refresh: the box shows on the thumbnail', !!after, JSON.stringify(await thumbInfo(0)))

console.log('\n↻ on a thumbnail turns the page a quarter clockwise, staged')
const turnBtn = page.getByRole('button', { name: 'Turn page 2 90° clockwise' })
const portrait = await thumbInfo(1)
await turnBtn.click()
const land = await waitFor(async () => {
  const v = await thumbInfo(1)
  return v && v.w > v.h ? v : null
})
check('the thumbnail turns landscape', !!land, JSON.stringify(await thumbInfo(1)))
check('and the ✓ bar offers Apply changes', (await page.getByRole('button', { name: /Apply changes/ }).count()) === 1)
await turnBtn.click()
await turnBtn.click()
await turnBtn.click()
await page.waitForTimeout(300)
const round = await thumbInfo(1)
check('four turns come all the way round', round && round.h > round.w && round.w === portrait.w, JSON.stringify(round))
check('with nothing left to apply', (await page.getByRole('button', { name: /Apply/ }).count()) === 0)
await turnBtn.click()
await page.getByRole('button', { name: /Apply changes/ }).click()
const rot = await waitFor(() =>
  page.evaluate(async () => {
    const d = window.__stores.pdf.getState().doc
    const p = await d.getPage(2)
    return p.rotate === 90 ? p.rotate : null
  })
)
check('Apply turns page 2 in the file', rot === 90, String(rot))
const stillBoxed = await waitFor(async () => {
  await page.waitForSelector('[data-thumb-page="0"] img', { timeout: 10000 }).catch(() => {})
  const v = await thumbInfo(0)
  return v && v.dark > 200 ? v : null
})
check('and the thumbnails keep showing the annotations', !!stillBoxed, JSON.stringify(await thumbInfo(0)))

console.log('\nDeleting asks, with "Don\'t ask again"')
const pages = () => page.evaluate(() => window.__stores.pdf.getState().numPages)
await page.getByRole('button', { name: 'Delete page 3' }).click()
const dialog = page.getByRole('alertdialog')
check('the question is up', (await dialog.count()) === 1)
check('and "Don\'t ask again" starts unticked', !(await page.getByLabel('Don’t ask again').isChecked()))
await dialog.getByRole('button', { name: 'Cancel' }).click()
check('Cancel keeps the page', (await pages()) === 3 && (await dialog.count()) === 0)
await page.getByRole('button', { name: 'Delete page 3' }).click()
await page.getByLabel('Don’t ask again').check()
await dialog.getByRole('button', { name: 'Delete' }).click()
check('Delete deletes it', (await waitFor(async () => ((await pages()) === 2 ? 2 : null))) === 2)
const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('universal-pdf-tool-prefs')).state.noDeleteConfirm)
check('and the tick is saved as "Don\'t confirm page deletes"', pref === true, String(pref))
await page.getByRole('button', { name: 'Delete page 2' }).click()
await page.waitForTimeout(200)
check('the next delete does not ask', (await dialog.count()) === 0)
check('it just deletes', (await waitFor(async () => ((await pages()) === 1 ? 1 : null))) === 1)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
