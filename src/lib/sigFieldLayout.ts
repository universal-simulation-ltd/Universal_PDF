// Where a "Sign here" box's extras go: the "Please sign here" label ABOVE the
// box, and the Name: / Date: fill-in fields UNDER it. One answer for the editor
// preview (AnnotationLayer's SigField) and the export (addSignatureFields), so
// the file comes out the way the page showed it.
//
// James, 2026-10-13: the caption used to be drawn INSIDE the box ("Sign here •
// Name • Date"), where a short box cut it off. Now the box is a plain dashed
// outline, and each extra is the sender's choice: the label (some contracts
// already say where to sign) and the name/date fields (some already have
// their own).
//
// Pure (no canvas, no pdf-lib). Coordinates are page points, y DOWN — the
// annotation's own space.

export const SIG_LABEL_SIZE = 10
export const SIG_DETAIL_SIZE = 10
export const SIG_FIELD_HEIGHT = 16
const LABEL_GAP = 4
const ROW_GAP = 4
const ROWS_GAP = 6
// The fill-in fields are never narrower than this, however small the box: a
// name has to fit.
const MIN_FIELD_WIDTH = 120

export type SigFieldBox = { x: number; y: number; width: number; height: number }

export type SigFieldLayout = {
  /** Top-left of the label's text, or null when there is no label. */
  label: { x: number; y: number } | null
  /** The Name: and Date: rows, in that order; empty when not asked for. */
  rows: { key: 'name' | 'date'; textX: number; textY: number; field: SigFieldBox }[]
}

/**
 * `labelColumn` is the width the "Name:" / "Date:" words take (the wider of the
 * two, in this language) — see `sigLabelColumn`.
 */
export function sigFieldLayout(
  box: SigFieldBox,
  opts: { label: boolean; details: boolean; labelColumn: number }
): SigFieldLayout {
  let below = box.y + box.height
  let label: SigFieldLayout['label'] = null
  if (opts.label) {
    const above = box.y - LABEL_GAP - SIG_LABEL_SIZE
    // A box at the very top of the page has nothing above it to write on, so
    // the label goes underneath it instead (and the rows under that).
    if (above >= 2) label = { x: box.x, y: above }
    else {
      label = { x: box.x, y: below + LABEL_GAP }
      below += LABEL_GAP + SIG_LABEL_SIZE
    }
  }
  const rows: SigFieldLayout['rows'] = []
  if (opts.details) {
    const fieldX = box.x + opts.labelColumn
    const fieldW = Math.max(MIN_FIELD_WIDTH, box.width - opts.labelColumn)
    let top = below + ROWS_GAP
    for (const key of ['name', 'date'] as const) {
      rows.push({
        key,
        textX: box.x,
        textY: top + (SIG_FIELD_HEIGHT - SIG_DETAIL_SIZE) / 2,
        field: { x: fieldX, y: top, width: fieldW, height: SIG_FIELD_HEIGHT }
      })
      top += SIG_FIELD_HEIGHT + ROW_GAP
    }
  }
  return { label, rows }
}

/** The "Name:" / "Date:" column: the wider word, plus a gap before its field. */
export function sigLabelColumn(widths: number[]): number {
  return Math.ceil(Math.max(0, ...widths)) + 6
}

/** A width estimate where nothing can measure text (Helvetica-ish, ~0.55em per character). */
export function estimateTextWidth(text: string, size: number): number {
  return text.length * size * 0.55
}
