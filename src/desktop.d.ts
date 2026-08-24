// Bridge exposed by the Electron preload script (electron/preload.cjs) in the
// packaged desktop app. Absent in the browser/PWA build.
export {}

declare global {
  interface Window {
    desktop?: {
      /**
       * Subscribe to PDFs the user opened via the OS (double-click or
       * "Open with → Universal PDF"). Returns an unsubscribe function.
       */
      onOpenPdf(
        cb: (payload: { name: string; bytes: Uint8Array<ArrayBuffer> }) => void
      ): () => void
      /**
       * Fires when this page load is NOT getting a PDF from the OS — either
       * there was never one (a plain launch, or a reload) or the file could
       * not be read, in which case `unreadable` is its name. Ends the launch
       * placeholder. Returns an unsubscribe function.
       */
      onNoPdf(cb: (payload: { unreadable?: string }) => void): () => void
    }
  }
}
