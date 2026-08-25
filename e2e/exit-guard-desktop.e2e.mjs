// The exit guard's DESKTOP half — the window's × and the native Save dialog.
//
//   ./scripts/preview.sh            # in one terminal (Universal PDF is :5174)
//   npm run test:exit-guard:desktop # in another
//
// The web spec (exit-guard.e2e.mjs) covers the popup itself. This one covers
// the two things only Electron has, and neither can be exercised in a browser:
//
//   • the main process HOLDS the window close and asks the renderer, rather
//     than letting `beforeunload` refuse it silently (which is all Electron
//     would do with the web mechanism — no dialog, just a × that stops working);
//   • "Save and exit" writes a real file through a real Save dialog, instead of
//     dropping a download into ~/Downloads without asking where it should go.
//
// ⚠️ It drives the app against the DEV SERVER (`ELECTRON_START_URL`), not the
// packaged bundle, so the test can reach the app's own modules by URL the same
// way the web spec does. The main process is the packaged one either way — it
// is the half under test.
//
// ⚠️ The OS Save dialog is modal and cannot be clicked by a test, so it is
// replaced in the MAIN process for the duration. What is being proven is our
// side of it: that a chosen path is written, and that a cancel is not an exit.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

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

// The renderer is served by Vite, so the dev server has to be up.
try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  process.exit(2)
}

// ⚠️ ELECTRON_RUN_AS_NODE must not survive into the child: npm sets it in some
// shells and it turns the Electron binary into a plain Node, so the launch
// hangs waiting for a window that will never exist.
function launchEnv(extra) {
  const env = { ...process.env, ELECTRON_START_URL: BASE, ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

// ⚠️ Playwright resolves `electron` from ITS own install, which is a sibling
// repo's — so the binary is named explicitly out of this project's. Without it
// the launch fails with "Electron executablePath not found" even though
// `npm run electron` works perfectly.
const ELECTRON_BIN = join(
  ROOT,
  'node_modules',
  'electron',
  'dist',
  readFileSync(join(ROOT, 'node_modules', 'electron', 'path.txt'), 'utf8').trim()
)

async function launch(extra) {
  const app = await playwright._electron.launch({
    executablePath: ELECTRON_BIN,
    args: [ROOT],
    cwd: ROOT,
    env: launchEnv(extra)
  })
  // ⚠️ NOT `firstWindow()`. In dev mode the main process opens DevTools
  // detached, and that window turns up first as often as not — the failure is a
  // dynamic import resolving against `devtools://devtools/`, which reads as a
  // bundler problem and is nothing of the sort.
  let win = null
  for (let i = 0; i < 100 && !win; i++) {
    win = app.windows().find((w) => w.url().startsWith('http')) ?? null
    if (!win) await new Promise((r) => setTimeout(r, 200))
  }
  if (!win) throw new Error('The app window never appeared.')
  await win.waitForLoadState('domcontentloaded')
  return { app, win }
}

async function openExample(win) {
  await win.evaluate(async () => {
    const { createExamplePdfFile } = await import('/src/lib/examplePdf.ts')
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    await usePdfStore.getState().loadFile(await createExamplePdfFile())
  })
  await win.waitForSelector('canvas', { timeout: 30000 })
}

async function amend(win) {
  await win.evaluate(async () => {
    const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
    useAnnotationStore.getState().add({
      id: 'e2e-desktop-rect',
      pageIndex: 0,
      type: 'rect',
      x: 60,
      y: 60,
      width: 180,
      height: 90,
      color: '#dc2626'
    })
  })
  // The flag reaches the main process through a store subscription, so give
  // that one turn of the loop before asking the window to close.
  await win.waitForTimeout(300)
}

/** Ask the window to close the way the × does. */
function clickWindowClose(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('http'))
    if (win) win.close()
  })
}

// Counts the APP's windows only — a detached DevTools window is a
// BrowserWindow too, and counting it would make "the window is still open"
// true whatever happened to the one under test.
function windowStillThere(app) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().startsWith('http')).length
  )
}

const dialogTitle = 'Save your changes?'

// ── 1. an untouched document does not hold the window ──────────────────────
console.log('\nUntouched document')
{
  const { app, win } = await launch()
  await openExample(win)
  const closed = new Promise((resolve) => app.on('close', () => resolve(true)))
  await clickWindowClose(app)
  const wentAway = await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 5000))])
  check('the window closes straight away', wentAway === true)
  if (wentAway !== true) await app.close().catch(() => {})
}

// ── 2. an amended document holds it, and asks ──────────────────────────────
console.log('\nAmended document')
{
  const { app, win } = await launch()
  await openExample(win)
  await amend(win)
  await clickWindowClose(app)
  await win.waitForTimeout(600)
  check('the window is still open', (await windowStillThere(app)) === 1)
  const popup = win.getByRole('dialog', { name: dialogTitle })
  check('the popup asks', await popup.isVisible().catch(() => false))
  check('it says the window is what is closing', (await popup.innerText()).includes('shuts Universal PDF down'))

  // Cancel means stay — including on the second attempt, which must ask again
  // rather than let the window through on a stale answer.
  await popup.getByRole('button', { name: 'Cancel' }).click()
  await win.waitForTimeout(200)
  check('cancel keeps the window', (await windowStillThere(app)) === 1)
  await clickWindowClose(app)
  await win.waitForTimeout(600)
  check('asks again on the next attempt', await popup.isVisible().catch(() => false))

  // Exit without saving lets it through.
  const closed = new Promise((resolve) => app.on('close', () => resolve(true)))
  await win.getByRole('button', { name: 'Exit without saving' }).click()
  const wentAway = await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 8000))])
  check('exit without saving closes the window', wentAway === true)
  if (wentAway !== true) await app.close().catch(() => {})
}

// ── 3. Save and exit writes a real file where the Save dialog said ─────────
console.log('\nSave and exit')
const outDir = mkdtempSync(join(tmpdir(), 'unipdf-exit-'))
const outPath = join(outDir, 'saved-on-exit.pdf')
{
  const { app, win } = await launch()
  await openExample(win)
  await amend(win)

  // First: a cancelled Save dialog is not an exit.
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined })
  })
  await clickWindowClose(app)
  await win.waitForTimeout(600)
  await win.getByRole('button', { name: /Save and exit/ }).click()
  await win.waitForTimeout(1500)
  check('a cancelled save leaves the window open', (await windowStillThere(app)) === 1)
  check('and leaves the popup up', await win.getByRole('dialog', { name: dialogTitle }).isVisible().catch(() => false))

  // Then: a real path is written, and the window goes.
  await app.evaluate(async ({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, outPath)
  const closed = new Promise((resolve) => app.on('close', () => resolve(true)))
  await win.getByRole('button', { name: /Save and exit/ }).click()
  const wentAway = await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 20000))])
  check('the window closes after saving', wentAway === true)
  if (wentAway !== true) await app.close().catch(() => {})
}

check('the file is on disk', existsSync(outPath))
if (existsSync(outPath)) {
  const bytes = readFileSync(outPath)
  check('it is a PDF', bytes.subarray(0, 5).toString() === '%PDF-', bytes.subarray(0, 8).toString())
  check('with the document in it', bytes.length > 5000, `${bytes.length} bytes`)
}
rmSync(outDir, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nAll desktop exit-guard checks passed.')
