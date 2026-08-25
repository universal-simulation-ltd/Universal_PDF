// Hub handoff — desktop-shell regression check.
//
//   ./scripts/preview.ps1     # or preview.sh — Universal PDF is :5174
//   npm run test:handoff      # in another terminal
//
// Signing in on desktop uses the SDK's in-app dialog, so the session lives in
// this app and NOWHERE else. Every hub link is handed to the system browser by
// electron/main.cjs, and that browser has never seen the session — which is
// how "View profile" delivered a signed-in user to a signed-out page. The fix
// (`installHubHandoff` from @unisim/sdk/electron, wired up in main.cjs) opens
// hub pages in a window this app owns, with the session planted as the cookie
// the SDK's own storage adapter reads.
//
// What this pins down is the plumbing, not the hub's reaction to it: the
// bridge is exposed, a suite URL opens in-app, the cookie lands on
// .unisim.co.uk in the shape the SDK writes, a NON-suite URL is refused both
// the window and the cookie, and sign-out clears it. Whether the hub then
// renders as the signed-in user needs real credentials and a human.
//
// Playwright is borrowed from a sibling repo, exactly as office-import.e2e.mjs
// does — this repo has no test runner of its own.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
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
      // Imports fine, wrong browser revision on this machine — try the next.
    }
  }
  console.error(
    'No usable Playwright found. Install it in a sibling Universal app, or run:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  )
  process.exit(2)
}

// ⚠️ Playwright's `firstWindow()` can hand back the DETACHED DEVTOOLS window —
// the dev build opens one, and whichever appears first wins the race. It has no
// preload, so the bridge looks missing and every check below fails for a reason
// that has nothing to do with the bridge.
async function appWindow(app) {
  for (let i = 0; i < 40; i++) {
    for (const w of app.windows()) {
      if (w.url().startsWith(BASE)) return w
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('the app window never appeared')
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

const playwright = await loadPlaywright()

// ⚠️ Electron runs main.cjs as PLAIN NODE when ELECTRON_RUN_AS_NODE is set —
// no window, no preload, exit 0. Some shells (including Claude Code's) export
// it, and the app then looks broken for a reason that is not in the app.
const env = { ...process.env, ELECTRON_START_URL: BASE }
delete env.ELECTRON_RUN_AS_NODE

const app = await playwright._electron.launch({
  args: [REPO],
  cwd: REPO,
  env,
  executablePath: require('electron'),
})

let page
try {
  page = await appWindow(app)
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.ps1).`)
  await app.close()
  process.exit(2)
}
await page.waitForTimeout(1500)

const bridge = await page.evaluate(() => ({
  open: typeof window.unisimDesktop?.openHub === 'function',
  clear: typeof window.unisimDesktop?.clearHub === 'function',
}))
check('preload exposes window.unisimDesktop.openHub', bridge.open)
check('preload exposes clearHub', bridge.clear)

// Stands in for a real session: the handoff copies the persisted string
// verbatim and never looks inside it, so any string exercises the same path.
const FAKE = JSON.stringify({ access_token: 'fake', refresh_token: 'fake', user: { id: 'test' } })

const opened = await page.evaluate(
  (s) => window.unisimDesktop.openHub('https://app.unisim.co.uk/profile', s),
  FAKE,
)
check('a hub URL opens in-app rather than in the browser',
  opened?.ok === true && !opened.external, JSON.stringify(opened))

const cookies = await app.evaluate(async ({ session }) =>
  session.defaultSession.cookies.get({ name: 'universal-suite-auth' }))
check('the session cookie was installed', cookies.length > 0)
const cookie = cookies[0]
if (cookie) {
  check('cookie is scoped to the suite zone', cookie.domain === '.unisim.co.uk', cookie.domain)
  check('cookie covers the whole site', cookie.path === '/', cookie.path)
  check('cookie is Secure', cookie.secure === true)
  // The SDK's cookie storage percent-decodes what it reads, so this is the
  // assertion that the hub gets back exactly what the app persisted.
  check('the value round-trips through the SDK cookie format',
    decodeURIComponent(cookie.value) === FAKE, decodeURIComponent(cookie.value).slice(0, 40))
}

const urls = await app.evaluate(async ({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()))
check('a hub window opened inside the app',
  urls.some((u) => u.startsWith('https://app.unisim.co.uk')), JSON.stringify(urls))

// The guard that stops a compromised renderer asking us to plant the session
// on someone else's origin.
const outside = await page.evaluate((s) => window.unisimDesktop.openHub('https://example.com/', s), FAKE)
check('a non-suite URL is refused the in-app window', outside?.external === true, JSON.stringify(outside))
const strays = await app.evaluate(async ({ session }) =>
  session.defaultSession.cookies.get({ domain: 'example.com' }))
check('no cookie was planted on a non-suite origin', strays.length === 0)

await page.evaluate(() => window.unisimDesktop.clearHub())
const after = await app.evaluate(async ({ session }) =>
  session.defaultSession.cookies.get({ name: 'universal-suite-auth' }))
check('sign-out clears the handed-over session', after.length === 0, JSON.stringify(after))

await app.close()
console.log(failures.length ? `\n${failures.length} FAILED` : '\nAll hub-handoff checks passed.')
process.exit(failures.length ? 1 : 0)
