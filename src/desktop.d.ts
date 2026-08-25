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
      /**
       * Write a PDF to a file the user picks. The renderer has no filesystem
       * of its own, so the bytes go to the main process, which owns the Save
       * dialog and the write.
       *
       * `cancelled` is a NORMAL outcome, not an error: backing out of the Save
       * dialog is an answer, and the exit guard treats it as "stay here".
       */
      savePdf(
        suggestedName: string,
        bytes: Uint8Array
      ): Promise<{ ok: boolean; cancelled?: boolean; path?: string; error?: string }>
      /**
       * The unsaved-changes guard. The main process holds the window's × when
       * `set(true)` was the last thing it heard, asks the renderer over
       * `onCloseRequest`, and closes for real when `allowClose()` answers.
       *
       * ⚠️ `beforeunload` is NOT the desktop mechanism: Electron shows no
       * dialog for it and silently refuses the close instead.
       */
      unsaved: {
        set(dirty: boolean): void
        onCloseRequest(cb: () => void): () => void
        allowClose(): void
      }
      /**
       * Whether this app is the system's default `.pdf` handler, and the
       * request to become it.
       *
       * ⚠️ `canSet` is false on Windows even though `makeDefault` does
       * something there: an application is not allowed to change the
       * association, so all it can do is open Settings at the right page
       * (`openedSettings`). Read `isDefault`, never `ok`, to know whether the
       * app actually became the default.
       */
      defaultApp: {
        status(): Promise<{
          platform: string
          supported: boolean
          isDefault: boolean
          canSet: boolean
          reason?: string
        }>
        makeDefault(): Promise<{
          ok: boolean
          isDefault: boolean
          openedSettings?: boolean
          error?: string
        }>
      }
      /**
       * Whether PDFs appear in Explorer's preview pane (Alt+P), and turning
       * that on or off.
       *
       * ⚠️ `set` raises a Windows administrator prompt. The key that makes a
       * preview handler visible to the shell is machine-wide, and a per-user
       * installer cannot write it — so this is the one elevation in the app,
       * asked for only by someone who wants the feature. Read `enabled` from
       * the result, never `ok`: a dismissed prompt is not an error worth
       * showing, it is simply "still off".
       *
       * `incomplete` means the machine-wide half is there but the per-user
       * half is missing — a broken half-install, not "on".
       */
      previewPane: {
        status(): Promise<{
          platform: string
          supported: boolean
          enabled: boolean
          incomplete?: boolean
          needsAdmin?: boolean
          reason?: string
        }>
        set(enable: boolean): Promise<{
          ok: boolean
          enabled: boolean
          restartShell?: boolean
          error?: string
        }>
      }
    }
  }
}
