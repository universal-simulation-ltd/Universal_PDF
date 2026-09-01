// The PDF standard security handler, revision 6 (AES-256) — the cryptography
// only. `pdfEncrypt.ts` next door does the PDF-object plumbing; nothing here
// knows what a PDF is.
//
// ⚠️ This module imports NOTHING, on purpose. `scripts/pdfCrypto.test.mjs`
// imports it directly under Node's type-stripping, same landmine as
// `renderQueue.ts` — one import of React or a store and the test goes red for
// a reason that has nothing to do with the crypto.
//
// WHY REVISION 6 AND NOTHING ELSE
//
// PDF has shipped five encryption schemes and four of them are worthless:
//
//   RC4 40-bit    Recoverable in hours REGARDLESS of the password. The key
//                 space is the weakness, not the passphrase.
//   RC4 128-bit   Fast hash; a GPU tries hundreds of millions of guesses/sec.
//   AES-128 (R4)  Same problem — the password check is one MD5-ish round.
//   AES-256 (R5)  Adobe 9's botched draft: a SINGLE SHA-256. Cracks as fast as
//                 the disk feeds it.
//   AES-256 (R6)  ISO 32000-2. Algorithm 2.B below is a deliberately slow
//                 hash — 64+ rounds of SHA-2 and AES over a 64x-repeated
//                 block. THIS is the only one worth calling a lock.
//
// So R6 is the only revision this file can write. There is no `revision`
// parameter to get wrong.
//
// ⚠️ WHAT THIS DOES NOT DO: the *owner* password, i.e. PDF's "no printing, no
// copying" permission flags. Those are not encryption in any sense — the file
// is encrypted under the EMPTY user password and every viewer can already read
// it, and is merely asked politely to honour the flags. `qpdf --decrypt`
// removes them without knowing any password at all. Offering that next to a
// real lock would put a checkbox that does nothing beside one that does
// everything, and no user could tell which was which.

/** 32 bytes: an AES-256 key. */
export type Key = Uint8Array

const enc = new TextEncoder()

/**
 * Password bytes as the standard security handler wants them for R6: UTF-8,
 * truncated to 127 BYTES (not characters).
 *
 * ⚠️ The truncation is on the byte length, so a password of emoji or CJK runs
 * out well before 127 typed characters — and cutting mid-sequence would leave
 * a partial code point that a reader normalising its own input might not
 * reproduce. We cut on a character boundary instead and accept being one or
 * two bytes under.
 *
 * ⚠️ The spec also asks for SASLprep (RFC 4013) normalisation first. Almost
 * nothing implements it — pdf.js does not, and neither do the common writers —
 * so applying it here would make our files disagree with the readers they have
 * to open in. For ASCII passwords and for every PIN it is a no-op anyway.
 * `passwordWarning` below is what tells the user when that stops being true.
 */
export function passwordBytes(password: string): Uint8Array {
  const full = enc.encode(password)
  if (full.length <= 127) return full
  let cut = password.length
  while (cut > 0 && enc.encode(password.slice(0, cut)).length > 127) cut--
  return enc.encode(password.slice(0, cut))
}

/**
 * Non-null when `password` contains something whose byte-for-byte round trip
 * through another PDF reader we cannot vouch for — see the SASLprep note
 * above. Latin-1 and below is safe everywhere; beyond that a reader that DOES
 * normalise may hash different bytes than we did and reject the right
 * password.
 */
export function passwordWarning(password: string): string | null {
  if (enc.encode(password).length > 127) {
    return 'Only the first 127 bytes of a password count. Anything past that is ignored.'
  }
  for (const ch of password) {
    if (ch.codePointAt(0)! > 0xFF) {
      return 'Accented or non-Latin characters can be typed differently by other PDF apps. A password of letters, digits and punctuation is safest.'
    }
  }
  return null
}

function subtle(): SubtleCrypto {
  // ⚠️ `crypto.subtle` is undefined outside a secure context. The web app is
  // HTTPS and both Capacitor shells serve from localhost (which counts), so
  // this should never fire — but a plain-http LAN preview of the dev build is
  // one `npm run dev -- --host` away, and there the failure is silent unless
  // we say so.
  const s = globalThis.crypto?.subtle
  if (!s) {
    throw new Error(
      'This browser will not do encryption on an insecure connection. Open Universal PDF over https:// (or localhost) and try again.'
    )
  }
  return s
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

async function sha(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  const buf = await subtle().digest(`SHA-${bits}`, data as BufferSource)
  return new Uint8Array(buf)
}

/**
 * AES-CBC encrypt with NO padding. `data.length` must be a multiple of 16.
 *
 * ⚠️ WebCrypto cannot do this directly: its AES-CBC ALWAYS appends a PKCS#7
 * block, and there is no flag to turn that off. But the padding is appended,
 * not interleaved — every earlier block is byte-identical to the unpadded
 * answer — so dropping the trailing 16 bytes is exact, not an approximation.
 * This is the standard workaround and it is why this file needs no AES
 * implementation of its own (and why the bundle grows by 0 bytes).
 */
async function aesCbcNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length % 16 !== 0) throw new Error('aesCbcNoPad: length must be a multiple of 16')
  const k = await subtle().importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt'])
  const out = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, data as BufferSource))
  return out.subarray(0, out.length - 16)
}

/**
 * AES-256-CBC with a fresh random IV prepended to the ciphertext, PKCS#7
 * padded — the wire format AESV3 uses for every string and every stream in the
 * document. WebCrypto's default padding is the right one here, so unlike
 * `aesCbcNoPad` this is a straight call.
 */
export async function aesEncryptData(key: Key, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(16)
  const k = await subtle().importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt'])
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, data as BufferSource))
  const out = new Uint8Array(16 + ct.length)
  out.set(iv, 0)
  out.set(ct, 16)
  return out
}

/**
 * Algorithm 2.B — the hardened hash that makes R6 worth using. Transcribed
 * from ISO 32000-2 and checked line-by-line against pdf.js's `PDF20._hash`,
 * which is the implementation that will be READING our files.
 *
 * ⚠️ The loop bound is the whole security property. It runs at least 64
 * rounds, then keeps going while the last byte of E exceeds (round - 32) — so
 * the count is password-dependent and cannot be shortcut. Replace the
 * condition with a fixed 64 and everything still round-trips perfectly against
 * itself while silently becoming a different, weaker hash that no other reader
 * agrees with. There is no test that fails "a bit" here.
 */
async function hash2B(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  const seed = new Uint8Array(pw.length + salt.length + udata.length)
  seed.set(pw, 0)
  seed.set(salt, pw.length)
  seed.set(udata, pw.length + salt.length)

  let k = (await sha(256, seed)).subarray(0, 32)
  // Seeded so the loop's `e[e.length - 1]` has something to read on round 0.
  // Typed against ArrayBufferLike because `aesCbcNoPad` hands back a subarray,
  // whose buffer TypeScript will not narrow to a plain ArrayBuffer.
  let e: Uint8Array<ArrayBufferLike> = new Uint8Array([0])
  let i = 0
  while (i < 64 || e[e.length - 1] > i - 32) {
    const unit = new Uint8Array(pw.length + k.length + udata.length)
    unit.set(pw, 0)
    unit.set(k, pw.length)
    unit.set(udata, pw.length + k.length)

    const k1 = new Uint8Array(unit.length * 64)
    for (let j = 0; j < 64; j++) k1.set(unit, j * unit.length)

    e = await aesCbcNoPad(k.subarray(0, 16), k.subarray(16, 32), k1)

    let sum = 0
    for (let z = 0; z < 16; z++) sum += e[z]
    const remainder = sum % 3
    k = remainder === 0 ? await sha(256, e) : remainder === 1 ? await sha(384, e) : await sha(512, e)
    i++
  }
  return k.subarray(0, 32)
}

export interface EncryptionValues {
  /** 48 bytes: hash(32) || validation salt(8) || key salt(8). */
  U: Uint8Array
  /** 32 bytes: the file key wrapped under the user password. */
  UE: Uint8Array
  O: Uint8Array
  OE: Uint8Array
  /** 16 bytes: the permission bits, encrypted, so they cannot be edited out. */
  Perms: Uint8Array
  /** The random file encryption key everything in the document is sealed with. */
  fileKey: Key
  /** The value written to /P. */
  permissions: number
}

/**
 * Every permission granted.
 *
 * Bits 1-2 are reserved-zero and the rest are "allowed" flags, so all-granted
 * is 0xFFFFFFFC read as a signed 32-bit int. We hand out full rights on
 * purpose: the password IS the protection here, and someone who typed it
 * should not then be told they may not print.
 */
export const PERMS_ALL = -4

/**
 * Build everything the /Encrypt dictionary needs for one document.
 *
 * `ownerPassword` defaults to the user password. That is deliberate — a
 * separate owner password only buys the permission theatre described at the
 * top of this file, and leaving it empty (which some writers do) would mean
 * ANY viewer could open the file with no password at all.
 */
export async function buildEncryptionValues(
  userPassword: string,
  ownerPassword: string = userPassword
): Promise<EncryptionValues> {
  const fileKey = randomBytes(32)
  const upw = passwordBytes(userPassword)
  const opw = passwordBytes(ownerPassword)

  const uValidationSalt = randomBytes(8)
  const uKeySalt = randomBytes(8)
  const empty = new Uint8Array(0)
  const zeroIv = new Uint8Array(16)

  const uHash = await hash2B(upw, uValidationSalt, empty)
  const U = new Uint8Array(48)
  U.set(uHash, 0)
  U.set(uValidationSalt, 32)
  U.set(uKeySalt, 40)

  const uIntermediate = await hash2B(upw, uKeySalt, empty)
  const UE = await aesCbcNoPad(uIntermediate, zeroIv, fileKey)

  // ⚠️ The owner half hashes the password against the FULL 48-byte U, not the
  // password alone. Pass U's first 32 bytes and every reader rejects the owner
  // password while the user password still works — a bug that survives any
  // test that only ever opens the file the normal way.
  const oValidationSalt = randomBytes(8)
  const oKeySalt = randomBytes(8)
  const oHash = await hash2B(opw, oValidationSalt, U)
  const O = new Uint8Array(48)
  O.set(oHash, 0)
  O.set(oValidationSalt, 32)
  O.set(oKeySalt, 40)

  const oIntermediate = await hash2B(opw, oKeySalt, U)
  const OE = await aesCbcNoPad(oIntermediate, zeroIv, fileKey)

  // Algorithm 10. The permission bits are repeated here inside the encrypted
  // envelope so that editing /P in a hex editor is detectable: a reader
  // compares the two and the plaintext copy loses.
  const permsBlock = new Uint8Array(16)
  const view = new DataView(permsBlock.buffer)
  view.setInt32(0, PERMS_ALL, true) // little-endian, per spec
  permsBlock[4] = 0xFF
  permsBlock[5] = 0xFF
  permsBlock[6] = 0xFF
  permsBlock[7] = 0xFF
  permsBlock[8] = 0x54 // 'T' — /EncryptMetadata true
  permsBlock[9] = 0x61 // 'a'
  permsBlock[10] = 0x64 // 'd'
  permsBlock[11] = 0x62 // 'b'
  permsBlock.set(randomBytes(4), 12)
  // A single block with a zero IV is exactly ECB, which WebCrypto refuses to
  // expose by name — the spec asks for ECB here.
  const Perms = await aesCbcNoPad(fileKey, zeroIv, permsBlock)

  return { U, UE, O, OE, Perms, fileKey, permissions: PERMS_ALL }
}

/**
 * AES-CBC decrypt with NO padding. `data.length` must be a multiple of 16.
 *
 * ⚠️ The mirror of `aesCbcNoPad`, and harder: WebCrypto REQUIRES valid PKCS#7
 * on decrypt and throws otherwise, so unlike the encrypt direction we cannot
 * just trim. Instead we append one block chosen so that it decrypts to exactly
 * the padding WebCrypto insists on seeing.
 *
 * For CBC, plaintext block n is `D(Cn) XOR C(n-1)`. We want the appended block
 * to come out as sixteen 0x10 bytes, so it must be `E(0x10... XOR Clast)` —
 * one ECB encryption, which is a single-block zero-IV CBC encryption, which is
 * `aesCbcNoPad`. Then WebCrypto strips the block we engineered and hands back
 * exactly the plaintext.
 */
async function aesCbcNoPadDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0 || data.length % 16 !== 0) {
    throw new Error('aesCbcNoPadDecrypt: length must be a positive multiple of 16')
  }
  const last = data.subarray(data.length - 16)
  const target = new Uint8Array(16)
  for (let i = 0; i < 16; i++) target[i] = last[i] ^ 0x10
  const synthetic = await aesCbcNoPad(key, new Uint8Array(16), target)

  const padded = new Uint8Array(data.length + 16)
  padded.set(data, 0)
  padded.set(synthetic, data.length)

  const k = await subtle().importKey('raw', key as BufferSource, 'AES-CBC', false, ['decrypt'])
  const out = await subtle().decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, padded as BufferSource)
  return new Uint8Array(out)
}

/**
 * Undo `aesEncryptData`: the first 16 bytes are the IV, the rest is PKCS#7
 * padded ciphertext that WebCrypto unpads for us.
 *
 * ⚠️ Returns empty for a 0- or 16-byte input rather than throwing. A PDF may
 * legitimately contain an empty string, and some writers emit a bare IV with
 * no ciphertext block for it; treating that as a corrupt document would fail
 * the whole file over an empty /Author.
 */
export async function aesDecryptData(key: Key, data: Uint8Array): Promise<Uint8Array> {
  if (data.length <= 16) return new Uint8Array(0)
  const iv = data.subarray(0, 16)
  const body = data.subarray(16)
  const k = await subtle().importKey('raw', key as BufferSource, 'AES-CBC', false, ['decrypt'])
  const out = await subtle().decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, body as BufferSource)
  return new Uint8Array(out)
}

/**
 * Recover the file encryption key from a password, or null when the password
 * is wrong.
 *
 * Tries the user password first and the owner password second — the same order
 * a reader uses. Both are supported because a document locked by another app
 * may well have been given two, and refusing the owner password on a file we
 * can plainly open would be a bug the user could not diagnose.
 */
export async function fileKeyFromPassword(
  password: string,
  U: Uint8Array,
  UE: Uint8Array,
  O: Uint8Array,
  OE: Uint8Array
): Promise<Key | null> {
  const pw = passwordBytes(password)
  const zeroIv = new Uint8Array(16)

  const userHash = await hash2B(pw, U.subarray(32, 40), new Uint8Array(0))
  if (equal(userHash, U.subarray(0, 32))) {
    const intermediate = await hash2B(pw, U.subarray(40, 48), new Uint8Array(0))
    return await aesCbcNoPadDecrypt(intermediate, zeroIv, UE)
  }

  // ⚠️ Against the full 48-byte /U, exactly as when it was written. See the
  // matching note in `buildEncryptionValues`.
  const u48 = U.subarray(0, 48)
  const ownerHash = await hash2B(pw, O.subarray(32, 40), u48)
  if (equal(ownerHash, O.subarray(0, 32))) {
    const intermediate = await hash2B(pw, O.subarray(40, 48), u48)
    return await aesCbcNoPadDecrypt(intermediate, zeroIv, OE)
  }

  return null
}

/** Constant-time-ish equality. Length is public here, contents are not. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Re-derive the user hash for a candidate password and compare against a
 * document's /U. Only used by the tests and by `pdfEncrypt`'s self-check —
 * pdf.js does this for real when opening a file.
 */
export async function checkUserPassword(password: string, U: Uint8Array): Promise<boolean> {
  const hash = await hash2B(passwordBytes(password), U.subarray(32, 40), new Uint8Array(0))
  let diff = 0
  for (let i = 0; i < 32; i++) diff |= hash[i] ^ U[i]
  return diff === 0
}
