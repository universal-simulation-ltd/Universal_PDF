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

contextBridge.exposeInMainWorld('desktop', {
  onOpenPdf: channel('open-pdf'),
  onNoPdf: channel('no-pdf'),
})
