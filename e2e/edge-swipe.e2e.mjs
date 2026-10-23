// A swipe in from the left edge goes back a page, as on any iPhone (James,
// 2026-10-19: "Side swipe should go back a page, I am on send and it doesn't
// do anything"). See useEdgeSwipeBack in @unisim/sdk (the phone kit).
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:edge-swipe           # in another terminal
//
// The phone screens in WebKit at iPhone size (`?app`). WebKit won't build a
// Touch from script, so the touches are plain events carrying `touches` /
// `changedTouches` — what the hook reads. What is pinned:
//
//   • On the Share page, a swipe from the left edge drags the page with the
//     finger, holds the browser's scroll off (touchmove's default prevented),
//     and let go past a third of the width goes back to the document.
//   • A short, slow one springs back: still on Share, the page back in place.
//   • A swipe starting mid-screen does nothing, nor does a mostly-upward one
//     from the edge (that's the page's own scroll).
//   • A knowledge base article swipes back to its list.
//   • On the document itself, the edge swipe does nothing (the carousel's).

import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// E2E_PLAYWRIGHT=<path to playwright/index.js> for a checkout away from its siblings (a worktree).
const PLAYWRIGHT_CANDIDATES = [
  ...(process.env.E2E_PLAYWRIGHT ? [relative(HERE, process.env.E2E_PLAYWRIGHT)] : []),
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
      const probe = await mod.webkit.launch()
      await probe.close()
      return mod
    } catch {
      /* try the next one */
    }
  }
  console.error('No usable Playwright (with WebKit) found. Install it in a sibling Universal app.')
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
const browser = await playwright.webkit.launch()
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

const mod = (path, src, arg) =>
  page.evaluate(
    async ({ path, src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', 'arg', src)(m, arg)
    },
    { path, src, arg },
  )
const screens = () => mod('/src/native/nav.ts', 'return m.useNav.getState().screens')

/** One touch event at (x, y), sent to where the finger came down, as a real one is. */
const touch = (type, x, y) =>
  page.evaluate(
    ({ type, x, y }) => {
      if (type === 'touchstart') window.__swipeTarget = document.elementFromPoint(x, y)
      const target = window.__swipeTarget
      const t = { identifier: 7, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y }
      const e = new Event(type, { bubbles: true, cancelable: true, composed: true })
      const live = type === 'touchend' || type === 'touchcancel' ? [] : [t]
      Object.defineProperty(e, 'touches', { value: live })
      Object.defineProperty(e, 'targetTouches', { value: live })
      Object.defineProperty(e, 'changedTouches', { value: [t] })
      target.dispatchEvent(e)
      return e.defaultPrevented
    },
    { type, x, y },
  )

/**
 * A swipe from (x0, y0) by (dx, dy) in `steps` moves, `ms` apart. Reports
 * whether any move had its default (the scroll) prevented, and the transform
 * on the page layer just before the finger lifts.
 */
async function swipe(x0, y0, dx, dy, { steps = 12, ms = 16 } = {}) {
  await touch('touchstart', x0, y0)
  let prevented = false
  for (let i = 1; i <= steps; i++) {
    if (await touch('touchmove', x0 + (dx * i) / steps, y0 + (dy * i) / steps)) prevented = true
    await page.waitForTimeout(ms)
  }
  const midDrag = await layerTransform()
  await touch('touchend', x0 + dx, y0 + dy)
  await page.waitForTimeout(450)
  return { prevented, midDrag }
}
/** The transform written on the sliding page (the layer, or an article in it). */
const layerTransform = () =>
  page.evaluate(() => {
    const pages = document.querySelectorAll('[data-edge-page]')
    const el = pages.length ? pages[pages.length - 1] : document.querySelector('.np .z-\\[150\\]')
    return el ? el.style.transform : null
  })

const W = 393
const Y = 420

await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
await mod('/src/native/jobs.ts', "void m.runJob('example')")
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)

const openShare = async () => {
  await page.locator('nav[aria-label="Tools"]').getByRole('button', { name: 'Share' }).click()
  await page.waitForTimeout(500)
}

console.log('\nShare: a swipe from the left edge goes back to the document')
await openShare()
{
  check('Share is open', json(await screens()) === json(['share']), json(await screens()))
  const s = await swipe(6, Y, W * 0.55, 8)
  check('the page followed the finger', /translateX\(\d/.test(s.midDrag ?? ''), s.midDrag)
  check("the page's scroll was held off", s.prevented)
  check('let go past a third: back to the document', json(await screens()) === json([]), json(await screens()))
  const open = await mod('/src/stores/pdfStore.ts', 'return !!m.usePdfStore.getState().doc')
  check('…which is still open', open)
}

console.log('\na short, slow one springs back')
await openShare()
{
  const s = await swipe(6, Y, 70, 0, { steps: 10, ms: 60 })
  check('the page moved with it', /translateX\(\d/.test(s.midDrag ?? ''), s.midDrag)
  check('still on Share', json(await screens()) === json(['share']), json(await screens()))
  check('the page is back in place', (await layerTransform()) === '', await layerTransform())
}

console.log('\na swipe from mid-screen, or upward from the edge, does nothing')
{
  const mid = await swipe(W / 2 - 40, Y, W * 0.5, 0)
  check('mid-screen: still on Share', json(await screens()) === json(['share']), json(await screens()))
  check('mid-screen: nothing moved, the scroll left alone', !mid.prevented && !mid.midDrag, json(mid))
  const up = await swipe(6, Y + 150, 20, -200)
  check('upward from the edge: still on Share', json(await screens()) === json(['share']), json(await screens()))
  check('upward from the edge: the scroll left alone', !up.prevented && !up.midDrag, json(up))
}

console.log('\na knowledge base article swipes back to its list')
await mod('/src/native/nav.ts', 'm.useNav.getState().clearScreens()')
await page.waitForTimeout(400)
{
  await page.getByRole('button', { name: 'What else' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'How to…' }).click()
  await page.waitForSelector('h1:has-text("Good to")')
  await page.locator('section button').first().click()
  await page.waitForTimeout(500)
  check('the article is open', json(await screens()) === json(['kb', 'kb-article']), json(await screens()))
  const s = await swipe(6, Y, W * 0.6, 0)
  check('the article followed the finger', /translateX\(\d/.test(s.midDrag ?? ''), s.midDrag)
  check('back to the list', json(await screens()) === json(['kb']), json(await screens()))
  check('the list is showing', await page.locator('h1:has-text("Good to")').isVisible())
  await swipe(6, Y, W * 0.6, 0)
  check('and the list back to the document', json(await screens()) === json([]), json(await screens()))
}

console.log('\non the document itself, the edge swipe does nothing')
{
  const s = await swipe(6, Y, W * 0.6, 0)
  check('no page to go back from: nothing moved', !s.prevented, json(s))
  const open = await mod('/src/stores/pdfStore.ts', 'return !!m.usePdfStore.getState().doc')
  check('the document is still open', open && json(await screens()) === json([]), json(await screens()))
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
