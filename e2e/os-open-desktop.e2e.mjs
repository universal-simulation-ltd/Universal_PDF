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
//
// The second half is a Word / OpenDocument file handed over the same way — by
// Finder's `open-file`, and by Windows's second launch with the path on its
// command line. Either has to open exactly as a drop on the window does:
// converted on this device, not refused, and a legacy .doc answered with advice.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const FIXTURE = join(HERE, 'fixtures', 'sample.pdf')
const DOCX = join(HERE, 'fixtures', 'rich.docx')
const ODT = join(HERE, 'fixtures', 'orientation.odt')

// A Word 97–2003 file needs only its OLE2 signature to be recognised as one —
// the page refuses it with advice before reading any further.
const LEGACY_DOC = join(mkdtempSync(join(tmpdir(), 'unipdf-os-open-')), 'minutes.doc')
writeFileSync(LEGACY_DOC, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]))

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

// ⚠️ A profile of its own, or the test cannot run while the INSTALLED Universal
// PDF is open: both use `~/Library/Application Support/universal-pdf`, so the
// installed copy holds the single-instance lock, this launch forwards its argv
// to it and quits with exit 0, and Playwright reports only "Target page,
// context or browser has been closed".
const PROFILE = mkdtempSync(join(tmpdir(), 'unipdf-os-open-profile-'))

const app = await playwright._electron.launch({
  executablePath: ELECTRON_BIN,
  args: [ROOT, `--user-data-dir=${PROFILE}`],
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
  // ⚠️ Wait for PLAYWRIGHT to see the page go as well, not just the main
  // process: until its close event lands, `app.windows()` still lists the dead
  // first page, `appWindow` below hands it straight back as the "new" window,
  // and the next evaluate fails with "Target page, context or browser has been
  // closed". A slow dev server (Vite re-optimising after a lockfile change) is
  // enough to open that gap.
  for (let i = 0; i < 50 && ((await mainWindowExists()) || (first && !first.isClosed())); i++) {
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
      named = await reopened
        .evaluate(async () => {
          const { usePdfStore } = await import('/src/stores/pdfStore.ts')
          return usePdfStore.getState().fileName
        })
        // A cold dev server reloads the page once it has re-optimised its deps,
        // destroying the context mid-call. That is "not yet", not a failure.
        .catch(() => null)
      if (!named) await new Promise((r) => setTimeout(r, 200))
    }
    check('the handed-over PDF is the document it loads', named === 'sample.pdf', `loaded ${named}`)
  }

  // ── A Word / OpenDocument file handed over by the OS ───────────────────────
  // It has to open the way a DROP opens it: converted on this device, with the
  // notice saying so. On macOS it used to reach pdf.js as a "PDF" and come back
  // as "Failed to load PDF"; on Windows it never reached the page at all,
  // because the command-line filter took `.pdf` and nothing else.
  const win = reopened ?? (await appWindow(app))
  if (win) {
    // Recorded rather than shown: a real alert() is modal and would stall the
    // renderer this test is asking questions of. Installed by every probe, not
    // once, because a reload of the page takes the stub with it.
    const opened = () =>
      win
        .evaluate(async () => {
          if (!window.__alerts) {
            window.__alerts = []
            window.alert = (message) => window.__alerts.push(String(message))
          }
          const { usePdfStore } = await import('/src/stores/pdfStore.ts')
          const s = usePdfStore.getState()
          return { name: s.fileName, notice: s.importNotice, alerts: window.__alerts.slice() }
        })
        // A reload mid-call is "not yet" — see the PDF check above.
        .catch(() => ({ name: null, notice: null, alerts: [] }))
    const alerts = () => win.evaluate(() => (window.__alerts ?? []).splice(0)).catch(() => [])
    await opened()
    // Long, because the first conversion may be LibreOffice building its
    // private profile — several seconds on a cold machine.
    async function waitFor(pred, tries = 300) {
      let last = null
      for (let i = 0; i < tries; i++) {
        last = await opened()
        if (pred(last) || last.alerts.length) return last
        await new Promise((r) => setTimeout(r, 200))
      }
      return last
    }
    const secondLaunch = (filePath) =>
      // Exactly what Windows delivers when "Open with" starts a second copy:
      // the new process's argv, forwarded to the one holding the lock. In dev
      // that argv is `electron <app dir> <document>`.
      app.evaluate(({ app: electronApp }, argv) => {
        electronApp.emit('second-instance', { preventDefault() {} }, argv)
      }, [ELECTRON_BIN, ROOT, filePath])

    console.log('\nmacOS: Finder hands over a .docx')
    await app.evaluate(({ app: electronApp }, filePath) => {
      electronApp.emit('open-file', { preventDefault() {} }, filePath)
    }, DOCX)
    const docx = await waitFor((s) => s.name === 'rich.pdf')
    check('the .docx is converted and opens as rich.pdf', docx?.name === 'rich.pdf', `loaded ${docx?.name}`)
    check('with the notice saying it was converted', /^Converted /.test(docx?.notice ?? ''), docx?.notice)
    check('and no alert', (await alerts()).length === 0, docx?.alerts.join(' | '))

    console.log('\nWindows: "Open with" starts a second copy with an .odt on its command line')
    await secondLaunch(ODT)
    const odt = await waitFor((s) => s.name === 'orientation.pdf')
    check('the .odt reaches the page and opens as orientation.pdf', odt?.name === 'orientation.pdf', `loaded ${odt?.name}`)
    check('with the notice saying it was converted', /^Converted /.test(odt?.notice ?? ''), odt?.notice)
    check('and no alert', (await alerts()).length === 0, odt?.alerts.join(' | '))

    console.log('\nWindows: an older .doc gets advice rather than silence')
    await secondLaunch(LEGACY_DOC)
    const legacy = await waitFor(() => false, 150)
    const advice = (await alerts()).join(' | ')
    check('the user is told to save it as .docx', /save it as \.docx/i.test(advice), advice || 'no alert')
    check('and the open document is left alone', legacy?.name === 'orientation.pdf', `now ${legacy?.name}`)
  }
} finally {
  await app.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
