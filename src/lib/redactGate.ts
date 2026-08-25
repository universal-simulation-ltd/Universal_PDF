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

export function countRedactions(annotations: Annotation[]): number {
  return annotations.filter((a) => a.type === 'redact').length
}

export function isRedactConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === REDACT_CONFIRM_WORD.toLowerCase()
}
