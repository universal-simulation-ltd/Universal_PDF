// "Sign in with your browser" — desktop-shell check (SDK 0.221.0).
//
//   npm run build:desktop        # the test loads dist/ (no dev server)
//   npm run test:browser-sign-in
//
// The desktop app can't see the browser's UNI·SIM session, so its sign-in
// dialog opens the hub's /desktop-sign-in page in the SYSTEM browser instead
// (`installBrowserSignIn` from @unisim/sdk/electron, wired in main.cjs). The
// hub sends the browser back to a loopback listener in the app with a sealed
// code; the app trades it (with a verifier only it holds) for a single-use
// token and the renderer redeems that with `verifyOtp`.
//
// What this pins down, in the real app with the real preload:
//   • Tune this app → Sign in shows the browser variant, not the form;
//   • the link it opens: the hub, app=pdf, a loopback port, state, challenge;
//   • the listener: 404 off /callback, a wrong state ignored (still waiting),
//     the browser always sent back to the hub's page with app + done;
//   • a forged code is refused by the LIVE desktop-sign-in function and the
//     dialog says so; a token GoTrue rejects is reported the same way;
//   • Cancel, and closing the dialog, both close the listener;
//   • "Sign in here instead" brings the email-code form back.
//
// The browser is never opened: `shell.openExternal` is replaced in the main
// process and the test plays the hub's part against the listener.
//
//   REAL=1 npm run test:browser-sign-in
//
// skips the checks and runs one real sign-in: it prints the hub link, you open
// it in a browser signed in to UNI·SIM and press Continue, and it waits up to
// 5 minutes for the app to come back signed in and greet you by name.
//
// Playwright is borrowed from a sibling repo, as hub-handoff.e2e.mjs does.

import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const REAL = process.env.REAL === '1'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      return (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      // next
    }
  }
  console.error('No Playwright found. Install it in a sibling Universal app, or: npm i -D playwright')
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const playwright = await loadPlaywright()
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE // see hub-handoff.e2e.mjs
delete env.ELECTRON_START_URL // the built bundle, over file://

const userData = mkdtempSync(join(tmpdir(), 'updf-signin-'))
const app = await playwright._electron.launch({
  args: [REPO, `--user-data-dir=${userData}`],
  cwd: REPO,
  env,
  executablePath: require('electron'),
})

async function appWindow() {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) if (w.url().startsWith('file://')) return w
    await sleep(250)
  }
  throw new Error('the app window never appeared')
}

const page = await appWindow()
await page.waitForLoadState('domcontentloaded')
await sleep(2500)

// Catch the browser link instead of opening a browser.
await app.evaluate(({ shell }) => {
  globalThis.__opened = []
  shell.openExternal = async (url) => { globalThis.__opened.push(url) }
})
async function nextLink(before) {
  for (let i = 0; i < 40; i++) {
    const all = await app.evaluate(() => globalThis.__opened)
    if (all.length > before) return all[all.length - 1]
    await sleep(150)
  }
  return null
}
const openedCount = () => app.evaluate(() => globalThis.__opened.length)

// Tune this app is a row in the profile menu (top right), which opens on
// hover; a click is the fallback (see about-app.e2e.mjs).
async function openSignIn() {
  const tune = page.locator('[role=menuitem]', { hasText: /Tune this app/ }).first()
  const profile = page.getByRole('button', { name: /^Profile$/ }).first()
  for (const open of [() => profile.hover(), () => profile.click()]) {
    if (await tune.isVisible().catch(() => false)) break
    await open()
    await sleep(600)
  }
  await tune.click()
  await sleep(600)
  await page.locator('[data-testid="unisim-prefs-sign-in-button"]').first().click()
  await sleep(400)
}
const dialog = () => page.locator('[role=dialog][data-signin-mode="browser"]')
const stage = () => dialog().getAttribute('data-signin-stage').catch(() => null)
async function waitStage(want) {
  for (let i = 0; i < 60; i++) {
    if ((await stage()) === want) return true
    await sleep(150)
  }
  return false
}

async function hit(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return { status: res.status, location: res.headers.get('location') }
  } catch {
    return { refused: true }
  }
}

console.log('\nBrowser sign-in')

const bridge = await page.evaluate(() => ({
  signIn: typeof window.unisimDesktop?.signInWithBrowser === 'function',
  cancel: typeof window.unisimDesktop?.cancelSignInWithBrowser === 'function',
}))
check('preload exposes signInWithBrowser', bridge.signIn)
check('preload exposes cancelSignInWithBrowser', bridge.cancel)

await openSignIn()
check('Tune → Sign in shows the browser variant', await dialog().isVisible())
check('…with one "Sign in with your browser" button',
  (await page.locator('[data-testid="signin-browser-button"]').textContent().catch(() => ''))?.includes('browser'))

if (REAL) {
  const n = await openedCount()
  await page.locator('[data-testid="signin-browser-button"]').click()
  const link = await nextLink(n)
  console.log(`\nOpen this in a browser signed in to UNI·SIM and press Continue:\n\n${link}\n`)
  let signedIn = false
  for (let i = 0; i < 600 && !signedIn; i++) {
    await sleep(500)
    signedIn = !(await dialog().isVisible().catch(() => false)) &&
      (await page.evaluate(() => !!localStorage.getItem('universal-suite-auth')))
    const err = await page.locator('[role=dialog] [role=alert]').textContent().catch(() => null)
    if (err) { console.log(`  dialog says: ${err}`); break }
  }
  check('the app came back signed in', signedIn)
  if (signedIn) {
    await sleep(2500)
    const who = await page.evaluate(() => JSON.parse(localStorage.getItem('universal-suite-auth') ?? '{}')?.user?.email ?? null)
    console.log(`  signed in as ${who}`)
    await page.screenshot({ path: join(userData, '..', 'updf-signed-in.png') })
    console.log(`  screenshot: ${join(userData, '..', 'updf-signed-in.png')}`)
  }
} else {
  // ── 1. The link, the listener, a forged code ─────────────────────────────
  let n = await openedCount()
  await page.locator('[data-testid="signin-browser-button"]').click()
  const link = await nextLink(n)
  check('the browser is sent to the hub page', link?.startsWith('https://app.unisim.co.uk/desktop-sign-in?'), link)
  const q = new URL(link ?? 'https://x/').searchParams
  const port = Number(q.get('port'))
  check('…naming this app (app=pdf)', q.get('app') === 'pdf', q.get('app'))
  check('…with a loopback port', port >= 1024 && port <= 65535, String(port))
  check('…a state', /^[A-Za-z0-9_-]{16,64}$/.test(q.get('state') ?? ''))
  check('…and a 43-character challenge, not the verifier', /^[A-Za-z0-9_-]{43}$/.test(q.get('challenge') ?? ''))
  check('the dialog waits for the browser', await waitStage('waiting'))

  const base = `http://127.0.0.1:${port}`
  check('the listener answers 404 off /callback', (await hit(`${base}/`)).status === 404)
  const wrong = await hit(`${base}/callback?code=x&state=not-the-state`)
  check('a wrong state is sent back to the hub as an error',
    wrong.status === 302 && wrong.location === 'https://app.unisim.co.uk/desktop-sign-in?app=pdf&done=error', JSON.stringify(wrong))
  await sleep(300)
  check('…and ignored: still waiting', (await stage()) === 'waiting')

  const right = await hit(`${base}/callback?code=forged-code&state=${q.get('state')}`)
  check('the right state is sent back to the hub as done',
    right.status === 302 && right.location === 'https://app.unisim.co.uk/desktop-sign-in?app=pdf&done=1', JSON.stringify(right))
  check('a forged code is refused (live desktop-sign-in) and the dialog says so',
    (await waitStage('start')) && /didn’t work/.test(await page.locator('[role=dialog] [role=alert]').textContent().catch(() => '') ?? ''))
  check('the listener is closed afterwards', (await hit(`${base}/`)).refused === true)

  // ── 2. A token GoTrue won't take ─────────────────────────────────────────
  await app.evaluate(() => {
    const real = globalThis.fetch
    globalThis.__realFetch = real
    globalThis.fetch = async (url, init) => String(url).endsWith('/functions/v1/desktop-sign-in')
      ? new Response(JSON.stringify({ ok: true, token_hash: 'not-a-real-token-hash' }), { headers: { 'content-type': 'application/json' } })
      : real(url, init)
  })
  n = await openedCount()
  await page.locator('[data-testid="signin-browser-button"]').click()
  const link2 = new URL((await nextLink(n)) ?? 'https://x/')
  await hit(`http://127.0.0.1:${link2.searchParams.get('port')}/callback?code=c&state=${link2.searchParams.get('state')}`)
  check('a token the platform rejects ends in "That didn’t work", still signed out',
    (await waitStage('start')) &&
      /didn’t work/.test(await page.locator('[role=dialog] [role=alert]').textContent().catch(() => '') ?? '') &&
      !(await page.evaluate(() => localStorage.getItem('universal-suite-auth'))))
  await app.evaluate(() => { globalThis.fetch = globalThis.__realFetch })

  // ── 3. Cancel ────────────────────────────────────────────────────────────
  n = await openedCount()
  await page.locator('[data-testid="signin-browser-button"]').click()
  const link3 = new URL((await nextLink(n)) ?? 'https://x/')
  await waitStage('waiting')
  await page.locator('[data-testid="signin-browser-cancel"]').click()
  check('Cancel goes back to the start, with no error',
    (await waitStage('start')) && !(await page.locator('[role=dialog] [role=alert]').isVisible().catch(() => false)))
  await sleep(300)
  check('…and closes the listener', (await hit(`http://127.0.0.1:${link3.searchParams.get('port')}/`)).refused === true)

  // ── 4. Closing the dialog while waiting ──────────────────────────────────
  n = await openedCount()
  await page.locator('[data-testid="signin-browser-button"]').click()
  const link4 = new URL((await nextLink(n)) ?? 'https://x/')
  await waitStage('waiting')
  await page.keyboard.press('Escape')
  await sleep(500)
  check('Escape closes the dialog', !(await dialog().isVisible().catch(() => false)))
  check('…and closes the listener', (await hit(`http://127.0.0.1:${link4.searchParams.get('port')}/`)).refused === true)

  // ── 5. Sign in here instead ──────────────────────────────────────────────
  await openSignIn()
  await page.locator('[data-testid="signin-browser-use-form"]').click()
  await sleep(400)
  check('"Sign in here instead" brings back the email form',
    await page.locator('[role=dialog] input[type=email]').first().isVisible().catch(() => false))
  await page.keyboard.press('Escape')
  await sleep(400)
  await openSignIn()
  check('…for that opening only: the next one is the browser variant again', await dialog().isVisible())
}

await app.close()
rmSync(userData, { recursive: true, force: true })
console.log(failures.length ? `\n${failures.length} FAILED` : '\nAll browser sign-in checks passed.')
process.exit(failures.length ? 1 : 0)
