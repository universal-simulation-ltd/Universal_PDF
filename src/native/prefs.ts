import { usePdfSettings, type PdfSettings } from '../stores/pdfSettings'

// The phone screens' own two switches in Tune. Both start off, like every
// switch in the suite; Reset to defaults puts them back.
//
// Since 2026-11-20 they live in the app's one synced settings store
// (stores/pdfSettings.ts): on the device and, signed in, on the account.
// This keeps the zustand-style `usePhonePrefs(selector)` / `getState()`.
interface PhonePrefs {
  /** Keep the screen from dimming while a document is open. */
  keepAwake: boolean
  /** No tilt and no handwriting on the screens — just the page. */
  plainPaper: boolean
  setKeepAwake: (v: boolean) => void
  setPlainPaper: (v: boolean) => void
  reset: () => void
}

const actions = {
  setKeepAwake: (keepAwake: boolean) => usePdfSettings.set({ keepAwake }),
  setPlainPaper: (plainPaper: boolean) => usePdfSettings.set({ plainPaper }),
  reset: () => usePdfSettings.set({ keepAwake: false, plainPaper: false }),
}

function view(s: PdfSettings): PhonePrefs {
  return { keepAwake: s.keepAwake, plainPaper: s.plainPaper, ...actions }
}

interface PhonePrefsStore {
  <U>(selector: (s: PhonePrefs) => U): U
  getState(): PhonePrefs
}

function usePhonePrefsSlice<U>(selector: (s: PhonePrefs) => U): U {
  return usePdfSettings((s) => selector(view(s)))
}

export const usePhonePrefs: PhonePrefsStore = Object.assign(usePhonePrefsSlice, {
  getState: () => view(usePdfSettings.getState()),
})
