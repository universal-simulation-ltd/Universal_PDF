// The privacy note's "don't show again" X — browser-level checks that the
// dismissal sticks, and that it sticks SUITE-WIDE rather than per-page.
//
//   ./scripts/preview.ps1       # or preview.sh — Universal PDF is :5174
//   npm run test:privacy        # in another terminal
//
// The component under test is the SDK's <PrivacyNote>, not this repo's code —
// Universal PDF is simply the app that renders it on its front door, the same
// reason actions-menu.e2e.mjs tests the SDK's profile dropdown from here.
//
// What is pinned:
//
//   • The note is there for a first-time reader, with a close control whose
//     label says what the click really does ("any Universal app"). A button
//     labelled for this one card would be promising less than it delivers.
//   • Clicking it hides the note AND survives a reload — the point of the
//     feature is that you never see it again, not that it collapses once.
//   • The decision is written where another app on the same origin will read
//     it (localStorage) *and*, on a real *.unisim.co.uk host, to a cookie on
//     the parent zone so it carries to an app on another subdomain. Only the
//     first is checkable from localhost: there is no zone to hang a cookie on,
//     which is exactly why both stores exist. The cookie branch is asserted by
//     shape here (nothing written on localhost) and by reading the source.
//
// Negative control (2026-08-29, run): against the SDK build WITHOUT the X —
// i.e. before the new dist was dropped into node_modules — the first three
// checks go red and the rest cascade, so the harness is not just agreeing with
// whatever the page happens to render.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Sibling repos that carry a Playwright install. See office-import.e2e.mjs for
// why this launches a browser rather than trusting the first import that works.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
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
      (problems.join('\n') || '  (none imported at all)') +
      '\n\nInstall it in a sibling Universal app, or run:\n' +
      '  npm i -D playwright && npx playwright install chromium',
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

const DISMISS_KEY = 'universal:privacy_note_dismissed'
// ⚠️ Anchored to the note's own <p>, not a bare `text=` match. The headline is
// quoted verbatim in the suite changelog entry that announced this feature, so
// a loose matcher also finds the (hidden) changelog popup and reports the note
// as still present after it has gone — which is exactly how this read as two
// failures on the live site before the selector was tightened.
const NOTE = 'p:text-is("Other companies upload your files to view them and scrape your data.")'
const CLOSE = "button[aria-label=\"Don't show this again in any Universal app\"]"

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

try {
  console.log('\nPrivacy note — dismissal')

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const note = page.locator(NOTE).first()
  await note.waitFor({ state: 'visible', timeout: 15000 })
  check('the note greets a first-time reader', await note.isVisible())

  const close = page.locator(CLOSE).first()
  const hasClose = (await close.count()) > 0
  check('it carries a close control', hasClose)
  if (!hasClose) {
    // Everything below is about what the button does, so there is nothing
    // honest left to assert. Stop rather than report six cascading failures.
    console.log(`\n${failures.length} failed:\n  - ${failures.join('\n  - ')}\n`)
    await browser.close()
    process.exit(1)
  }
  const title = await close.getAttribute('title')
  check(
    'the label promises the suite, not this one card',
    title === "Don't show this again in any Universal app",
    `title was ${JSON.stringify(title)}`,
  )

  await close.click()
  await note.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  check('clicking it removes the note', (await page.locator(NOTE).count()) === 0)

  const stored = await page.evaluate((k) => window.localStorage.getItem(k), DISMISS_KEY)
  check('the decision is written to the shared origin store', stored === '1', `got ${stored}`)

  // localhost has no parent zone to hang a suite-wide cookie on — asserted so
  // that a future change writing a bare `domain=localhost` cookie (which the
  // browser silently drops) gets noticed here rather than in production.
  const cookies = await context.cookies()
  check(
    'no half-scoped cookie is written off-zone',
    !cookies.some((c) => c.name === encodeURIComponent(DISMISS_KEY)),
    cookies.map((c) => c.name).join(', '),
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  check('it stays gone after a reload', (await page.locator(NOTE).count()) === 0)

  // A second app on the same origin is what `opensource.unisim.co.uk/<app>`
  // actually is, so a fresh page in the same context stands in for one.
  const second = await context.newPage()
  await second.goto(BASE, { waitUntil: 'domcontentloaded' })
  await second.waitForTimeout(1200)
  check('a sibling app on the same origin honours it', (await second.locator(NOTE).count()) === 0)
  await second.close()

  // And a genuinely separate browser profile still gets the pitch.
  const fresh = await browser.newContext()
  const freshPage = await fresh.newPage()
  await freshPage.goto(BASE, { waitUntil: 'domcontentloaded' })
  await freshPage.locator(NOTE).first().waitFor({ state: 'visible', timeout: 15000 })
  check('a different browser still sees it', await freshPage.locator(NOTE).first().isVisible())
  await fresh.close()
} finally {
  await browser.close()
}

if (failures.length) {
  console.log(`\n${failures.length} failed:\n  - ${failures.join('\n  - ')}\n`)
  process.exit(1)
}
console.log('\nAll checks passed.\n')
