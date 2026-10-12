import { useSignatureStore } from '../stores/signatureStore'
import {
  SIGNATURES_KEY,
  hasVaultKey,
  importVaultKey,
  isSealed,
  seal,
  setLockFlag,
  setVaultKey,
  unseal,
  useVaultStore,
  vaultPlugin,
} from './signatureVault'

/**
 * What the Sign menu and Tune this app do with the signature lock
 * (lib/signatureVault.ts has the storage, the crypto and the why). A separate
 * module because these need the signature store, and the store needs the vault.
 *
 * Every function here rejects when the person cancels the Face ID /
 * fingerprint / passcode prompt; callers treat that as "nothing changed".
 */

/** Face ID (or the like), then the saved signatures come back. */
export async function unlockSignatures(reason: string): Promise<void> {
  const { key } = await (await vaultPlugin()).p.getKey({ reason })
  const k = await importVaultKey(key)
  const raw = localStorage.getItem(SIGNATURES_KEY)
  setVaultKey(k)
  if (isSealed(raw)) {
    const saved = JSON.parse(await unseal(raw!, k)) as { state?: Record<string, unknown> }
    if (saved.state) useSignatureStore.setState(saved.state)
  }
  useVaultStore.setState({ locked: false })
}

/** Switch the lock on: a new key, and what is saved now is sealed with it. */
export async function enableSignatureLock(reason: string): Promise<void> {
  const { key } = await (await vaultPlugin()).p.createKey({ reason })
  const k = await importVaultKey(key)
  const raw = localStorage.getItem(SIGNATURES_KEY)
  if (raw && !isSealed(raw)) localStorage.setItem(SIGNATURES_KEY, await seal(raw, k))
  setVaultKey(k)
  setLockFlag(true)
  useVaultStore.setState({ enabled: true, locked: false })
}

/** Switch it off: unlock if need be, then store the library in the clear again. */
export async function disableSignatureLock(reason: string): Promise<void> {
  if (!hasVaultKey()) await unlockSignatures(reason)
  setLockFlag(false)
  useVaultStore.setState({ enabled: false, locked: false })
  // The store now holds exactly what was sealed (unlockSignatures restored
  // it); writing it back through persist, with the lock off, leaves it plain.
  const s = useSignatureStore.getState()
  useSignatureStore.setState({ signatures: [...s.signatures] })
  setVaultKey(null)
  await (await vaultPlugin()).p.deleteKey()
}

/**
 * Lock again whenever the app leaves the screen: the key is forgotten and the
 * library is cleared from memory (the sealed copy is untouched, see the ⚠️ in
 * signatureVault.ts). Phone app only; returns an uninstall function.
 */
export async function installSignatureAutoLock(): Promise<() => void> {
  const { App } = await import('@capacitor/app')
  const handle = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive || !useVaultStore.getState().enabled) return
    setVaultKey(null)
    useVaultStore.setState({ locked: true })
    useSignatureStore.setState({ signatures: [], activeId: null })
  })
  return () => void handle.remove()
}
