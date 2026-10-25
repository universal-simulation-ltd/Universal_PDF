// The open document's page-number chip (James, 2026-10-25) — browser-level
// check of src/native/PageChip.tsx.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:page-chip            # in another terminal
//
// What is pinned:
//   • "1 / 3" shows as the document opens, then fades after ~2 s of stillness;
//     faded it lets touches through (pointer-events: none) and is still a
//     button with its label ("Page 1 of 3, open Pages") for VoiceOver.
//   • Moving the pages wakes it, showing the page most in view — side by
//     side (the phone's default) and down the screen alike.
//   • A tap opens Pages, scrolled to that page and marking it.
//   • It is gone while Mark up's sheet, a drawing tool, a sheet or a page is
//     up, and while a message shows at the foot.
//   • It sits above the tool bar, inside the screen.

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
await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
const mod = (path, src) =>
  page.evaluate(
    async ({ path, src }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', src)(m)
    },
    { path, src },
  )
const nav = (src) => mod('/src/native/nav.ts', `const n = m.useNav.getState(); ${src}`)
const chip = page.locator('[data-page-chip]')
const state = () =>
  page.evaluate(() => {
    const c = document.querySelector('[data-page-chip]')
    if (!c) return null
    const r = c.getBoundingClientRect()
    const cs = getComputedStyle(c)
    const bar = document.querySelector('nav[aria-label="Tools"]')?.getBoundingClientRect()
    return {
      label: c.getAttribute('aria-label'),
      text: c.textContent,
      awake: c.hasAttribute('data-awake'),
      opacity: Number(cs.opacity),
      events: cs.pointerEvents,
      box: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
      barTop: bar ? Math.round(bar.top) : null,
    }
  })
/** Scroll the viewer so page `i` starts at the top-left of what is in view. */
const scrollTo = (i) =>
  page.evaluate((i) => {
    const p = document.querySelector(`[data-page-index="${i}"]`)
    const sc = p.closest('.overflow-auto')
    const r = p.getBoundingClientRect()
    const v = sc.getBoundingClientRect()
    sc.scrollLeft += r.left - v.left
    sc.scrollTop += r.top - v.top
  }, i)

console.log('\nshown as the document opens, then fades')
await mod('/src/native/jobs.ts', "return m.runJob('example')")
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(400)
let s = await state()
check('"1 / 3" on show as it opens', !!s && s.awake && s.text === '1 / 3', json(s))
check('…labelled for VoiceOver', s?.label === 'Page 1 of 3, open Pages', json(s))
check('…bottom right, above the tool bar, on screen', !!s && s.box.right <= 393 && s.box.right > 340 && s.barTop !== null && s.box.bottom <= s.barTop, json(s))
await page.waitForTimeout(2600)
s = await state()
check('faded after two seconds of stillness', !!s && !s.awake && s.opacity === 0, json(s))
check('…lets touches through', s?.events === 'none', json(s))
check('…and is still a button with its label', (await page.getByRole('button', { name: 'Page 1 of 3, open Pages' }).count()) === 1)

console.log('\nmoving the pages wakes it, with the page most in view')
await scrollTo(1)
await page.waitForTimeout(300)
s = await state()
check('side by side (the default): page 2 → "2 / 3"', !!s && s.awake && s.text === '2 / 3' && s.events === 'auto', json(s))

console.log('\na tap opens Pages at that page')
await chip.click()
await page.waitForTimeout(700)
check('the Pages page', json(await nav('return n.screens')) === json(['pages']), json(await nav('return n.screens')))
check('…with page 2 marked', (await page.locator('[data-thumb-page="1"] > button[data-flash]').count()) === 1)
check('…and the request put down', (await nav('return n.pagesFocus')) === null)
await nav('n.pop()')
await page.waitForTimeout(500)

console.log('\ngone while Mark up, a drawing tool, a sheet, a page or a message is up')
await page.getByRole('button', { name: 'Mark up' }).click()
await page.waitForTimeout(400)
check('Mark up open: no chip', (await chip.count()) === 0)
await nav('n.closeSheet()')
await mod('/src/stores/annotationStore.ts', "m.useAnnotationStore.getState().setTool('draw')")
await page.waitForTimeout(200)
check('a pen in hand: no chip', (await chip.count()) === 0)
await mod('/src/stores/annotationStore.ts', "m.useAnnotationStore.getState().setTool('select')")
await nav("n.openSheet('more')")
await page.waitForTimeout(300)
check('What else open: no chip', (await chip.count()) === 0)
await nav('n.closeSheet()')
await nav("n.push('sign')")
await page.waitForTimeout(300)
check('the Sign page up: no chip', (await chip.count()) === 0)
await nav('n.pop()')
await nav("n.say('Hello')")
await page.waitForTimeout(200)
check('a message at the foot: no chip', (await chip.count()) === 0)
await nav('n.dismissToast()')
await page.waitForTimeout(200)
check('back when they are gone', (await chip.count()) === 1)

console.log('\npages down the screen too (Tune ▸ Page scrolling)')
await page.evaluate(() => localStorage.setItem('unisim:default-view:pdf:page-scroll', 'vertical'))
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
await mod('/src/native/jobs.ts', "return m.runJob('example')")
await page.waitForSelector('[data-page-index="1"]', { timeout: 30000 })
await page.waitForTimeout(800)
const stacked = await page.evaluate(() => {
  const a = document.querySelector('[data-page-index="0"]').getBoundingClientRect()
  const b = document.querySelector('[data-page-index="1"]').getBoundingClientRect()
  return b.top >= a.bottom - 1
})
check('the pages are one under another', stacked)
await scrollTo(2)
await page.waitForTimeout(300)
s = await state()
check('page 3 most in view → "3 / 3"', !!s && s.awake && s.text === '3 / 3', json(s))

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nall passed')
