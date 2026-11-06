// The bar's personal title on a phone — "Jim's PDFs" once signed in, the
// product's own lockup for a guest, and never at the cost of the row.
//
//   ./scripts/preview.ps1        # or preview.sh — Universal PDF is :5174
//   npm run test:personal-title  # in another terminal
//
// ── What is under test ──────────────────────────────────────────────────────
//
// Signed in = personalised (James, 2026-10-26: "If signed in it should be
// clear from the personalisation — 'Bradley's Book' — as opposed to the
// traditional profile button"). Since e980221 the landing bar passes the SDK's
// <UniversalAppsNavBar accountInTune personalTitle>: the product lockup
// becomes "<first name>'s PDFs" ("My PDFs" when no name is known), the pill is
// the bare ⚙ menu with no photo and no greeting, and the account lives in Tune
// this app (pinned by e2e/profile-identity.e2e.mjs).
//
// This spec replaced phone-greeting.e2e.mjs, which pinned the rotating
// "Hi Jim" label beside the avatar — the thing the personal title removed.
// What it guarded is still the risk here, re-aimed at the title:
//
//   • missing — a signed-in phone still showing "UNIVERSAL PDF", or a guest
//     shown somebody's name;
//   • leaking — a greeting or a name creeping back into the pill; and
//   • greedy — a long name pushing the row into a horizontal scroll or eating
//     the clearance before the menu.
//
// The rotation loop is kept from the old spec as the flap control: the bar
// measures itself, and a measurement that reads live geometry can disagree
// with itself from one frame to the next.

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

// The app's own strings, so a reworded title does not break the test — a
// missing one does.
const app = (await import(pathToFileURL(join(HERE, '../src/i18n/en/app.ts')).href)).default
const titleFor = (name) => app.personal_title.replace('{name}', name)
const MINE = app.personal_title_mine

const UID = '00000000-0000-4000-8000-000000000001'

const sessionFor = (email) => ({
  access_token: 'stub-access',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'stub-refresh',
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    is_anonymous: false,
  },
})

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

/**
 * The landing page at `width`. `who` is null for a guest, otherwise the
 * profile's display name (null for none) and the account's email.
 */
async function phone(width, who) {
  const context = await browser.newContext({ viewport: { width, height: 780 } })
  const session = who ? sessionFor(who.email) : null
  if (session) {
    await context.addInitScript(
      (s) => window.localStorage.setItem('universal-suite-auth', JSON.stringify(s)),
      session,
    )
  }
  await context.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/rest/v1/')[1]
    const body = table === 'profiles' && who
      ? [{ id: UID, display_name: who.name, avatar_url: null, locale: 'en' }]
      : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await context.route('**/auth/v1/**', (route) =>
    session
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: session.user, session }),
        })
      : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
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
  // The title waits on the auth round trip AND the profile row, so it does not
  // flash "My PDFs" before the name is in.
  await page.waitForTimeout(1500)
  return { context, page }
}

// The bar, as measured in the browser.
//
// `title` is the personal title: the one visible leaf <span> in the identity
// cluster. The guest's "UNIVERSAL / PDF" lockup is aria-hidden (the link
// carries the name), so a guest reads as null here and `product` instead.
const readBar = (page) =>
  page.evaluate(() => {
    const identity = document.querySelector('header > div')
    const pill = document.querySelector('button[aria-label$="Profile"]')
    const leaves = identity
      ? [...identity.querySelectorAll('span')].filter(
          (s) => s.children.length === 0 && s.textContent.trim() && !s.closest('button[aria-label$="Profile"]'),
        )
      : []
    const titleEl = leaves.find((s) => s.getAttribute('aria-hidden') !== 'true')
    return {
      title: titleEl?.textContent.trim() ?? null,
      titleTruncated: titleEl ? titleEl.scrollWidth > titleEl.clientWidth + 1 : null,
      product: leaves.filter((s) => s.getAttribute('aria-hidden') === 'true').map((s) => s.textContent.trim()).join(' ') || null,
      pill: pill?.textContent.trim() ?? null,
      gap: identity && pill
        ? Math.round(pill.closest('div').getBoundingClientRect().left
            - identity.getBoundingClientRect().right)
        : null,
      scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

const JIM = { name: 'Jim Original', email: 'james@unisim.co.uk' }

console.log('\na signed-in phone names the app for them')
{
  const { context, page } = await phone(430, JIM)
  const bar = await readBar(page)
  check(`the bar says "${titleFor('Jim')}"`, bar.title === titleFor('Jim'), JSON.stringify(bar))
  check('not truncated to fit', bar.titleTruncated === false)
  check('the pill is the bare menu — no greeting, no name', bar.pill === '⚙', JSON.stringify(bar.pill))
  check('and the row does not scroll sideways', bar.scrolls === false)
  check('the menu keeps its clearance', bar.gap >= 12, `gap ${bar.gap}px`)
  await context.close()
}

console.log('\nno name to go on: "My PDFs"')
{
  // No display name, and an email whose local part is no first name (digits),
  // so the SDK has nothing to call them.
  const { context, page } = await phone(360, { name: null, email: 'x1@example.invalid' })
  const bar = await readBar(page)
  check(`the bar says "${MINE}"`, bar.title === MINE, JSON.stringify(bar))
  await context.close()
}

console.log('\na guest gets the product, not a stranger’s name')
{
  const { context, page } = await phone(360, null)
  const bar = await readBar(page)
  check('no personal title', bar.title === null, JSON.stringify(bar))
  check('the "UNIVERSAL PDF" lockup is up', bar.product === 'UNIVERSAL PDF', JSON.stringify(bar.product))
  check('the pill is the same bare menu', bar.pill === '⚙', JSON.stringify(bar.pill))
  await context.close()
}

console.log('\na long name on the narrowest phone keeps the row whole')
{
  // 300px is narrower than any phone in the catalogue.
  const { context, page } = await phone(300, { name: 'Maximiliana Original', email: JIM.email })
  const bar = await readBar(page)
  check(`the bar says "${titleFor('Maximiliana')}"`, bar.title === titleFor('Maximiliana'), JSON.stringify(bar))
  check('the row does not scroll sideways', bar.scrolls === false, JSON.stringify(bar))
  // It ends in an ellipsis here ("Maximiliana’s PD…", seen 2026-11-06) and
  // sits ~6px short of the menu — tight, but apart. Overlap is the fault.
  check('the title and the menu do not overlap', bar.gap >= 0, `gap ${bar.gap}px`)
  await context.close()
}

// ── The flap ────────────────────────────────────────────────────────────────
//
// Each stop is sampled twice, ~0.7s apart: a bar that flaps disagrees with
// itself, and one that drops the title at some width shows it here too.
console.log('\nrotating the phone settles, every time')
{
  const { context, page } = await phone(430, JIM)
  for (const width of [430, 320, 430, 300, 360, 430, 320]) {
    await page.setViewportSize({ width, height: 780 })
    await page.waitForTimeout(500)
    const first = await readBar(page)
    await page.waitForTimeout(700)
    const second = await readBar(page)
    check(
      `${width}px settles on "${first.title}" with no sideways scroll`,
      first.title === second.title && first.title === titleFor('Jim') && !second.scrolls,
      `${JSON.stringify(first.title)} then ${JSON.stringify(second.title)}, scrolls ${second.scrolls}`,
    )
  }
  await context.close()
}

console.log('\nand a desktop says the same')
{
  const { context, page } = await phone(1400, JIM)
  const bar = await readBar(page)
  check(`the bar says "${titleFor('Jim')}" above the breakpoint`, bar.title === titleFor('Jim'), JSON.stringify(bar))
  check('with no greeting in the pill', bar.pill === '⚙', JSON.stringify(bar.pill))
  await context.close()
}

await browser.close()

console.log(
  failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed',
)
process.exit(failures.length ? 1 : 0)
