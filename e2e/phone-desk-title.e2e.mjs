// The phone desk's title follows a suite session the phone already holds:
// "James’ PDFs" signed in, "Universal PDF" for everyone else, and no sign-in
// anywhere (James, 2026-11-21).
//
//   ./scripts/preview.sh        # or preview.ps1 — Universal PDF is :5174
//   npm run test:desk-title     # in another terminal
//
// The phone app has no sign-in of its own (`noAccounts` + `signInInTune:
// false` in the shell). It only recognises a session another UNI·SIM app made,
// and shows it by the desk's title (src/native/personalTitle.ts), the same
// words as the website's bar ("<name>’s PDFs", "My PDFs" with no name).
//
// `?app` turns the phone screens on in a dev build; `?mockauth` serves the
// SDK's offline fixture, started already signed in (display name "James
// (demo)"), so "James’ PDFs" also pins the possessive for a name ending in s.

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

const playwright = await loadPlaywright()
const engine = process.env.E2E_BROWSER && playwright[process.env.E2E_BROWSER] ? process.env.E2E_BROWSER : 'chromium'
const browser = await playwright[engine].launch()

async function deskTitle(query, signedIn = false) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: engine !== 'firefox' })
  await keepAppModuleUrls(context)
  // Already signed in, as if another suite app had made the session: the
  // fixture keeps its signed-in flag in localStorage.
  if (signedIn) await context.addInitScript(() => localStorage.setItem('universal:mock_session', 'james'))
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(`page error (${query}): ${e.message}`))
  try {
    await page.goto(`${BASE}${query}`, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  const title = page.locator('[data-app-title]')
  await title.waitFor({ timeout: 30000 })
  // The session (and, signed in, the name) arrives a moment after the first paint.
  await page.waitForTimeout(1500)
  const text = (await title.textContent())?.trim()
  const body = await page.locator('.np').innerText()
  await context.close()
  return { text, body }
}

console.log('guest')
const guest = await deskTitle('?app')
check('the desk says the product’s own name', guest.text === 'Universal PDF', guest.text)

console.log('signed in elsewhere (the SDK’s offline fixture)')
const signedIn = await deskTitle('?app&mockauth', true)
check('the desk says whose PDFs they are', signedIn.text === 'James’ PDFs', signedIn.text)
check('no sign-in or account wording on the desk', !/sign in|sign out|universal id/i.test(signedIn.body))

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\nphone desk title: all checks passed')
