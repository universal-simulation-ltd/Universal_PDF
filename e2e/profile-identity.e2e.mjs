// Who is signed in, and where their account lives — the bar's personal title
// and "Your Universal ID" in Tune this app.
//
//   ./scripts/preview.ps1        # or preview.sh — Universal PDF is :5174
//   npm run test:profile         # in another terminal
//
// ── Why this one stubs the network instead of using `?mockauth=1` ────────────
//
// `e2e/actions-menu.e2e.mjs` runs on the SDK's offline fixture, which is right
// for anything that only needs *a* signed-in user. This file needs a profile
// row it controls (the name the title is made from) and a sign-out that
// lands, so it seeds a session into the SDK's localStorage key and answers
// `/rest/v1/*` and `/auth/v1/*` itself.
//
// ── What changed (e980221, 2026-10-26) ───────────────────────────────────────
//
// Signed in = personalised: no photo, initials or greeting in a pill and no
// account rows in the menu. The landing bar says "Jim's PDFs" (SDK
// `personalTitle`), and the account — the email, the hub, Sign out, "Call me"
// and the App name choice — is "Your Universal ID" in Tune this app
// (`accountInTune`), from the landing bar AND from the dark tools bar a
// document opens under (`ToolbarUserProfile`).
//
// Until then this spec pinned the stale-display-name fix in the pill's
// dropdown (`useProfile()` is per-call-site state, so `ToolbarUserProfile`
// re-read the row on pointer enter). The dropdown no longer prints a name and
// that re-read went with it; the name that shows now is the bar's title, and
// the in-app way to change it is Call me — so the "a renamed user sees the new
// name with no reload" checks are re-aimed there.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

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

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Profile identity test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

const UID = '00000000-0000-4000-8000-000000000001'
const ORG_ID = '00000000-0000-4000-8000-0000000000aa'

// A 1×1 transparent PNG, so the logo path can be exercised without a network
// fetch for the image itself.
const LOGO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// The SDK's own strings. The preferences row is asked for by KEY, never by its
// English text: 0.148.0 renamed it "App preferences" → "Tune this app" and the
// hard-coded literal here went on looking for a row that no longer says that,
// so the case below failed for eight SDK releases while the row was fine.
const sdk = await import(pathToFileURL(join(HERE, '../node_modules/@unisim/sdk/dist/i18n.js')).href)
const APP_PREFS = sdk.t('en', 'prefs.app_preferences')

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

const app = (await import(pathToFileURL(join(HERE, '../src/i18n/en/app.ts')).href)).default
const titleFor = (name) => app.personal_title.replace('{name}', name)
const ACCOUNT = sdk.t('en', 'prefs.account')

// The world this run serves.
const world = {
  displayName: 'Jim Original',
  orgName: 'Acme Ltd',
  iconUrl: null,
}

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

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })

// `universal-suite-auth` is the storageKey the SDK gives its Supabase client
// (provider.ts). With no cookieDomain — which is the case in a dev build — that
// is a plain localStorage entry, so seeding it IS being signed in. Seeded once:
// an init script would put the session back on every load, and the sign-out
// check at the end reloads.
await context.addInitScript((s) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  window.localStorage.setItem('universal-suite-auth', JSON.stringify(s))
}, session)

const org = () => ({
  id: ORG_ID,
  slug: 'acme',
  name: world.orgName,
  logo_url: null,
  icon_url: world.iconUrl,
  brand_color: '#123456',
  billing_email: null,
  people_marked_complete: false,
  places_marked_complete: false,
  projects_marked_complete: false,
})
const profileRow = () => ({ id: UID, display_name: world.displayName, avatar_url: null, locale: 'en' })

// `profileDelayMs` is what makes a needless re-read OBSERVABLE (see the menu
// checks below). Answered instantly, `loading` goes true and false inside one
// React batch and the re-read is invisible.
let profileReads = 0
let profileDelayMs = 0
let signedOut = false

await context.route('**/rest/v1/**', async (route) => {
  const table = new URL(route.request().url()).pathname.split('/rest/v1/')[1]
  let body = []
  if (table === 'profiles') {
    profileReads++
    body = [profileRow()]
    if (profileDelayMs) await new Promise((r) => setTimeout(r, profileDelayMs))
  }
  else if (table === 'org_members') body = [{ user_id: UID, role: 'owner', organisations: org(), profile: profileRow() }]
  else if (table === 'organisations') body = [org()]
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})
await context.route('**/auth/v1/**', (route) => {
  if (new URL(route.request().url()).pathname.endsWith('/logout')) {
    signedOut = true
    return route.fulfill({ status: 204, body: '' })
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: session.user, session }),
  })
})

const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.waitForTimeout(1500)

// ⚠️ HOVER, not click: the pill opens on mouseenter, so a click would open it
// on the way in and toggle it straight back shut.
const PILL = 'button[aria-label$="Profile"]'
async function openMenu() {
  // Park the pointer well away first, so the next hover is a real re-entry.
  await page.mouse.move(20, 500)
  await page.waitForTimeout(120)
  await page.hover(PILL)
  await page.waitForTimeout(600)
}
const tune = page.locator('[data-unisim-preferences="app"]')
const account = tune.getByTestId('unisim-prefs-account')
async function openTune() {
  await openMenu()
  await page.locator(`[role="menu"] [role="menuitem"][aria-haspopup="dialog"]:has-text("${APP_PREFS}")`).click()
  await tune.waitFor({ timeout: 5000 })
}
async function closeTune() {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
// The landing bar's title: the identity cluster's one visible leaf <span>.
const barTitle = () =>
  page.evaluate(() => {
    const identity = document.querySelector('header > div')
    const el = identity && [...identity.querySelectorAll('span')].find(
      (s) => s.children.length === 0 && s.textContent.trim() && s.getAttribute('aria-hidden') !== 'true'
        && !s.closest('button'),
    )
    return el?.textContent.trim() ?? null
  })
const pillText = async () => (await page.locator(PILL).first().innerText()).trim()
// Commit a Call me: it saves on blur (Enter blurs it).
async function callMe(name) {
  const input = account.locator(`input[placeholder="${sdk.t('en', 'prefs.call_me_placeholder')}"]`)
  await input.fill(name)
  await input.press('Enter')
  await page.waitForTimeout(400)
}

console.log('\nthe bar names the app for them, and the pill names nobody')
check(`the current display name is on screen, as "${titleFor('Jim')}"`, (await barTitle()) === titleFor('Jim'), await barTitle())
check('the pill is the bare menu (no photo, initials or greeting)', (await pillText()) === '⚙', await pillText())
await openMenu()
const menu = await page.locator('[role="menu"]').first().innerText()
check('the menu has no account rows (no email, no Sign out)', !menu.includes('james@unisim.co.uk') && !menu.includes(sdk.t('en', 'profile.sign_out')), menu.slice(0, 200))

console.log(`\n"${ACCOUNT}" is in ${APP_PREFS}`)
await openTune()
check(`the "${ACCOUNT}" section is there`, (await account.count()) === 1)
const accountText = (await account.count()) ? await account.innerText() : ''
check('with the email', accountText.includes('james@unisim.co.uk'), accountText.slice(0, 200))
check('a link to the hub', (await account.locator('a[href*="unisim.co.uk"]').count()) === 1)
check('and Sign out', (await account.getByTestId('unisim-prefs-sign-out').count()) === 1)
check(
  `App name offers "${titleFor('Jim')}"`,
  (await account.getByTestId('unisim-app-title-personal').innerText()).includes(titleFor('Jim')),
)

console.log('\na new name shows in the bar at once — no reload')
await callMe('Jimbo')
check('the new name is shown', (await barTitle()) === titleFor('Jimbo'), await barTitle())
check('and the old one is gone', !(await barTitle())?.includes('Jim’'))

console.log('\nand it keeps up with a second change')
await callMe('Jimmy')
check('the newest name is shown', (await barTitle()) === titleFor('Jimmy'), await barTitle())

console.log('\nApp name: the product\'s own name instead')
await account.getByTestId('unisim-app-title-product').click()
await page.waitForTimeout(400)
check('the bar says "Universal PDF" instead', (await barTitle()) === 'Universal PDF', await barTitle())
await account.getByTestId('unisim-app-title-personal').click()
await page.waitForTimeout(400)
check('and picking it again brings it back', (await barTitle()) === titleFor('Jimmy'), await barTitle())
await closeTune()

// The rest runs with a document open: the landing bar gives way to the dark
// tools bar, whose menu is `ToolbarUserProfile` — the same SDK pill, merged
// with Actions.
await page.setInputFiles('input[type=file]', {
  name: 'identity.pdf',
  mimeType: 'application/pdf',
  buffer: pdf,
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

console.log(`\nwith a document open, the account is still in ${APP_PREFS}`)
await openTune()
check(`the "${ACCOUNT}" section is there`, (await account.count()) === 1)
check('with the email', (await account.count()) > 0 && (await account.innerText()).includes('james@unisim.co.uk'))
await closeTune()

// ── The menu holds still ────────────────────────────────────────────────────
//
// Kept from the stale-name era (James, 2026-08-29): a profile re-read hung off
// the pill's wrapper fired on every click INSIDE the open menu, and while each
// was in flight the control fell back to its '·' placeholder — the pill
// blinked, and the account rows the props drove left the panel, so everything
// below jumped ~83px, including the row under the cursor mid-press. The
// re-read and the account rows are gone now (e980221), so these are
// regression guards: nothing in the menu should re-read the profile, blank the
// pill or move the Tune this app row under a press.
profileDelayMs = 350

console.log('\nclicking inside the open menu does not re-read the profile')
await openMenu()
const readsBefore = profileReads
// ⚠️ Observe `document`, and from evaluate() — NOT addInitScript, which runs
// before the document exists and would silently never fire.
await page.evaluate(() => {
  window.__pill = []
  const pill = document.querySelector('button[aria-label$="Profile"]')
  new MutationObserver(() => {
    const t = pill.textContent.replace(/\s+/g, ' ').trim()
    if (window.__pill[window.__pill.length - 1] !== t) window.__pill.push(t)
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true })
})
for (const name of ['Advanced', 'View', 'File']) {
  const row = page.locator(`button[aria-haspopup="true"][aria-expanded]:has-text("${name}")`).first()
  if (await row.count()) {
    await row.click()
    await page.waitForTimeout(700)
  }
}
check(
  'no profiles select for three clicks on Actions rows',
  profileReads === readsBefore,
  `${profileReads - readsBefore} read(s)`,
)
const pillStates = await page.evaluate(() => window.__pill)
check(
  'the avatar never blanks to its placeholder',
  !pillStates.some((t) => t.includes('·')),
  JSON.stringify(pillStates),
)

console.log(`\nthe "${APP_PREFS}" row holds still while the pointer is on it`)
const panelShape = () =>
  page.evaluate((label) => {
    const el = [...document.querySelectorAll('[role="menu"] [role="menuitem"][aria-haspopup="dialog"]')]
      .find((b) => b.textContent.includes(label))
    if (!el) return null
    return {
      top: Math.round(el.getBoundingClientRect().top),
      rows: document.querySelectorAll('[role="menu"] > *').length,
    }
  }, APP_PREFS)
await openMenu()
const atRest = await panelShape()
// Not `.boundingBox()` straight off: it waits 30 s and THROWS when the row is
// absent, which takes the run down instead of turning this one check red.
const selLocator = page
  .locator(`[role="menu"] [role="menuitem"][aria-haspopup="dialog"]:has-text("${APP_PREFS}")`)
const selBox = (await selLocator.count()) > 0 ? await selLocator.boundingBox() : null
check(`the "${APP_PREFS}" row is in the open panel`, !!atRest && !!selBox)
if (atRest && selBox) {
  await page.mouse.move(selBox.x + selBox.width / 2, selBox.y + selBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(150)
  const pressed = await panelShape()
  await page.mouse.up()
  check(
    'it does not move under the cursor',
    !!pressed && pressed.top === atRest.top,
    JSON.stringify({ atRest, pressed }),
  )
  check(
    'and the panel keeps every row',
    !!pressed && pressed.rows === atRest.rows,
    JSON.stringify({ atRest, pressed }),
  )
}

// ── Sign out, from Tune ─────────────────────────────────────────────────────
console.log(`\nSign out in "${ACCOUNT}" signs out`)
await page.mouse.move(20, 500)
await page.waitForTimeout(300)
if (!(await tune.isVisible())) await openTune()
await account.getByTestId('unisim-prefs-sign-out').click()
await page.waitForTimeout(800)
check('the session is gone from this device', (await page.evaluate(() => localStorage.getItem('universal-suite-auth'))) === null)
check('and the hub was told', signedOut)
if (await tune.isVisible()) await closeTune()
await openTune()
check(`${APP_PREFS} no longer shows "${ACCOUNT}" for them`, (await account.count()) === 0)
await closeTune()

await browser.close()

console.log(
  failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed',
)
process.exit(failures.length ? 1 : 0)
