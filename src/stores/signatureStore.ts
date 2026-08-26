import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SignatureData } from '../types/annotations'

// Name/date the user chose to place as SEPARATE text (next to the signature)
// rather than baking into the image. Absent when everything is baked in.
export interface SignatureExtras {
  name?: string
  date?: boolean
  // The date line as the user wrote it in the pad. When absent the date
  // resolves to the day of placement.
  dateText?: string
  // Colour for separately-placed name/date text, so it matches the signature.
  color?: string
}

export interface Signature {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
  createdAt: number
  extras?: SignatureExtras
  // The untouched ink + baked-label options, carried onto the placed image
  // annotation so a dropped signature's name/date can be re-edited later
  // (double-tap / size+alignment pill) without re-drawing the strokes. `dataUrl`
  // stays the composite used for the library thumbnail + ghost preview.
  sig?: SignatureData
}

// Queue of extra text pieces awaiting placement after a "separate" signature is
// dropped — each consumed by one click on the page.
export interface PendingExtra {
  kind: 'name' | 'date'
  text: string
  color: string
}

export type ImportTarget = 'signature' | 'stamp'

interface SignatureState {
  signatures: Signature[]
  activeId: string | null
  // Text pieces (name/date) waiting to be click-placed after a separate
  // signature is dropped. Transient — not persisted.
  pendingExtras: PendingExtra[]
  padOpen: boolean
  importOpen: boolean
  importTarget: ImportTarget
  stampPickerOpen: boolean
  // "Request signature" options — chosen before the box is drawn. Whether the
  // next signature-request box should also ask for a name and/or a date line,
  // and whether it should require live ink rather than an uploaded image.
  requestName: boolean
  requestDate: boolean
  requestLive: boolean
  // Id of the signature-request field currently being signed. When set, the
  // pad fills that field on save instead of adding a reusable library
  // signature. Transient — not persisted.
  signingFieldId: string | null
  add: (sig: Omit<Signature, 'id' | 'createdAt'>) => string
  remove: (id: string) => void
  setActive: (id: string | null) => void
  setPendingExtras: (items: PendingExtra[]) => void
  consumePendingExtra: () => void
  rename: (id: string, name: string) => void
  setRequestName: (v: boolean) => void
  setRequestDate: (v: boolean) => void
  setRequestLive: (v: boolean) => void
  // Open the pad to sign a specific request field (or re-sign an existing one).
  startSigningField: (id: string) => void
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
      pendingExtras: [],
      padOpen: false,
      importOpen: false,
      importTarget: 'signature',
      stampPickerOpen: false,
      requestName: false,
      requestDate: false,
      requestLive: false,
      signingFieldId: null,
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
      // Switching the active signature abandons any half-finished placement.
      setActive: (activeId) => set({ activeId, pendingExtras: [] }),
      setPendingExtras: (pendingExtras) => set({ pendingExtras }),
      consumePendingExtra: () =>
        set((s) => ({ pendingExtras: s.pendingExtras.slice(1) })),
      rename: (id, name) =>
        set((s) => ({
          signatures: s.signatures.map((x) => (x.id === id ? { ...x, name } : x))
        })),
      setRequestName: (requestName) => set({ requestName }),
      setRequestDate: (requestDate) => set({ requestDate }),
      setRequestLive: (requestLive) => set({ requestLive }),
      startSigningField: (id) => set({ signingFieldId: id, padOpen: true }),
      openPad: () => set({ padOpen: true }),
      // Closing the pad always abandons any in-progress field signing.
      closePad: () => set({ padOpen: false, signingFieldId: null }),
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
