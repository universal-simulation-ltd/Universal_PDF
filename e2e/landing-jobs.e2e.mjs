// The row of jobs on the website's landing page (James, 2026-11-27: the phone
// app's carousel, on the web).
//
//   ./scripts/preview.sh            # or preview.ps1 — Universal PDF is :5174
//   node e2e/landing-jobs.e2e.mjs
//
// Under the hero there is one row of cards: the three ways in, then the twelve
// jobs. Pinned here:
//
//   • All fifteen are there, the row scrolls sideways without the page doing
//     so, and its arrows move it (desktop) — at a phone's width too.
//   • A job that works on one PDF picks a file, opens it, and puts that job's
//     tool in the hand: Black out, Fill in, Mark up, Pages, Compare, Sign,
//     Send to sign, Lock (the Export box).
//   • The jobs with a dialog of their own open it with no file picked first:
//     Merge, Photos to PDF.

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
const json = (v) => JSON.stringify(v)

const playwright = await loadPlaywright()
const engine = process.env.E2E_BROWSER && playwright[process.env.E2E_BROWSER] ? process.env.E2E_BROWSER : 'chromium'
const browser = await playwright[engine].launch()

const PDF = join(HERE, 'fixtures', 'page-scroll-5.pdf')

async function landing(width, height, mobile = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile && engine !== 'firefox' })
  await keepAppModuleUrls(context)
  await context.addInitScript(() => {
    try { localStorage.setItem('universal:language', 'en-gb') } catch { /* no storage */ }
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
  await page.waitForSelector('[data-landing-jobs]', { timeout: 30000 })
  await page.waitForTimeout(500)
  const state = (path, src) =>
    page.evaluate(
      async ({ path, src }) => {
        const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
        // eslint-disable-next-line no-new-func
        return new Function('m', src)(m)
      },
      { path, src },
    )
  return { page, context, state }
}

/** Click a job's card, give its picker the PDF, and wait for the document. */
async function pick(page, job) {
  const card = page.locator(`[data-landing-jobs] [data-job="${job}"]`)
  await card.scrollIntoViewIfNeeded()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), card.click()])
  await chooser.setFiles(PDF)
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(700)
}

console.log('\nthe row')
{
  const { page, context } = await landing(1440, 900)
  const row = await page.evaluate(() => {
    const el = document.querySelector('[data-landing-jobs]')
    return { cards: el.querySelectorAll('button').length, scrolls: el.scrollWidth > el.clientWidth + 100, pageWide: document.documentElement.scrollWidth > innerWidth, at: el.scrollLeft }
  })
  check('fifteen cards: three ways in and twelve jobs', row.cards === 15, json(row))
  check('the row scrolls sideways, the page does not', row.scrolls && !row.pageWide, json(row))
  check('no "earlier" arrow at the start', (await page.getByRole('button', { name: 'Earlier jobs' }).count()) === 0)
  await page.getByRole('button', { name: 'More jobs' }).click()
  await page.waitForTimeout(900)
  check('the arrow moves the row along', (await page.evaluate(() => document.querySelector('[data-landing-jobs]').scrollLeft)) > 200)
  check('…and the way back appears', (await page.getByRole('button', { name: 'Earlier jobs' }).count()) === 1)
  await context.close()
}
{
  const { page, context } = await landing(393, 852, true)
  const row = await page.evaluate(() => {
    const el = document.querySelector('[data-landing-jobs]')
    const second = el.querySelectorAll('button')[2].getBoundingClientRect()
    return { cards: el.querySelectorAll('button').length, pageWide: document.documentElement.scrollWidth > innerWidth, cut: second.left < innerWidth && second.right > innerWidth - 16 }
  })
  check('on a phone: all fifteen, the page no wider than the screen', row.cards === 15 && !row.pageWide, json(row))
  check('…and a card cut off at the edge says there are more', row.cut, json(row))
  await context.close()
}

console.log('\na job picks a file and opens its tool')
const TOOL = '/src/stores/annotationStore.ts'
const PDFS = '/src/stores/pdfStore.ts'
for (const [job, label, path, src, want] of [
  ['blackout', 'Black out text has the redact tool in hand', TOOL, 'return m.useAnnotationStore.getState().tool', 'redact'],
  ['fill', 'Fill in a form has the form tool in hand', TOOL, 'return m.useAnnotationStore.getState().tool', 'form'],
  ['markup', 'Highlight and mark up has the highlighter in hand', TOOL, 'return m.useAnnotationStore.getState().tool', 'highlight'],
  ['pages', 'Pages opens the page list', PDFS, 'return m.usePdfStore.getState().pageNavOpen', true],
  ['compare', 'Compare two PDFs opens Compare', PDFS, 'return m.usePdfStore.getState().compareOpen', true],
  ['send-sign', 'Send to sign opens Send for signature', PDFS, 'return m.usePdfStore.getState().sendForSignatureOpen', true],
]) {
  const { page, context, state } = await landing(1440, 900)
  await pick(page, job)
  const got = await state(path, src)
  check(label, got === want, json(got))
  await context.close()
}
{
  const { page, context } = await landing(1440, 900)
  await pick(page, 'sign')
  check('Sign a PDF opens the Sign menu', (await page.getByText('Draw new', { exact: false }).count()) >= 1)
  await context.close()
}
{
  const { page, context } = await landing(1440, 900)
  await pick(page, 'lock')
  await page.waitForTimeout(600)
  check('Lock with a password opens the Export box', (await page.locator('.fixed.inset-0').count()) >= 1)
  await context.close()
}

console.log('\na job with a dialog of its own opens it')
{
  const { page, context } = await landing(1440, 900)
  await page.locator('[data-landing-jobs] [data-job="merge"]').scrollIntoViewIfNeeded()
  await page.locator('[data-landing-jobs] [data-job="merge"]').click()
  await page.waitForTimeout(800)
  check('Merge PDFs', (await page.locator('.fixed.inset-0').count()) >= 1)
  await context.close()
}
{
  const { page, context } = await landing(1440, 900)
  await page.locator('[data-landing-jobs] [data-job="photos"]').scrollIntoViewIfNeeded()
  await page.locator('[data-landing-jobs] [data-job="photos"]').click()
  await page.waitForTimeout(800)
  check('Photos to PDF', (await page.locator('.fixed.inset-0').count()) >= 1)
  await context.close()
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\nlanding jobs: all checks passed')
