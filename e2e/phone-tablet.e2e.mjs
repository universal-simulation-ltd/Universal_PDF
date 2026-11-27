// The phone screens on an iPad (James, 2026-11-27: "do properly for iPad").
//
//   ./scripts/preview.sh            # or preview.ps1 — Universal PDF is :5174
//   node e2e/phone-tablet.e2e.mjs
//
// From 700 px across, the same screens are laid out for a tablet (the end of
// src/native/native.css); under it — an iPhone, and an iPad's Slide Over and
// narrow Split View panes — the phone layout stands. Pinned here:
//
//   • The tabs are a rail down the left edge, and the Desk shows every job at
//     once: no carousel to swipe, no dots, no "swipe for more".
//   • Lying down, "On your desk" is a panel beside the desk.
//   • A page (About) is a card over what is under it, and a tap on the dimmed
//     ground goes back.
//   • The document's bar is centred, Mark up's tray holds every tool without
//     scrolling, and the website's page / zoom / Present strip never shows.
//   • A bottom sheet is a card at the foot, not the width of the screen.
//   • On a tablet the words say "device", not "phone".
//   • A Split View pane under 700 px gets the phone layout back.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../node_modules/playwright/index.js',
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      return (await import(pathToFileURL(join(HERE, rel)).href)).default
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
const engine = process.env.E2E_BROWSER && playwright[process.env.E2E_BROWSER] ? process.env.E2E_BROWSER : 'chromium'
const browser = await playwright[engine].launch()

async function open(width, height, tablet = true) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: engine !== 'firefox' })
  await keepAppModuleUrls(context)
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('universal:language', 'en-gb')
      if (t) sessionStorage.setItem('unipdf:device', 'tablet')
    } catch { /* no storage */ }
  }, tablet)
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  try {
    await page.goto(`${BASE}?app`, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.waitForSelector('.np', { timeout: 30000 })
  await page.waitForTimeout(800)
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
  const box = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(el).display !== 'none' }
  }, sel)
  return { page, context, nav, box }
}

// ── An iPad upright ────────────────────────────────────────────────────────
{
  const { page, context, nav, box } = await open(1032, 1376)
  console.log('\nupright: the rail and the desk')
  const rail = await box('.np-tabbar')
  check('the tabs are a rail on the left', !!rail && rail.x === 0 && rail.w <= 110 && rail.h >= 1300, json(rail))
  const jobs = await page.evaluate(() => {
    const el = document.querySelector('.np-desk-top .np-jobs')
    const cards = [...el.querySelectorAll('button')].map((b) => b.getBoundingClientRect())
    return { scrolls: el.scrollWidth > el.clientWidth + 1, count: cards.length, onScreen: cards.every((r) => r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight) }
  })
  check('every job is on the desk at once', jobs.count === 15 && !jobs.scrolls && jobs.onScreen, json(jobs))
  check('no carousel dots', (await box('.np-jobs-dots'))?.shown === false)
  check('no "swipe for more"', (await box('.np-swipe-hint'))?.shown === false)
  check('the words say "device"', (await page.getByText('only on this device').count()) === 1 && (await page.getByText('any PDF on this device').count()) === 1)
  check('…and never "phone" on the desk', !/this phone/.test(await page.locator('.np').innerText()))

  console.log('\nupright: a page is a card')
  await nav(`n.setTab('tune'); n.push('about')`)
  await page.waitForTimeout(600)
  const card = await box('.np-pagecard')
  check('About is narrower than the screen and stands clear of its edges', !!card && card.w <= 640 && card.x > 100 && card.y > 20, json(card))
  await page.mouse.click(30, 700)
  await page.waitForTimeout(500)
  check('a tap on the dimmed ground goes back', !(await nav('return n.screens')).includes('about'))

  console.log('\nupright: the document')
  await nav(`n.setTab('desk')`)
  await page.getByText('Try with example PDF').click()
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(1000)
  const bar = await box('.np-docbar')
  check('its bar is centred, not the width of the screen', !!bar && bar.w <= 460 && Math.abs(bar.x + bar.w / 2 - 516) <= 2, json(bar))
  check('the website’s page / zoom / Present strip is not shown', (await box('[data-viewer-bar]'))?.shown === false)
  await nav(`n.openSheet('markup')`)
  await page.waitForTimeout(700)
  const tray = await page.evaluate(() => {
    const g = document.querySelector('.np-markup [role="group"]')
    const r = document.querySelector('.np-markup').getBoundingClientRect()
    return { scrolls: g.scrollWidth > g.clientWidth + 1, tools: g.querySelectorAll('button').length, w: Math.round(r.width) }
  })
  check('Mark up’s tray holds every tool without scrolling', tray.tools >= 9 && !tray.scrolls && tray.w <= 720, json(tray))
  await nav(`n.openSheet('more')`)
  await page.waitForTimeout(700)
  const sheet = await box('.np-sheet')
  check('What else is a card at the foot', !!sheet && sheet.w <= 580 && sheet.x > 150, json(sheet))
  await context.close()
}

// ── Lying down ─────────────────────────────────────────────────────────────
{
  const { context, box } = await open(1376, 1032)
  console.log('\nlying down')
  const panel = await box('[data-desk-panel]')
  const top = await box('.np-desk-top')
  check('"On your desk" is a panel beside the desk', !!panel && !!top && panel.x >= top.x + top.w - 2 && panel.y === 0 && panel.w <= 400, json({ panel, top }))
  await context.close()
}

// ── A narrow Split View pane, still an iPad ────────────────────────────────
{
  const { page, context, box } = await open(678, 1032)
  console.log('\na Split View pane under 700 px')
  const bar = await box('.np-tabbar')
  check('the tabs are back at the foot', !!bar && bar.w === 678 && bar.y > 900, json(bar))
  check('the jobs are a carousel again', await page.evaluate(() => { const el = document.querySelector('.np-desk-top .np-jobs'); return el.scrollWidth > el.clientWidth + 100 }))
  check('…and it is still a "device"', (await page.getByText('only on this device').count()) === 1)
  await context.close()
}

// ── A phone says "phone" ───────────────────────────────────────────────────
{
  const { page, context } = await open(393, 852, false)
  console.log('\na phone')
  check('the words say "phone"', (await page.getByText('only on this phone').count()) === 1)
  await context.close()
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\nphone tablet: all checks passed')
