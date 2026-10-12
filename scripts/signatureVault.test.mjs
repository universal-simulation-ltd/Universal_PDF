// "Lock saved signatures" (src/lib/signatureVault.ts): the sealing, and the one
// rule that protects people's signatures — while locked, nothing is written.
//
//   npm run test:signature-vault
//
// Runs on Node's own WebCrypto with a stand-in localStorage; the Face ID half
// is native and is checked on a phone.

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis

const {
  importVaultKey, seal, unseal, isSealed, signatureStorage, setVaultKey, useVaultStore, SIGNATURES_KEY,
} = await import('../src/lib/signatureVault.ts')

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const tick = () => new Promise((r) => setTimeout(r, 20))
const rawKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
const key = await importVaultKey(rawKey)
const library = JSON.stringify({ state: { signatures: [{ id: 'a', name: 'Sam', dataUrl: 'data:image/png;base64,AAAA' }] }, version: 0 })

console.log('\nSealing\n')
const sealed = await seal(library, key)
ok(isSealed(sealed), 'a sealed copy is recognised as sealed')
ok(!sealed.includes('Sam') && !sealed.includes('data:image'), 'nothing of the signature is readable in it')
ok((await unseal(sealed, key)) === library, 'it opens back to exactly what was sealed')
const other = await importVaultKey(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))
let refused = false
try { await unseal(sealed, other) } catch { refused = true }
ok(refused, 'another key cannot open it')
ok(!isSealed(library) && !isSealed(null), 'a plain library is not taken for a sealed one')

console.log('\nLock off: plain storage, as before\n')
useVaultStore.setState({ enabled: false, locked: false })
signatureStorage.setItem(SIGNATURES_KEY, library)
ok(store.get(SIGNATURES_KEY) === library, 'written as it is')
ok(signatureStorage.getItem(SIGNATURES_KEY) === library, 'read as it is')

console.log('\nLock on and unlocked: every write is sealed\n')
useVaultStore.setState({ enabled: true, locked: false })
setVaultKey(key)
signatureStorage.setItem(SIGNATURES_KEY, library)
await tick()
ok(isSealed(store.get(SIGNATURES_KEY)), 'the stored copy is sealed')
ok((await unseal(store.get(SIGNATURES_KEY), key)) === library, 'and holds the library')

console.log('\nLocked: nothing is written, nothing is read\n')
const before = store.get(SIGNATURES_KEY)
setVaultKey(null)
useVaultStore.setState({ locked: true })
signatureStorage.setItem(SIGNATURES_KEY, JSON.stringify({ state: { signatures: [] }, version: 0 }))
await tick()
ok(store.get(SIGNATURES_KEY) === before, 'an empty library written while locked does NOT replace the sealed one')
useVaultStore.setState({ enabled: false, locked: false })
ok(signatureStorage.getItem(SIGNATURES_KEY) === null, 'reading a sealed copy gives nothing to show')
ok(useVaultStore.getState().enabled && useVaultStore.getState().locked, '…and marks the lock on and locked')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
