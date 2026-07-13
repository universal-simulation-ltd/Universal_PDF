const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

// Set by `npm run electron:dev` to load the live Vite dev server. When unset
// (the packaged app), we load the built bundle from disk over `file://`.
const DEV_SERVER_URL = process.env.ELECTRON_START_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      // The app uses no Node or Electron APIs — keep the renderer sandboxed.
      contextIsolation: true,
      nodeIntegration: false,
    },
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
