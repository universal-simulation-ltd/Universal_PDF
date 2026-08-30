// The navbar greeting on a phone — shown when the row can spare the width for
// it, and not otherwise.
//
//   ./scripts/preview.ps1        # or preview.sh — Universal PDF is :5174
//   npm run test:greeting        # in another terminal
//
// ── What is under test ──────────────────────────────────────────────────────
//
// The SDK's <UniversalAppsNavBar> used to drop the identity label below its
// 768px breakpoint outright, so every phone got a bare avatar disc. It now
// measures: an off-screen probe gives the label's real width, and the label
// goes up only if the gap between the identity cluster and the controls can
// take it with clearance to spare. Owner's ask, 2026-08-30 — "show the howdy /
// hey next to the profile image on navbar IF SPACE".
//
// This app is the harness because it is one of only two whose landing bar has
// no `actions` menu, and the label only exists where that slot is free — an
// app that passes `actions` spends the pill on the word "Actions" instead.
//
// ── The two things that can go wrong are opposite, so both are pinned ───────
//
//   • too shy — the label never appears, which is the bug being fixed; and
//   • too greedy — it appears where it does not fit, pushing the product name
//     into an ellipsis or the row into a horizontal scroll.
//
// The third is subtler and gets its own section: a measurement that reads the
// live geometry can FLAP, because putting the label up is what takes the space
// away that the next measurement looks at. The rotation loop below is the
// negative control for that — it settles on every size or it does not.
//
// ⚠️ The greeting ROTATES per page load (six variants, advanced through
// localStorage), so a test that just loads the page is testing a different
// string each run — and the whole question here is how wide the string is.
// Every context seeds `unisim_nav_greeting` to pin the word.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  const problems = []
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
    } catch (err) {
      problems.push(`  ${rel}\n    ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found. Candidates that imported but could not launch:\n' +
      (problems.join('\n') || '  (none imported at all)'),
  )
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

const UID = '00000000-0000-4000-8000-000000000001'

const session = {
  access_token: 'stub-access',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'stub-refresh',
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'james@unisim.co.uk',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    is_anonymous: false,
  },
}

// `advance()` stores the index it just used and the next load takes
// `(stored + 1) % 6`, so seeding N-1 pins greeting N. Order is i18n.ts's.
const GREETINGS = ['Hello', 'Howdy', 'Hey', 'Hi', 'Welcome', 'Good day']
const seedFor = (word) => (GREETINGS.indexOf(word) + 5) % 6

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

/** A signed-in page at `width`, with the greeting pinned to `word`. */
async function phone(width, word) {
  const context = await browser.newContext({ viewport: { width, height: 780 } })
  await context.addInitScript(
    ([s, seed]) => {
      window.localStorage.setItem('universal-suite-auth', JSON.stringify(s))
      window.localStorage.setItem('unisim_nav_greeting', String(seed))
    },
    [session, seedFor(word)],
  )
  await context.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/rest/v1/')[1]
    const body = table === 'profiles'
      ? [{ id: UID, display_name: 'Jim Original', avatar_url: null, locale: 'en' }]
      : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await context.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: session.user, session }),
    }),
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  try {
    await page.goto(BASE, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  // The label lands in an effect and waits on the auth round trip.
  await page.waitForTimeout(1200)
  return { context, page }
}

// The bar, as measured in the browser. `label` is null for the bare avatar
// disc — the fallback renders the user's initials in the same <span>, so a
// one-or-two-capitals string IS "no label" rather than a very short one.
const readBar = (page) =>
  page.evaluate(() => {
    const pill = document.querySelector('button[aria-label*="Profile"]')
    const span = pill?.querySelector('span')
    const text = span?.textContent?.trim() ?? ''
    const identity = document.querySelector('header > div')
    // The product half of the compact "UNIVERSAL / PDF" lockup — the one thing
    // in the row with an ellipsis, so the first thing a greedy label costs.
    const name = [...document.querySelectorAll('header span')]
      .find((s) => s.getAttribute('aria-hidden') === 'true' && s.textContent.trim() === 'PDF')
    return {
      label: text && !/^[A-Z]{1,2}$/.test(text) ? text : null,
      gap: identity && pill
        ? Math.round(pill.closest('div').getBoundingClientRect().left
            - identity.getBoundingClientRect().right)
        : null,
      nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : null,
      scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

console.log('\na phone with room shows the greeting beside the avatar')
{
  const { context, page } = await phone(430, 'Hi')
  const bar = await readBar(page)
  check('the label is up', bar.label === 'Hi Jim', JSON.stringify(bar))
  check('the product name is not truncated to pay for it', bar.nameTruncated === false)
  check('and the row does not scroll sideways', bar.scrolls === false)
  await context.close()
}

console.log('\na phone without room keeps the bare avatar')
{
  // 300px is narrower than any phone in the catalogue and is the point of the
  // check: whatever the label, it cannot fit here.
  const { context, page } = await phone(300, 'Good day')
  const bar = await readBar(page)
  check('no label', bar.label === null, JSON.stringify(bar))
  check('the product name survives', bar.nameTruncated === false)
  check('and the row does not scroll sideways', bar.scrolls === false)
  await context.close()
}

console.log('\nthe decision is the LABEL’s width, not the viewport’s')
{
  // Same 340px phone, two greetings. A breakpoint answers these identically;
  // a measurement does not, and that is the whole change.
  const short = await phone(340, 'Hi')
  const long  = await phone(340, 'Good day')
  const [a, b] = [await readBar(short.page), await readBar(long.page)]
  check('the short greeting fits', a.label === 'Hi Jim', JSON.stringify(a))
  check('the long one does not', b.label === null, JSON.stringify(b))
  await short.context.close()
  await long.context.close()
}

console.log('\nwhatever it decides, the identity keeps its clearance')
{
  const { context, page } = await phone(360, 'Good day')
  const bar = await readBar(page)
  check('the label is up at 360', bar.label === 'Good day Jim', JSON.stringify(bar))
  check('with the row’s clearance intact', bar.gap >= 12, `gap ${bar.gap}px`)
  await context.close()
}

// ── The flap ────────────────────────────────────────────────────────────────
//
// ⚠️ The one that a single-size test cannot see. Showing the label consumes
// the space the measurement reads, so a naive implementation says "no room",
// hides it, immediately measures room again, and shows it — for ever, on every
// resize. Each stop is sampled twice, ~0.7s apart: a flapping bar disagrees
// with itself.
console.log('\nrotating the phone settles, every time')
{
  const { context, page } = await phone(430, 'Good day')
  for (const width of [430, 320, 430, 300, 360, 430, 320]) {
    await page.setViewportSize({ width, height: 780 })
    await page.waitForTimeout(500)
    const first = (await readBar(page)).label
    await page.waitForTimeout(700)
    const second = (await readBar(page)).label
    check(
      `${width}px settles on ${first === null ? 'the bare avatar' : `"${first}"`}`,
      first === second,
      `${JSON.stringify(first)} then ${JSON.stringify(second)}`,
    )
  }
  await context.close()
}

console.log('\nand a desktop is untouched by any of it')
{
  const { context, page } = await phone(1400, 'Good day')
  const bar = await readBar(page)
  check('the label is up above the breakpoint', bar.label === 'Good day Jim', JSON.stringify(bar))
  await context.close()
}

await browser.close()

console.log(
  failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed',
)
process.exit(failures.length ? 1 : 0)
