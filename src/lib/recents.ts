import type { Annotation } from '../types/annotations'
import type { FormFieldValue } from '../stores/formStore'

const DB_NAME = 'universal-pdf'
const STORE = 'recents'
const VERSION = 1
const MAX_RECENTS = 8
const SLUG_LEN = 8
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

// The editing state persisted alongside a recent PDF so reopening it (from the
// recents list or a page refresh) restores the user's work — including
// signature-request boxes — editable and signable.
export interface RecentEdits {
  annotations?: Annotation[]
  formValues?: FormFieldValue[]
}

export interface RecentFile extends RecentEdits {
  id: string
  name: string
  size: number
  lastOpened: number
  bytes: ArrayBuffer
  slug?: string
}

export interface RecentMeta {
  id: string
  name: string
  size: number
  lastOpened: number
  slug?: string
}

export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LEN)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < SLUG_LEN; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < SLUG_LEN; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  }
  return out
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
}

export async function listRecents(): Promise<RecentMeta[]> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const all = req.result as RecentFile[]
        const metas = all
          .map((f) => ({ id: f.id, name: f.name, size: f.size, lastOpened: f.lastOpened, slug: f.slug }))
          .sort((a, b) => b.lastOpened - a.lastOpened)
        resolve(metas)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('recents.listRecents failed:', e)
    return []
  }
}

export async function getRecentBySlug(
  slug: string
): Promise<{ meta: RecentMeta; bytes: ArrayBuffer; edits: RecentEdits } | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const match = (req.result as RecentFile[]).find((f) => f.slug === slug)
        if (!match) return resolve(null)
        resolve({
          meta: { id: match.id, name: match.name, size: match.size, lastOpened: match.lastOpened, slug: match.slug },
          bytes: match.bytes,
          edits: { annotations: match.annotations, formValues: match.formValues }
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('recents.getRecentBySlug failed:', e)
    return null
  }
}

// Read a recent's stored edits (annotations + form values) by its id. Returns
// an empty object when the entry has none.
export async function getRecentEdits(id: string): Promise<RecentEdits> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const entry = req.result as RecentFile | undefined
        resolve({ annotations: entry?.annotations, formValues: entry?.formValues })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('recents.getRecentEdits failed:', e)
    return {}
  }
}

// Persist the user's live edits onto the recent entry for `name` (the same key
// saveRecent dedupes by). Called on a debounce as the document is edited, so
// closing and reopening the file restores the work.
export async function updateRecentEdits(
  name: string,
  edits: RecentEdits
): Promise<void> {
  if (!name) return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const all = allReq.result as RecentFile[]
        const entry = all.find((f) => f.name === name)
        // Only update an existing entry — saveRecent creates the row on open,
        // so there is always one to attach edits to for the open document.
        if (entry) {
          store.put({ ...entry, annotations: edits.annotations, formValues: edits.formValues })
        }
      }
      allReq.onerror = () => reject(allReq.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('recents.updateRecentEdits failed:', e)
  }
}

export async function saveRecent(name: string, bytes: ArrayBuffer): Promise<string | null> {
  try {
    const db = await openDB()
    let slug: string | null = null
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const all = allReq.result as RecentFile[]
        const existing = all.find((f) => f.name === name)
        let entrySlug = existing?.slug
        if (!entrySlug) {
          // Avoid (extremely unlikely) collisions with other recents
          do {
            entrySlug = generateSlug()
          } while (all.some((f) => f.slug === entrySlug))
        }
        slug = entrySlug
        const entry: RecentFile = {
          id: existing?.id ?? crypto.randomUUID(),
          name,
          size: bytes.byteLength,
          lastOpened: Date.now(),
          bytes,
          slug: entrySlug,
          // Preserve any edits already stored for this file — saveRecent is
          // called on every open (including reopens), and must not wipe the
          // annotations that updateRecentEdits has persisted.
          annotations: existing?.annotations,
          formValues: existing?.formValues
        }
        store.put(entry)
        // Evict oldest if over the cap
        const merged = [...all.filter((f) => f.id !== entry.id), entry].sort(
          (a, b) => b.lastOpened - a.lastOpened
        )
        merged.slice(MAX_RECENTS).forEach((f) => store.delete(f.id))
      }
      allReq.onerror = () => reject(allReq.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return slug
  } catch (e) {
    console.warn('recents.saveRecent failed:', e)
    return null
  }
}

export async function getRecent(id: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const entry = req.result as RecentFile | undefined
        resolve(entry?.bytes ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('recents.getRecent failed:', e)
    return null
  }
}

export async function renameRecent(oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const all = allReq.result as RecentFile[]
        const entry = all.find((f) => f.name === oldName)
        if (entry) {
          store.put({ ...entry, name: newName })
        }
      }
      allReq.onerror = () => reject(allReq.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('recents.renameRecent failed:', e)
  }
}

export async function deleteRecent(id: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('recents.deleteRecent failed:', e)
  }
}
