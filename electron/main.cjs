const { app, BrowserWindow, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// Set by `npm run electron:dev` to load the live Vite dev server. When unset
// (the packaged app), we load the built bundle from disk over `file://`.
const DEV_SERVER_URL = process.env.ELECTRON_START_URL

let mainWindow = null

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
  }
}

function createWindow() {
  // Fill the display's full working height (screen minus taskbar) on launch —
  // PDFs are portrait documents, so vertical space is what matters. Width
  // stays at the comfortable 1280 default (clamped to the work area on small
  // screens). y pins the window to the top of the work area so the full
  // height is actually visible.
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    width: Math.min(1280, workArea.width),
    height: workArea.height,
    y: workArea.y,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer needs no Node or Electron APIs — keep it sandboxed. The
      // preload script only bridges OS-opened PDFs (bytes + name) into the page.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Deliver the launch file once the bundle is loaded; the preload bridge
  // buffers it if React hasn't subscribed yet.
  win.webContents.on('did-finish-load', () => {
    if (pendingPdfPath) {
      sendPdf(win, pendingPdfPath)
      pendingPdfPath = null
    }
  })

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
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
      if (filePath) sendPdf(mainWindow, filePath)
    } else if (filePath) {
      pendingPdfPath = filePath
    }
  })

  // macOS delivers OS-opened files as an event (possibly before `ready`).
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) sendPdf(mainWindow, filePath)
    else pendingPdfPath = filePath
  })

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
