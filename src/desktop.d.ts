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
    }
  }
}
