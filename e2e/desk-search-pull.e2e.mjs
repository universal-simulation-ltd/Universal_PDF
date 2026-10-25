// The phone desk's search: pull down for it, pull again for the keyboard
// (BRANDING.md ▸ "Pull down for search, pull again for the keyboard"; James,
// 2026-10-19). It replaced a search button over "On your desk". See
// src/native/DeskScreen.tsx and the SDK's PullDrawer.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:desk-search          # in another terminal
//
// The phone screens (`?app`) at iPhone size in Chromium, driven with REAL
// touch events (CDP Input.dispatchTouchEvent), the way the SDK's
// test:pull-drawer is. The claims are read back from the page: the drawer's
// height, document.activeElement, where the rows sit.
//
// ⚠️ NEGATIVE CONTROLS, checked when it was written (2026-10-19): against the
// old desk with its search button it fails from the first check on; with the
// drawer kept but `pullable={false}` every pull check fails (9 of them, then
// it stops). So the gesture has to be there for this to pass, not merely
// nothing breaking.
//
// What is pinned:
//   • No search button on screen; the drawer starts shut and inert; a
//     first-run hint says to pull; the page's overscroll is contained.
//   • A short pull peeks and springs shut. Upward, sideways, on the carousel
//     of cards, or from the tab bar: not pulls.
//   • A full pull opens it without the keyboard; a second pull focuses the
//     box from inside the touch's release (what iOS needs for the keyboard).
//   • Open, the search moves to the top (James, 2026-10-25): the cobalt desk
//     and "On your desk" fold away, the box sits under the status bar, and
//     the list leaves room for the keyboard (a shrunken visualViewport, faked).
//     Cancel puts the desk back; so does Back; so does the box emptied and let go.
//   • Typing filters the list, and a typed search stays when scrolled. The ×
//     only clears; Cancel clears and folds it.
//   • Open, it stays pinned at the top of the list as the list scrolls (until
//     2026-10-25 it folded away instead).
//   • With the list scrolled down, a drag down (on the list or the desk above)
//     is not a pull.
//   • Tapping Desk while on it opens it with the box focused, inside the tap.
//   • The options sheet's own pull-to-close still works, and opens nothing.
//   • Tune's Reset to defaults brings the hint back; an empty desk has no pull.

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
let passed = 0
function check(label, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}
const json = (v) => JSON.stringify(v)

const W = 390
const H = 844
// The desk keeps 8 (lib/recents). With the desk folded away for a search they
// fit without scrolling, so the scrolling checks below run with the faked
// keyboard up, whose room at the foot makes the list scroll.
const NAMES = ['Alpha lease', 'Bravo invoice', 'Charlie form', 'Delta letter', 'Echo receipt', 'Foxtrot contract', 'Golf report', 'Hotel booking']

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

async function phone({ recents = NAMES } = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await keepAppModuleUrls(context)
  // Every focus() made on the desk's search box, with the event it was made inside.
  await context.addInitScript(() => {
    window.__focusLog = []
    const focus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (...args) {
      if (this instanceof HTMLInputElement && this.type === 'search') window.__focusLog.push(window.event ? window.event.type : 'none')
      return focus.apply(this, args)
    }
  })
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
  if (recents.length) {
    await page.evaluate(async (names) => {
      const imp = globalThis.__appImport ?? ((p) => import(p))
      const r = await imp('/src/lib/recents.ts')
      for (const name of names) await r.saveRecent(`${name}.pdf`, new ArrayBuffer(2048))
      const s = await imp('/src/stores/pdfStore.ts')
      await s.usePdfStore.getState().refreshRecents()
    }, recents)
    await page.waitForSelector(`text=${recents.at(-1)}`, { timeout: 10000 })
  }
  await page.waitForTimeout(300)
  return { context, page, cdp }
}

const touch = (cdp, type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
/** A real finger: down, a series of moves 16ms apart, up. Returns the state just before the release. */
async function pull(page, cdp, { x = W / 2, y, dy = 170, dx = 0, steps = 12 }) {
  await touch(cdp, 'touchStart', x, y)
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', x + (dx * i) / steps, y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  const mid = await state(page)
  await touch(cdp, 'touchEnd')
  await page.waitForTimeout(450)
  return mid
}
const state = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('[data-pull-drawer]')
    const list = d?.parentElement
    const input = d?.querySelector('input[type="search"]')
    return {
      drawer: d ? d.getAttribute('data-pull-drawer') : null,
      height: d ? Math.round(d.getBoundingClientRect().height) : null,
      inert: d ? d.hasAttribute('inert') : null,
      focused: !!input && document.activeElement === input,
      query: input ? input.value : null,
      scrollTop: list ? Math.round(list.scrollTop) : null,
      focusLog: window.__focusLog.slice(),
      rows: document.querySelectorAll('[data-pull-drawer] + div li').length,
    }
  })
/** Where the middle of the desk's list is on screen, and of the n-th row. */
const listBox = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('[data-pull-drawer]').parentElement.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 }
  })
const setListScroll = (page, y) =>
  page.evaluate((y) => {
    document.querySelector('[data-pull-drawer]').parentElement.scrollTop = y
  }, y)
const hint = (page) => page.getByRole('button', { name: /Pull down to search/ })
const cancel = async (page) => {
  await page.locator('[data-search-cancel]').click()
  await page.waitForTimeout(450)
}
/** Where the box, the folded desk and the "On your desk" heading are. */
const layout = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-pull-drawer] input')?.getBoundingClientRect()
    const desk = document.querySelector('.np-collapse')?.getBoundingClientRect()
    const heading = [...document.querySelectorAll('h2')].find((h) => /On your desk/.test(h.textContent))
    return {
      boxTop: box ? Math.round(box.top) : null,
      deskHeight: desk ? Math.round(desk.height) : null,
      headingShown: !!heading && heading.getBoundingClientRect().height > 0 && heading.closest('[data-collapsed]') === null,
    }
  })

try {
  console.log('\nthe desk: no search button, the drawer shut, a hint to pull')
  let { context, page, cdp } = await phone()
  {
    const s = await state(page)
    check('there is a drawer, shut, 0 tall and inert', s.drawer === 'shut' && s.height === 0 && s.inert === true, json(s))
    check(`all ${NAMES.length} recents are listed`, s.rows === NAMES.length, json(s))
    const btn = page.getByRole('button', { name: 'Search your documents' })
    const box = (await btn.count()) ? await btn.boundingBox() : null
    check('no search button on screen (the keyboard one takes no room)', !box || (box.width <= 1 && box.height <= 1), json(box))
    check('the first-run hint is showing', await hint(page).isVisible())
    const contain = await page.evaluate(() => document.documentElement.style.overscrollBehaviorY)
    check("the page's overscroll is contained (no pull-to-refresh)", contain === 'contain', contain)
  }

  console.log('\na short pull peeks and springs shut; not-pulls do nothing')
  const L = await listBox(page)
  {
    const mid = await pull(page, cdp, { y: L.top + 20, dy: 60 })
    const s = await state(page)
    check('a 60px pull peeks about 36px (0.6 of the finger)', Math.abs(mid.height - 36) <= 3, json(mid))
    check('…and springs shut short of 64px', s.drawer === 'shut' && s.height === 0, json(s))

    await pull(page, cdp, { y: L.bottom - 20, dy: -150 })
    await setListScroll(page, 0)
    let t = await state(page)
    check('an upward swipe is not a pull', t.drawer === 'shut' && t.height === 0, json(t))

    await pull(page, cdp, { y: L.top + 20, dy: 120, dx: 140 })
    t = await state(page)
    check('a sideways swipe is not a pull', t.drawer === 'shut' && t.height === 0, json(t))

    const cards = await page.locator('[data-swipe-x]').boundingBox()
    await pull(page, cdp, { y: cards.y + cards.height / 2, dy: 170 })
    t = await state(page)
    check('a pull on the carousel of cards (data-swipe-x) is not a pull', t.drawer === 'shut' && t.height === 0, json(t))

    const nav = await page.locator('nav[aria-label="Main"]').boundingBox()
    await pull(page, cdp, { y: nav.y + 2, dy: Math.min(80, H - nav.y - 4) })
    t = await state(page)
    check('a pull that starts on the tab bar is not a pull', t.drawer === 'shut' && t.height === 0, json({ t, nav }))
  }

  console.log('\na full pull opens it; a second pull focuses the box inside the release')
  {
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    let s = await state(page)
    check('a full pull on the list opens it', s.drawer === 'open' && s.height >= 44 && s.inert === false, json(s))
    check('…without the keyboard (nothing focused)', !s.focused && s.focusLog.length === 0, json(s))
    check('the hint is gone', !(await hint(page).count()))
    const learnt = await page.evaluate(() => localStorage.getItem('unipdf:desk-pull-learnt'))
    check('…and remembered', learnt === '1', String(learnt))

    await page.waitForTimeout(300)
    const lay = await layout(page)
    check('open, the search moved to the top: the cobalt desk folded away', lay.deskHeight === 0, json(lay))
    check('…"On your desk" folded away too', !lay.headingShown, json(lay))
    check('…and the box sits just under the status bar', lay.boxTop !== null && lay.boxTop < 40, json(lay))

    await pull(page, cdp, { y: L.top + 80, dy: 170 })
    s = await state(page)
    check('a second pull puts the cursor in the box', s.focused, json(s))
    check('…focused from inside the touchend (so iOS raises the keyboard)', json(s.focusLog) === json(['touchend']), json(s.focusLog))
  }

  console.log('\ntyping filters the desk; a typed search stays; the × clears, Cancel folds')
  {
    await page.keyboard.type('bravo')
    await page.waitForTimeout(200)
    let s = await state(page)
    check('typing "bravo" leaves one row', s.rows === 1 && s.query === 'bravo', json(s))
    await page.locator('[data-pull-drawer] input').blur()
    await page.keyboard.press('Escape')
    s = await state(page)
    check('still open with a search typed in', s.drawer === 'open', json(s))
    await page.locator('[data-pull-drawer] input').focus()
    await page.getByRole('button', { name: 'Clear the search' }).click()
    await page.waitForTimeout(300)
    s = await state(page)
    check('the × empties the box and keeps the finger in it', s.drawer === 'open' && s.query === '' && s.focused && s.rows === NAMES.length, json(s))
    await cancel(page)
    s = await state(page)
    const lay = await layout(page)
    check('Cancel folds it away', s.drawer === 'shut' && s.height === 0 && s.query === '' && s.rows === NAMES.length, json(s))
    check('…and the desk is back', lay.deskHeight > 200 && lay.headingShown, json(lay))
  }

  console.log('\nthe box emptied and let go leaves the search; Back leaves it too')
  {
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    await page.locator('[data-pull-drawer] input').focus()
    await page.locator('[data-pull-drawer] input').blur()
    await page.waitForTimeout(500)
    let s = await state(page)
    check('focused, then let go with nothing typed: folded away', s.drawer === 'shut', json(s))
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    await page.locator('[data-pull-drawer] input').fill('alpha')
    await page.locator('[data-pull-drawer] input').blur()
    await page.waitForTimeout(300)
    await page.evaluate(() => history.back())
    await page.waitForTimeout(500)
    s = await state(page)
    const lay = await layout(page)
    check('Back leaves the search and puts the desk back', s.drawer === 'shut' && s.query === '' && lay.deskHeight > 200, json({ s, lay }))
  }

  console.log('\nthe keyboard: the list leaves room for it')
  {
    // A phone keyboard 336px tall: the visual viewport shrinks, the page does not (iOS).
    await page.evaluate(() => {
      const listeners = []
      const fake = {
        height: window.innerHeight - 336,
        width: window.innerWidth,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
        addEventListener: (_t, fn) => listeners.push(fn),
        removeEventListener: () => {},
      }
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })
    })
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    await page.locator('[data-pull-drawer] input').focus()
    await page.waitForTimeout(300)
    const room = await page.evaluate(() => {
      const list = document.querySelector('[data-pull-drawer]').parentElement
      list.scrollTop = list.scrollHeight
      const rows = document.querySelectorAll('[data-pull-drawer] + div li')
      const last = rows[rows.length - 1].getBoundingClientRect()
      return { pad: parseFloat(getComputedStyle(list).paddingBottom), lastBottom: Math.round(last.bottom), keyboardTop: window.innerHeight - 336 }
    })
    check('the list pads its foot by the keyboard', room.pad >= 336, json(room))
    check('…so the last document scrolls up above the keyboard', room.lastBottom <= room.keyboardTop, json(room))
    await page.evaluate(() => {
      document.querySelector('[data-pull-drawer]').parentElement.scrollTop = 0
    })
    await cancel(page)
    // ⚠️ The fake keyboard stays up from here on: see NAMES.
  }

  console.log('\nopen, it stays pinned at the top while the list scrolls')
  {
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    let s = await state(page)
    check('open again', s.drawer === 'open', json(s))
    const drawerH = s.height
    const boxBefore = (await layout(page)).boxTop
    await setListScroll(page, drawerH + 40)
    await page.waitForTimeout(150)
    s = await state(page)
    const boxAfter = (await layout(page)).boxTop
    check('scrolled, it stays open', s.drawer === 'open' && s.scrollTop > 0, json(s))
    check('…pinned where it was', boxAfter === boxBefore, `before=${boxBefore} after=${boxAfter}`)
    await setListScroll(page, 0)
    await cancel(page)

    // A typed search stays however far the list scrolls.
    await setListScroll(page, 0)
    await page.waitForTimeout(100)
    await pull(page, cdp, { y: L.top + 20, dy: 170 })
    await page.locator('[data-pull-drawer] input').fill('e')
    await page.locator('[data-pull-drawer] input').blur()
    await page.waitForTimeout(100)
    s = await state(page)
    await setListScroll(page, 400)
    await page.waitForTimeout(150)
    const t = await state(page)
    check('with a search typed in it stays open when scrolled', s.drawer === 'open' && t.drawer === 'open' && t.scrollTop > 0, json({ s, t }))
    await setListScroll(page, 0)
    await cancel(page)
  }

  console.log('\nwith the list scrolled down, a drag down is the list, not a pull')
  {
    await setListScroll(page, 200)
    await page.waitForTimeout(100)
    await pull(page, cdp, { y: L.top + 30, dy: 120 })
    let s = await state(page)
    check('a drag down on the scrolled list leaves it shut', s.drawer === 'shut' && s.height === 0, json(s))
    check('…and scrolled the list back up instead', s.scrollTop < 200, json(s))
    await setListScroll(page, 200)
    await page.waitForTimeout(100)
    await pull(page, cdp, { y: 80, dy: 170 })
    s = await state(page)
    check('a pull on the desk above a scrolled list leaves it shut', s.drawer === 'shut' && s.height === 0, json(s))
  }

  console.log('\ntapping Desk while on it opens the search, focused inside the tap')
  {
    await page.evaluate(() => (window.__focusLog = []))
    await page.locator('nav[aria-label="Main"]').getByRole('button', { name: 'Desk' }).tap()
    await page.waitForTimeout(400)
    const s = await state(page)
    check('the drawer is open', s.drawer === 'open', json(s))
    check('the list went back to its top to show it', s.scrollTop === 0, json(s))
    check('the box is focused, from inside the tap', s.focused && s.focusLog.length === 1 && ['click', 'touchend', 'pointerup'].includes(s.focusLog[0]), json(s))
    await cancel(page)
  }

  console.log("\nthe options sheet's pull-to-close still works, and opens nothing")
  {
    await page.getByRole('button', { name: /^Options for/ }).first().click()
    await page.waitForTimeout(500)
    const sheet = page.locator('section[role="dialog"]')
    check('the options sheet is open', await sheet.isVisible())
    const grip = await page.locator('section[role="dialog"] [data-sheet-grip]').boundingBox()
    await pull(page, cdp, { y: grip.y + grip.height / 2, x: grip.x + grip.width / 2, dy: 260, steps: 16 })
    await page.waitForTimeout(400)
    const s = await state(page)
    check('pulled down by its grip, the sheet closed', !(await sheet.count()), String(await sheet.count()))
    check('…and the desk search stayed shut', s.drawer === 'shut' && s.height === 0, json(s))
  }

  console.log("\nTune's Reset to defaults brings the hint back")
  {
    await page.evaluate(async () => {
      const imp = globalThis.__appImport ?? ((p) => import(p))
      ;(await imp('/src/lib/resetDefaults.ts')).clearDismissedPrompts()
    })
    const left = await page.evaluate(() => localStorage.getItem('unipdf:desk-pull-learnt'))
    check('the learnt flag is cleared', left === null, String(left))
  }
  await context.close()

  console.log('\nan empty desk has nothing to search')
  ;({ context, page, cdp } = await phone({ recents: [] }))
  {
    const L0 = await listBox(page)
    await pull(page, cdp, { y: L0.top + 20, dy: 170 })
    const s = await state(page)
    check('a full pull leaves it shut', s.drawer === 'shut' && s.height === 0, json(s))
    check('no hint', !(await hint(page).count()))
    check('the example lies on the desk instead', await page.getByText(/example/i).first().isVisible())
  }
  await context.close()
} catch (e) {
  failures.push('threw: ' + (e && e.stack ? e.stack : e))
  console.log(e)
}

await browser.close()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(failures.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
