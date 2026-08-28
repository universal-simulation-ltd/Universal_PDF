// The QR design model — a field-for-field copy of Universal QR's `QrConfig`
// (its `src/lib/qr.ts`).
//
// The shape is copied deliberately rather than simplified: a design saved in
// Universal QR is restored here VERBATIM (see ./library), so the two apps have
// to agree on what a design is. What Universal PDF simplifies is the *editor* —
// six presets and a content field instead of the full studio — not the format.

import type {
  Options as QrOptions,
  DotType,
  CornerSquareType,
  CornerDotType,
  ErrorCorrectionLevel
} from 'qr-code-styling'
import type { FrameShape, StarPlacement } from './frames'
import type { DecorStyle } from './decor'

export type { DotType, CornerSquareType, CornerDotType, ErrorCorrectionLevel }

/** The full, serialisable description of a QR code. */
export interface QrDesign {
  /** Human label — shown under the preview and used as the saved-design name. */
  name: string
  /** The encoded payload (a URL, but any text works). */
  data: string

  // ── Geometry ──────────────────────────────────────────────────────────────
  /** Rendered size in px (square). */
  size: number
  /** Quiet-zone margin in px. */
  margin: number
  /** QR error-correction level. Fixed at 'H' (the highest) so the code stays
   *  scannable even when a centre logo obscures part of it. */
  ecLevel: ErrorCorrectionLevel

  // ── Colours ───────────────────────────────────────────────────────────────
  fgColor: string
  bgColor: string
  /** Knock the background out (transparent PNG) — useful over a coloured page. */
  bgTransparent: boolean
  /** Blend the modules from fgColor → gradientColor. */
  useGradient: boolean
  gradientColor: string
  /** Gradient angle in degrees. */
  gradientRotation: number
  /** When true the finder corners follow the module colour; otherwise use
   *  cornerColor for a two-tone look. */
  matchCornerColor: boolean
  cornerColor: string

  // ── Module shapes ─────────────────────────────────────────────────────────
  dotType: DotType
  cornerSquareType: CornerSquareType
  cornerDotType: CornerDotType

  /** The silhouette of the whole code — a circle, hexagon or star instead of
   *  the usual square. This shapes the PLATE the code sits on; the code itself
   *  is rendered smaller and centred inside it, never clipped (see frames.ts). */
  frameShape: FrameShape

  /** Where the code sits relative to a STAR: inside it as a plate, or in front
   *  of it with the star as a backdrop. Ignored on every other shape. */
  starPlacement: StarPlacement
  /** The star's own colour when it stands behind the code. It needs its own
   *  field because that arrangement uses two colours where a plate uses one:
   *  `bgColor` becomes the ground the code and its quiet zone sit on, and this
   *  is the star painted on top of it. */
  starColor: string

  /** Marks filling the space a shaped plate leaves around the code. Turning it
   *  on SHRINKS the code to make room (see decor.ts), and it does nothing at
   *  all on a square plate, where there is no space to fill. */
  decorStyle: DecorStyle
  /** Decoration follows the module colour. Off to give it its own. */
  matchDecorColor: boolean
  decorColor: string

  // ── Logo / branding ───────────────────────────────────────────────────────
  /** A user-supplied brand logo (data URI), placed in the centre. Universal PDF
   *  has no logo upload of its own — this arrives with an imported design. */
  logoDataUrl: string | null
  /** Centre-logo size as a fraction of the QR (0.1–0.5). */
  logoSize: number
  /** Padding in px between the logo and the surrounding modules. */
  logoMargin: number
  /** Clear the modules sitting directly behind the logo. */
  hideBackgroundDots: boolean
  /** Include the UNI·SIM mark — as the centre logo when no brand logo is set,
   *  or as a small bottom-right stamp when one is. */
  unisimMark: boolean
}

// ⚠️ This file is the QR STUDIO's design model — shapes, plates, decoration, a
// user's own logo — and it stays here on purpose. If all you need is the house
// code (ink modules, orange finder eyes, the mark in the centre, click to
// enlarge), use @unisim/sdk's <UnisimQr> instead of adding another renderer;
// this app's sign-on-phone code does exactly that. The defaults below are the
// same measured arrangement the SDK ships, so the two agree by construction.
export const DEFAULT_DESIGN: QrDesign = {
  name: '',
  // Empty, unlike Universal QR — which prefills its own address so a fresh
  // generator always has something to show. That reasoning does not carry over:
  // there the code is the thing you came for and is one select-all from being
  // replaced, whereas here it would be a default URL baked into someone's
  // document. The dialog shows a placeholder plate and disables Add instead.
  data: '',
  size: 512,
  margin: 12,
  // Always highest correction so a centre logo never breaks scanning.
  ecLevel: 'H',
  // Near-black modules on white, orange finder eyes — the suite scheme in the
  // one arrangement that scans. See Universal QR's src/lib/qr.ts for the
  // measurements behind it: orange modules are a 2.3:1 contrast against white,
  // under the 3:1 floor a decoder needs, and light-on-dark is an inverted code
  // that strict readers reject outright.
  fgColor: '#1c1917',
  bgColor: '#ffffff',
  bgTransparent: false,
  useGradient: false,
  gradientColor: '#e05504',
  gradientRotation: 45,
  matchCornerColor: false,
  cornerColor: '#e05504',
  dotType: 'rounded',
  cornerSquareType: 'extra-rounded',
  cornerDotType: 'dot',
  frameShape: 'square',
  starPlacement: 'inside',
  starColor: '#e05504',
  decorStyle: 'none',
  matchDecorColor: true,
  decorColor: '#e05504',
  logoDataUrl: null,
  logoSize: 0.28,
  logoMargin: 6,
  hideBackgroundDots: true,
  unisimMark: true
}

/** One-click starting points, shown as a row of chips in the dialog.
 *
 *  These are Universal QR's presets, names and patches verbatim, so a code
 *  designed in one app is recognisable in the other. Every preset pins the
 *  fields another preset might have changed — background, frameShape,
 *  decorStyle, logo size, gradient stops — not just the ones it cares about: a
 *  patch merges onto whatever the user already had, so without pinning them
 *  "Classic" would quietly keep a star silhouette and a burst around it.
 *
 *  Every preset also sets an explicit, opaque background alongside its module
 *  colours, guaranteeing a module↔background contrast comfortably above what a
 *  scanner needs whatever the design was before. */
export interface QrPreset {
  name: string
  /** One-word hint at the silhouette, for the chip caption. */
  shape: string
  patch: Partial<QrDesign>
}

export const QR_PRESETS: QrPreset[] = [
  {
    name: 'Classic',
    shape: 'Square',
    patch: {
      matchDecorColor: true,
      decorStyle: 'none',
      dotType: 'square',
      cornerSquareType: 'square',
      cornerDotType: 'square',
      fgColor: '#000000',
      bgColor: '#ffffff',
      bgTransparent: false,
      useGradient: false,
      gradientColor: '#e05504',
      gradientRotation: 45,
      matchCornerColor: true,
      logoSize: 0.28,
      frameShape: 'square',
      starPlacement: 'inside',
      starColor: '#e05504'
    }
  },
  {
    name: 'Rounded',
    shape: 'Square',
    patch: {
      matchDecorColor: true,
      decorStyle: 'none',
      dotType: 'rounded',
      cornerSquareType: 'extra-rounded',
      cornerDotType: 'dot',
      fgColor: '#0f172a',
      bgColor: '#ffffff',
      bgTransparent: false,
      useGradient: false,
      gradientColor: '#e05504',
      gradientRotation: 45,
      matchCornerColor: true,
      logoSize: 0.28,
      frameShape: 'square',
      starPlacement: 'inside',
      starColor: '#e05504'
    }
  },
  {
    name: 'Dots',
    shape: 'Square',
    patch: {
      matchDecorColor: true,
      decorStyle: 'none',
      dotType: 'dots',
      cornerSquareType: 'dot',
      cornerDotType: 'dot',
      fgColor: '#1e293b',
      bgColor: '#ffffff',
      bgTransparent: false,
      useGradient: false,
      gradientColor: '#e05504',
      gradientRotation: 45,
      matchCornerColor: false,
      cornerColor: '#e05504',
      logoSize: 0.28,
      frameShape: 'square',
      starPlacement: 'inside',
      starColor: '#e05504'
    }
  },
  {
    name: 'Sunset',
    shape: 'Square',
    patch: {
      matchDecorColor: true,
      decorStyle: 'none',
      dotType: 'extra-rounded',
      cornerSquareType: 'extra-rounded',
      cornerDotType: 'dot',
      useGradient: true,
      // Deep warm modules on cream — dark-side-DOWN. The obvious pairing (warm
      // modules on dusk) has a fine contrast ratio and is still an inverted
      // code; it failed to decode at every size in Universal QR's harness.
      fgColor: '#c2410c',
      gradientColor: '#9f1239',
      gradientRotation: 30,
      bgColor: '#fff7ed',
      bgTransparent: false,
      matchCornerColor: true,
      logoSize: 0.28,
      frameShape: 'square',
      starPlacement: 'inside',
      starColor: '#e05504'
    }
  },
  {
    // The look the branded circular codes people point at have: dotted modules,
    // round finder eyes, a large centre mark, and the ring around the code
    // filled in rather than left as blank background.
    name: 'Radial',
    shape: 'Circle',
    patch: {
      matchDecorColor: true,
      dotType: 'dots',
      cornerSquareType: 'dot',
      cornerDotType: 'dot',
      fgColor: '#1c1917',
      bgColor: '#ffffff',
      bgTransparent: false,
      useGradient: false,
      gradientColor: '#e05504',
      gradientRotation: 45,
      matchCornerColor: false,
      cornerColor: '#e05504',
      frameShape: 'circle',
      starPlacement: 'inside',
      starColor: '#e05504',
      decorStyle: 'burst',
      logoSize: 0.3,
      hideBackgroundDots: true
    }
  },
  {
    // The star stands BEHIND the code (Universal QR, 2026-08-24): the code goes
    // from 37% of the image to 72%, and the star reads as a mark rather than as
    // a square code dropped on a spiky background.
    //
    // The palette moves with it, because 'behind' needs two colours where the
    // plate needed one: white is now the GROUND the code and its quiet zone sit
    // on, and the brand orange moves to `starColor`. Black modules therefore
    // meet two backgrounds and clear both — 5.5:1 on the orange, 21:1 on the
    // white.
    //
    // BLACK modules, not white. White on orange is an INVERTED code, which
    // strict readers reject outright.
    //
    // `decorStyle: 'burst'` is pinned even though decoration is not drawn in
    // this arrangement: it is what the design becomes if the placement goes
    // back to 'inside', and pinning it stops another preset's choice following
    // you there.
    name: 'Star',
    shape: 'Star',
    patch: {
      matchDecorColor: true,
      decorStyle: 'burst',
      dotType: 'extra-rounded',
      cornerSquareType: 'extra-rounded',
      cornerDotType: 'dot',
      fgColor: '#000000',
      bgColor: '#ffffff',
      bgTransparent: false,
      useGradient: false,
      gradientColor: '#e05504',
      gradientRotation: 45,
      matchCornerColor: true,
      logoSize: 0.28,
      frameShape: 'star',
      starPlacement: 'behind',
      starColor: '#e05504'
    }
  }
]

/** The UNI·SIM mark used as the centre logo / corner stamp. Universal QR
 *  inlines a 256px data URI so its SVG exports stay self-contained; here the
 *  output is always a PNG that gets embedded in the PDF, so the icon the app
 *  already ships is enough (and it is the same source image). */
export function unisimMarkUrl(): string {
  return `${import.meta.env.BASE_URL}unisim-icon.png`
}

/** Resolve the image that belongs in the centre of the QR, if any. */
export function centerImage(design: QrDesign): string | undefined {
  if (design.logoDataUrl) return design.logoDataUrl
  if (design.unisimMark) return unisimMarkUrl()
  return undefined
}

/** True when the UNI·SIM mark should be stamped in the corner (i.e. the centre
 *  is already taken by the user's own brand logo). */
export function showsCornerMark(design: QrDesign): boolean {
  return design.unisimMark && !!design.logoDataUrl
}

/** Geometry of the corner UNI·SIM stamp, in px, for a given rendered size. */
export function cornerStampGeometry(size: number, margin: number) {
  const badge = Math.max(28, Math.round(size * 0.16))
  const inset = margin + Math.round(size * 0.03)
  const pos = size - badge - inset
  return { badge, inset, x: pos, y: pos }
}

/** The colour the decoration is actually drawn in. */
export function decorColour(design: QrDesign): string {
  return design.matchDecorColor ? design.fgColor : design.decorColor
}

/** Best-effort hostname from the encoded data (empty for non-URL text). */
export function hostnameOf(data: string): string {
  try {
    return new URL(data.trim()).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** The label shown under the preview, falling back to the URL's hostname when
 *  the code has no name of its own. */
export function qrDisplayName(design: QrDesign): string {
  return design.name.trim() || hostnameOf(design.data) || 'QR code'
}

/** WCAG relative luminance (0–1) of a `#rrggbb` colour. Gamma-corrected: the
 *  naive channel average rates brand orange at 0.60 against white and calls it
 *  a comfortable gap, where the correct figure is 0.40 — a 2.3:1 ratio, under
 *  the 3:1 a decoder needs. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1–21. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The minimum module↔background ratio a decoder can rely on. */
const MIN_QR_CONTRAST = 3

/** Is `color` safe to draw PARTS OF THE CODE in against `bgColor`?
 *
 *  Used to decide whether a company's brand colour can take over the finder
 *  eyes. A brand palette is chosen for headers and buttons, where a pale mint
 *  or a bright yellow is perfectly good; the same colour on a finder eye is a
 *  code that photographs badly or, if it is lighter than the background,
 *  doesn't decode at all. When this says no the colour is still the tenant's
 *  brand — it just stays out of the modules (see `withBranding`). */
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

export type ContrastIssue =
  | { kind: 'inverted' }
  | { kind: 'low'; ratio: number; where: 'modules' | 'corners' }
  | null

/** What is wrong with this design's colours, if anything.
 *
 *  The six presets here all pass — this exists for designs arriving from
 *  Universal QR, where the full studio can produce a code that scans on a
 *  screen and fails on paper. Baking one of those into an exported PDF is the
 *  version of this feature nobody notices until the poster is printed.
 *
 *  - `inverted` — the modules are LIGHTER than the background. The QR standard
 *    is dark-on-light and strict decoders reject the inverse rather than
 *    guessing.
 *  - `low` — the polarity is right but the ratio is too thin, which is the
 *    quieter failure: it passes a casual desk test and then fails in the wild. */
export function qrContrastIssue(design: QrDesign): ContrastIssue {
  if (design.bgTransparent) return null
  const bg = luminance(design.bgColor)
  const fgs = [design.fgColor, ...(design.useGradient ? [design.gradientColor] : [])]
  if (fgs.some((c) => luminance(c) > bg + 0.02)) return { kind: 'inverted' }

  const worstModule = Math.min(...fgs.map((c) => contrastRatio(c, design.bgColor)))
  if (worstModule < MIN_QR_CONTRAST) return { kind: 'low', ratio: worstModule, where: 'modules' }

  if (!design.matchCornerColor) {
    if (luminance(design.cornerColor) > bg + 0.02) return { kind: 'inverted' }
    const corner = contrastRatio(design.cornerColor, design.bgColor)
    if (corner < MIN_QR_CONTRAST) return { kind: 'low', ratio: corner, where: 'corners' }
  }
  return null
}

/** Map a QrDesign into the options object understood by qr-code-styling. */
export function buildQrOptions(design: QrDesign): QrOptions {
  const gradient = design.useGradient
    ? {
        type: 'linear' as const,
        rotation: (design.gradientRotation * Math.PI) / 180,
        colorStops: [
          { offset: 0, color: design.fgColor },
          { offset: 1, color: design.gradientColor }
        ]
      }
    : undefined

  const cornerColor = design.matchCornerColor ? design.fgColor : design.cornerColor

  return {
    type: 'canvas',
    width: design.size,
    height: design.size,
    margin: design.margin,
    // qr-code-styling throws on empty data; callers guard against this, but keep
    // a single-space fallback so a transient empty string never crashes a render.
    data: design.data || ' ',
    image: centerImage(design),
    qrOptions: { errorCorrectionLevel: design.ecLevel },
    imageOptions: {
      hideBackgroundDots: design.hideBackgroundDots,
      imageSize: design.logoSize,
      margin: design.logoMargin,
      crossOrigin: 'anonymous'
    },
    dotsOptions: { type: design.dotType, color: design.fgColor, gradient },
    cornersSquareOptions: {
      type: design.cornerSquareType,
      color: cornerColor,
      gradient: design.matchCornerColor ? gradient : undefined
    },
    cornersDotOptions: { type: design.cornerDotType, color: cornerColor },
    backgroundOptions: {
      color: design.bgTransparent ? 'rgba(255,255,255,0)' : design.bgColor
    }
  }
}
