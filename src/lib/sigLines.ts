// A signature's details (name, detail lines, date) placed straight under it as
// separate lines of text, the moment the signature lands (James, 2026-10-22:
// "automatically place it underneath the signature once the signature location
// is picked. Allow the user to click and drag them individually still").
//
// Each line is its own text mark, so it can still be dragged into a form's own
// field; this only decides where they start. Sizes follow the baked layout in
// composeSignature (name 1, details 0.7, date 0.8 of a base set by the
// signature's height). Imports nothing, so scripts/sigLines.test.mjs runs it
// under Node's type-stripping.

export type SigLine = { text: string; scale: number }
export type Box = { x: number; y: number; width: number; height: number }

/**
 * Where the signature and each line go: lines left-aligned with the signature,
 * one under the other. If the block would run off the foot of the page, the
 * whole block (signature included) moves up so it all stays on.
 */
export function stackUnder(
  sig: Box,
  lines: SigLine[],
  pageH: number
): { sigY: number; lines: { text: string; x: number; y: number; fontSize: number }[] } {
  const base = Math.min(16, Math.max(9, sig.height * 0.35))
  const gap = Math.max(2, sig.height * 0.08)
  let y = sig.y + sig.height + gap
  const placed = lines.map((l) => {
    const fontSize = base * l.scale
    const at = { text: l.text, x: sig.x, y, fontSize }
    y += fontSize * 1.3
    return at
  })
  const overflow = Math.max(0, y - pageH)
  const lift = Math.min(overflow, sig.y)
  return {
    sigY: sig.y - lift,
    lines: placed.map((l) => ({ ...l, y: l.y - lift })),
  }
}
