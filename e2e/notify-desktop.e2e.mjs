// "Tell me when the desktop app is ready" under the download marks
// (James, 2026-10-13) — src/components/Landing/DownloadRow.tsx.
//
//   npx vite --port 5174           # or ./scripts/preview.sh
//   npm run test:notify-desktop    # in another terminal
//
// What is pinned:
//
//   • The download marks are still there, and the sign-up sits under them as
//     a quiet link that opens a one-field form (website build).
//   • A bad address shows its message and makes NO network call.
//   • A good address sends exactly one register_app_interest call carrying
//     ('pdf', email, 'desktop') and nothing else; true shows "on the list",
//     and pressing again shows "already on the list" with no second call.
//   • False (refused / hourly cap) shows "try later" with inbox@; a failed
//     fetch shows "offline".
//   • Nothing overflows at 390 px.
//
// The RPC is answered by a route stub, so nothing reaches the real list.
//
// Env: BASE (default http://localhost:5174/)

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]
if (process.env.PLAYWRIGHT_PATH) PLAYWRIGHT_CANDIDATES.unshift(process.env.PLAYWRIGHT_PATH)
let pw = null
for (const rel of PLAYWRIGHT_CANDIDATES) {
  try {
    const href = rel.startsWith('/') ? pathToFileURL(rel).href : pathToFileURL(join(HERE, rel)).href
    const mod = (await import(href)).default
    const probe = await mod.chromium.launch()
    await probe.close()
    pw = mod
    break
  } catch { /* try the next one */ }
}
if (!pw) {
  console.error('No Playwright found. Install it in a sibling Universal app, or set PLAYWRIGHT_PATH.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
    failures.push(label)
  }
}

const LABEL = 'Tell me when the desktop app is ready'
const b = await pw.chromium.launch()

async function open(width, height, answer) {
  const ctx = await b.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  const calls = []
  await page.route('**/rest/v1/rpc/register_app_interest', async (route) => {
    calls.push(route.request().postDataJSON())
    const a = answer()
    if (a === 'abort') return route.abort('internetdisconnected')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) })
  })
  await page.goto(BASE)
  await page.waitForSelector('text=Try with example PDF')
  return { ctx, page, calls }
}

const msg = (page) => page.locator('section[aria-labelledby="get-the-app"] [role="status"]')

// ── Computer width ──────────────────────────────────────────────────────────
console.log('\nthe sign-up under the marks')
let answer = true
let { ctx, page, calls } = await open(1440, 900, () => answer)
const section = page.locator('section[aria-labelledby="get-the-app"]')
check('the download marks are still there', await section.locator('a[aria-label="Windows"]').isVisible())
const toggle = section.getByRole('button', { name: LABEL })
check('the "tell me" link is there', await toggle.isVisible())
check('the form starts closed', (await section.locator('input[type="email"]').count()) === 0)
await toggle.click()
await page.waitForTimeout(100)
const input = section.locator('input[type="email"]')
check('opening it shows the email field, focused', await input.evaluate((el) => el === document.activeElement))
check('the small print is shown', await section.locator('text=No cookies, and nothing else about you.').isVisible())

console.log('\na bad address')
await input.fill('not-an-address')
await section.getByRole('button', { name: 'Notify me' }).click()
await page.waitForTimeout(300)
check('says it does not look like an address', (await msg(page).textContent())?.includes("doesn't look like an email address"))
check('and made no network call', calls.length === 0, calls)
check('the field is marked invalid', (await input.getAttribute('aria-invalid')) === 'true')

console.log('\na good address')
await input.fill('  Someone@Example.com ')
await section.getByRole('button', { name: 'Notify me' }).click()
await page.waitForFunction(() => /on the list/.test(document.querySelector('section[aria-labelledby="get-the-app"] [role="status"]')?.textContent ?? ''))
check('one call', calls.length === 1, calls)
check("carrying ('pdf', email, 'desktop') and nothing else",
  JSON.stringify(calls[0]) === JSON.stringify({ p_product: 'pdf', p_email: 'someone@example.com', p_what: 'desktop' }), calls[0])
check('says you are on the list', (await msg(page).textContent())?.startsWith("You're on the list."))
check('the field is cleared', (await input.inputValue()) === '')
await input.fill('someone@example.com')
await section.getByRole('button', { name: 'Notify me' }).click()
await page.waitForTimeout(200)
check('again: "already on the list"', (await msg(page).textContent())?.startsWith("You're already on the list."))
check('with no second call', calls.length === 1, calls.length)

console.log('\nthe server says no, or cannot be reached')
answer = false
await input.fill('other@example.com')
await section.getByRole('button', { name: 'Notify me' }).click()
await page.waitForFunction(() => /inbox@unisim\.co\.uk/.test(document.querySelector('section[aria-labelledby="get-the-app"] [role="status"]')?.textContent ?? ''))
check('false -> try later, with inbox@', true)
answer = 'abort'
await input.fill('third@example.com')
await section.getByRole('button', { name: 'Notify me' }).click()
await page.waitForFunction(() => /reach our server/.test(document.querySelector('section[aria-labelledby="get-the-app"] [role="status"]')?.textContent ?? ''))
check('a failed fetch -> offline', true)
await ctx.close()

// ── Phone width ─────────────────────────────────────────────────────────────
console.log('\nat 390 px')
;({ ctx, page, calls } = await open(390, 844, () => true))
const s2 = page.locator('section[aria-labelledby="get-the-app"]')
await s2.getByRole('button', { name: LABEL }).click()
await s2.locator('input[type="email"]').fill('nope')
await s2.getByRole('button', { name: 'Notify me' }).click()
await page.waitForTimeout(200)
const box = await s2.locator('form').boundingBox()
const btn = await s2.getByRole('button', { name: 'Notify me' }).boundingBox()
check('the form fits the screen', !!box && box.x >= 0 && box.x + box.width <= 390, box)
check('the button sits beside the field, on screen', !!btn && btn.x + btn.width <= 390 && btn.height >= 44, btn)
check('no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
if (process.env.SHOT) await s2.screenshot({ path: process.env.SHOT })
await ctx.close()

await b.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
