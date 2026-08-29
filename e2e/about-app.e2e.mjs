// "About this app" — browser checks for the Advanced category and the dialog
// it opens. Runs against ANY Universal app, not just this one, because the
// component under test is the SDK's and every app in the suite now carries it:
//
//   ./scripts/preview.ps1                    # Universal PDF is :5174
//   npm run test:about                       # in another terminal
//   BASE=http://localhost:5177/ SETUP=image NAME=Images npm run test:about
//
// Env:
//   BASE     the app to test (default this app's preview port)
//   NAME     what to print
//   SETUP    'pdf' | 'image' | ''  — some apps gate their Actions menu on a
//            document being open, which is deliberate (owner, 2026-08-29)
//   PRIVACY  'no' asserts the privacy section is ABSENT — the honest state for
//            the server-backed apps (Exports, Date Polling, Webinar), where
//            "never leaves this computer" would be a lie
//   SHOT     save a picture of the dialog
//
// Negative control (2026-08-29, run): against the app before <AdvancedMenu>
// was wired in, the first assertion goes red and the run stops there.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Sibling repos that carry a Playwright install — see office-import.e2e.mjs.
const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]
let pw = null
for (const rel of PLAYWRIGHT_CANDIDATES) {
  try {
    pw = (await import(pathToFileURL(join(HERE, rel)).href)).default
    break
  } catch { /* try the next one */ }
}
if (!pw) {
  console.error('No Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}
const BASE = process.env.BASE ?? 'http://localhost:5174/'
const NAME = process.env.NAME ?? BASE
const WANT_PRIVACY = (process.env.PRIVACY ?? 'yes') === 'yes'
const SHOT = process.env.SHOT
const SETUP = process.env.SETUP ?? ''

const fails = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) fails.push(label)
}

// Fixtures, written here so the test carries its own inputs.
const FIX = join(HERE, 'fixtures')
mkdirSync(FIX, { recursive: true })
const IMG = join(FIX, 'about-1px.png')
writeFileSync(IMG, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'))

const b = await pw.chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.goto(BASE, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)

// Some apps only show their Actions menu once something is open — PDF and
// Images gate it on a document, which is the owner's chosen behaviour.
if (SETUP === 'image') {
  await p.locator('input[type=file]').first().setInputFiles(IMG)
  await p.waitForTimeout(2500)
} else if (SETUP === 'pdf') {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  const PDF = join(FIX, 'about-blank.pdf')
  writeFileSync(PDF, Buffer.from(await doc.save()))
  await p.locator('input[type=file]').first().setInputFiles(PDF)
  await p.waitForTimeout(4000)
}

console.log(`\n${NAME}`)

// ⚠️ HOVER, not click. <UserProfile> opens the pill on hover, so Playwright's
// click — which moves the mouse first — opens it and then toggles it shut.
const pill = p.locator('button:has-text("Actions")').first()
await pill.waitFor({ state: 'visible', timeout: 15000 })
await pill.hover()
await p.waitForTimeout(600)
if (!(await p.locator('button[aria-haspopup="true"]', { hasText: /^\s*\S{0,3}\s*Advanced\s*$/ }).first().isVisible())) {
  await pill.click()
  await p.waitForTimeout(600)
}

// ⚠️ aria-haspopup, not the label alone: Universal QR has an "Advanced" TAB
// in its studio, and a bare text match found that instead of the menu's own
// category — green on the first assertion, then stuck on the second.
const advanced = p.locator('button[aria-haspopup="true"]', { hasText: /^\s*\S{0,3}\s*Advanced\s*$/ }).first()
check(await advanced.isVisible(), 'the menu has an Advanced category')
await advanced.click()
await p.waitForTimeout(400)

// Not [role=menuitem]: Universal PDF's own InfoRow is a plain <button>, and
// this test has to accept the app's existing row markup rather than the
// SDK's, since PDF keeps its own Advanced section.
const row = p.locator('button', { hasText: /About this app/ }).first()
check(await row.isVisible(), 'About this app is inside it')
await row.click()
await p.waitForTimeout(700)

const dialog = p.locator('[role=dialog]').first()
check(await dialog.isVisible(), 'the row opens the dialog')
const text = await dialog.innerText()
check(/OPEN SOURCE/i.test(text), 'it states the licence and links the source')
check(/SUPPORT/i.test(text), 'it says who to contact')
const hasPrivacy = /never leave/i.test(text)
check(hasPrivacy === WANT_PRIVACY, WANT_PRIVACY
  ? 'it carries the banner\'s privacy claim'
  : 'it does NOT claim local-first, which would be false here',
  `privacy section ${hasPrivacy ? 'present' : 'absent'}`)
if (SHOT) await dialog.screenshot({ path: SHOT })

await p.keyboard.press('Escape')
await p.waitForTimeout(400)
check((await p.locator('[role=dialog]').count()) === 0, 'Escape closes it')

check(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 200))
await b.close()

if (fails.length) {
  console.log(`  ${fails.length} FAILED in ${NAME}`)
  process.exit(1)
}
