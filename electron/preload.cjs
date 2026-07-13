const { contextBridge, ipcRenderer } = require('electron')

// PDFs opened via the OS (double-click / "Open with → Universal PDF") are read
// by the main process and pushed here over IPC. The React app subscribes after
// mount, which can be after the launch file has already arrived — buffer any
// early payloads and replay them on subscribe so the file is never dropped.
let handler = null
const buffered = []

ipcRenderer.on('open-pdf', (_event, payload) => {
  if (handler) handler(payload)
  else buffered.push(payload)
})

contextBridge.exposeInMainWorld('desktop', {
  // Returns an unsubscribe function (matches the addEventListener-style
  // cleanup the app's useEffect hooks expect).
  onOpenPdf(cb) {
    handler = cb
    for (const payload of buffered.splice(0)) cb(payload)
    return () => {
      if (handler === cb) handler = null
    }
  },
})
