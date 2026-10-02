import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SignatureData } from '../types/annotations'

// Name/date the user chose to place as SEPARATE text (next to the signature)
// rather than baking into the image. Absent when everything is baked in.
export interface SignatureExtras {
  name?: string
  // The detail lines under the name — role, email, phone — already filtered by
  // `detailLines` (blanks and untouched "Role:" prompts dropped). One piece per
  // line, because the whole point of placing separately is dropping each into a
  // form's own field, and a form field holds one line.
  details?: string[]
  date?: boolean
  // The date line as the user wrote it in the pad. When absent the date
  // resolves to the day of placement.
  dateText?: string
  // Colour for separately-placed label text, so it matches the signature.
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
  kind: 'name' | 'details' | 'date'
  text: string
  color: string
}

export type ImportTarget = 'signature' | 'stamp'

// The signed-in Universal ID's MAIN signature (platform 0224 — saved on the
// hub's Me page or in Universal Signatures) is mirrored into the library as
// one entry with this id prefix + its cert id. MainSignatureSync keeps it in
// step; removing it here only hides it until a different main is saved.
export const UID_MAIN_PREFIX = 'uid-main:'

export interface UniversalIdSignature {
  certId: string
  name: string
  dataUrl: string
  width: number
  height: number
}

interface SignatureState {
  signatures: Signature[]
  activeId: string | null
  // Cert id of a Universal ID main signature the user removed from this
  // library — not re-added unless the main signature changes.
  dismissedMainCert: string | null
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
  // Mirror the Universal ID's main signature (null = signed out / none).
  syncUniversalIdSignature: (main: UniversalIdSignature | null) => void
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
      dismissedMainCert: null,
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
          activeId: s.activeId === id ? null : s.activeId,
          dismissedMainCert: id.startsWith(UID_MAIN_PREFIX)
            ? id.slice(UID_MAIN_PREFIX.length)
            : s.dismissedMainCert
        })),
      syncUniversalIdSignature: (main) =>
        set((s) => {
          const existing = s.signatures.find((x) => x.id.startsWith(UID_MAIN_PREFIX))
          const rest = s.signatures.filter((x) => !x.id.startsWith(UID_MAIN_PREFIX))
          const dropActive = (keepId: string | null) =>
            s.activeId && s.activeId.startsWith(UID_MAIN_PREFIX) && s.activeId !== keepId ? null : s.activeId
          if (!main) {
            return existing ? { signatures: rest, activeId: dropActive(null) } : {}
          }
          const id = UID_MAIN_PREFIX + main.certId
          if (existing?.id === id) {
            return existing.name === main.name
              ? {}
              : { signatures: s.signatures.map((x) => (x.id === id ? { ...x, name: main.name } : x)) }
          }
          if (s.dismissedMainCert === main.certId) {
            return existing ? { signatures: rest, activeId: dropActive(null) } : {}
          }
          const entry: Signature = {
            id,
            name: main.name,
            dataUrl: main.dataUrl,
            width: main.width,
            height: main.height,
            createdAt: Date.now()
          }
          // First in the list: it is the one most people will reach for.
          return { signatures: [entry, ...rest], activeId: dropActive(id) }
        }),
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
      partialize: (s) => ({ signatures: s.signatures, activeId: s.activeId, dismissedMainCert: s.dismissedMainCert })
    }
  )
)
