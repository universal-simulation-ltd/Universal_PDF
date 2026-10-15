import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// The phone screens' own two switches in Tune. Both start off, like every
// switch in the suite; Reset to defaults puts them back.
interface PhonePrefs {
  /** Keep the screen from dimming while a document is open. */
  keepAwake: boolean
  /** No tilt and no handwriting on the screens — just the page. */
  plainPaper: boolean
  setKeepAwake: (v: boolean) => void
  setPlainPaper: (v: boolean) => void
  reset: () => void
}

export const usePhonePrefs = create<PhonePrefs>()(
  persist(
    (set) => ({
      keepAwake: false,
      plainPaper: false,
      setKeepAwake: (keepAwake) => set({ keepAwake }),
      setPlainPaper: (plainPaper) => set({ plainPaper }),
      reset: () => set({ keepAwake: false, plainPaper: false }),
    }),
    {
      name: 'unipdf:phone-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ keepAwake: s.keepAwake, plainPaper: s.plainPaper }),
    }
  )
)
