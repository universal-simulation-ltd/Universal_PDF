// When a smaller copy of the export earns a place beside a bigger one.
//
// James, 2026-10-22: "on export show default, compressed and flatten images —
// hide if the difference is too small". One rule, used by the website's Export
// dialog, the phone's Share page and Advanced export's strength buttons, so a
// copy is offered on one and hidden on another for the same document only if
// the surfaces genuinely differ.
//
// Both halves of a bar must hold. The ratio alone lets a 30 KB letter qualify
// by losing 5 KB nobody will notice; the bytes alone let a 200 MB scan qualify
// on a rounding error.

export interface SavingBar {
  /** The smaller copy must be at least this fraction smaller... */
  ratio: number
  /** ...and at least this many bytes smaller. */
  minBytes: number
}

/** Compressed: the lossless re-save. Costs nothing, so a modest saving earns it. */
export const LOSSLESS_BAR: SavingBar = { ratio: 0.05, minBytes: 10 * 1024 }

/**
 * Flattened: every page becomes a picture, and the text stops being
 * selectable or searchable. That is a real price, so the saving has to be big
 * enough to be worth paying it — the ≥20% AND ≥100 KB bar the export dialog
 * used for flattening before 2026-09-01, and Advanced export's for Maximum.
 */
export const FLATTEN_BAR: SavingBar = { ratio: 0.2, minBytes: 100 * 1024 }

export function worthOffering(smaller: number, bigger: number, bar: SavingBar): boolean {
  const saved = bigger - smaller
  return saved > 0 && saved >= bigger * bar.ratio && saved >= bar.minBytes
}
