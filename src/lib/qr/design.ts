// Universal PDF's layer on top of the shared QR design model.
//
// ⚠️ THE MODEL ITSELF IS NOT HERE ANY MORE. `QrDesign`, `DEFAULT_DESIGN`, the
// presets, the plate geometry, the decoration and the renderer all live in
// **@unisim/qr**, shared with Universal QR. This file holds only what is true
// of a QR code *in a PDF* — placing one on a page and overlaying a tenant's
// branding — and nothing that could disagree with the other app.
//
// It used to hold a copy of the whole model, and that copy drifted: Universal
// QR added `starPlacement` and `starColor` on 2026-08-24 and this side did not
// get them until 2026-08-28, so a star designed there rendered here as a
// different picture. An incoming design is merged over `DEFAULT_DESIGN`, so a
// field the reader has never heard of is dropped in silence — no error, just
// the wrong code. See the package README.

import {
  FRAME_SHAPES,
  MIN_QR_CONTRAST,
  PRESETS,
  contrastRatio,
  luminance,
  type QrDesign
} from '@unisim/qr'

/** A preset chip in this app's dialog: the shared preset plus the one-word
 *  silhouette caption the chip shows under its name.
 *
 *  Derived from the preset's own `frameShape` rather than stored beside it —
 *  a second hand-written label is a second thing to forget to update. */
export interface QrPreset {
  name: string
  /** One-word hint at the silhouette, for the chip caption. */
  shape: string
  patch: Partial<QrDesign>
}

function shapeLabel(patch: Partial<QrDesign>): string {
  const shape = patch.frameShape ?? 'square'
  return FRAME_SHAPES.find((s) => s.value === shape)?.label ?? 'Square'
}

/** Universal QR's presets, captioned for this app's chips. Not a copy of them:
 *  the patches ARE the shared ones, so a preset changed there changes here. */
export const QR_PRESETS: QrPreset[] = PRESETS.map((p) => ({
  name: p.name,
  shape: shapeLabel(p.patch),
  patch: p.patch
}))

/** Whether a tenant's brand colour can carry the finder eyes.
 *
 *  Dark enough to be the ink AND clear of the contrast floor. A brand colour
 *  that fails this is not rejected as a brand — it just stays out of the
 *  modules (see `withBranding`). */
export function isSafeQrAccent(color: string, bgColor: string): boolean {
  if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) return false
  return (
    luminance(color) <= luminance(bgColor) - 0.02 &&
    contrastRatio(color, bgColor) >= MIN_QR_CONTRAST
  )
}

/** What "custom branding" means to a design: a mark, a colour, or both. */
export interface QrBranding {
  /** The company's square mark as a self-contained data URI. */
  logo: string | null
  /** The company's brand colour, `#rrggbb`. */
  color: string | null
}

/** Overlay branding onto a design — or take it off again.
 *
 *  This is applied on top of whatever preset or saved design is selected rather
 *  than being edited into it, so switching style keeps the branding and turning
 *  branding off restores the style untouched. Two rules:
 *
 *  - The centre mark is one or the other, never both. With branding off the
 *    code carries the UNI·SIM mark (the app's default); with branding on it
 *    carries the tenant's, and ours steps aside rather than becoming a corner
 *    stamp — someone who has deliberately put their own brand on a code being
 *    printed on their own document did not ask for a second logo on it.
 *  - The brand colour recolours the FINDER EYES only, and only when it can be
 *    read (see `isSafeQrAccent`). The modules stay as the preset drew them:
 *    they are the part a scanner has to resolve, and a brand colour is not
 *    chosen against that constraint. */
export function withBranding(design: QrDesign, branding: QrBranding | null): QrDesign {
  if (!branding) return { ...design, logoDataUrl: null, unisimMark: true }
  const accent =
    branding.color && isSafeQrAccent(branding.color, design.bgColor) ? branding.color : null
  return {
    ...design,
    logoDataUrl: branding.logo,
    unisimMark: false,
    ...(accent ? { matchCornerColor: false, cornerColor: accent } : {})
  }
}

/** The editor state behind a code that has been placed on a page — what the
 *  dialog would need to come back up showing exactly the code you are looking
 *  at, so the ✏️ on a placed code reopens an editor rather than a fresh one.
 *
 *  Deliberately NOT the composed design: branding is an overlay here (see
 *  `withBranding`), and flattening it on the way out would come back in as an
 *  anonymously recoloured design with a picture in the middle — the branding
 *  switch would read as off, and turning it "on" would then do nothing. Keeping
 *  the three pieces apart round-trips the editor, not just the picture. */
export interface QrPlacement {
  /** The design as the STYLE controls left it, before branding. */
  base: QrDesign
  /** The branding overlaid on top, or null when the switch was off. */
  branding: QrBranding | null
  /** Which preset chip was lit, if the design still matches one. */
  presetName: string | null
}

/** The composed design a placement actually rendered as. */
export function placementDesign(p: QrPlacement): QrDesign {
  return withBranding(p.base, p.branding)
}
