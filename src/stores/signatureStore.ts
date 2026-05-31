import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Signature {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
  createdAt: number
}

export type ImportTarget = 'signature' | 'stamp'

interface SignatureState {
  signatures: Signature[]
  activeId: string | null
  padOpen: boolean
  importOpen: boolean
  importTarget: ImportTarget
  stampPickerOpen: boolean
  add: (sig: Omit<Signature, 'id' | 'createdAt'>) => string
  remove: (id: string) => void
  setActive: (id: string | null) => void
  rename: (id: string, name: string) => void
  openPad: () => void
  closePad: () => void
  openImport: (target?: ImportTarget) => void
  closeImport: () => void
  openStampPicker: () => void
  closeStampPicker: () => void
}

export const useSignatureStore = create<SignatureState>()(
  persist(
    (set) => ({
      signatures: [],
      activeId: null,
      padOpen: false,
      importOpen: false,
      importTarget: 'signature',
      stampPickerOpen: false,
      add: (sig) => {
        const id = crypto.randomUUID()
        set((s) => ({
          signatures: [...s.signatures, { ...sig, id, createdAt: Date.now() }],
          activeId: id
        }))
        return id
      },
      remove: (id) =>
        set((s) => ({
          signatures: s.signatures.filter((x) => x.id !== id),
          activeId: s.activeId === id ? null : s.activeId
        })),
      setActive: (activeId) => set({ activeId }),
      rename: (id, name) =>
        set((s) => ({
          signatures: s.signatures.map((x) => (x.id === id ? { ...x, name } : x))
        })),
      openPad: () => set({ padOpen: true }),
      closePad: () => set({ padOpen: false }),
      openImport: (target = 'signature') => set({ importOpen: true, importTarget: target }),
      closeImport: () => set({ importOpen: false }),
      openStampPicker: () => set({ stampPickerOpen: true }),
      closeStampPicker: () => set({ stampPickerOpen: false })
    }),
    {
      name: 'universal-pdf-signatures',
      partialize: (s) => ({ signatures: s.signatures, activeId: s.activeId })
    }
  )
)
