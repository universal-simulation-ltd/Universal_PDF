// Double-clicking a PDF when Universal PDF is ALREADY RUNNING.
//
//   ./scripts/preview.sh          # in one terminal (Universal PDF is :5174)
//   npm run test:os-open:desktop  # in another
//
// ⚠️ The bug this exists to stop coming back: macOS keeps an app alive after
// its last window closes, so "running, with no window" is the ordinary state of
// a Universal PDF that has been used once already. In that state the OS hands
// the document over as an `open-file` event — and the old handler only parked
// it in `pendingPdfPath`. Nothing appeared. The app was frontmost, its menu bar
// said "Universal PDF", and the document surfaced only when the user clicked
// the Dock icon, because `activate` happened to build the window that flushed
// it. It read as "the app won't open my PDF"; it was really "nobody made a
// window".
//
// ⚠️ The OS half — Finder actually sending `open-file` — is not simulated here
// (Launch Services cannot be driven from a test). The event is emitted onto
// `app` directly, which is exactly where Electron delivers it, so what is under
// test is our handler: does a document arriving with no window build one.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const FIXTURE = join(HERE, 'fixtures', 'sample.pdf')

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = await import(pathToFileURL(join(HERE, rel)).href)
      if (mod.default?._electron) return mod.default
    } catch {
      continue
    }
  }
  console.error('No usable Playwright found — see e2e/office-import.e2e.mjs for the candidate list.')
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

const playwright = await loadPlaywright()

try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  process.exit(2)
}

// ⚠️ ELECTRON_RUN_AS_NODE must not survive into the child — see
// exit-guard-desktop.e2e.mjs, where the same trap is spelled out.
const env = { ...process.env, ELECTRON_START_URL: BASE }
delete env.ELECTRON_RUN_AS_NODE

const ELECTRON_BIN = join(
  ROOT,
  'node_modules',
  'electron',
  'dist',
  readFileSync(join(ROOT, 'node_modules', 'electron', 'path.txt'), 'utf8').trim()
)

// ⚠️ NOT `firstWindow()`: dev mode opens DevTools detached and that window turns
// up first as often as not.
async function appWindow(app, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const win = app.windows().find((w) => w.url().startsWith('http'))
    if (win) {
      await win.waitForLoadState('domcontentloaded')
      return win
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

const app = await playwright._electron.launch({
  executablePath: ELECTRON_BIN,
  args: [ROOT],
  cwd: ROOT,
  env
})

// The main process's own view of things. `mainWindow` is what the open-file
// handler branches on, and it is deliberately NOT `getAllWindows().length` —
// in dev the detached DevTools window is in that list and would mask an
// app with no window of its own.
const mainWindowExists = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && !w.getURL().startsWith('devtools:')
    )
  )

try {
  console.log('A first window opens on launch')
  const first = await appWindow(app)
  check('the app opens a window at all', !!first)

  console.log('\nThe last window is closed — the app stays running, as macOS does')
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.getURL().startsWith('devtools:')) w.close()
    }
  })
  for (let i = 0; i < 50 && (await mainWindowExists()); i++) {
    await new Promise((r) => setTimeout(r, 200))
  }
  check('no app window is left', !(await mainWindowExists()))

  console.log('\nThe OS hands over a PDF while no window exists')
  await app.evaluate(({ app: electronApp }, filePath) => {
    // Exactly the shape Electron delivers: a preventable event and a path.
    electronApp.emit('open-file', { preventDefault() {} }, filePath)
  }, FIXTURE)

  const reopened = await appWindow(app, { timeout: 30000 })
  check('a window is built for the incoming document', !!reopened, 'nothing appeared')

  if (reopened) {
    // Not merely constructed — actually on screen. The window is created with
    // `show: false` and revealed on `ready-to-show`, so "exists" and "visible"
    // are genuinely different claims and only the second one is the bug.
    let visible = false
    for (let i = 0; i < 100 && !visible; i++) {
      visible = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => !w.getURL().startsWith('devtools:') && w.isVisible())
      )
      if (!visible) await new Promise((r) => setTimeout(r, 200))
    }
    check('and it is shown, not left hidden behind a Dock click', visible)

    let named = null
    for (let i = 0; i < 150 && !named; i++) {
      named = await reopened.evaluate(async () => {
        const { usePdfStore } = await import('/src/stores/pdfStore.ts')
        return usePdfStore.getState().fileName
      })
      if (!named) await new Promise((r) => setTimeout(r, 200))
    }
    check('the handed-over PDF is the document it loads', named === 'sample.pdf', `loaded ${named}`)
  }
} finally {
  await app.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
