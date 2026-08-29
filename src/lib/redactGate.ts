import type { Annotation } from '../types/annotations'

/**
 * The typed confirmation that gates baking redactions in.
 *
 * Until a document is saved out, a redaction is movable black-box markup with
 * the text still underneath it; saving rasterises the page and the text is gone
 * for good. That is the app's one irreversible action, so it asks for the word
 * to be typed rather than for a click.
 *
 * ⚠️ Shared by BOTH ways out — the Export dialog and the exit guard's "Save and
 * exit" — precisely so the rule cannot come to mean two different things in the
 * two places a redaction can be baked.
 */
export const REDACT_CONFIRM_WORD = 'REDACT'

/**
 * The colour a redaction box is painted with, on screen and when it is baked.
 *
 * `fill` is a hex string chosen from the toolbar's colour swatches — but boxes
 * drawn before redactions took an arbitrary colour stored the WORDS `'black'`
 * and `'white'`, and those still arrive from an old `.unipdf` backup. Every
 * reader goes through here so the legacy shape is translated in exactly one
 * place rather than by each caller testing `fill === 'white'` for itself.
 */
export function redactFillHex(fill?: string): string {
  if (!fill || fill === 'black') return '#000000'
  if (fill === 'white') return '#ffffff'
  return fill
}

/**
 * True when a redaction's fill is pale enough to vanish against a white page.
 * Drives the editor-only outline and the colour of the "will be redacted" hint
 * — a white box on white paper is otherwise invisible until it is exported.
 */
export function isPaleFill(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  // Rec. 601 luma — good enough to pick a legible label colour.
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luma > 160
}

export function countRedactions(annotations: Annotation[]): number {
  return annotations.filter((a) => a.type === 'redact').length
}

export function isRedactConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === REDACT_CONFIRM_WORD.toLowerCase()
}
