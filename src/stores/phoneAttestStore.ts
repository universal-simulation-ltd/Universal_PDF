import { create } from 'zustand'
import type { PhoneAttestation } from '../lib/phoneAttest'
import { useSignatureStore } from './signatureStore'

// Scan to sign, step 2 (universal-platform 0306): a signature that arrived
// from the UNI·SIM Hub phone app with an `attest` that checked out
// (lib/phoneAttest.ts), held against the library entry it became.
//
// ⚠️ The attestation is about the PNG the phone SENT (`received`, bare base64,
// PDF's dialect), not the library copy: the pad crops it and takes the white
// background out, so `dataUrl` is different bytes. Anything that shows or
// prints the line re-checks `received` with attestationMatches first, and the
// record counts only while the entry still holds the image it was made with
// (`dataUrl`) — remove or replace the signature and it is gone.
//
// In memory only, never persisted: the library is kept on this device, but
// who-signed-on-a-phone is about one handoff, not the saved image.

export interface HeldAttestation {
  attestation: PhoneAttestation
  /** The base64 PNG exactly as the phone sent it. */
  received: string
  /** The library entry's image when the attestation was attached. */
  dataUrl: string
}

interface PhoneAttestState {
  byEntry: Record<string, HeldAttestation>
  attach: (entryId: string, held: HeldAttestation) => void
}

export const usePhoneAttestStore = create<PhoneAttestState>()((set) => ({
  byEntry: {},
  attach: (entryId, held) => {
    // Only onto an entry that still exists and still holds that image.
    const entry = useSignatureStore.getState().signatures.find((s) => s.id === entryId)
    if (!entry || entry.dataUrl !== held.dataUrl) return
    set((s) => ({ byEntry: { ...s.byEntry, [entryId]: held } }))
  },
}))

/** The attestation for a library entry, while it is still the same image. */
export function heldFor(
  byEntry: Record<string, HeldAttestation>,
  entry: { id: string; dataUrl: string } | null | undefined,
): HeldAttestation | null {
  if (!entry) return null
  const held = byEntry[entry.id]
  return held && held.dataUrl === entry.dataUrl ? held : null
}

// Drop records whose entry was removed or replaced.
useSignatureStore.subscribe((state) => {
  const { byEntry } = usePhoneAttestStore.getState()
  const ids = Object.keys(byEntry)
  if (!ids.length) return
  const keep: Record<string, HeldAttestation> = {}
  let changed = false
  for (const id of ids) {
    const entry = state.signatures.find((s) => s.id === id)
    if (entry && entry.dataUrl === byEntry[id].dataUrl) keep[id] = byEntry[id]
    else changed = true
  }
  if (changed) usePhoneAttestStore.setState({ byEntry: keep })
})
