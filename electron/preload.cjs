const { contextBridge, ipcRenderer } = require('electron')

// PDFs opened via the OS (double-click / "Open with → Universal PDF") are read
// by the main process and pushed here over IPC. The React app subscribes after
// mount, which can be after the launch file has already arrived — buffer any
// early payloads and replay them on subscribe so the file is never dropped.
//
// `no-pdf` is the same message in the negative: this page load is not getting a
// file. It matters because the app renders a placeholder instead of the landing
// page when it was started with a document to open, and a placeholder needs an
// end whether or not the document turns up.
function channel(name) {
  let handler = null
  const buffered = []

  ipcRenderer.on(name, (_event, payload) => {
    if (handler) handler(payload)
    else buffered.push(payload)
  })

  // Returns an unsubscribe function (matches the addEventListener-style
  // cleanup the app's useEffect hooks expect).
  return function subscribe(cb) {
    handler = cb
    for (const payload of buffered.splice(0)) cb(payload)
    return () => {
      if (handler === cb) handler = null
    }
  }
}

// Hub links (View profile, App settings) opened in an app-owned window with
// this app's session installed for the hub's origin — otherwise Electron hands
// them to the system browser, which has never seen the session and shows a
// signed-out page. The main process does the work; see @unisim/sdk/electron.
//
// ⚠️ Spelled out rather than required from the SDK on purpose: Electron
// sandboxes preloads, and a sandboxed `require` resolves only a few built-ins
// — requiring the package here would throw at load and take the bridge with
// it. The channel names are the SDK's `PRELOAD_SNIPPET`; keep them in step.
contextBridge.exposeInMainWorld('unisimDesktop', {
  openHub: (url, session) => ipcRenderer.invoke('unisim:open-hub', { url, session }),
  clearHub: () => ipcRenderer.invoke('unisim:clear-hub'),
})

contextBridge.exposeInMainWorld('desktop', {
  onOpenPdf: channel('open-pdf'),
  onNoPdf: channel('no-pdf'),
  // Whether this app is the system's default .pdf handler, and the request to
  // become it. Request-response rather than a pushed event: the app asks when
  // it has somewhere to put the answer.
  defaultApp: {
    status: () => ipcRenderer.invoke('default-app:status'),
    makeDefault: () => ipcRenderer.invoke('default-app:set'),
  },
})
