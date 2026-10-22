// The phone's swipes and the way out of a document — browser-level, with real
// touches (CDP Input.dispatchTouchEvent).
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:phone-gestures      # in another terminal
//
// What is pinned (James, 2026-10-22):
//
//   • Leaving a document asks nothing ("why not have the confirmation exit?
//     It saves the annotations"), and its annotations are there when it is
//     reopened. ⚠️ They were not: closing saved an empty set over them.
//   • ⋯ What else has no "Put it away" (the back arrow does it) and has
//     "Revert to original": the original pages, no marks, asked first, and one
//     Undo puts everything back.
//   • A big swipe down anywhere on a drawer closes it; a short pull doesn't,
//     and puts the finger in the drawer's text box when it has one.
//   • A pull down on a page (QR) puts the finger in its text box.
//   • On the desk, a PDF swiped left shows Delete, swiped right shows Share;
//     its ⋯ has Share too.

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
// What reaches the share sheet: a PDF handed to navigator.share, or a PDF
// blob made into a download link.
await context.addInitScript(() => {
  window.__shared = []
  const orig = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (b) => {
    if (b && b.type === 'application/pdf') window.__shared.push('blob')
    return orig(b)
  }
  try {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared.push('share:' + (d?.files?.[0]?.name ?? '')) } })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  } catch { /* fine without */ }
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
page.on('console', (m) => { if (process.env.DEBUG_GESTURES && /share|fail|error|warn/i.test(m.text())) console.log('    [console]', m.text()) })
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
const pdf = (src, arg) => mod('/src/stores/pdfStore.ts', `const s = m.usePdfStore.getState(); ${src}`, arg)
const nav = (src) => mod('/src/native/nav.ts', `const n = m.useNav.getState(); ${src}`)
const cdp = await context.newCDPSession(page)

/** One finger: down, a drag of (dx, dy) over `ms`, up. */
async function finger({ x, y, dx = 0, dy = 0, ms = 240, steps = 12 }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  for (let i = 1; i <= (dx || dy ? steps : 0); i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id: 1 }] })
    await page.waitForTimeout(ms / steps)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}
const centre = async (locator) => {
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const focusedLabel = () => page.evaluate(() => {
  const el = document.activeElement
  if (!el || !/INPUT|TEXTAREA/.test(el.tagName)) return null
  return el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.tagName
})

await page.getByText('Try with example PDF').click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(1500)
const pagesAtFirst = await pdf('return s.numPages')

console.log('\nleaving asks nothing, and the work is there when it comes back')
await store("s.add({ id: 'keep1', type: 'tick', pageIndex: 0, x: 80, y: 80, size: 20, color: '#000000' }); s.setSelected(null)")
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Back to your desk' }).click()
await page.waitForTimeout(900)
check('straight back to the desk, no question', (await pdf('return !!s.doc')) === false && (await page.getByRole('dialog').count()) === 0)
await pdf('return s.refreshRecents()')
await page.waitForTimeout(300)
const row = page.locator('main li, li').filter({ hasText: /example/i }).first()
await row.locator('button:not([aria-hidden])').first().click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(1500)
check('reopened, the tick is still on it', json(await store('return s.annotations.map((a) => a.id)')) === '["keep1"]', json(await store('return s.annotations.map((a) => a.id)')))

console.log('\n⋯ What else: no "Put it away"; Revert to original')
await page.getByRole('button', { name: 'What else', exact: true }).click()
await page.waitForTimeout(500)
check('no "Put it away"', (await page.getByRole('button', { name: 'Put it away' }).count()) === 0)
check('"Revert to original" is there', (await page.getByRole('button', { name: 'Revert to original' }).count()) === 1)
await nav('n.closeSheet()')
await page.waitForTimeout(300)
await pdf('return s.deletePage(1)')
await page.waitForTimeout(1200)
const pagesEdited = await pdf('return s.numPages')
check('a page taken out to revert', pagesEdited === pagesAtFirst - 1, `${pagesAtFirst} -> ${pagesEdited}`)
await page.getByRole('button', { name: 'What else', exact: true }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Revert to original' }).click()
await page.waitForTimeout(300)
check('it asks first', (await page.getByText('Put this PDF back as it was when you first opened it?').count()) === 1)
await page.getByRole('button', { name: 'Revert', exact: true }).click()
await page.waitForTimeout(1500)
check('the original pages are back', (await pdf('return s.numPages')) === pagesAtFirst)
check('and the marks are off', (await store('return s.annotations.length')) === 0)
await page.getByRole('button', { name: 'Undo', exact: true }).click().catch(() => mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().undoDocument()'))
await page.waitForTimeout(1500)
check('one Undo puts the page change and the tick back', (await pdf('return s.numPages')) === pagesEdited && (await store('return s.annotations.length')) === 1, json({ pages: await pdf('return s.numPages'), marks: await store('return s.annotations.length') }))

console.log('\na big swipe down closes a drawer; a short pull doesn\'t')
await page.getByRole('button', { name: 'What else', exact: true }).click()
await page.waitForTimeout(600)
const title = page.getByRole('heading', { name: 'What else?' })
let at = await centre(title)
await finger({ x: at.x, y: at.y, dy: 60 })
check('a short pull leaves it open', (await nav('return n.sheet')) === 'more')
at = await centre(title)
await finger({ x: at.x, y: at.y, dy: 380, ms: 300 })
check('a big swipe down closes it', (await nav('return n.sheet')) !== 'more', String(await nav('return n.sheet')))

console.log('\na short pull on a drawer with a text box puts you in it')
await page.getByRole('button', { name: 'What else', exact: true }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Rename' }).click()
await page.waitForTimeout(300)
await page.evaluate(() => document.activeElement?.blur())
at = await centre(page.getByRole('heading', { name: 'What else?' }))
await finger({ x: at.x, y: at.y, dy: 80 })
check('the name box has the focus', (await focusedLabel())?.includes('New name'), String(await focusedLabel()))
check('and the drawer is still open', (await nav('return n.sheet')) === 'more')
await nav('n.closeSheet()')
await page.waitForTimeout(400)

console.log('\na pull down on the QR page puts you in the link box')
await nav("n.push('qr')")
await page.waitForTimeout(800)
await page.evaluate(() => document.activeElement?.blur())
const qrTitle = page.locator('h1, h2').filter({ hasText: /QR/ }).first()
at = await centre(qrTitle)
await finger({ x: at.x, y: at.y, dy: 120 })
check('the link box has the focus', !!(await focusedLabel()), String(await focusedLabel()))
await nav('n.clearScreens()')
await page.waitForTimeout(300)

console.log('\non the desk: swipe right for Share, left for Delete, Share in ⋯')
await page.getByRole('button', { name: 'Back to your desk' }).click()
await page.waitForTimeout(900)
await pdf('return s.refreshRecents()')
await page.waitForTimeout(300)
const deskRow = page.locator('li').filter({ hasText: /example/i }).first()
let rb = await deskRow.boundingBox()
await finger({ x: rb.x + 120, y: rb.y + rb.height / 2, dx: 140 })
const share = page.getByRole('button', { name: 'Share', exact: true, includeHidden: true }).first()
check('swiped right, the row slides open on Share', await page.evaluate(() => !!document.querySelector('[data-swipe-open]')))
await page.evaluate(() => { window.__shared = [] })
await share.click()
await page.waitForTimeout(2500)
check('…and hands the PDF to the share sheet', (await page.evaluate(() => window.__shared.length)) > 0, json(await page.evaluate(() => window.__shared)))
await page.getByRole('button', { name: /^Options for/ }).first().click()
await page.waitForTimeout(500)
check('its ⋯ has Share', (await page.getByRole('button', { name: 'Share', exact: true }).count()) >= 1)
await nav('n.closeSheet()').catch(() => {})
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const before = await pdf('return s.recents.length')
rb = await deskRow.boundingBox()
await finger({ x: rb.x + rb.width - 60, y: rb.y + rb.height / 2, dx: -140 })
const del = page.getByRole('button', { name: 'Delete', exact: true, includeHidden: true }).first()
check('swiped left, the row slides open on Delete', await page.evaluate(() => !!document.querySelector('[data-swipe-open]')))
await del.click()
await page.waitForTimeout(800)
check('…and takes it off the desk', (await pdf('return s.recents.length')) === before - 1, `${before} -> ${await pdf('return s.recents.length')}`)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
