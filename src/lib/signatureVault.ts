import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
import { isNativeShell } from './nativeOpen'

/**
 * "Lock saved signatures" in the phone app (2026-10-12).
 *
 * With the lock on, the saved-signature library (`universal-pdf-signatures`,
 * stores/signatureStore.ts) is kept in localStorage ENCRYPTED, AES-GCM, with a
 * key the phone only hands over after Face ID, Touch ID, a fingerprint or the
 * screen lock:
 *
 *   iOS      ios/App/App/SignatureVault.swift — the Keychain, `.userPresence`
 *   Android  android/.../SignatureVaultPlugin.java — the AndroidKeyStore
 *            behind BiometricPrompt (Android 11+)
 *
 * The key lives in memory only while unlocked, and is dropped whenever the app
 * goes to the background (signatureLock.ts). Nothing leaves the phone.
 *
 * ⚠️ WHILE LOCKED, NOTHING IS WRITTEN. The store starts empty when the stored
 * copy is sealed, and any write from that empty state would replace somebody's
 * signatures with nothing. `signatureStorage.setItem` therefore refuses to
 * write without the key, and the Sign menu offers Unlock instead of the
 * library (SignatureMenu).
 */

export const SIGNATURES_KEY = 'universal-pdf-signatures'
const LOCK_FLAG = 'universal-pdf-signature-lock'

export type Biometry = 'faceID' | 'touchID' | 'biometric' | 'passcode' | 'none'

interface VaultPlugin {
  isAvailable(): Promise<{ available: boolean; biometry: Biometry }>
  createKey(options: { reason: string }): Promise<{ key: string }>
  getKey(options: { reason: string }): Promise<{ key: string }>
  deleteKey(): Promise<void>
}

// See lib/documentScanner.ts: never resolve a promise with a plugin.
let plugin: Promise<{ p: VaultPlugin }> | null = null
export function vaultPlugin(): Promise<{ p: VaultPlugin }> {
  plugin ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    p: registerPlugin<VaultPlugin>('SignatureVault'),
  }))
  return plugin
}

interface VaultState {
  /** The lock is switched on (Tune this app). */
  enabled: boolean
  /** On, and not unlocked since the app last came to the front. */
  locked: boolean
}

const flagOn = (): boolean => {
  try {
    return localStorage.getItem(LOCK_FLAG) === '1'
  } catch {
    return false
  }
}

// Switched on means locked until the first unlock: without the key nothing can
// be saved (signatureStorage), so the app must ask before anything is added.
export const useVaultStore = create<VaultState>(() => ({ enabled: flagOn(), locked: flagOn() }))

let key: CryptoKey | null = null

export function setVaultKey(k: CryptoKey | null): void {
  key = k
}
export function hasVaultKey(): boolean {
  return key !== null
}
export function setLockFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOCK_FLAG, '1')
    else localStorage.removeItem(LOCK_FLAG)
  } catch { /* storage refused: nothing to remember it in */ }
}

/** Can this phone lock the signatures, and with what? Off the phone apps: no. */
export async function vaultAvailability(): Promise<{ available: boolean; biometry: Biometry }> {
  if (!isNativeShell()) return { available: false, biometry: 'none' }
  try {
    return await (await vaultPlugin()).p.isAvailable()
  } catch {
    return { available: false, biometry: 'none' }
  }
}

// ── AES-GCM ──────────────────────────────────────────────────────────────────

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function importVaultKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export const isSealed = (raw: string | null): boolean => !!raw && raw.startsWith('{"vault":1')

export async function seal(plain: string, k: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plain)))
  return JSON.stringify({ vault: 1, iv: b64(iv), ct: b64(ct) })
}

export async function unseal(sealed: string, k: CryptoKey): Promise<string> {
  const { iv, ct } = JSON.parse(sealed) as { iv: string; ct: string }
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct))
  return new TextDecoder().decode(plain)
}

// ── The signature store's storage ─────────────────────────────────────────────

// Writes are encrypted asynchronously, so they are chained: two quick edits
// must land in the order they were made.
let writes: Promise<void> = Promise.resolve()

export const signatureStorage: StateStorage = {
  getItem(name) {
    const raw = localStorage.getItem(name)
    if (isSealed(raw)) {
      useVaultStore.setState({ enabled: true, locked: true })
      return null
    }
    return raw
  },
  setItem(name, value) {
    if (!useVaultStore.getState().enabled) {
      localStorage.setItem(name, value)
      return
    }
    const k = key
    if (!k) return // locked: see the ⚠️ above
    writes = writes
      .then(async () => localStorage.setItem(name, await seal(value, k)))
      .catch((err) => console.error('Could not save the locked signatures:', err))
  },
  removeItem(name) {
    localStorage.removeItem(name)
  },
}
