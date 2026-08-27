// The Actions dropdown — browser-level checks for the accordion and the
// company badge.
//
//   ./scripts/preview.ps1     # or preview.sh — Universal PDF is :5174
//   npm run test:actions      # in another terminal
//
// Runs against `?mockauth=1`, the SDK's offline fixture world (dev builds
// only — see main.tsx). That is what makes this testable at all: the Actions
// rows live inside the SDK's <UserProfile> dropdown, which only has an account
// header and an `extras` slot to show when somebody is signed in, and the
// fixture signs one in with no network and no real credentials.
//
// What is pinned:
//
//   • ONE CATEGORY AT A TIME. Opening View closes Advanced (owner request,
//     2026-08-27). Six independent booleans used to leave every category you
//     had ever opened expanded, and the panel grew into a scroll.
//   • Clicking the open category still collapses it — an accordion, not a
//     radio group you can never get back out of.
//   • The company's name appears in the profile popup, sourced from the org
//     branding the SDK already exposes (`useOrg` / `useOrgBranding`).
//
// Negative control (2026-08-27, run): `git stash`-ing FileMenu.tsx back to the
// six-boolean version turns 5 of these red — every "the other one closed"
// assertion — and leaves the rest green.

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

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Actions menu test — page ${p + 1}`, { x: 60, y: 780, size: 20, font })
  }
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

// Sign the fixture in before the app boots. `universal:mock_session` is the
// key mockAuth keeps its mode under, and 'james' is what its own sign-in
// writes — so this is the same signed-in state, reached without driving the
// dialog. ⚠️ `addInitScript` runs before the document is parsed, which is fine
// for localStorage but is exactly why it must not be used to observe the DOM.
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

// The category headers are the only buttons in the panel carrying
// aria-expanded, which is also the attribute the assertions read — so the
// accessibility contract and the test are the same thing.
const sectionButton = (name) =>
  page.locator(`button[aria-haspopup="true"][aria-expanded]:has-text("${name}")`).first()

const expanded = async (name) => (await sectionButton(name).getAttribute('aria-expanded')) === 'true'

// ⚠️ Two traps in this one selector-and-gesture.
//
// Suffix match, not `[aria-label="Profile"]`: <UserProfile /> labels the
// COMBINED pill "<pill label> · Profile", and it invents the pill label
// ("Actions") itself as soon as an app passes `actions`, so the exact selector
// matches nothing here.
//
// And HOVER, not click. The pill opens on `mouseenter` as well as on click, so
// a Playwright click opens it on the way in and the click itself toggles it
// straight back shut — the panel is left closed and every row is invisible.
async function openMenu() {
  await page.hover('button[aria-label$="Profile"]')
  await page.waitForTimeout(400)
}

// ── Load a document ──────────────────────────────────────────────────────────
// ⚠️ The Actions rows only exist with a document open: the landing page uses
// the SDK's own navbar, and the toolbar that carries this control is rendered
// under `{doc && …}`.
await page.setInputFiles('input[type=file]', {
  name: 'actions.pdf',
  mimeType: 'application/pdf',
  buffer: pdf,
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

console.log('\nthe Actions dropdown opens with every category collapsed')
await openMenu()
check('Advanced starts closed', !(await expanded('Advanced')))
check('View starts closed', !(await expanded('View')))
check('File starts closed', !(await expanded('File')))

console.log('\nopening a category expands exactly that one')
await sectionButton('Advanced').click()
await page.waitForTimeout(150)
check('Advanced is open', await expanded('Advanced'))
check('View is still closed', !(await expanded('View')))
check(
  'and its rows are on screen',
  await page.locator('text=Merge with another PDF').first().isVisible(),
)

console.log('\nopening a second category CLOSES the first (the reported bug)')
await sectionButton('View').click()
await page.waitForTimeout(150)
check('View is open', await expanded('View'))
check('Advanced closed itself', !(await expanded('Advanced')))
check(
  "Advanced's rows are gone",
  (await page.locator('text=Merge with another PDF').count()) === 0,
)

console.log('\na third category closes the second, and so on')
await sectionButton('File').click()
await page.waitForTimeout(150)
check('File is open', await expanded('File'))
check('View closed itself', !(await expanded('View')))
check('Advanced is still closed', !(await expanded('Advanced')))

console.log('\nclicking the open category collapses it (still a toggle)')
await sectionButton('File').click()
await page.waitForTimeout(150)
check('File closed again', !(await expanded('File')))
check('and nothing else opened', !(await expanded('View')) && !(await expanded('Advanced')))

console.log("\nthe profile popup names the signed-in user's company")
const badge = page.locator('[data-testid="profile-company"]')
check('the company row is in the dropdown', (await badge.count()) === 1)
check(
  'it shows the org name from branding',
  (await badge.first().innerText()).includes('UNI·SIM Demo'),
  await badge.first().innerText().catch(() => '(not found)'),
)

await browser.close()

console.log(
  failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed',
)
process.exit(failures.length ? 1 : 0)
