// Which WINDOW a PDF opened from the OS lands in — tabs for files opened
// together, a new window for one opened on its own.
//
//   ./scripts/preview.sh           # in one terminal (Universal PDF is :5174)
//   npm run test:tabs:desktop      # in another
//
// James, 2026-09-14: "If the user ... opens multiple PDFs on Windows / Mac
// with open with... then introduce tabs ... Otherwise, if someone has a PDF
// open, and then opens a separate pdf independently it should be in a new
// window."
//
// ⚠️ Neither OS says "these files were opened together". macOS sends one
// `open-file` per file; Windows starts one process per file, each arriving here
// as `second-instance`. The main process groups them by timing (`BATCH_MS`), so
// this drives both events straight onto `app` — exactly where Electron delivers
// them — back to back for a batch, and with a pause for an independent open.
// Launch Services and Explorer themselves are not simulated.

import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Distinct names, because recents (and so a tab's saved edits) are keyed by name.
const DIR = mkdtempSync(join(tmpdir(), 'unipdf-tabs-'))
const fixture = (name, from = 'sample.pdf') => {
  const p = join(DIR, name)
  copyFileSync(join(HERE, 'fixtures', from), p)
  return p
}
const ALPHA = fixture('alpha.pdf')
const BRAVO = fixture('bravo.pdf', 'about-blank.pdf')
const CHARLIE = fixture('charlie.pdf')
const DELTA = fixture('delta.pdf', 'about-blank.pdf')
const ECHO = fixture('echo.pdf')
const FOXTROT = fixture('foxtrot.pdf', 'about-blank.pdf')

// The main process's batch window, plus margin.
const AFTER_BATCH_MS = 2200

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

// ⚠️ A profile of its own, or the test cannot run while the INSTALLED Universal
// PDF is open: both would use the same user-data folder, the installed copy
// holds the single-instance lock, and this launch would forward its argv to it
// and quit.
const PROFILE = mkdtempSync(join(tmpdir(), 'unipdf-tabs-profile-'))

const app = await playwright._electron.launch({
  executablePath: ELECTRON_BIN,
  args: [ROOT, `--user-data-dir=${PROFILE}`],
  cwd: ROOT,
  env
})

// App windows only — dev mode opens a detached DevTools window beside each.
const appWindowCount = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.getURL().startsWith('devtools:')).length
  )

// What a renderer is showing: the document in front and the tab labels.
async function stateOf(page) {
  return page
    .evaluate(async () => {
      const { usePdfStore } = await import('/src/stores/pdfStore.ts')
      const { useTabStore } = await import('/src/stores/tabStore.ts')
      const tabs = useTabStore.getState().tabs.map((t) => t.snapshot?.fileName ?? t.name)
      return { fileName: usePdfStore.getState().fileName, tabs }
    })
    .catch(() => null)
}

const appPages = () => app.windows().filter((w) => w.url().startsWith('http') && !w.isClosed())

// The page whose document matches `test`, polled until it exists.
async function pageWhere(test, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const page of appPages()) {
      const s = await stateOf(page)
      if (s && test(s)) return { page, state: s }
    }
    await sleep(250)
  }
  return null
}

const openFile = (filePath) =>
  app.evaluate(({ app: electronApp }, p) => {
    electronApp.emit('open-file', { preventDefault() {} }, p)
  }, filePath)

// Exactly what a second launch from Explorer hands the running instance:
// argv with the executable and (unpackaged) the app folder, then the paths.
const secondInstance = (paths) =>
  app.evaluate(({ app: electronApp }, argv) => {
    electronApp.emit('second-instance', {}, argv)
  }, ['electron', '.', ...paths])

try {
  console.log('Launch: one window, on the start screen')
  let first = null
  for (let i = 0; i < 120 && !first; i++) {
    first = appPages()[0] ?? null
    if (!first) await sleep(250)
  }
  check('the app opens a window', !!first)
  await first.waitForLoadState('domcontentloaded')

  console.log('\nTwo PDFs opened together ("Open with" on a selection)')
  await openFile(ALPHA)
  await openFile(BRAVO)
  const together = await pageWhere((s) => s.tabs.length === 2)
  check('they share ONE window as two tabs', !!together, 'no window ever had two tabs')
  if (together) {
    check('the first is the one in front', together.state.fileName === 'alpha.pdf', `in front: ${together.state.fileName}`)
    check('the tabs are in the order they were opened', together.state.tabs.join() === 'alpha.pdf,bravo.pdf', together.state.tabs.join())
    check('and it is the window that was on the start screen', together.page === first)
  }
  check('no second window was built for them', (await appWindowCount()) === 1, `${await appWindowCount()} windows`)

  console.log('\nA PDF opened on its own, later')
  await sleep(AFTER_BATCH_MS)
  await openFile(CHARLIE)
  const alone = await pageWhere((s) => s.fileName === 'charlie.pdf')
  check('it gets a window of its own', (await appWindowCount()) === 2, `${await appWindowCount()} windows`)
  check('with no tabs in it', !!alone && alone.state.tabs.length === 0, alone ? alone.state.tabs.join() : 'never opened')
  check('and the first window is untouched', (await stateOf(first))?.tabs.length === 2)

  console.log('\nThat window goes back to the start screen, and another PDF is opened')
  if (alone) {
    await alone.page.evaluate(async () => {
      const { usePdfStore } = await import('/src/stores/pdfStore.ts')
      usePdfStore.getState().reset()
    })
    await sleep(AFTER_BATCH_MS)
    await openFile(DELTA)
    const reused = await pageWhere((s) => s.fileName === 'delta.pdf')
    check('it goes into the empty window rather than a third', (await appWindowCount()) === 2, `${await appWindowCount()} windows`)
    check('the very window that was emptied', !!reused && reused.page === alone.page)
  }

  console.log('\nWindows: a selection opened from Explorer, one process per file')
  await sleep(AFTER_BATCH_MS)
  await secondInstance([ECHO])
  await sleep(300)
  await secondInstance([FOXTROT])
  const explorer = await pageWhere((s) => s.tabs.length === 2 && s.tabs.includes('echo.pdf'))
  check('both land in one NEW window, as tabs', !!explorer && (await appWindowCount()) === 3, `${await appWindowCount()} windows`)
  if (explorer) {
    check('echo in front, foxtrot behind', explorer.state.fileName === 'echo.pdf' && explorer.state.tabs[1] === 'foxtrot.pdf', JSON.stringify(explorer.state))
  }

  console.log('\nClosing a window whose tabs are BOTH amended asks about each, in turn')
  if (explorer) {
    const p = explorer.page
    await p.evaluate(async () => {
      const { useFormStore } = await import('/src/stores/formStore.ts')
      const { activateTab, useTabStore } = await import('/src/stores/tabStore.ts')
      const { tabs } = useTabStore.getState()
      useFormStore.getState().setValue(0, 'probe', 'echo')
      activateTab(tabs[1].id)
      useFormStore.getState().setValue(0, 'probe', 'foxtrot')
      activateTab(tabs[0].id)
    })
    await sleep(500)
    const before = await appWindowCount()
    // The × of THIS window — told apart from the others by its address, whose
    // hash is the recents slug of the document in front.
    const url = p.url()
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === target)?.close()
    }, url)
    const popup = p.getByRole('dialog', { name: 'Save your changes?' })
    await popup.waitFor({ timeout: 5000 }).catch(() => {})
    check('the question is asked, about the tab in front first', (await popup.innerText().catch(() => '')).includes('echo.pdf'))
    await p.getByRole('button', { name: 'Exit without saving' }).click()
    await sleep(500)
    check(
      'then again about the other amended tab, brought forward to be asked',
      (await popup.innerText().catch(() => '')).includes('foxtrot.pdf')
    )
    check('and the window waits for that answer too', (await appWindowCount()) === before)
    await p.getByRole('button', { name: 'Exit without saving' }).click()
    let closed = false
    for (let i = 0; i < 40 && !closed; i++) {
      closed = (await appWindowCount()) === before - 1
      if (!closed) await sleep(200)
    }
    check('once both are answered, the window closes', closed, `${await appWindowCount()} windows`)
  }
} finally {
  await app.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
