// The browser extension, driven in a real Chromium with the unpacked build
// loaded. Every claim it makes is about behaviour that exists nowhere but in a
// browser, so there is no other way to check any of it.
//
//   npm run build:extension   # first — the spec drives extension/dist
//   npm run test:extension
//
// No dev server needed: the extension carries its own copy of the app, and the
// spec starts its own web server (`pdf-host.mjs`) to serve the documents.
//
// ── ⚠️ THE ONE THING NO TEST CAN DO, AND HOW THIS SPEC WORKS AROUND IT ───────
//
// `chrome.permissions.request` raises a permission bubble in the browser's own
// chrome. Nothing can answer it: not Playwright (which only reaches the page),
// not headless (where the promise simply never settles), not headed, and there
// is no Chromium switch to auto-accept it. Measured, all four, 2026-08-31.
//
// Everything this extension does downstream is gated on that grant, so the spec
// runs TWO browsers:
//
//   Part 1 loads the REAL `extension/dist` and proves the negatives — that a
//     fresh install holds nothing, cannot read a page, and cannot redirect one
//     even with a rule installed. Those are the claims that matter most, and
//     they are made against the exact artifact that ships.
//
//   Part 2 loads a COPY of that build with one key added to the manifest,
//     `host_permissions`, standing in for the grant a click would produce.
//     The spec asserts mechanically that the copy differs by that key alone.
//     Everything after the grant — reading the tab, the handoff, the viewer,
//     the redirect, persistence — is the shipped code, unmodified.
//
// So what is left unverified here is Chrome's own bubble, not our logic.
// The manual check that closes it is in extension/README.md.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startPdfHost } from './pdf-host.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXT = join(HERE, '..', 'extension', 'dist')

// Same borrowed-Playwright arrangement as the other specs in here, and for the
// same reason: this repo carries no test runner of its own. See the long note
// in office-import.e2e.mjs about why a candidate is LAUNCHED, not just imported.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
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
      // ⚠️ `channel: 'chromium'`, not the default. Playwright's default headless
      // build is the headless SHELL, which has no extension support at all:
      // `--load-extension` is accepted and silently does nothing, so every
      // assertion below would fail with no service worker and no explanation.
      const probe = await mod.chromium.launch({ channel: 'chromium' })
      await probe.close()
      return mod
    } catch (err) {
      problems.push(`  ${rel}\n    ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found. Candidates that imported but could not launch:\n' +
      (problems.join('\n') || '  (none imported at all)')
  )
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('extension/dist is not built. Run:  npm run build:extension')
  process.exit(2)
}

const playwright = await loadPlaywright()
const host = await startPdfHost()
const profiles = []

/** A browser with `extensionPath` loaded, on a throwaway profile. */
async function launch(extensionPath, userDataDir) {
  const dir = userDataDir ?? mkdtempSync(join(tmpdir(), 'unipdf-ext-'))
  if (!userDataDir) profiles.push(dir)
  const context = await playwright.chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20000 }))
  return { context, worker, id: new URL(worker.url()).host, dir }
}

let browser = null

// ⚠️ Messages cannot be sent from the service worker to itself — Chrome
// excludes the sender and `chrome.runtime.sendMessage` fails with "Receiving
// end does not exist", which reads exactly like a worker that failed to start.
// So the spec keeps one extension PAGE open and speaks from there, as the popup
// does.
let driver = null
async function ask(message) {
  if (!driver || driver.isClosed()) {
    driver = await browser.context.newPage()
    await driver.goto(`chrome-extension://${browser.id}/popup.html`)
  }
  return driver.evaluate((msg) => chrome.runtime.sendMessage(msg), message)
}

/**
 * The tab id Chrome knows `page` by.
 *
 * ⚠️ NOT by matching URLs. `chrome.tabs.query` redacts `url` for every tab the
 * extension has no permission for, which on a fresh profile is all of them — the
 * whole list comes back as bare ids. Bringing the page to the front and asking
 * which tab is active is the only identification available before a grant, and
 * it resolves to the same tab a real toolbar click would.
 */
async function tabIdOf(page) {
  await page.bringToFront()
  const [id] = await browser.worker.evaluate(() =>
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((t) => t.map((x) => x.id))
  )
  return id
}

/** Open the popup for `tab` as an ordinary page — see the header note. */
async function openPopupFor(tabId) {
  const popup = await browser.context.newPage()
  await popup.goto(`chrome-extension://${browser.id}/popup.html?tab=${tabId}`)
  return popup
}

const RENAME = 'button[title="Click to rename"]'

/** True once the app has a document open — that button only exists then. */
async function documentIsOpen(page) {
  return page
    .waitForSelector(RENAME, { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
}

const openedName = async (page) => (await page.locator(RENAME).innerText()).split('\n')[0].trim()

/** Put a redirect rule in place directly, with no popup and no grant. */
const installRuleDirectly = (worker, origin, viewerBase) =>
  worker.evaluate(
    async ({ origin, viewer }) => {
      const rule = {
        id: 99,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: `${viewer}?launching=1&file=\\0` } },
        condition: {
          regexFilter: `^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
          resourceTypes: ['main_frame'],
          responseHeaders: [{ header: 'content-type', values: ['application/pdf*'] }]
        }
      }
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [99], addRules: [rule] })
        return { accepted: true }
      } catch (err) {
        return { accepted: false, error: String(err) }
      }
    },
    { origin, viewer: viewerBase }
  )

try {
  // ===========================================================================
  console.log('\n── the build that ships ────────────────────────────────────')
  // ===========================================================================
  browser = await launch(EXT)

  const granted = await browser.worker.evaluate(() => chrome.permissions.getAll())
  check('no host permissions at install', (granted.origins ?? []).length === 0, JSON.stringify(granted.origins))
  const rules = await browser.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())
  check('no redirect rules at install', rules.length === 0, JSON.stringify(rules))

  const cold = await browser.context.newPage()
  await cold.goto(`${host.origin}/plain.pdf`).catch(() => {})
  await cold.waitForTimeout(800)
  const coldTab = await tabIdOf(cold)
  const refused = await ask({ cmd: 'openTab', tabId: coldTab })
  check('and it will not open a page it was not invited to', refused?.ok === false, JSON.stringify(refused))
  // ⚠️ The reason above is `notab`, not `inject`, and that is worth knowing:
  // with no grant Chrome redacts even the tab's URL, so the extension fails
  // before it gets as far as trying to read anything. Assert the refusal that
  // actually matters directly, so this cannot pass for the wrong reason.
  const injection = await browser.worker.evaluate(async (tabId) => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => 1 })
      return 'ALLOWED'
    } catch (err) {
      return String(err)
    }
  }, coldTab)
  check('Chrome refuses the injection outright', /must request permission/i.test(injection), injection)

  // The rule the "always" switch installs, put in place by hand. This browser
  // accepting it is what proves the content-type condition is available at all
  // (Chrome 128+); it then NOT redirecting is what proves the feature is inert
  // until the user has granted the site.
  const ruleResult = await installRuleDirectly(
    browser.worker,
    host.origin,
    `chrome-extension://${browser.id}/viewer/index.html`
  )
  check('a rule matching on the response content type is accepted', ruleResult.accepted, ruleResult.error)
  await cold.goto(`${host.origin}/plain.pdf`, { waitUntil: 'commit' }).catch(() => {})
  await cold.waitForTimeout(800)
  check('but with no grant behind it, it redirects nothing', cold.url() === `${host.origin}/plain.pdf`, cold.url())

  await browser.context.close()
  driver = null

  // ===========================================================================
  console.log('\n── the same build, with the grant a click would give it ────')
  // ===========================================================================
  const copy = mkdtempSync(join(tmpdir(), 'unipdf-ext-granted-'))
  cpSync(EXT, copy, { recursive: true })
  const shipped = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'))
  const stood_in = { ...shipped, host_permissions: ['http://127.0.0.1/*'] }
  writeFileSync(join(copy, 'manifest.json'), JSON.stringify(stood_in, null, 2))
  const added = Object.keys(stood_in).filter((k) => JSON.stringify(stood_in[k]) !== JSON.stringify(shipped[k]))
  check(
    'the stand-in differs from the shipped manifest by host_permissions and nothing else',
    added.length === 1 && added[0] === 'host_permissions',
    added.join(', ')
  )

  browser = await launch(copy)

  // ---------------------------------------------------------------------------
  console.log('\none click on a plain PDF link')
  // ---------------------------------------------------------------------------
  const before = host.gets('/plain.pdf')
  const linkPage = await browser.context.newPage()
  await linkPage.goto(`${host.origin}/`)
  await linkPage.click('#plain')
  await linkPage.waitForTimeout(1200)
  check('the browser opens it in its own viewer first', linkPage.url() === `${host.origin}/plain.pdf`, linkPage.url())

  const popup = await openPopupFor(await tabIdOf(linkPage))
  await popup.locator('#open').click()
  await linkPage.waitForURL(/chrome-extension:\/\/.*\/viewer\//, { timeout: 15000 }).catch(() => {})
  check('one click moves it into our viewer', linkPage.url().includes('/viewer/index.html'), linkPage.url())
  check('the document opened', await documentIsOpen(linkPage))
  check('named from its address', (await openedName(linkPage)) === 'plain.pdf', await openedName(linkPage))
  // The whole reason the click path reads the document out of the TAB rather
  // than fetching the URL again.
  check(
    'and it cost the site NO extra request',
    host.gets('/plain.pdf') - before === 1,
    `${host.gets('/plain.pdf') - before} GETs`
  )
  await popup.close()
  await linkPage.close()

  // ---------------------------------------------------------------------------
  console.log('\na PDF at an address with no .pdf on the end')
  // ---------------------------------------------------------------------------
  const extless = await browser.context.newPage()
  await extless.goto(`${host.origin}/download`).catch(() => {})
  await extless.waitForTimeout(800)
  const extlessPopup = await openPopupFor(await tabIdOf(extless))
  await extlessPopup.locator('#open').click()
  await extless.waitForURL(/chrome-extension:\/\/.*\/viewer\//, { timeout: 15000 }).catch(() => {})
  check('it opens just the same', await documentIsOpen(extless), extless.url())
  check(
    'named from Content-Disposition, not from the URL',
    (await openedName(extless)) === 'Quarterly report.pdf',
    await openedName(extless)
  )
  await extlessPopup.close()
  await extless.close()

  // ---------------------------------------------------------------------------
  console.log('\na PDF behind a login')
  // ---------------------------------------------------------------------------
  const auth = await browser.context.newPage()
  await auth.goto(`${host.origin}/login`)
  await auth.goto(`${host.origin}/private.pdf`).catch(() => {})
  await auth.waitForTimeout(800)
  const privateBefore = host.gets('/private.pdf')
  const authPopup = await openPopupFor(await tabIdOf(auth))
  await authPopup.locator('#open').click()
  await auth.waitForURL(/chrome-extension:\/\/.*\/viewer\//, { timeout: 15000 }).catch(() => {})
  check('a session-protected PDF opens', await documentIsOpen(auth), auth.url())
  check(
    'without asking the server again at all',
    host.gets('/private.pdf') - privateBefore === 0,
    `${host.gets('/private.pdf') - privateBefore} GETs`
  )
  await authPopup.close()
  await auth.close()

  // ---------------------------------------------------------------------------
  console.log('\nthe one document shape this cannot open')
  // ---------------------------------------------------------------------------
  // A single-use link served `no-store`: the browser has painted it and the
  // bytes are in no cache, so reading it back is a second GET the token will not
  // answer. The assertion is not that it fails — it is that it fails
  // ATTRIBUTABLY. The tab stays where it was and the popup says what happened.
  const once = await browser.context.newPage()
  await once.goto(`${host.origin}/onetime.pdf?t=abc`).catch(() => {})
  await once.waitForTimeout(800)
  const oncePopup = await openPopupFor(await tabIdOf(once))
  await oncePopup.locator('#open').click()
  await oncePopup.waitForTimeout(2500)
  check('the tab is left exactly where it was', once.url() === `${host.origin}/onetime.pdf?t=abc`, once.url())
  const status = await oncePopup.locator('#status').innerText()
  check('and the reason is spelled out, with the status code', /one-time or expiring link/.test(status) && /403/.test(status), status)
  await oncePopup.close()
  await once.close()

  // ---------------------------------------------------------------------------
  console.log('\n"always use Universal PDF on this site"')
  // ---------------------------------------------------------------------------
  // Added through a real click on the real control. `permissions.request`
  // resolves straight away here because the stand-in manifest already holds the
  // host — which is the entire substitution this spec is making.
  const options = await browser.context.newPage()
  await options.goto(`chrome-extension://${browser.id}/options.html`)
  await options.fill('#site', host.origin)
  await options.click('button.add')
  await options.waitForTimeout(1500)
  check('the site is listed as managed', (await options.locator('#sites code').allInnerTexts()).includes(host.origin), await options.locator('#sites').innerText())
  check(
    'added with no ".pdf addresses only" caveat, so it matches by content type',
    (await options.locator('#status').innerText()) === `${host.origin} added.`,
    await options.locator('#status').innerText()
  )
  const dnr = await browser.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())
  check(
    'exactly one rule, scoped to this origin',
    dnr.length === 1 && dnr[0].condition.regexFilter.includes(String(host.port)),
    JSON.stringify(dnr)
  )

  const redirected = await browser.context.newPage()
  await redirected.goto(`${host.origin}/plain.pdf`, { waitUntil: 'commit' }).catch(() => {})
  await redirected.waitForTimeout(600)
  check('a PDF on that site now lands in our viewer without being asked', redirected.url().startsWith(`chrome-extension://${browser.id}/viewer/`), redirected.url())
  check('and the document opens', await documentIsOpen(redirected), redirected.url())
  await redirected.close()

  // A second origin proves the scoping is real rather than a rule that happens
  // to match everything.
  const other = await startPdfHost()
  const elsewhere = await browser.context.newPage()
  await elsewhere.goto(`${other.origin}/plain.pdf`).catch(() => {})
  await elsewhere.waitForTimeout(600)
  check('a PDF on any other site is left alone', elsewhere.url() === `${other.origin}/plain.pdf`, elsewhere.url())
  await elsewhere.close()
  await other.close()

  // ---------------------------------------------------------------------------
  console.log('\nand it is still there after a restart')
  // ---------------------------------------------------------------------------
  const profile = browser.dir
  await browser.context.close()
  driver = null
  browser = await launch(copy, profile)
  const afterRestart = await browser.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())
  check('the rule survived the browser closing', afterRestart.length === 1, JSON.stringify(afterRestart))
  const reopened = await browser.context.newPage()
  await reopened.goto(`${host.origin}/plain.pdf`, { waitUntil: 'commit' }).catch(() => {})
  await reopened.waitForTimeout(600)
  check('and it still redirects', reopened.url().startsWith(`chrome-extension://${browser.id}/viewer/`), reopened.url())
  await reopened.close()

  // ---------------------------------------------------------------------------
  console.log('\nand it can be taken back')
  // ---------------------------------------------------------------------------
  const manage = await browser.context.newPage()
  await manage.goto(`chrome-extension://${browser.id}/options.html`)
  await manage.locator('button.remove').first().click()
  await manage.waitForTimeout(1000)
  check('the site is off the list', (await manage.locator('#sites').innerText()).includes('No sites yet'), await manage.locator('#sites').innerText())
  const gone = await browser.context.newPage()
  await gone.goto(`${host.origin}/plain.pdf`, { waitUntil: 'commit' }).catch(() => {})
  await gone.waitForTimeout(600)
  check('and PDFs there open in the browser again', gone.url() === `${host.origin}/plain.pdf`, gone.url())
  await gone.close()
  await manage.close()

  rmSync(copy, { recursive: true, force: true })
} finally {
  if (browser) await browser.context.close().catch(() => {})
  await host.close()
  for (const dir of profiles) rmSync(dir, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
