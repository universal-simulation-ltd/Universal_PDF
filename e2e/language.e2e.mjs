// The app's language — the bug James reported on Android (2026-09-17): the
// phone was French, the navbar came up French, and every label in the app was
// English; picking Français under "Document language" changed nothing, because
// that picker only set <html lang> and the app had no translations at all.
//
//   ./scripts/preview.sh      # Universal PDF is :5174
//   npm run test:language     # in another terminal
//
// What is pinned:
//   • A browser in French opens the app in French, with nothing chosen — the
//     SDK's device-language fallback reaches the app's own labels.
//   • The language is chosen in the SDK's dialogs, not an Actions row (that
//     row went 2026-09-17): App preferences sets THIS app's language, live,
//     and <html lang> with it; Global preferences sets the suite's, which an
//     app override outranks until "Follow global" removes it.
//   • The choice survives a reload.
//   • App preferences is light (the panel's theme, not the dark pill's) and
//     says Universal PDF is always light.
//   • window.__pdfSetLanguage (store-assets/generate.mjs) still switches it.
//
// Expected words are read from src/i18n and the SDK's dictionary, not copied
// here, so a retranslation doesn't break the test — a missing translation does.

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
  doc.addPage([595, 842]).drawText('Language test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

// Node strips the types; the dictionaries are plain objects.
const dict = async (lang, ns) => (await import(pathToFileURL(join(HERE, `../src/i18n/${lang}/${ns}.ts`)).href)).default
const en = { menu: await dict('en', 'menu'), app: await dict('en', 'app') }
const fr = { menu: await dict('fr', 'menu'), app: await dict('fr', 'app') }
const de = { menu: await dict('de', 'menu') }
const it = { menu: await dict('it', 'menu') }
// The SDK's own strings (the preferences rows and dialogs).
const sdk = await import(pathToFileURL(join(HERE, '../node_modules/@unisim/sdk/dist/i18n.js')).href)
const APP_KEY = 'universal:language:pdf'

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' })
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.waitForTimeout(1200)

const htmlLang = () => page.evaluate(() => document.documentElement.lang)
const stored = (key) => page.evaluate((k) => localStorage.getItem(k), key)
const visible = async (text) => (await page.getByText(text).count()) > 0
const sectionButton = (name) =>
  page.locator(`button[aria-haspopup="true"][aria-expanded]:has-text("${name}")`).first()
const prefsRow = (lang, kind) =>
  page.locator(`[role="menuitem"][aria-haspopup="dialog"]:has-text("${sdk.t(lang, `prefs.${kind}_preferences`)}")`)
const dialog = (kind) => page.locator(`[data-unisim-preferences="${kind}"]`)
async function openMenu() {
  // The SDK labels the pill "<greeting> · Profile" — translated too, so the
  // selector keys on the separator rather than the English word.
  await page.hover('button[aria-label*=" · "]')
  await page.waitForTimeout(400)
}
// Signed in, Global preferences sits in the account panel behind the menu's
// identity header (the first expandable row); App preferences is in the list.
async function openAccountPanel() {
  await page.locator('[role="menu"] [role="menuitem"][aria-haspopup="true"][aria-expanded="false"]').first().click()
  await page.waitForTimeout(300)
}
async function openPrefs(lang, kind) {
  await openMenu()
  if (kind === 'global') await openAccountPanel()
  await prefsRow(lang, kind).click()
  await dialog(kind).waitFor({ timeout: 5000 })
}
async function closePrefs() {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

console.log('\na French browser gets the app in French, with nothing chosen')
check('<html lang> is fr', (await htmlLang()) === 'fr', await htmlLang())
check('the start screen is French', await visible(fr.app.landing_try_example))
check('and not English', !(await visible(en.app.landing_try_example)))

await page.setInputFiles('input[type=file]', { name: 'language.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

console.log('\nthe Actions menu is French too, and the language lives in the SDK rows')
await openMenu()
check('its File section is "' + fr.menu.file + '"', (await sectionButton(fr.menu.file).count()) > 0)
check('there is no Actions Language row any more', (await page.getByTestId('menu-language').count()) === 0)
check('one App preferences row', (await prefsRow('fr', 'app').count()) === 1)
check('no language <select> in the panel itself', (await page.locator('[role="menu"] select').count()) === 0)
await openAccountPanel()
check('one Global preferences row, in the account panel', (await prefsRow('fr', 'global').count()) === 1)

console.log('\nApp preferences: light, "always light", and a per-app language')
await prefsRow('fr', 'app').click()
await dialog('app').waitFor({ timeout: 5000 })
const bg = await dialog('app').evaluate((el) => getComputedStyle(el).backgroundColor)
const rgb = (bg.match(/\d+/g) ?? []).map(Number)
check('the dialog is light, not the dark pill', rgb.length >= 3 && rgb[0] > 200 && rgb[1] > 200 && rgb[2] > 200, bg)
check(
  'it says Universal PDF is always light',
  (await dialog('app').innerText()).includes(sdk.t('fr', 'prefs.always_light').replace('{app}', 'Universal PDF')),
)
const appSelect = dialog('app').locator('select')
check(
  'Language defaults to "Follow global: Français"',
  (await appSelect.inputValue()) === '' &&
    (await appSelect.locator('option').first().innerText()).includes(sdk.t('fr', 'prefs.follow_global').replace('{value}', 'Français')),
)

console.log('\npicking Deutsch for this app translates the app (the reported bug)')
await appSelect.selectOption('de')
await page.waitForTimeout(400)
check('<html lang> is de', (await htmlLang()) === 'de', await htmlLang())
check('saved as this app\'s override', (await stored(APP_KEY)) === 'de', await stored(APP_KEY))
check('and not as the suite language', (await stored('universal:language')) !== 'de', await stored('universal:language'))
await closePrefs()
await openMenu()
check('the File section is now "' + de.menu.file + '"', (await sectionButton(de.menu.file).count()) > 0)
check('the Advanced section is now "' + de.menu.advanced + '"', (await sectionButton(de.menu.advanced).count()) > 0)
check('no French section is left', (await sectionButton(fr.menu.file).count()) === 0)
await page.mouse.move(5, 895)
await page.waitForTimeout(400)

console.log('\nthe choice survives a reload')
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1200)
check('<html lang> is still de', (await htmlLang()) === 'de', await htmlLang())

await page.setInputFiles('input[type=file]', { name: 'language.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

console.log('\nGlobal preferences sets the suite language; the app override still wins')
await openPrefs('de', 'global')
await dialog('global').locator('select').selectOption('it')
await page.waitForTimeout(400)
check('saved as the suite language', (await stored('universal:language')) === 'it', await stored('universal:language'))
check('the app stays in German', (await htmlLang()) === 'de', await htmlLang())
check(
  'and the dialog says why',
  (await dialog('global').innerText()).includes(
    sdk.t('de', 'prefs.app_uses_own_language').replace('{app}', 'Universal PDF').replace('{value}', 'Deutsch'),
  ),
)
await closePrefs()

console.log('\n"Follow global" removes the override')
await openPrefs('de', 'app')
await dialog('app').locator('select').selectOption('')
await page.waitForTimeout(400)
check('<html lang> is it', (await htmlLang()) === 'it', await htmlLang())
check('the override is gone, not stored as "it"', (await stored(APP_KEY)) === null, await stored(APP_KEY))
await closePrefs()
await openMenu()
check('the Advanced section is now "' + it.menu.advanced + '"', (await sectionButton(it.menu.advanced).count()) > 0)
await page.mouse.move(5, 895)
await page.waitForTimeout(400)

console.log('\nthe store-screenshot hook still switches it')
await page.evaluate(() => window.__pdfSetLanguage?.('tr'))
await page.waitForTimeout(400)
check('<html lang> is tr', (await htmlLang()) === 'tr', await htmlLang())
check('as this app\'s override', (await stored(APP_KEY)) === 'tr', await stored(APP_KEY))

await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
