// "Turn the pages into pictures" on the phone: to the photo library, or one
// ZIP file (James, 2026-10-25) — browser-level check of src/native/PhotosScreen
// and src/lib/photoLibrary.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:pictures             # in another terminal
//
// A browser has no photo library, so a stand-in plugin goes in through
// lib/photoLibrary's test seam (`__unipdfPhotoLibrary`). The native halves
// (PhotoLibrary.swift, PhotoLibraryPlugin.java) are checked on a phone.
//
// What is pinned: the website gets no choice (the ZIP, as before); the phone
// app offers Photos (Android: Gallery) or one ZIP file, ZIP the first time and
// the last choice after; Photos saves every page in order and says "Saved 3
// images to Photos"; refused, it says so on the page with Open Settings and
// "Save a ZIP instead".

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

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
    } catch {
      continue
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
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
const json = (v) => JSON.stringify(v)

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

/** A phone context; `fake` puts the stand-in photo library in (lib/photoLibrary's test seam). */
async function phone(fake) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true })
  await keepAppModuleUrls(context)
  if (fake) {
    await context.addInitScript((f) => {
      window.__saved = []
      window.__settings = 0
      window.__unipdfPhotoLibrary = {
        platform: f.platform,
        requestAccess: async () => ({ access: localStorage.getItem('test:deny') ? 'denied' : 'granted' }),
        saveImage: async ({ data, name, album }) => {
          window.__saved.push({ name, album, bytes: atob(data).length })
        },
        openSettings: async () => {
          window.__settings++
        },
      }
    }, fake)
  }
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  try {
    await page.goto(`${BASE}?app`, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
  return { context, page }
}
const mod = (page, path, src) =>
  page.evaluate(
    async ({ path, src }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', src)(m)
    },
    { path, src },
  )
/** The example open, then What else ▸ Turn the pages into pictures, with it on the page. */
async function picturesPage(page) {
  await mod(page, '/src/native/jobs.ts', "return m.runJob('example')")
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(500)
  await mod(page, '/src/native/jobs.ts', "m.openJob({ kind: 'convert', mode: 'pdf-to-images', initialPdf: m.currentFile() })")
  await page.waitForTimeout(600)
}
const dest = (page) => page.locator('[data-pictures-dest] [role="radio"][aria-checked="true"]').innerText().catch(() => null)
const primary = (page) => page.locator('.np-page-enter button.min-h-\\[56px\\]').last()

console.log('\nthe website (no photo library): no choice, the ZIP as before')
{
  const { context, page } = await phone(null)
  await picturesPage(page)
  check('no "where to?" choice', (await page.locator('[data-pictures-dest]').count()) === 0)
  check('the button saves the pictures', (await primary(page).innerText()) === 'Save the pictures', await primary(page).innerText())
  await context.close()
}

console.log('\nthe iPhone app: Photos or one ZIP file')
{
  const { context, page } = await phone({ platform: 'ios' })
  await picturesPage(page)
  check('the choice is there, ZIP the first time (as before)', (await dest(page)) === 'One ZIP file', String(await dest(page)))
  await page.getByRole('radio', { name: 'Photos' }).click()
  check('Photos picked: the button says so', (await primary(page).innerText()) === 'Save to Photos', await primary(page).innerText())
  check('…and says what happens', (await page.getByText('Each page becomes a photo in your library, in order.').count()) === 1)
  await primary(page).click()
  await page.waitForFunction(() => window.__saved.length === 3, null, { timeout: 30000 }).catch(() => {})
  const saved = await page.evaluate(() => window.__saved)
  check('every page saved, in order', json(saved.map((x) => x.name)) === json(saved.map((x) => x.name).slice().sort()) && saved.length === 3 && saved.every((x) => x.bytes > 1000), json(saved))
  await page.waitForTimeout(300)
  check('"Saved 3 images to Photos"', (await mod(page, '/src/native/nav.ts', 'return m.useNav.getState().toast')) === 'Saved 3 images to Photos', String(await mod(page, '/src/native/nav.ts', 'return m.useNav.getState().toast')))

  console.log('\nthe choice is remembered')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })
  await picturesPage(page)
  check('Photos again after a restart', (await dest(page)) === 'Photos', String(await dest(page)))

  console.log('\naccess refused: said plainly, with Settings and the ZIP')
  await page.evaluate(() => localStorage.setItem('test:deny', '1'))
  await primary(page).click()
  const panel = page.locator('[data-pictures-denied]')
  await panel.waitFor({ timeout: 30000 }).catch(() => {})
  check('it says so, on the page', /isn’t allowed to add photos/.test(await panel.innerText().catch(() => '')))
  await panel.getByRole('button', { name: 'Open Settings' }).click()
  check('"Open Settings" goes to the app\'s Settings', (await page.evaluate(() => window.__settings)) === 1)
  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
  await panel.getByRole('button', { name: 'Save a ZIP instead' }).click()
  const zip = await dl
  check('"Save a ZIP instead" makes the ZIP', !!zip && /\.zip$/.test(zip.suggestedFilename()), zip && zip.suggestedFilename())
  check('…and the choice is now the ZIP', (await dest(page)) === 'One ZIP file', String(await dest(page)))
  await context.close()
}

console.log('\nthe Android app calls it the Gallery')
{
  const { context, page } = await phone({ platform: 'android' })
  await picturesPage(page)
  await page.getByRole('radio', { name: 'Gallery' }).click()
  check('"Save to the Gallery"', (await primary(page).innerText()) === 'Save to the Gallery', await primary(page).innerText())
  await primary(page).click()
  await page.waitForFunction(() => window.__saved.length === 3, null, { timeout: 30000 }).catch(() => {})
  const saved = await page.evaluate(() => window.__saved)
  check('into a folder named after the PDF', saved.length === 3 && saved.every((x) => x.album === 'Universal-PDF-example'), json(saved))
  await context.close()
}

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nall passed')
