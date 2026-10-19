// The phone's knowledge base, a page of its own (James, 2026-10-18: "Make
// knowledge base native page").
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:phone-knowledge      # in another terminal
//
// The phone screens in WebKit at iPhone size (`?app`). What is pinned:
//
//   • Tune ▸ How to… opens the page over the tabs (no document open), and
//     What else ▸ How to… opens it over the document, with the file's name on
//     its back link. Neither opens the SDK's dialog.
//   • The search box is NOT focused when the page opens (no keyboard before
//     the page has been read), and it filters the articles; a search that
//     matches nothing says so.
//   • The articles come in the knowledge base's groups; an article is a page
//     with its own back link, its body rendered (subheadings, lists), and
//     Next turns to the next article in place.
//   • Android's back (history.back()) closes article → list → page.
//   • Nothing scrolls sideways.
//   • The website (`?app=0`) still opens the SDK's dialog.
//
// E2E_SHOTS=<folder> also saves screenshots of the list, an article and a search.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const SHOTS = process.env.E2E_SHOTS ?? ''

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
      const probe = await mod.webkit.launch()
      await probe.close()
      return mod
    } catch {
      /* try the next one */
    }
  }
  console.error('No usable Playwright (with WebKit) found. Install it in a sibling Universal app.')
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
const browser = await playwright.webkit.launch()
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await keepAppModuleUrls(context)
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

const mod = (path, src, arg) =>
  page.evaluate(
    async ({ path, src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', 'arg', src)(m, arg)
    },
    { path, src, arg },
  )
const screens = () => mod('/src/native/nav.ts', 'return m.useNav.getState().screens')
const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}
/** Nothing on the screen is wider than the screen, nor scrolls sideways. */
const sideways = () =>
  page.evaluate(() => {
    const out = []
    if (document.documentElement.scrollWidth > innerWidth) out.push({ doc: document.documentElement.scrollWidth })
    for (const el of document.querySelectorAll('.np *')) {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.classList.contains('np-jobs')) {
        out.push({ cls: el.className.slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth })
      }
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('.np-jobs')) out.push({ tag: el.tagName, left: r.left, right: r.right })
    }
    return out.slice(0, 5)
  })
const back = async () => {
  await page.evaluate(() => history.back())
  await page.waitForTimeout(450)
}

await page.waitForSelector('nav[aria-label] button', { timeout: 30000 })

console.log('\nTune ▸ How to… opens the page over the tabs')
await page.getByRole('button', { name: 'Tune', exact: true }).click()
await page.getByRole('button', { name: 'How to…' }).click()
await page.waitForSelector('h1:has-text("Good to")')
await page.waitForTimeout(400)
{
  check('the knowledge base is on the nav stack', json(await screens()) === json(['kb']), json(await screens()))
  check('no SDK dialog', (await page.locator('[role="dialog"]').count()) === 0)
  check('the back link names Tune', (await page.getByRole('button', { name: 'Tune', exact: true }).count()) >= 1)
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '')
  check('the search box is not focused', focused !== 'INPUT', focused)
  const groups = await page.locator('section > h2').allTextContents()
  check('three groups, in order', json(groups) === json(['The basics', 'How it works', 'Privacy and security']), json(groups))
  const rows = await page.locator('section button').count()
  check('all ten articles', rows === 10, String(rows))
  const wide = await sideways()
  check('nothing scrolls sideways (list)', wide.length === 0, json(wide))
  await shot('kb-list')
}

console.log('\nan article is a page of its own')
await page.getByRole('button', { name: /What actually is a PDF\?/ }).click()
await page.waitForTimeout(500)
{
  check('the article is a page over the list', json(await screens()) === json(['kb', 'kb-article']), json(await screens()))
  check('its title is the heading', (await page.locator('h1').last().textContent())?.includes('What actually is a PDF?'))
  check('its back link goes to all guides', (await page.getByRole('button', { name: 'All guides' }).count()) === 1)
  const body = await page.evaluate(() => {
    const a = document.querySelector('article')
    return a ? { h: a.querySelectorAll('h2').length, li: a.querySelectorAll('li').length, strong: a.querySelectorAll('strong').length, stars: a.textContent.includes('**') } : null
  })
  check('the body has its subheadings, list and bold', !!body && body.h >= 3 && body.li >= 5 && body.strong >= 1 && !body.stars, json(body))
  check('its research is listed', (await page.getByText('Research and sources').count()) === 1)
  const wide = await sideways()
  check('nothing scrolls sideways (article)', wide.length === 0, json(wide))
  await shot('kb-article')
  await page.evaluate(() => {
    const a = document.querySelector('article')?.parentElement
    a?.scrollTo({ top: a.scrollHeight })
  })
  await page.waitForTimeout(300)
  await shot('kb-article-end')

  await page.getByRole('button', { name: /^Next/ }).click()
  await page.waitForTimeout(400)
  check('Next turns the page in place', json(await screens()) === json(['kb', 'kb-article']), json(await screens()))
  check('…to the next article', (await page.locator('h1').last().textContent())?.includes('Why are PDFs so hard to edit?'))
}

console.log('\nAndroid back: article → list → page')
await back()
check('back from the article: the list', json(await screens()) === json(['kb']), json(await screens()))
check('the list is showing', await page.locator('h1:has-text("Good to")').isVisible())
await back()
check('back from the list: the tabs', json(await screens()) === json([]), json(await screens()))
check('Tune is back', await page.getByRole('button', { name: 'How to…' }).isVisible())

console.log('\nthe search')
await page.getByRole('button', { name: 'How to…' }).click()
await page.waitForSelector('h1:has-text("Good to")')
{
  const box = page.getByRole('searchbox', { name: 'Search the guides' })
  await box.fill('password')
  await page.waitForTimeout(300)
  const rows = await page.locator('section button').allTextContents()
  check('a search narrows the list', rows.length > 0 && rows.length < 10, json(rows.length))
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.waitForTimeout(200)
  await shot('kb-search')
  await box.fill('zzqqxx')
  await page.waitForTimeout(200)
  check('nothing matching says so', (await page.getByText('No guide matches that.').count()) === 1)
  await page.getByRole('button', { name: 'Clear the search' }).click()
  check('clearing it brings them all back', (await page.locator('section button').count()) === 10)
  await back()
  check('back closes it', json(await screens()) === json([]), json(await screens()))
}

console.log('\nWhat else ▸ How to… over a document')
await mod('/src/native/jobs.ts', "void m.runJob('example')")
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)
{
  await page.getByRole('button', { name: 'What else' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'How to…' }).click()
  await page.waitForSelector('h1:has-text("Good to")')
  check('the page is over the document', json(await screens()) === json(['kb']), json(await screens()))
  const name = await mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().fileName')
  const label = (name ?? '').replace(/\.pdf$/i, '')
  check('its back link names the document', !!label && (await page.getByRole('button', { name: label }).count()) >= 1, label)
  await page.locator('section button').first().click()
  await page.waitForTimeout(400)
  await back()
  await back()
  const open = await mod('/src/stores/pdfStore.ts', 'return !!m.usePdfStore.getState().doc')
  check('back twice: the document, still open', open && json(await screens()) === json([]), json(await screens()))
}

console.log('\nthe store flag opens the page, not the dialog')
{
  await mod('/src/stores/pdfStore.ts', 'm.usePdfStore.getState().setKnowledgeBaseOpen(true)')
  await page.waitForTimeout(400)
  check('setKnowledgeBaseOpen pushes the page', json(await screens()) === json(['kb']), json(await screens()))
  check('…and no dialog', (await page.locator('[role="dialog"]').count()) === 0)
  await back()
}

// The website's toolbar (a document open) mounts the dialog on the same flag.
console.log('\nthe website keeps the SDK dialog')
{
  const web = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await keepAppModuleUrls(web)
  const p = await web.newPage()
  await p.goto(`${BASE}?app=0`, { waitUntil: 'load' })
  await p.getByText('Try with example PDF').first().click()
  await p.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await p.evaluate(async () => {
    const m = await (globalThis.__appImport ?? ((x) => import(x)))('/src/stores/pdfStore.ts')
    m.usePdfStore.getState().setKnowledgeBaseOpen(true)
  })
  await p.waitForTimeout(800)
  check('the website shows the dialog', (await p.locator('[role="dialog"][aria-modal="true"]').count()) === 1)
  await web.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
