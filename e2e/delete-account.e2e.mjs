// delete-account.e2e.mjs — "Delete my account" is reachable only when signed
// in, says the deletion is everywhere, stays dead until delete-all is typed,
// and shows a failure without signing anyone out. `npm run test:delete-account`
// (dev server up).
//
// App Review 5.1.1(v): an app whose sign-in can create an account must be able
// to delete one from inside the app.
//
// ⚠️ WHAT THIS CAN AND CANNOT PROVE. The SDK's offline mock (`?mockauth=1`) has
// no `supabase.functions`, so every delete here FAILS, before any request is
// sent. That is useful: it is the failure path, end to end in the real UI. The
// request itself (the function name, {"confirm":"delete-all"}, the refusal
// text, the local sign-out on success) is `npm run test:delete-account-call`
// against a fake client. The function's own half was proved on prod
// (2026-09-12, 14/14 with Ergo live) from the Ergo Assess iPhone app, which
// calls it the same way.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    } catch { continue }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch { /* next */ }
  }
  console.error('No usable Playwright found.')
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

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Delete account test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

async function openPage({ signedIn, viewport = { width: 1400, height: 900 } }) {
  const context = await browser.newContext({ viewport })
  if (signedIn) {
    await context.addInitScript(() => {
      window.localStorage.setItem('universal:mock_session', 'james')
    })
  }
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  // Belt and braces: nothing here may ever reach a real delete-account.
  const calls = []
  await page.route('**/functions/v1/delete-account', (route) => {
    calls.push(route.request().method())
    return route.abort()
  })
  try {
    await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.waitForTimeout(800)
  return { context, page, calls }
}

const dialog = (page) => page.locator('[data-testid="delete-account-dialog"]')
const deleteButton = (page) => dialog(page).locator('button:has-text("Delete my account")')
const landingLink = (page) => page.locator('[data-testid="landing-delete-account"]')

console.log('\nsigned out: there is nothing to delete, so no way in')
{
  const { context, page } = await openPage({ signedIn: false })
  check('no Delete link on the landing page', await landingLink(page).count() === 0)
  await context.close()
}

console.log('\nsigned in, landing page: the question and the phrase')
{
  const { context, page } = await openPage({ signedIn: true })
  check('the Delete link is on the landing page', await landingLink(page).isVisible())
  await landingLink(page).click()
  await page.waitForTimeout(300)
  check('the dialog opens', await dialog(page).isVisible())
  const text = await dialog(page).innerText()
  check('it says the deletion is everywhere', /every/i.test(text) && /UNI·SIM app/.test(text))
  check('it names the account being deleted', /@/.test(text))
  check('it says local files are left alone', /Recent files are not touched/.test(text))
  check('Delete is dead before anything is typed', await deleteButton(page).isDisabled())

  await dialog(page).locator('input').fill('delete')
  check('…and still dead on a partial phrase', await deleteButton(page).isDisabled())
  await dialog(page).locator('input').fill('Delete-All ')
  check('…and live once delete-all is typed (case and a stray space forgiven)', await deleteButton(page).isEnabled())
  await page.screenshot({ path: 'e2e-delete-account.png' })

  console.log('\na failed delete is shown, and nobody is signed out')
  await deleteButton(page).click()
  await page.waitForTimeout(1000)
  const alert = await dialog(page).locator('[role="alert"]').innerText().catch(() => '')
  check('the failure is on screen', /Couldn't delete your account/.test(alert), alert)
  check('the dialog did not claim success', !/has been deleted/.test(await dialog(page).innerText()))
  check('the button is live again for another try', await deleteButton(page).isEnabled())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape cancels', await dialog(page).count() === 0)
  check('still signed in, so the link is still there', await landingLink(page).isVisible())

  await landingLink(page).click()
  await page.waitForTimeout(300)
  check('reopened, the phrase has been cleared', (await dialog(page).locator('input').inputValue()) === '')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(300)
  check('a click on the backdrop cancels', await dialog(page).count() === 0)
  await context.close()
}

console.log('\nwith a document open: the row sits with the account rows in the profile menu')
{
  const { context, page, calls } = await openPage({ signedIn: true })
  await page.setInputFiles('input[type=file][accept*="pdf"], input[type=file]', {
    name: 'delete.pdf', mimeType: 'application/pdf', buffer: pdf,
  })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(500)
  // ⚠️ HOVER, not click: <UserProfile /> opens on pointer-enter (see
  // reset-defaults.e2e.mjs for the same trap).
  await page.locator('button:has-text("Actions")').first().hover()
  await page.waitForTimeout(600)
  const row = page.locator('[data-testid="profile-delete-account"]')
  check('the Delete row is in the open profile menu', await row.isVisible())
  await row.click()
  await page.waitForTimeout(300)
  check('it opens the same dialog', await dialog(page).isVisible())
  const topmost = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="delete-account-dialog"] input')
    if (!d) return false
    const r = d.getBoundingClientRect()
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === d
  })
  check('…in front of the tools bar and the menu (the confirm field is topmost)', topmost)
  await page.screenshot({ path: 'e2e-delete-account-doc.png' })
  check('no request is made just by opening it', calls.length === 0)
  await context.close()
}

console.log('\nat phone width the buttons stay on screen')
{
  const { context, page } = await openPage({ signedIn: true, viewport: { width: 375, height: 667 } })
  await landingLink(page).scrollIntoViewIfNeeded()
  await landingLink(page).click()
  await page.waitForTimeout(300)
  const box = await deleteButton(page).boundingBox()
  check('Delete my account is inside the viewport', !!box && box.y >= 0 && box.y + box.height <= 667, JSON.stringify(box))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  check('no sideways scroll', !overflow)
  await page.screenshot({ path: 'e2e-delete-account-phone.png' })
  await context.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
