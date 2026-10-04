import { getT } from '../i18n/runtime.ts'

// The parts of `pdfEncrypt.ts` the document-OPEN path needs — "is this file
// locked?" and the errors an unlock can raise — without pdf-lib. Opening a
// plain PDF must not have to download and parse pdf-lib just to learn that it
// has no /Encrypt. `pdfEncrypt.ts` re-exports all of this.

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
  constructor(message = getT()('lib.unlock_wrong_password')) {
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
