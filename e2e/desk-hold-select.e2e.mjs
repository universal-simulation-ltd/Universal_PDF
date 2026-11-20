// The phone desk: press and hold selects (BRANDING.md ▸ "A deletable row
// swipes", owner rule 2026-10-25: "a tap and hold should select the item"),
// into the same select-several bar Recent files has on the website (SDK
// <SelectionBar action="remove">, 0.228.0). See src/native/DeskScreen.tsx and
// useHold / useLeaveSelection in src/native/parts.tsx.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:desk-hold            # in another terminal
//
// The phone screens (`?app`) at iPhone size in Chromium, driven with REAL
// touch events (CDP Input.dispatchTouchEvent), as desk-search-pull does.
//
// What is pinned:
//   • The desk starts with no tick boxes and no bar (the negative control: the
//     checks below see them appear).
//   • A finger that moves during the hold (a sideways swipe, a scroll) selects
//     nothing.
//   • A still hold selects that row and enters selection mode: a tick box on
//     every row, the bar with "1 selected", Remove selected (not the red
//     Delete) and Done — and the hold opened nothing.
//   • In selection mode a tap ticks a row instead of opening it.
//   • Remove selected asks first in the phone's sheet, with the app's own
//     words; Cancel keeps the rows; Remove takes the ticked ones off the desk
//     and leaves selection mode.
//   • Done, Back (the browser's, which is Android's gesture) and a swipe in
//     from the left edge each leave selection mode.
//   • The ⋯ sheet's Select is the way in without the gesture.

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
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      /* try the next one */
    }
  }
  console.error('No usable Playwright (with Chromium) found. Install it in a sibling Universal app.')
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

const W = 390
const H = 844
const NAMES = ['Alpha lease', 'Bravo invoice', 'Charlie form', 'Delta letter']

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await keepAppModuleUrls(context)
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
const cdp = await context.newCDPSession(page)
try {
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
await page.evaluate(async (names) => {
  const imp = globalThis.__appImport ?? ((p) => import(p))
  const r = await imp('/src/lib/recents.ts')
  for (const name of names) await r.saveRecent(`${name}.pdf`, new ArrayBuffer(2048))
  const s = await imp('/src/stores/pdfStore.ts')
  await s.usePdfStore.getState().refreshRecents()
}, NAMES)
await page.waitForSelector(`text=${NAMES.at(-1)}`, { timeout: 10000 })
await page.waitForTimeout(300)

const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
/** Where a desk row's name is, by the file's name. */
const rowAt = (name) =>
  page.evaluate((n) => {
    const li = [...document.querySelectorAll('[data-desk-list] li')].find((el) => el.textContent.includes(n))
    const r = li?.getBoundingClientRect()
    return r ? { x: Math.round(r.left + r.width * 0.45), y: Math.round(r.top + r.height / 2) } : null
  }, name)
/** A still finger for `ms`, then up. */
async function hold(name, ms = 700) {
  const p = await rowAt(name)
  await touch('touchStart', p.x, p.y)
  await page.waitForTimeout(ms)
  await touch('touchEnd')
  await page.waitForTimeout(350)
}
async function tap(name) {
  const p = await rowAt(name)
  await touch('touchStart', p.x, p.y)
  await page.waitForTimeout(40)
  await touch('touchEnd')
  await page.waitForTimeout(300)
}
const state = () =>
  page.evaluate(async () => {
    const imp = globalThis.__appImport ?? ((p) => import(p))
    const s = await imp('/src/stores/pdfStore.ts')
    const st = s.usePdfStore.getState()
    const bar = document.querySelector('.u-sel-bar')
    return {
      rows: document.querySelectorAll('[data-desk-list] li').length,
      boxes: document.querySelectorAll('[data-desk-list] li input[type=checkbox]').length,
      ticked: [...document.querySelectorAll('[data-desk-list] li')]
        .filter((li) => li.querySelector('input[type=checkbox]')?.checked)
        .map((li) => li.textContent.replace(/\s+/g, ' ').trim().split(/\d/)[0].trim()),
      bar: bar ? bar.textContent : null,
      buttons: bar ? [...bar.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
      danger: !!bar?.querySelector('.u-btn--danger'),
      opened: !!st.doc || st.loading,
    }
  })

console.log('\nthe desk starts quiet')
let s = await state()
check(`${NAMES.length} rows`, s.rows === NAMES.length, json(s))
check('no tick boxes and no bar (negative control)', s.boxes === 0 && s.bar === null, json(s))

console.log('\na finger that moves is not a hold')
{
  const p = await rowAt('Charlie form')
  await touch('touchStart', p.x, p.y)
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', p.x - i * 4, p.y)
    await page.waitForTimeout(60)
  }
  await touch('touchEnd')
  await page.waitForTimeout(500)
  s = await state()
  check('a slow sideways swipe selects nothing', s.bar === null && s.boxes === 0, json(s))
  // Close the row the swipe may have opened: a tap on an open row only closes it.
  await page.mouse.click(W / 2, 60)
  await page.waitForTimeout(300)
}

console.log('\na still hold selects the row')
await hold('Bravo invoice')
s = await state()
check('selection mode: a tick box on every row', s.boxes === NAMES.length, json(s))
check('the held row is ticked, and only it', json(s.ticked) === json(['Bravo invoice']), json(s.ticked))
check('the bar says "1 selected"', s.bar?.includes('1 selected'), json(s.bar))
check('Remove selected (not the red Delete), Clear and Done', json(s.buttons) === json(['Remove selected', 'Done', 'Clear']) && !s.danger, json(s.buttons))
check('and the hold opened nothing', !s.opened, json(s))

console.log('\nin selection mode a tap ticks')
await tap('Delta letter')
s = await state()
check('Delta letter is ticked too', json([...s.ticked].sort()) === json(['Bravo invoice', 'Delta letter']), json(s.ticked))
check('"2 selected"', s.bar?.includes('2 selected'), json(s.bar))
check('nothing opened', !s.opened, json(s))
await tap('Delta letter')
s = await state()
check('a second tap unticks it', json(s.ticked) === json(['Bravo invoice']), json(s.ticked))
await tap('Delta letter')

console.log('\nRemove selected asks first')
await page.click('.u-sel-bar .u-sel-act')
await page.waitForSelector('[data-phone-dialog="confirm"]', { timeout: 3000 }).catch(() => {})
const sheet = await page.evaluate(() => document.querySelector('[data-phone-dialog="confirm"]')?.textContent ?? null)
check('in the phone sheet, with the app’s own words', sheet?.includes('Remove 2 files from recents?') && sheet.includes('not touched'), json(sheet))
await page.click('[data-phone-dialog="confirm"] button:has-text("Cancel")')
await page.waitForTimeout(400)
s = await state()
check('Cancel keeps every row, still ticked', s.rows === NAMES.length && s.ticked.length === 2, json(s))
await page.click('.u-sel-bar .u-sel-act')
await page.waitForSelector('[data-phone-dialog="confirm"]', { timeout: 3000 })
await page.click('[data-phone-dialog="confirm"] button:has-text("Remove")')
await page.waitForFunction((n) => document.querySelectorAll('[data-desk-list] li').length === n, NAMES.length - 2, { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(300)
s = await state()
check('Remove takes the two off the desk', s.rows === NAMES.length - 2 && !(await page.isVisible('text=Bravo invoice')), json(s))
check('and leaves selection mode', s.boxes === 0 && s.bar === null, json(s))

console.log('\nthe ways out')
await hold('Alpha lease')
check('(in again)', (await state()).boxes === 2)
await page.click('[data-desk-select-done]')
await page.waitForTimeout(300)
s = await state()
check('Done leaves', s.boxes === 0 && s.bar === null, json(s))

await hold('Alpha lease')
await page.evaluate(() => history.back())
await page.waitForTimeout(500)
s = await state()
check('Back leaves', s.boxes === 0 && s.bar === null, json(s))
check('…and stays on the desk', s.rows === 2 && !s.opened, json(s))

await hold('Alpha lease')
{
  const y = (await rowAt('Charlie form')).y
  await touch('touchStart', 4, y)
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', 4 + i * 16, y)
    await page.waitForTimeout(16)
  }
  await touch('touchEnd')
  await page.waitForTimeout(400)
}
s = await state()
check('a swipe in from the left edge leaves', s.boxes === 0 && s.bar === null, json(s))

console.log('\nthe ⋯ sheet’s Select, for VoiceOver and TalkBack')
await page.click('button[aria-label*="Charlie form"]')
await page.waitForTimeout(400)
await page.click('button:has-text("Select")')
await page.waitForTimeout(400)
s = await state()
check('selection mode with that row ticked', json(s.ticked) === json(['Charlie form']) && s.bar?.includes('1 selected'), json(s))
await page.click('[data-desk-select-done]')

await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
