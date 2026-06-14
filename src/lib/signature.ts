// Shared signature styling/util used by the signature pad (which bakes the
// name/date into the image) and the annotation layer (which can drop the
// name/date as separate text), so the ink colour and date format stay in sync.

// A deep blue-black ink. Reads as a real pen rather than crisp digital black.
export const SIGNATURE_INK = '#1a3a73'

// The date a signature is applied. Short, readable form e.g. "14 Jun 2026".
export function formatSigningDate(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}
