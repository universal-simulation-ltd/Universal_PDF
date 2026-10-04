// Offline signing of a "Send to sign" request.
//
// A signer can open a request, sign it and press "Finish & send back" with no
// connection: the signed copy waits here, on this device, and goes back the
// moment the device is online again — from the signing page if it is still
// open, or from Universal PDF the next time it starts.
//
// Two IndexedDB stores, in their own database (not `universal-pdf`, whose
// schema version belongs to the recent-files list):
//
//   • `docs`  — the document as the signer last opened it, so the link opens
//     offline afterwards. ⚠️ ONLY for requests WITHOUT email verification. A
//     verified request exists so that holding the link is not enough; keeping
//     its document readable on the device with no check at all would undo
//     that on any shared machine. (The verification session itself is never
//     stored anywhere — see SignRequestPage.)
//   • `queue` — signed copies waiting to go back. Each carries the hash of the
//     version it was signed on (`baseSha256`), and the server refuses it with
//     `stale_version` if another party has signed since — so a submission
//     that sat offline for a day can never erase somebody else's signature.
//
// ⚠️ Syncing only ever SUBMITS. It never asks for or checks an access code: a
// verified request has five tries at its emailed code, and a retry loop that
// spent them while the signer was on a train would lock them out. A queued
// submission that needs verification waits, marked, until the signer opens
// the link and verifies by hand.

const DB_NAME = 'universal-pdf-signing'
const VERSION = 1
/** A cached document is dropped after this long unused. */
const DOC_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface CachedSignDoc {
  token: string
  docName: string
  bytes: ArrayBuffer
  sha256: string
  savedAt: number
}

export type QueueState = 'queued' | 'needs_verification' | 'stale' | 'failed'

export interface QueuedSubmission {
  token: string
  docName: string
  /** The signed copy. */
  bytes: Uint8Array
  /** Only what the server classifies for its provenance log. */
  annotations: Array<{ type?: string; opacity?: number; pageIndex?: number }>
  /** SHA-256 of the version it was signed on. */
  baseSha256: string | null
  queuedAt: number
  state: QueueState
  lastError?: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'token' })
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'token' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(store: 'docs' | 'queue', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDB()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(store, mode)
      const req = run(t.objectStore(store))
      let result: T | undefined
      if (req) req.onsuccess = () => (result = req.result)
      t.oncomplete = () => resolve(result)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } finally {
    db.close()
  }
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ── The cached document ──────────────────────────────────────────────────────

export async function cacheSignDoc(doc: CachedSignDoc): Promise<void> {
  try {
    await tx('docs', 'readwrite', (s) => {
      s.put(doc)
    })
  } catch (e) {
    console.warn('Could not keep the document for offline use', e)
  }
}

export async function getCachedSignDoc(token: string): Promise<CachedSignDoc | null> {
  try {
    const doc = (await tx<CachedSignDoc>('docs', 'readonly', (s) => s.get(token))) ?? null
    if (doc && Date.now() - doc.savedAt > DOC_TTL_MS) {
      await forgetSignDoc(token)
      return null
    }
    return doc
  } catch {
    return null
  }
}

export async function forgetSignDoc(token: string): Promise<void> {
  try {
    await tx('docs', 'readwrite', (s) => {
      s.delete(token)
    })
  } catch {
    /* nothing to forget */
  }
}

// ── The queue ────────────────────────────────────────────────────────────────

export async function enqueueSubmission(item: QueuedSubmission): Promise<void> {
  await tx('queue', 'readwrite', (s) => {
    s.put(item)
  })
  notify()
}

export async function getQueued(token: string): Promise<QueuedSubmission | null> {
  try {
    return (await tx<QueuedSubmission>('queue', 'readonly', (s) => s.get(token))) ?? null
  } catch {
    return null
  }
}

export async function listQueued(): Promise<QueuedSubmission[]> {
  try {
    return (await tx<QueuedSubmission[]>('queue', 'readonly', (s) => s.getAll())) ?? []
  } catch {
    return []
  }
}

export async function removeQueued(token: string): Promise<void> {
  await tx('queue', 'readwrite', (s) => {
    s.delete(token)
  })
  notify()
}

async function markQueued(item: QueuedSubmission, state: QueueState, lastError?: string) {
  await tx('queue', 'readwrite', (s) => {
    s.put({ ...item, state, lastError })
  })
  notify()
}

// Pages that show the queue re-read it when it changes (same tab).
const listeners = new Set<() => void>()
function notify() {
  for (const l of listeners) l()
}
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The outcome of trying one queued submission. */
export type SyncOutcome =
  | { token: string; docName: string; result: 'sent'; completed: boolean; certId: string | null }
  /** The server already had this party's signature — nothing left to do. */
  | { token: string; docName: string; result: 'already' }
  | { token: string; docName: string; result: 'stale' | 'needs_verification' | 'offline' | 'failed'; error?: string }

/** What `submit` needs; the real one is `submitSignedPdf` in signRequestClient. */
export type Submit = (item: QueuedSubmission, session?: string) => Promise<{
  ok: boolean
  code?: string
  error?: string
  network?: boolean
  completed?: boolean
  cert_id?: string
}>

/**
 * Send one queued submission. `session` is passed only by the signing page,
 * after the signer has verified by hand — the background sync never has one.
 */
export async function sendQueued(item: QueuedSubmission, submit: Submit, session?: string): Promise<SyncOutcome> {
  const base = { token: item.token, docName: item.docName }
  let res: Awaited<ReturnType<Submit>>
  try {
    res = await submit(item, session)
  } catch (e) {
    return { ...base, result: 'offline', error: (e as Error).message }
  }
  if (res.ok) {
    await removeQueued(item.token)
    await forgetSignDoc(item.token)
    return { ...base, result: 'sent', completed: !!res.completed, certId: res.cert_id ?? null }
  }
  if (res.network) return { ...base, result: 'offline', error: res.error }
  if (res.code === 'already_signed' || res.code === 'completed') {
    await removeQueued(item.token)
    await forgetSignDoc(item.token)
    return { ...base, result: 'already' }
  }
  if (res.code === 'stale_version') {
    await markQueued(item, 'stale', res.error)
    await forgetSignDoc(item.token)
    return { ...base, result: 'stale', error: res.error }
  }
  if (res.code === 'verification_required' || res.code === 'verification_expired') {
    await markQueued(item, 'needs_verification', res.error)
    return { ...base, result: 'needs_verification', error: res.error }
  }
  // Expired, deleted, too large… — not something a retry will fix.
  await markQueued(item, 'failed', res.error)
  return { ...base, result: 'failed', error: res.error }
}

/**
 * Send everything that is waiting and can go without the signer: `queued`
 * entries only. One at a time; stops at the first network failure (still
 * offline — the rest would fail the same way).
 */
export async function syncQueue(submit: Submit): Promise<SyncOutcome[]> {
  const out: SyncOutcome[] = []
  for (const item of await listQueued()) {
    if (item.state !== 'queued') continue
    const r = await sendQueued(item, submit)
    out.push(r)
    if (r.result === 'offline') break
  }
  return out
}

/** True when the browser says it has no connection. Optimistic when it can't
 *  tell: a real send is the only reliable test, and it is tried anyway. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
