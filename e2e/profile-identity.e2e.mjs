// The profile popup's identity — the display name that went stale, and the
// company badge.
//
//   ./scripts/preview.ps1        # or preview.sh — Universal PDF is :5174
//   npm run test:profile         # in another terminal
//
// ── Why this one stubs the network instead of using `?mockauth=1` ────────────
//
// `e2e/actions-menu.e2e.mjs` runs on the SDK's offline fixture, which is right
// for anything that only needs *a* signed-in user. It cannot serve this file:
// its `profiles` select returns one frozen row, so "the display name changed"
// is inexpressible there. So this context seeds a session into the SDK's
// localStorage key and answers `/rest/v1/*` and `/auth/v1/*` itself — which
// also means the name and the branding can be changed BETWEEN reads, which is
// the whole bug.
//
// ── The bug ─────────────────────────────────────────────────────────────────
//
// `useProfile()` is a hook with its own `useState` per call site, not a shared
// store. The display-name editor is the SDK's <ProfileDialog>, mounted inside
// <UserProfile>, and it calls `useProfile()` for itself — so saving refreshed
// the dialog's copy and never the app's, and the dropdown went on showing the
// old name until a reload. `ToolbarUserProfile` now re-reads the row as the
// pointer reaches the pill (enter AND down — the panel opens on hover, so a
// pointerdown-only refresh would miss anyone who never clicks it).
//
// Negative control (2026-08-27, run): dropping the pointer handlers from
// `ToolbarUserProfile` turns 3 checks red — every assertion about a name
// changing — and leaves the company-badge ones green.

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

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

// The world this run serves. Mutating these between reads is how "somebody
// just saved a new display name / uploaded a company logo" is simulated.
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
// is a plain localStorage entry, so seeding it IS being signed in.
await context.addInitScript(
  (s) => window.localStorage.setItem('universal-suite-auth', JSON.stringify(s)),
  session,
)

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

// `profileDelayMs` is what makes the re-read OBSERVABLE. Answered instantly,
// `loading` goes true and false inside one React batch and a needless refresh
// is invisible — which is exactly why the bug below sat there. A third of a
// second is an ordinary round trip.
let profileReads = 0
let profileDelayMs = 0

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

// The control only exists with a document open — the landing page uses the
// SDK's own navbar instead.
await page.setInputFiles('input[type=file]', {
  name: 'identity.pdf',
  mimeType: 'application/pdf',
  buffer: pdf,
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

// ⚠️ HOVER, not click: the pill opens on mouseenter, so a click would open it
// on the way in and toggle it straight back shut.
const PILL = 'button[aria-label$="Profile"]'
async function openMenu() {
  // Park the pointer well away first, so the next hover is a real re-entry —
  // that is the event the refresh hangs off, and moving to a spot the pointer
  // is already on fires nothing.
  await page.mouse.move(20, 500)
  await page.waitForTimeout(120)
  await page.hover(PILL)
  await page.waitForTimeout(600)
}
const menuText = () => page.locator('[data-menu-panel], body').first().innerText()

console.log('\nthe dropdown shows the name the profile row holds')
await openMenu()
check('the current display name is on screen', (await menuText()).includes('Jim Original'))

console.log('\nthe company badge names the org, from the branding the SDK already exposes')
const badge = page.locator('[data-testid="profile-company"]')
check('the company row is present', (await badge.count()) === 1)
const badgeText = await badge.first().innerText()
check('it shows the org name', badgeText.includes('Acme Ltd'), badgeText)
check(
  'with an initials tile while no mark is set',
  badgeText.includes('AC'),
  badgeText,
)
check('and no <img> until there is one', (await badge.locator('img').count()) === 0)

console.log('\nsaving a new display name updates the dropdown — no reload (the reported bug)')
world.displayName = 'Jim Renamed'
await openMenu()
const afterRename = await menuText()
check('the new name is shown', afterRename.includes('Jim Renamed'), afterRename.slice(0, 200))
check('and the old one is gone', !afterRename.includes('Jim Original'))

console.log('\nand it keeps up with a second change')
world.displayName = 'Jim Renamed Again'
await openMenu()
check('the newest name is shown', (await menuText()).includes('Jim Renamed Again'))

console.log('\nuploading a company mark in branding puts it in the popup')
world.iconUrl = LOGO_DATA_URL
world.orgName = 'Acme Holdings'
// The org row is read by useOrg, which re-reads on the same pointer refresh
// path only for the profile — reload so the org query re-runs, which is what a
// branding change does for a user in practice anyway.
await page.reload({ waitUntil: 'load' })
await page.setInputFiles('input[type=file]', {
  name: 'identity.pdf',
  mimeType: 'application/pdf',
  buffer: pdf,
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)
await openMenu()
check('the mark is rendered as an image', (await badge.locator('img').count()) === 1, )
check('the renamed org is shown', (await badge.first().innerText()).includes('Acme Holdings'))

// ── The other half of the same wire ─────────────────────────────────────────
//
// The refresh above hangs off pointer events on the WRAPPER, and the dropdown
// panel is a child of that same wrapper — so every click inside the open menu
// fired one too, and while each was in flight the control fell back to its '·'
// placeholder. Two visible faults from one cause (James, 2026-08-29):
//
//   • the avatar blinked to a dot on every click in the menu; and
//   • the account rows the props drive left the panel with it, so everything
//     below jumped ~83px — including the language <select>, which moved out
//     from under the cursor mid-press and could not be used at all.
//
// Both are pinned here rather than by the pill's appearance alone, because a
// screenshot of the resting state looks identical either way.
profileDelayMs = 350

console.log('\nclicking inside the open menu does not re-read the profile (the reported bug)')
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

console.log('\nthe language row holds still while the pointer is on it')
const panelShape = () =>
  page.evaluate(() => {
    const el = document.querySelector('[role="menu"] select')
    if (!el) return null
    return {
      top: Math.round(el.getBoundingClientRect().top),
      rows: document.querySelectorAll('[role="menu"] > *').length,
    }
  })
await openMenu()
const atRest = await panelShape()
const selBox = await page.locator('[role="menu"] select').first().boundingBox()
check('the language select is in the open panel', !!atRest && !!selBox)
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

await browser.close()

console.log(
  failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed',
)
process.exit(failures.length ? 1 : 0)
