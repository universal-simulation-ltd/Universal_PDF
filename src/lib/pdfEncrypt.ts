// Turning a finished PDF into a locked one — the PDF half of the job. All the
// cryptography lives in `pdfCrypto.ts`; this file only knows which bytes of a
// document are supposed to be sealed and which have to stay readable.
//
// WHERE THIS SITS: last. `buildAnnotatedPdfBytes` bakes the annotations,
// `compressPdf` flattens if asked, and only then does this run — encrypting a
// document and *then* editing it would mean decrypting it again for no reason.
// It takes finished bytes and returns finished bytes.

import { PDFDocument, PDFName, PDFNumber, PDFHexString, PDFString, PDFArray, PDFDict, PDFStream, PDFRawStream, PDFBool, PDFRef, type PDFObject } from 'pdf-lib'
import { buildEncryptionValues, aesEncryptData, aesDecryptData, fileKeyFromPassword, randomBytes, checkUserPassword, PERMS_ALL, type Key } from './pdfCrypto'

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** Bytes as the `<...>` hex string PDF wants. Always hex, never a literal
 * `(...)` string: ciphertext is arbitrary binary and a literal would need
 * escaping for `\`, `(` and `)` that is easy to get subtly wrong. */
function hexString(bytes: Uint8Array): PDFHexString {
  return PDFHexString.of(toHex(bytes))
}

/**
 * Replace every string inside a direct object with its encrypted form.
 * Recurses through dictionaries and arrays; `PDFRef`s are left alone because
 * the object they point at is enumerated in its own right.
 *
 * Returns the replacement for `obj`, or `obj` itself when nothing changed.
 */
async function encryptStrings(obj: PDFObject, key: Key): Promise<PDFObject> {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return hexString(await aesEncryptData(key, obj.asBytes()))
  }
  if (obj instanceof PDFArray) {
    const items = obj.asArray()
    for (let i = 0; i < items.length; i++) {
      const next = await encryptStrings(items[i], key)
      if (next !== items[i]) obj.set(i, next)
    }
    return obj
  }
  if (obj instanceof PDFDict) {
    for (const [name, value] of obj.entries()) {
      const next = await encryptStrings(value, key)
      if (next !== value) obj.set(name, next)
    }
    return obj
  }
  return obj
}

const XREF = PDFName.of('XRef')
const METADATA = PDFName.of('Metadata')
const LENGTH = PDFName.of('Length')
const TYPE = PDFName.of('Type')

/**
 * Encrypt one document in place, in its pdf-lib object graph, then hand back
 * the /Encrypt values so the caller can attach them.
 */
async function encryptObjects(doc: PDFDocument, key: Key): Promise<void> {
  const context = doc.context
  // Snapshot: we reassign entries as we go, and enumerating live while
  // assigning is asking for a skipped object.
  const objects = [...context.enumerateIndirectObjects()]

  for (const [ref, obj] of objects) {
    if (obj instanceof PDFStream) {
      // ⚠️ Cross-reference streams are the document's own index. A reader has
      // to parse one BEFORE it has authenticated anybody, so it is never
      // encrypted — sealing it produces a file no reader can even find the
      // objects in. Harmless in practice (see the `useObjectStreams: false`
      // note in `encryptPdf` — the output has a classic xref table and no such
      // stream), but this is the wrong thing to leave to a downstream default.
      if (obj.dict.get(TYPE) === XREF) continue

      await encryptStrings(obj.dict, key)
      const plain = obj instanceof PDFRawStream ? obj.contents : obj.getContents()
      const sealed = await aesEncryptData(key, plain)
      // The 16-byte IV and the padding both make the stream longer, and a
      // stale /Length truncates it at parse time.
      obj.dict.set(LENGTH, PDFNumber.of(sealed.length))
      context.assign(ref, PDFRawStream.of(obj.dict, sealed))
      continue
    }
    const next = await encryptStrings(obj, key)
    if (next !== obj) context.assign(ref, next)
  }
}

export interface LockResult {
  bytes: Uint8Array
  /** Byte length after locking — encryption adds ~16-32 bytes per stream. */
  size: number
}

/**
 * Lock `bytes` with `password`, returning a PDF that no reader will open
 * without it.
 *
 * ⚠️ `useObjectStreams: false` is load-bearing, not a preference. pdf-lib
 * defaults it to TRUE, which packs many objects into one compressed stream —
 * and the rule for those is that the container is encrypted as a whole while
 * the objects inside it must NOT be encrypted again. Leaving the default on
 * would have us double-encrypt every string in the document, producing a file
 * that opens, authenticates, and then renders as garbage. Turning the packing
 * off costs a few KB and removes the entire class of bug.
 *
 * ⚠️ `updateMetadata: false` on load: pdf-lib otherwise stamps its own
 * Producer and ModDate, which would silently undo `scrubPdfMetadata` for
 * anyone who locked a document precisely because they cared who could see
 * what.
 *
 * `options.ownerPassword` is not wired to any UI and defaults to `password`.
 * It exists because /O and /OE are written either way, and a second password
 * is the only way to prove that half of `buildEncryptionValues` is right — a
 * mistake there is invisible while both passwords are the same string. See
 * `scripts/pdfEncrypt.test.mjs`.
 */
export async function encryptPdf(
  bytes: Uint8Array,
  password: string,
  options: { ownerPassword?: string } = {}
): Promise<LockResult> {
  if (!password) throw new Error('A password is required to lock a PDF.')

  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const values = await buildEncryptionValues(password, options.ownerPassword || password)

  await encryptObjects(doc, values.fileKey)

  const encryptDict = doc.context.obj({
    Filter: 'Standard',
    V: 5,
    R: 6,
    // ⚠️ NO top-level /Length. Adobe's Extension Level 3 draft asked for
    // `/Length 256` here and several writers still emit it, but ISO 32000-2
    // defines /Length only for /V 2 and 3 — Ghostscript warns
    // "/Length present in Encryption dictionary and /V is neither 2 nor 3"
    // and repairs the file. The per-crypt-filter /Length below is the one V5
    // actually uses, and it is in BYTES.
    CF: {
      StdCF: {
        CFM: 'AESV3',
        AuthEvent: 'DocOpen',
        Length: 32,
      },
    },
    StmF: 'StdCF',
    StrF: 'StdCF',
    P: PERMS_ALL,
    EncryptMetadata: PDFBool.True,
  }) as PDFDict
  // Set after the fact: `context.obj` would turn these into PDF *text* strings
  // and re-encode the bytes. They are raw hashes and must go out verbatim.
  encryptDict.set(PDFName.of('U'), hexString(values.U))
  encryptDict.set(PDFName.of('UE'), hexString(values.UE))
  encryptDict.set(PDFName.of('O'), hexString(values.O))
  encryptDict.set(PDFName.of('OE'), hexString(values.OE))
  encryptDict.set(PDFName.of('Perms'), hexString(values.Perms))

  // ⚠️ The /Encrypt dictionary is itself never encrypted — which is why it is
  // attached only now, after `encryptObjects` has already walked the document.
  // Registering it earlier would seal the very values a reader needs in order
  // to unseal anything.
  doc.context.trailerInfo.Encrypt = doc.context.register(encryptDict)

  // A file identifier is required alongside /Encrypt. Unlike revision 4, R6
  // does NOT mix /ID into the key, so this is an identifier and nothing more.
  const id = hexString(randomBytes(16))
  doc.context.trailerInfo.ID = doc.context.obj([id, id]) as PDFArray

  const out = await doc.save({ useObjectStreams: false })

  // Cheap insurance against the one failure that would be invisible until a
  // recipient hit it: a file locked with a password that does not open it.
  if (!(await checkUserPassword(password, values.U))) {
    throw new Error('Could not lock this PDF — the password check failed. Nothing has been saved.')
  }

  return { bytes: out, size: out.length }
}

/**
 * True when `bytes` is already an encrypted PDF. Locking one a second time
 * would need the first password to get in, so callers offer to save a copy
 * instead of silently producing an unopenable file.
 */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  // Look for `/Encrypt` in the trailer region. Scanning the tail is enough:
  // the trailer is at the end by construction, and this only needs to be right
  // often enough to show a warning.
  const tail = bytes.subarray(Math.max(0, bytes.length - 4096))
  const text = new TextDecoder('latin1').decode(tail)
  return /\/Encrypt\b/.test(text)
}

/** Thrown when a locked PDF is opened without the right password. */
export class WrongPasswordError extends Error {
  constructor(message = 'That password does not open this PDF.') {
    super(message)
    this.name = 'WrongPasswordError'
  }
}

/** Thrown for a locked PDF this app cannot open at all — not a wrong password. */
export class UnsupportedEncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEncryptionError'
  }
}

/** Mirror of `encryptStrings`. */
async function decryptStrings(obj: PDFObject, key: Key): Promise<PDFObject> {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    const raw = obj.asBytes()
    // ⚠️ NOT EVERY STRING IN A LOCKED PDF IS ACTUALLY CIPHERTEXT, whatever the
    // spec says, and one such string used to cost the whole document.
    // LibreOffice 26 writes the PDF 2.0 structure namespace
    // `/NS (http://iso.org/pdf2/ssn)` in the CLEAR inside an AES-256 file — 23
    // bytes, which cannot be a 16-byte IV followed by whole cipher blocks
    // under any key. Handing it to WebCrypto threw a bare `OperationError`
    // straight out of `decryptPdf`, and `pdfStore.loadFile` shows the message
    // of whatever it caught: the user was told "The operation failed for an
    // operation-specific reason" and did not get their file. pdf.js opens the
    // same document without complaint.
    //
    // So: a string that cannot be ciphertext, or that refuses to decrypt under
    // a key the /U check has already accepted, is left exactly as it is. The
    // worst case is a garbled /Author; the alternative is losing the document
    // over it. Stream bodies below are deliberately NOT this forgiving — they
    // are the content, and passing ciphertext off as content would be silent
    // corruption.
    if (raw.length % 16 !== 0) return obj
    try {
      return hexString(await aesDecryptData(key, raw))
    } catch {
      return obj
    }
  }
  if (obj instanceof PDFArray) {
    const items = obj.asArray()
    for (let i = 0; i < items.length; i++) {
      const next = await decryptStrings(items[i], key)
      if (next !== items[i]) obj.set(i, next)
    }
    return obj
  }
  if (obj instanceof PDFDict) {
    for (const [name, value] of obj.entries()) {
      const next = await decryptStrings(value, key)
      if (next !== value) obj.set(name, next)
    }
    return obj
  }
  return obj
}

function bytesOf(dict: PDFDict, key: string): Uint8Array | null {
  const v = dict.get(PDFName.of(key))
  if (v instanceof PDFHexString || v instanceof PDFString) return v.asBytes()
  return null
}

/**
 * Open a locked PDF and hand back the ordinary, unlocked bytes.
 *
 * ⚠️ WHY DECRYPT AT ALL, when pdf.js could just render it. Because pdf.js is
 * only the VIEWER here. Everything else this app does to a document —
 * annotating, flattening, compressing, reading embedded signature boxes — goes
 * through pdf-lib, which has no decryption of any kind and would see
 * ciphertext. Rendering a locked PDF without decrypting it would give a
 * document you can look at and nothing else, with every tool in the app
 * failing in its own way.
 *
 * ⚠️ THE OUTPUT IS PLAINTEXT. Callers must think about where they put it — in
 * particular it must not be written to `recents` (IndexedDB), which would
 * leave an unlocked copy of a deliberately locked document sitting on the
 * disk of whatever machine opened it. See `pdfStore.loadFile`.
 */
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  // ⚠️ `ignoreEncryption` does NOT decrypt anything — it tells pdf-lib to
  // parse the file's structure and leave the ciphertext alone, which is
  // exactly what is wanted: the object graph, the dictionary keys and the
  // /Encrypt dictionary itself are all plaintext in an encrypted PDF. Only
  // strings and stream bodies are sealed.
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context

  const encryptRef = context.trailerInfo.Encrypt
  const encryptDict = encryptRef ? context.lookup(encryptRef) : undefined
  if (!(encryptDict instanceof PDFDict)) {
    throw new UnsupportedEncryptionError('This PDF is not locked.')
  }

  const v = encryptDict.get(PDFName.of('V'))
  const r = encryptDict.get(PDFName.of('R'))
  const vNum = v instanceof PDFNumber ? v.asNumber() : 0
  const rNum = r instanceof PDFNumber ? r.asNumber() : 0
  // ⚠️ Only AES-256 is handled. The older schemes (RC4, AES-128) derive a
  // DIFFERENT key per object from the file ID and the object number, which is
  // a separate algorithm this file does not implement — and quietly producing
  // garbage would be far worse than saying so.
  if (vNum !== 5 || (rNum !== 5 && rNum !== 6)) {
    throw new UnsupportedEncryptionError(
      'This PDF uses an older encryption scheme Universal PDF cannot open. Try the app that locked it.'
    )
  }

  const U = bytesOf(encryptDict, 'U')
  const UE = bytesOf(encryptDict, 'UE')
  const O = bytesOf(encryptDict, 'O')
  const OE = bytesOf(encryptDict, 'OE')
  if (!U || !UE || !O || !OE || U.length < 48 || O.length < 48) {
    throw new UnsupportedEncryptionError('This PDF says it is locked but its encryption details are incomplete.')
  }

  const key = await fileKeyFromPassword(password, U, UE, O, OE)
  if (!key) throw new WrongPasswordError()

  // ⚠️ `/EncryptMetadata false` means the XMP metadata stream was deliberately
  // left readable — the whole point being that a search indexer can read the
  // title of a document it cannot open. Acrobat offers it as a checkbox. Every
  // OTHER stream is still sealed, so this is a per-stream exemption and not a
  // mode: decrypt that one anyway and AES either throws and costs the user the
  // document, or unpads by luck and writes noise over the metadata.
  const encryptMetadata = encryptDict.get(PDFName.of('EncryptMetadata'))
  const metadataIsPlain = encryptMetadata instanceof PDFBool && !encryptMetadata.asBoolean()

  for (const [ref, obj] of [...context.enumerateIndirectObjects()]) {
    // The /Encrypt dictionary is the one thing that was never encrypted.
    if (obj === encryptDict) continue
    if (obj instanceof PDFStream) {
      if (obj.dict.get(TYPE) === XREF) continue
      if (metadataIsPlain && obj.dict.get(TYPE) === METADATA) continue
      await decryptStrings(obj.dict, key)
      const sealed = obj instanceof PDFRawStream ? obj.contents : obj.getContents()
      let plain: Uint8Array
      try {
        plain = await aesDecryptData(key, sealed)
      } catch {
        // The password was already accepted against /U, so this is not a wrong
        // password — the file itself is damaged or truncated. Say so, because
        // the raw WebCrypto message ("The operation failed for an
        // operation-specific reason") is what the user would otherwise read.
        throw new Error('This PDF was unlocked but part of it could not be read — the file looks damaged.')
      }
      obj.dict.set(LENGTH, PDFNumber.of(plain.length))
      context.assign(ref, PDFRawStream.of(obj.dict, plain))
      continue
    }
    const next = await decryptStrings(obj, key)
    if (next !== obj) context.assign(ref, next)
  }

  // Drop the lock itself, or every reader would ask for a password again and
  // then fail to decrypt plaintext.
  context.trailerInfo.Encrypt = undefined
  // ⚠️ `delete()` on the context, not just the trailer: the dictionary is a
  // registered indirect object and would otherwise be written out as an
  // orphan, leaving a file that advertises AES-256 in its body while being
  // entirely readable.
  if (encryptRef instanceof PDFRef) context.delete(encryptRef)

  return await doc.save({ useObjectStreams: false })
}
