// The phone app stands on its own (the mobile-first pass, 2026-11-27).
//
//   ./scripts/preview.sh            # or preview.ps1 — Universal PDF is :5174
//   node e2e/phone-standalone.e2e.mjs
//
// What the App Store's 4.3 / 4.2.6 rejection was about, pinned on the phone
// screens (`?app`):
//
//   • About is a page with a back link, not the website's dialog, and none of
//     its links goes to a unisim.co.uk site.
//   • The only links to a UNI·SIM site anywhere on the tabs are the two in
//     the credit on Tune.
//   • A guide in the knowledge base offers no hosted copy from
//     opensource.unisim.co.uk; its sources keep their publishers' links.
//   • A new QR code starts with an empty link box, not the suite's address.
//   • In German the desk's headline, the stamps on the four moments and the
//     hint under the signature line all stay inside their boxes.

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

async function open(language) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: engine !== 'firefox' })
  await keepAppModuleUrls(context)
  await context.addInitScript((l) => {
    try { localStorage.setItem('universal:language', l) } catch { /* no storage */ }
  }, language)
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  page.on('dialog', async (d) => {
    failures.push(`a browser ${d.type()} box: ${d.message()}`)
    await d.dismiss()
  })
  try {
    await page.goto(`${BASE}?app`, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.waitForSelector('.np', { timeout: 30000 })
  await page.waitForTimeout(800)
  const mod = (path, src, arg) =>
    page.evaluate(
      async ({ path, src, arg }) => {
        const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
        // eslint-disable-next-line no-new-func
        return new Function('m', 'arg', src)(m, arg)
      },
      { path, src, arg },
    )
  const nav = (src) => mod('/src/native/nav.ts', `const n = m.useNav.getState(); ${src}`)
  const suiteLinks = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.np a[href]')]
        .filter((a) => a.getBoundingClientRect().width > 0)
        .map((a) => a.href)
        .filter((h) => /(^|\.)unisim\.co\.uk$/.test(new URL(h).hostname)),
    )
  return { page, context, mod, nav, suiteLinks }
}

// ── English ────────────────────────────────────────────────────────────────
{
  const { page, context, mod, nav, suiteLinks } = await open('en-gb')

  console.log('\nAbout is a page of the phone’s own')
  await page.getByRole('button', { name: 'Tune', exact: true }).click()
  await page.getByRole('button', { name: 'About', exact: true }).click()
  await page.waitForTimeout(500)
  check('no website dialog opens', (await page.locator('[role="dialog"]').count()) === 0)
  check('it is on the page stack', (await nav('return n.screens')).includes('about'))
  check('it says what the licence really is', (await page.getByText(/AGPL-3\.0/).count()) >= 1)
  check('it lists what the app is built with', (await page.getByText('PDF.js', { exact: true }).count()) === 1)
  const opened = await page.evaluate(() => {
    const seen = []
    const real = window.open
    window.open = (url) => {
      seen.push(String(url))
      return null
    }
    for (const b of document.querySelectorAll('.np-page-enter button')) b.click()
    window.open = real
    return seen
  })
  // The back link is one of those buttons, so the page may have gone: only the links matter.
  check('its rows open this app’s own repository', opened.length >= 4 && opened.every((u) => u.startsWith('https://github.com/universal-simulation-ltd/Universal_PDF')), json(opened))
  await nav('n.clearScreens(); n.push("about")')
  await page.waitForTimeout(300)
  await page.locator('.np-page-enter').getByRole('button', { name: 'Tune', exact: true }).click()
  await page.waitForTimeout(400)
  check('the back link goes back to Tune', !(await nav('return n.screens')).includes('about'))

  console.log('\nthe credit is the only pointer to a UNI·SIM site')
  const onTune = await suiteLinks()
  check('Tune links to unisim.co.uk once', onTune.length === 1 && onTune[0] === 'https://www.unisim.co.uk/', json(onTune))
  for (const tab of ['desk', 'signatures']) {
    await nav(`n.setTab('${tab}')`)
    await page.waitForTimeout(300)
    check(`none on ${tab}`, (await suiteLinks()).length === 0)
  }

  console.log('\na guide offers no hosted copy')
  await nav(`n.setTab('tune'); n.push('kb'); n.readArticle('signing-a-pdf')`)
  await page.waitForTimeout(900)
  const guideLinks = await page.evaluate(() => [...document.querySelectorAll('[data-edge-page] a[href]')].map((a) => a.href))
  check('the guide has sources', guideLinks.length >= 3, json(guideLinks))
  check('…and none is on a UNI·SIM site', guideLinks.every((h) => !/unisim\.co\.uk/.test(h)), json(guideLinks))

  console.log('\na new QR code starts empty')
  await nav('n.clearScreens(); n.setTab("desk")')
  await page.getByText('Try with example PDF').click()
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(800)
  await nav(`n.push('qr')`)
  await page.waitForTimeout(500)
  check('the link box is empty', (await page.getByLabel('Where it takes them').inputValue()) === '')
  check('…and there is nothing to put on the page yet', await page.getByRole('button', { name: 'Put it on the page' }).isDisabled())
  void mod
  await context.close()
}

// ── German: the long words fit ─────────────────────────────────────────────
{
  const { page, context, nav } = await open('de')

  console.log('\nGerman fits')
  const head = await page.evaluate(() => {
    const h = document.querySelector('.np h1')
    const hl = h?.querySelector('.np-hl')
    return h && hl ? { right: hl.getBoundingClientRect().right, width: window.innerWidth, size: getComputedStyle(h).fontSize } : null
  })
  check('the desk headline ends on screen', !!head && head.right <= head.width - 8, json(head))

  await page.locator('.np-jobs button').nth(2).click()
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(800)
  for (const moment of ['signed', 'smaller', 'blacked', 'sent']) {
    await nav(`n.clearScreens(); n.push('${moment}')`)
    await page.waitForTimeout(moment === 'smaller' ? 3500 : 700)
    const stamps = await page.evaluate(() =>
      [...document.querySelectorAll('.np [data-paper] .np-tilt, .np .np-tilt')]
        .filter((el) => /double/.test(el.style.border))
        .map((el) => {
          const word = el.querySelector('span span') ?? el
          const paper = el.parentElement.getBoundingClientRect()
          return { text: word.textContent, over: word.scrollWidth - word.clientWidth, width: el.offsetWidth, paper: Math.round(paper.width) }
        }),
    )
    check(`${moment}: there is a stamp`, stamps.length >= 1, json(stamps))
    check(`${moment}: its word is not cut off`, stamps.every((s) => s.over <= 1), json(stamps))
    check(`${moment}: it is no wider than its page allows`, stamps.every((s) => s.width <= s.paper + 34), json(stamps))
  }

  await nav(`n.clearScreens(); n.push('sign')`)
  await page.waitForTimeout(600)
  const hint = await page.evaluate(() => {
    const pad = document.querySelector('.np canvas[aria-label]')?.parentElement
    const el = pad?.querySelector('.np-hand span')
    return pad && el ? { right: el.getBoundingClientRect().right, pad: pad.getBoundingClientRect().right } : null
  })
  check('the hint under the signature line stays on the pad', !!hint && hint.right <= hint.pad, json(hint))
  await context.close()
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\nphone standalone: all checks passed')
