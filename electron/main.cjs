const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const defaultApp = require('./defaultApp.cjs')

// Set by `npm run electron:dev` to load the live Vite dev server. When unset
// (the packaged app), we load the built bundle from disk over `file://`.
const DEV_SERVER_URL = process.env.ELECTRON_START_URL

let mainWindow = null

// Whether mainWindow's renderer has finished loading. `webContents.send` before
// that point goes nowhere — the preload's buffer only covers the gap between
// preload and React, not the gap before preload runs — so anything arriving
// earlier waits in `pendingPdfPath` instead of being fired into the void.
let windowLoaded = false

// PDF the app was launched with (double-click / "Open with → Universal PDF"),
// held until the window has finished loading.
let pendingPdfPath = null

// Windows passes the document path as a plain argument after the executable
// (plus the app-dir argument when running unpackaged via `electron .`).
// Chromium switches all start with `-`, so skip those.
function pdfPathFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2)
  const candidate = args.find((a) => !a.startsWith('-') && /\.pdf$/i.test(a))
  if (!candidate) return null
  try {
    return fs.existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

// The renderer is fully sandboxed (no Node access), so the main process reads
// the bytes off disk and ships them over IPC; the preload bridge hands them to
// the React app, which opens them like any other picked/dropped file.
function sendPdf(win, filePath) {
  try {
    const bytes = fs.readFileSync(filePath)
    win.webContents.send('open-pdf', { name: path.basename(filePath), bytes })
  } catch (err) {
    console.error('Failed to read PDF passed from the OS:', err)
    // The renderer may be sitting on the launch placeholder waiting for exactly
    // this file. Tell it to give up, or it spins forever on a file that is
    // never coming.
    win.webContents.send('no-pdf', { unreadable: path.basename(filePath) })
  }
}

// Hand a PDF to the window if it can receive one, and hold it otherwise.
// `did-finish-load` flushes whatever is held.
function deliverPdf(filePath) {
  if (mainWindow && windowLoaded) sendPdf(mainWindow, filePath)
  else pendingPdfPath = filePath
}

function createWindow() {
  // Fill the display's full working height (screen minus taskbar) on launch —
  // PDFs are portrait documents, so vertical space is what matters. Width
  // stays at the comfortable 1280 default (clamped to the work area on small
  // screens). y pins the window to the top of the work area so the full
  // height is actually visible.
  const { workArea } = screen.getPrimaryDisplay()
  // Launched by double-clicking a PDF? The renderer needs to know at its FIRST
  // paint, because the file itself cannot arrive until the bundle has loaded.
  // Without this the app paints the landing page, then throws it away a beat
  // later when the document lands — the front door flashing past on the way to
  // a document the user already chose.
  const launching = !!pendingPdfPath
  const win = new BrowserWindow({
    width: Math.min(1280, workArea.width),
    height: workArea.height,
    y: workArea.y,
    minWidth: 640,
    minHeight: 480,
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
  mainWindow = win
  windowLoaded = false
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
      windowLoaded = false
    }
  })

  // `ready-to-show` is the right moment; `did-finish-load` is the belt-and-
  // braces one, so a page that somehow never reaches first paint still leaves
  // the user with a window rather than nothing at all.
  const reveal = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }
  win.once('ready-to-show', reveal)

  // Deliver the launch file once the bundle is loaded; the preload bridge
  // buffers it if React hasn't subscribed yet.
  win.webContents.on('did-finish-load', () => {
    windowLoaded = true
    reveal()
    if (pendingPdfPath) {
      const filePath = pendingPdfPath
      pendingPdfPath = null
      sendPdf(win, filePath)
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
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
}

// Opening a PDF while the app is already running must reuse the existing
// window (Windows/Linux launch a second process for it — forward the argv
// and quit the newcomer).
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  pendingPdfPath = pdfPathFromArgv(process.argv)

  app.on('second-instance', (_event, argv) => {
    const filePath = pdfPathFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (filePath) deliverPdf(filePath)
    } else if (filePath) {
      pendingPdfPath = filePath
    }
  })

  // macOS delivers OS-opened files as an event (possibly before `ready`).
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    deliverPdf(filePath)
  })

  // Whether this app owns .pdf on the machine, and the attempt to make it so.
  // Both live in the main process because every route to the answer is an OS
  // call (Launch Services, xdg-mime, the registry) that a sandboxed renderer
  // has no way to reach.
  ipcMain.handle('default-app:status', () => defaultApp.status())
  ipcMain.handle('default-app:set', () => defaultApp.makeDefault())

  app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
