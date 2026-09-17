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
//   • The Actions menu's Language row changes the language of the menu itself,
//     live, and <html lang> with it.
//   • The choice survives a reload.
//   • One language picker in that panel, not two.
//
// Expected words are read from src/i18n, not copied here, so a retranslation
// doesn't break the test — a missing translation does.

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
const visible = async (text) => (await page.getByText(text).count()) > 0
const sectionButton = (name) =>
  page.locator(`button[aria-haspopup="true"][aria-expanded]:has-text("${name}")`).first()
async function openMenu() {
  // The SDK labels the pill "<greeting> · Profile" — translated too, so the
  // selector keys on the separator rather than the English word.
  await page.hover('button[aria-label*=" · "]')
  await page.waitForTimeout(400)
}

console.log('\na French browser gets the app in French, with nothing chosen')
check('<html lang> is fr', (await htmlLang()) === 'fr', await htmlLang())
check('the start screen is French', await visible(fr.app.landing_try_example))
check('and not English', !(await visible(en.app.landing_try_example)))

await page.setInputFiles('input[type=file]', { name: 'language.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(600)

console.log('\nthe Actions menu is French too')
await openMenu()
check('its File section is "' + fr.menu.file + '"', (await sectionButton(fr.menu.file).count()) > 0)
check('its Language row is "' + fr.menu.language + '"', (await page.getByTestId('menu-language').innerText()).includes(fr.menu.language))
check('and says Français', (await page.getByTestId('menu-language').innerText()).includes('Français'))
check(
  'there is one language picker in the panel, not two',
  (await page.locator('[role="menu"] select').count()) === 0,
)

console.log('\npicking Deutsch translates the menu under the pointer (the reported bug)')
await page.getByTestId('menu-language').click()
await page.waitForTimeout(150)
await page.getByTestId('menu-language-de').click()
await page.waitForTimeout(400)
check('<html lang> is de', (await htmlLang()) === 'de', await htmlLang())
await openMenu()
check('the File section is now "' + de.menu.file + '"', (await sectionButton(de.menu.file).count()) > 0)
check('the Advanced section is now "' + de.menu.advanced + '"', (await sectionButton(de.menu.advanced).count()) > 0)
check('no French section is left', (await sectionButton(fr.menu.file).count()) === 0)
check('the Language row says Deutsch', (await page.getByTestId('menu-language').innerText()).includes('Deutsch'))

console.log('\nthe choice survives a reload')
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1200)
check('<html lang> is still de', (await htmlLang()) === 'de', await htmlLang())
check(
  'saved as the suite language',
  (await page.evaluate(() => localStorage.getItem('universal:language'))) === 'de',
)

await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
