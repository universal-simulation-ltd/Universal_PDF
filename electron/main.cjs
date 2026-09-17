const { app, BrowserWindow, dialog, ipcMain, screen, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const defaultApp = require('./defaultApp.cjs')
const previewPane = require('./previewPane.cjs')
const libreOffice = require('./libreOffice.cjs')
const downloads = require('./downloads.cjs')
const strings = require('./strings.cjs')
const { installHubHandoff } = require('@unisim/sdk/electron')

// Set by `npm run electron:dev` to load the live Vite dev server. When unset
// (the packaged app), we load the built bundle from disk over `file://`.
const DEV_SERVER_URL = process.env.ELECTRON_START_URL

// ⚠️ NOT the same string as the page's <title>, deliberately. The web build's
// title is its search-result headline ("open source, browser-based PDF editor")
// — right for Google, wrong for a title bar, where nobody needs to be told what
// kind of app the window they are looking at is.
const WINDOW_TITLE = 'Universal PDF: Welcome to PDFs that just work.'

// ── Windows ─────────────────────────────────────────────────────────────────
// One window per document the user opened on its own, and one window — with a
// tab per file — for documents opened TOGETHER (James, 2026-09-14: "if the user
// ... opens multiple PDFs on Windows / Mac with open with... then introduce
// tabs ... Otherwise, if someone has a PDF open, and then opens a separate pdf
// independently it should be in a new window").
//
// ⚠️ "Together" has to be worked out from TIMING, because neither OS says so.
// macOS sends one `open-file` event per selected file, back to back. Windows is
// worse: the association is registered as `"Universal PDF.exe" "%1"`, so a
// multi-selection opened from Explorer launches one PROCESS per file, and each
// one reaches this process as a separate `second-instance` a beat apart. So a
// file arriving within `BATCH_MS` of the previous one joins that one's window;
// anything later is an independent open.
//
// Tabs themselves are entirely the renderer's business (src/stores/tabStore.ts).
// All this side decides is which WINDOW a file goes to.
const BATCH_MS = 1500

// Everything this process tracks per window, keyed by the BrowserWindow.
//   loaded       the renderer has finished loading. `webContents.send` before
//                that goes nowhere — the preload's buffer only covers the gap
//                between preload and React — so files wait in `pending`.
//   pending      paths handed over before the window could take them.
//   hasDocument  whether the window is showing anything. Reported by the
//                renderer, and set here the moment a file is sent so a second
//                open cannot pick the window in the gap before it answers.
//   unsaved      closing the window would lose amendments (renderer-owned).
//   allowClose   the renderer has answered the close question; let it through.
//   openFolder   the folder this window's documents came off the disk from.
const windows = new Map()

// The window taking the files of the batch in progress, and the timer that
// ends the batch.
let batch = null

// Paths handed over before `ready`, when no window can be built yet. macOS
// sends a launch's documents as `open-file` events that can arrive that early.
let startupPaths = []

// Folder the most recent document came off the disk from, in ANY window — the
// fallback for a window that has not opened one of its own yet.
//
// Someone who opened a contract out of a client folder is saving the signed
// copy back beside it — not into the same pile as every browser download they
// have ever made, which is where Electron's own default (~/Downloads) puts it.
//
// Fed from both directions: a document handed over by the OS, whose path this
// process already has, and one picked or dropped in the page, whose path only
// the preload can resolve (`webUtils.getPathForFile`).
//
// A document that never came off the disk — a recent replayed from storage, a
// converted file, the example PDF — leaves these ALONE rather than clearing
// them. It is the last folder the user actually chose a document from, which is
// the same "remember where I was working" every desktop app keeps, and a better
// guess than falling back to ~/Downloads mid-session.
let lastOpenFolder = null

function rememberOpenFolder(win, filePath) {
  if (!filePath) return
  try {
    const folder = path.dirname(filePath)
    // Checked, because a folder that has since been unplugged or deleted (a
    // document opened off a USB stick, then pulled out) would open the dialog
    // on nothing at all. A path we cannot see is simply not an answer, and the
    // previous one stands.
    if (!fs.existsSync(folder)) return
    lastOpenFolder = folder
    const state = win && windows.get(win)
    if (state) state.openFolder = folder
  } catch {
    // Unreadable path — keep whatever we had.
  }
}

// `name` placed in the folder `win`'s documents came from. Falls back to the
// bare filename, which is Electron's cue to use its own default folder.
function suggestedSavePath(name, win) {
  const base = path.basename(String(name || 'document.pdf'))
  const state = win && windows.get(win)
  const folder = (state && state.openFolder) || lastOpenFolder
  return folder ? path.join(folder, base) : base
}

// What the page can do something with when the OS hands it a document: a PDF,
// a Word or OpenDocument file it converts on the way in (exactly as if it had
// been dropped on the window), and the older .doc / .rtf / .pages it answers
// with "save it as .docx first" rather than nothing at all.
//
// ⚠️ Mirrors `isConvertibleName` in src/lib/officeToPdf.ts. This used to be
// `.pdf` alone, so a .docx sent with "Open with → Universal PDF" on Windows was
// thrown away right here and the app opened on its landing page as if it had
// been given nothing — while the same file dropped on the window converted
// fine. A format added there and not here brings exactly that back.
const OPENABLE_DOCUMENT = /\.(pdf|docx|odt|doc|rtf|pages)$/i

// Windows passes the document path as a plain argument after the executable
// (plus the app-dir argument when running unpackaged via `electron .`).
// Chromium switches all start with `-`, so skip those. Every document, not
// just the first: a launcher that passes several at once (xdg-open with `%F`)
// means them all.
function documentPathsFromArgv(argv) {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((a) => !a.startsWith('-') && OPENABLE_DOCUMENT.test(a))
    .filter((candidate) => {
      try {
        return fs.existsSync(candidate)
      } catch {
        return false
      }
    })
}

const isLive = (win) => !!win && !win.isDestroyed() && windows.has(win)

// The renderer is fully sandboxed (no Node access), so the main process reads
// the bytes off disk and ships them over IPC; the preload bridge hands them to
// the React app, which opens them like any other picked/dropped file.
function sendPdf(win, filePath) {
  try {
    const bytes = fs.readFileSync(filePath)
    // Read succeeded, so this folder exists and holds the document now on
    // screen — where its exports should be offered back.
    rememberOpenFolder(win, filePath)
    const state = windows.get(win)
    if (state) state.hasDocument = true
    win.webContents.send('open-pdf', { name: path.basename(filePath), bytes })
  } catch (err) {
    console.error('Failed to read PDF passed from the OS:', err)
    // The renderer may be sitting on the launch placeholder waiting for exactly
    // this file. Tell it to give up, or it spins forever on a file that is
    // never coming.
    win.webContents.send('no-pdf', { unreadable: path.basename(filePath) })
  }
}

// Hand a PDF to a window if it can receive one, and hold it otherwise.
// `did-finish-load` flushes whatever is held.
function deliverPdf(win, filePath) {
  const state = windows.get(win)
  if (!state) return
  if (state.loaded) sendPdf(win, filePath)
  else state.pending.push(filePath)
}

// Bring a window back in front of whatever the user is looking at. `focus()`
// alone only raises the window WITHIN an app that is already frontmost, and an
// app being handed a document by Finder or Explorer usually is not — so the app
// itself has to be raised too.
function revealWindow(win) {
  if (!isLive(win)) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  // macOS only: `steal` is what lets a background app pull itself forward.
  if (process.platform === 'darwin') app.focus({ steal: true })
}

// A window sitting on the start screen, which can take a document rather than
// having a new window built beside it — the one in front first. Without this,
// the first PDF double-clicked after launching the app from the Dock or the
// Start menu would open a SECOND window next to an empty one.
function emptyWindow() {
  for (const win of [BrowserWindow.getFocusedWindow(), ...windows.keys()]) {
    if (!isLive(win)) continue
    const state = windows.get(win)
    if (!state.hasDocument && state.pending.length === 0) return win
  }
  return null
}

function extendBatch(win) {
  if (batch) clearTimeout(batch.timer)
  batch = {
    win,
    timer: setTimeout(() => {
      batch = null
    }, BATCH_MS)
  }
}

// Documents handed over by the OS — double-click, "Open with → Universal PDF",
// or a second launch on Windows/Linux.
//
// ⚠️ A window has to be CREATED here when there is none, and that is not an
// edge case: macOS keeps an app running after its last window closes (see
// `window-all-closed`), so "running, no window" is the ordinary state of a
// Universal PDF that has been used once already. Parking the document until
// something else built a window is how double-clicking a PDF once did nothing
// at all until the Dock icon was clicked.
function openFromOs(filePaths) {
  if (filePaths.length === 0) {
    // A second launch with no document (the Start menu again): bring back what
    // is there rather than doing nothing, or open a window if there is none.
    if (!app.isReady()) return
    const existing = [...windows.keys()].find(isLive)
    if (existing) revealWindow(existing)
    else createWindow()
    return
  }
  // Before `ready` there is no window to make; `whenReady` is moments away and
  // hands these back here.
  if (!app.isReady()) {
    startupPaths.push(...filePaths)
    return
  }
  for (const filePath of filePaths) {
    const joining = batch && isLive(batch.win) ? batch.win : null
    const win = joining || emptyWindow() || createWindow({ launching: true })
    deliverPdf(win, filePath)
    extendBatch(win)
    // A window built just now reveals itself once it has something to show
    // (`ready-to-show`); one that was already up is raised here.
    if (windows.get(win).loaded) revealWindow(win)
  }
}

function createWindow({ launching = false } = {}) {
  // Fill the display's full working height (screen minus taskbar) on launch —
  // PDFs are portrait documents, so vertical space is what matters. Width
  // stays at the comfortable 1280 default (clamped to the work area on small
  // screens). y pins the window to the top of the work area so the full
  // height is actually visible.
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1280, workArea.width)
  // A second window steps along from the one in front, so it does not land
  // exactly on top of it — a new window in precisely the old one's place looks
  // like the old one's document was replaced.
  const front = [BrowserWindow.getFocusedWindow()].find(isLive) || [...windows.keys()].filter(isLive).pop()
  let x
  if (front) {
    x = front.getBounds().x + 32
    if (x + width > workArea.x + workArea.width) x = workArea.x
  }
  // Launched by double-clicking a PDF? The renderer needs to know at its FIRST
  // paint, because the file itself cannot arrive until the bundle has loaded.
  // Without this the app paints the landing page, then throws it away a beat
  // later when the document lands — the front door flashing past on the way to
  // a document the user already chose.
  const win = new BrowserWindow({
    width,
    height: workArea.height,
    ...(x !== undefined ? { x } : {}),
    y: workArea.y,
    minWidth: 640,
    minHeight: 480,
    title: WINDOW_TITLE,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    // Hold the window back until there is something to look at, rather than
    // showing an empty frame while the bundle boots.
    show: false,
    webPreferences: {
      // The renderer needs no Node or Electron APIs — keep it sandboxed. The
      // preload script only bridges OS-opened PDFs (bytes + name) into the page.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // A loaded page's <title> replaces the window title unless this is stopped,
  // so `title` above would last only until the bundle finished loading.
  win.on('page-title-updated', (event) => event.preventDefault())

  const state = {
    loaded: false,
    pending: [],
    hasDocument: launching,
    unsaved: false,
    allowClose: false,
    openFolder: null,
  }
  windows.set(win, state)

  // ⚠️ The window's × is held here, in the main process, and NOT by the page's
  // `beforeunload`: Electron shows no dialog for that event, it merely refuses
  // the close — so a renderer using it would make the × look broken. Instead
  // the close is cancelled once, the renderer is asked, and its answer comes
  // back as `unsaved:allow-close`.
  //
  // This covers ⌘Q / Alt+F4 as well: quitting closes each window, and a
  // cancelled window close cancels the quit with it.
  win.on('close', (event) => {
    if (state.allowClose || !state.unsaved) return
    event.preventDefault()
    win.webContents.send('unsaved:close-request', {})
  })

  win.on('closed', () => {
    windows.delete(win)
    if (batch && batch.win === win) {
      clearTimeout(batch.timer)
      batch = null
    }
  })

  // `ready-to-show` is the right moment; `did-finish-load` is the belt-and-
  // braces one, so a page that somehow never reaches first paint still leaves
  // the user with a window rather than nothing at all.
  const reveal = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }
  win.once('ready-to-show', reveal)

  // Deliver whatever was handed over while the bundle loaded; the preload
  // bridge buffers it if React hasn't subscribed yet.
  win.webContents.on('did-finish-load', () => {
    state.loaded = true
    reveal()
    if (state.pending.length > 0) {
      for (const filePath of state.pending.splice(0)) sendPdf(win, filePath)
    } else {
      // Nothing inbound. Said out loud rather than left to a timeout, because
      // this also covers a manual reload (⌘R) of a window that was started with
      // `launching` set: the flag survives the reload, the file does not, and
      // the renderer would otherwise wait on it forever.
      win.webContents.send('no-pdf', {})
    }
  })

  if (DEV_SERVER_URL) {
    const devUrl = new URL(DEV_SERVER_URL)
    if (launching) devUrl.searchParams.set('launching', '1')
    win.loadURL(devUrl.toString())
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(
      path.join(__dirname, '..', 'dist', 'index.html'),
      launching ? { query: { launching: '1' } } : undefined
    )
  }

  // External links (e.g. the UNI SIM navbar) open in the system browser rather
  // than inside the app window.
  // mailto:/tel: are here because a PDF's own link annotations can carry them
  // (see LinkLayer) and they arrive through this handler as target=_blank. Left
  // to 'allow' they would open an empty BrowserWindow on a scheme Chromium
  // can't render; handed to the OS they open the mail/phone app, which is what
  // the same link does in a browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('http://') || url.startsWith('https://') ||
      url.startsWith('mailto:') || url.startsWith('tel:')
    ) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // setWindowOpenHandler only covers window.open/target=_blank. Plain <a href>
  // clicks (e.g. the suite-switcher rows) navigate the window itself, which
  // would replace the app with the remote site — send those to the system
  // browser too. The packaged app is a local file:// bundle, so any http(s)
  // navigation is external — except the dev server's own origin in dev mode.
  win.webContents.on('will-navigate', (event, url) => {
    if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  return win
}

// The window an IPC message came from, or null if it is not one of ours.
function senderWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  return isLive(win) ? win : null
}

// Opening a PDF while the app is already running is routed through the one
// process that is (Windows/Linux launch a second process for it — forward the
// argv and quit the newcomer), which decides which window it belongs in.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  startupPaths = documentPathsFromArgv(process.argv)

  app.on('second-instance', (_event, argv) => {
    openFromOs(documentPathsFromArgv(argv))
  })

  // macOS delivers OS-opened files as an event (possibly before `ready`).
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    openFromOs([filePath])
  })

  // The page reporting which file it just opened — see `lastOpenFolder`. A
  // send, not an invoke: nothing waits on the answer, and an open must never
  // be held up by bookkeeping about where a later save might go.
  ipcMain.on('open-folder:set', (event, filePath) => {
    rememberOpenFolder(senderWindow(event), typeof filePath === 'string' ? filePath : null)
  })

  // Whether the window is showing anything — see `emptyWindow`.
  // The suite language, from the renderer, for the dialogs this process shows.
  ipcMain.on('language:set', (_event, lang) => strings.setLanguage(lang))

  ipcMain.on('document:set-open', (event, open) => {
    const win = senderWindow(event)
    if (win) windows.get(win).hasDocument = !!open
  })

  // The unsaved-changes guard's two halves — see `win.on('close')` above.
  ipcMain.on('unsaved:set', (event, dirty) => {
    const win = senderWindow(event)
    if (win) windows.get(win).unsaved = !!dirty
  })
  ipcMain.on('unsaved:allow-close', (event) => {
    const win = senderWindow(event)
    if (!win) return
    windows.get(win).allowClose = true
    win.close()
  })

  // "Save and exit" — the renderer builds the PDF, the main process owns the
  // Save dialog and the write. A cancelled dialog is reported as such rather
  // than as an error: it means "I have changed my mind about leaving".
  ipcMain.handle('save-pdf', async (event, payload) => {
    const bytes = payload && payload.bytes
    if (!bytes) return { ok: false, error: strings.t('nothingToSave') }
    const suggestedName =
      payload && typeof payload.suggestedName === 'string' ? payload.suggestedName : 'document.pdf'
    const parent = senderWindow(event)
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(parent ?? undefined, {
        title: strings.t('savePdf'),
        // Beside the document that was opened, not in ~/Downloads — see
        // `lastOpenFolder`.
        defaultPath: suggestedSavePath(suggestedName, parent),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { ok: false, cancelled: true }
      await fs.promises.writeFile(filePath, Buffer.from(bytes))
      return { ok: true, path: filePath }
    } catch (err) {
      console.error('Failed to save the PDF:', err)
      return { ok: false, error: err.message || strings.t('pdfNotWritten') }
    }
  })

  // A Word/OpenDocument file converted by LibreOffice, when the machine happens
  // to have it. The renderer asks first (`status`) so it only sends the bytes
  // when there is something to send them to, and treats every failure as "use
  // the built-in converter" — see electron/libreOffice.cjs.
  ipcMain.handle('libreoffice:status', () => libreOffice.status())
  ipcMain.handle('libreoffice:convert', async (_event, payload) => {
    const bytes = payload && payload.bytes
    if (!bytes) return { ok: false, reason: 'no-input' }
    const res = await libreOffice.convert(bytes, payload.fileName)
    // Buffer does not survive the IPC boundary as a Buffer; hand back a plain
    // Uint8Array the renderer can put straight into a File.
    return res.ok ? { ok: true, bytes: new Uint8Array(res.bytes), version: res.version } : res
  })

  // Whether this app owns .pdf on the machine, and the attempt to make it so.
  // Both live in the main process because every route to the answer is an OS
  // call (Launch Services, xdg-mime, the registry) that a sandboxed renderer
  // has no way to reach.
  ipcMain.handle('default-app:status', () => defaultApp.status())

  ipcMain.handle('default-app:set', () => defaultApp.makeDefault())

  // The Explorer preview pane. Its last registry key is machine-wide, so
  // turning it on raises an administrator prompt — see electron/previewPane.cjs.
  ipcMain.handle('preview-pane:status', () => previewPane.status())
  ipcMain.handle('preview-pane:set', (_event, enable) => previewPane.setEnabled(!!enable))

  app.whenReady().then(() => {
    // Hub pages (profile, account settings) open in a window this app owns,
    // signed in as the current user. Without it every hub link lands in the
    // system browser as a stranger — the desktop app's session lives here and
    // nowhere else.
    installHubHandoff({ icon: path.join(__dirname, '..', 'public', 'icon-512.png') })
    // Every export the page hands out — the Export dialog, a compressed copy,
    // a converted document — leaves the renderer as an ordinary browser
    // download, because that is the one path that also works in the web build.
    // Electron answers those with a Save dialog rooted in ~/Downloads; this
    // moves it to the open document's folder instead, in one place, without
    // every export button needing to know it is running on a desktop.
    //
    // ⚠️ Registered on the shared default session at `ready`, NOT per window:
    // closing and reopening a window (the ordinary state of things on macOS)
    // would otherwise stack a second listener on the same session for every
    // window ever built.
    //
    // The dialog is OURS rather than Chromium's, because Chromium's writes the
    // part-downloaded file into the destination folder as it goes — and now
    // that the destination is the open document's own folder, that is a
    // scratch file appearing next to the user's PDF. electron/downloads.cjs
    // stages every download in AppData and moves it in when it is whole;
    // `suggestedSavePath` still decides where the dialog opens.
    downloads.installAll(session.defaultSession, suggestedSavePath)
    // The launch's own documents, if it had any, go through the same routing
    // as every later one — so several opened together share the first window
    // as tabs. Guarded, because `open-file` can land between `ready` and this
    // callback and build the window itself — an unguarded createWindow() would
    // answer one document with two windows.
    const launchPaths = startupPaths.splice(0)
    if (launchPaths.length > 0) openFromOs(launchPaths)
    else if (windows.size === 0) createWindow()
    app.on('activate', () => {
      if (windows.size === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
