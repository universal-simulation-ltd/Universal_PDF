// Clear all annotations on the phone — browser-level check.
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:phone-clear-all     # in another terminal
//
// What is pinned (James, 2026-10-22: "Add a delete all annotations on the
// mobile app"):
//
//   • ⋯ What else offers "Clear all annotations" only when there is something
//     to clear.
//   • It asks first, in the sheet, with the count; Cancel clears nothing.
//   • Clear all takes every mark off, says how many, and one Undo puts them
//     all back.


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
// ⚠️ A short phone (iPhone SE height). On James's iPhone the ⋯ sheet was
// taller than the screen and its last card was squashed, cutting the row off;
// at 852 px it all fitted, and this test passed while the row was out of reach.
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
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
const count = () => store('return s.annotations.length')
const toast = () => mod('/src/native/nav.ts', 'return m.useNav.getState().toast')
const row = page.getByRole('button', { name: 'Clear all annotations' })
const openMore = async () => {
  await page.getByRole('button', { name: 'What else', exact: true }).click()
  await page.waitForTimeout(500)
}
const closeMore = () => mod('/src/native/nav.ts', 'm.useNav.getState().closeSheet()')

await page.getByText('Try with example PDF').click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(1000)
await store('s.resetDocument()')

console.log('\nnothing to clear')
await openMore()
check('no Clear all annotations row', (await row.count()) === 0)
await closeMore()
await page.waitForTimeout(300)

console.log('\nthree marks')
await store(`s.addMany([
  { id: 'a', type: 'text', pageIndex: 0, x: 40, y: 40, text: 'one', color: '#000', fontSize: 12 },
  { id: 'b', type: 'tick', pageIndex: 0, x: 80, y: 80, size: 20, color: '#000' },
  { id: 'c', type: 'text', pageIndex: 1, x: 40, y: 40, text: 'two', color: '#000', fontSize: 12 },
]); s.setSelected(null)`)
await openMore()
check('the row is there', (await row.count()) === 1)
// Really reachable. ⚠️ Not "scroll it into view, then hit-test": a clipped
// card is still scrollable FROM CODE, so that passed while the row was cut
// off for a finger. The sheet's own cards must each show all they hold, and
// the sheet is what scrolls.
const clipped = await page.evaluate(() => {
  const sc = document.querySelector('.np-sheet .overflow-y-auto')
  return [...(sc?.children ?? [])].filter((c) => c.scrollHeight > c.getBoundingClientRect().height + 1).length
})
check('no card in the sheet is cut short (the sheet scrolls instead)', clipped === 0, `${clipped} clipped`)
await row.click()
await page.waitForTimeout(300)
check('it asks first, with the count', (await page.getByText('Take all 3 annotations off this PDF?').count()) === 1)
await page.getByRole('button', { name: 'Cancel', exact: true }).click()
await page.waitForTimeout(300)
check('Cancel clears nothing', (await count()) === 3)
await row.click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Clear all', exact: true }).click()
await page.waitForTimeout(500)
check('Clear all takes every mark off', (await count()) === 0)
check('and says how many', /3 annotations cleared/.test(String(await toast())), String(await toast()))
await store('s.undo()')
await page.waitForTimeout(300)
check('one Undo puts them all back', (await count()) === 3)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
