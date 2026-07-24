export type Tool =
  | 'select'
  | 'marquee'
  | 'hand'
  // Select & copy the PDF's own underlying text (pdf.js text-layer overlay),
  // as opposed to 'select' which selects/moves the annotations drawn on top.
  | 'selecttext'
  | 'text'
  | 'draw'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'redact'
  | 'tick'
  | 'cross'
  | 'line'
  | 'image'
  | 'signature'
  // Place a "sign here" request box. Optionally asks for a name and/or date
  // line too. Clicking one of these boxes (with the Select tool) opens the
  // signature pad and drops the resulting signature straight into the box.
  | 'sigfield'
  | 'form'

type Base = { id: string; pageIndex: number }

export type FontFamily = 'sans' | 'serif' | 'mono' | 'georgia' | 'verdana' | 'comic' | 'impact'

// A styled span within a text annotation. Only the inline style toggles vary
// per run — colour, size and family stay whole-annotation. An empty/whitespace
// run is allowed (it carries spaces between styled words).
export type TextRun = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  // A clickable hyperlink covering just this run.
  link?: string
}

export type TextAnnotation = Base & {
  type: 'text'
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  fontFamily?: FontFamily
  rotation?: number
  // Whole-annotation style fallback, used when `runs` is absent (legacy text,
  // or text with a single uniform style). The pill toggles these when the box
  // is selected but not being edited.
  bold?: boolean
  italic?: boolean
  underline?: boolean
  // A clickable hyperlink for the whole annotation (fallback, as above). When
  // set the text is underlined on-screen and a real URI link annotation is
  // baked over it on export. The font colour is left unchanged.
  link?: string
  // When present (and non-empty) this is the styled source of truth: the text
  // is split into runs each carrying their own bold/italic/underline/link, so
  // formatting can apply to part of the text. `text` mirrors the concatenation
  // for search / export fallback / back-compat.
  runs?: TextRun[]
}

export type DrawAnnotation = Base & {
  type: 'draw'
  points: number[]
  color: string
  strokeWidth: number
  // Set for highlighter strokes so they render with a translucent fill.
  // Pencil strokes leave this undefined and render fully opaque.
  opacity?: number
  // Set for straight lines drawn with the line tool (a two-point stroke). Lets
  // the editor offer endpoint grabbers + a contextual stroke/snap panel without
  // confusing them with free-draw scribbles that happen to be short.
  shape?: 'line'
}

export type RectAnnotation = Base & {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  color: string
  rotation?: number
  // When true the rectangle is painted with `color` instead of just outlined.
  filled?: boolean
}

// Stored as a top-left bounding box (same convention as RectAnnotation) so the
// drag / transform / bbox / export plumbing can be shared. The ellipse is
// inscribed in that box: centre = (x + width/2, y + height/2), radii = half the
// box. A square box gives a circle.
export type EllipseAnnotation = Base & {
  type: 'ellipse'
  x: number
  y: number
  width: number
  height: number
  color: string
  rotation?: number
  filled?: boolean
}

export type RedactAnnotation = Base & {
  type: 'redact'
  x: number
  y: number
  width: number
  height: number
  // Fill colour the box is baked with on export. Defaults to black when
  // undefined (back-compat with boxes drawn before white-fill existed).
  fill?: 'black' | 'white'
}

export type MarkAnnotation = Base & {
  type: 'tick' | 'cross'
  x: number
  y: number
  size: number
  color: string
  rotation?: number
}

// How the name/date labels beneath a signature are horizontally aligned
// (relative to the ink). Cycled by the size/alignment pill.
export type SigAlign = 'left' | 'center' | 'right'

// Re-editable label options for a placed signature. Changing any of these
// re-composes the rendered image from the untouched ink — the strokes are never
// altered, only the labels beneath them.
export type SignatureLabelOptions = {
  name?: string
  showName?: boolean
  showDate?: boolean
  align?: SigAlign
  // Multiplier on the base label font size (driven by the size pill).
  labelScale?: number
  // Colour used for the name/date labels (matches the ink by default).
  color?: string
}

// The full re-editable signature payload attached to a placed signature. `ink`
// is the ink-only PNG (the drawn strokes or imported image) and is NEVER mutated
// by option edits; the annotation's rendered image is always `ink` composited
// with the labels described by the options above. Its presence marks an image /
// signed field as an editable signature (double-tap to change name/date, and a
// size/alignment pill when labels are showing).
export type SignatureData = SignatureLabelOptions & {
  ink: string
  inkWidth: number
  inkHeight: number
}

export type ImageAnnotation = Base & {
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  src: string
  rotation?: number
  // Present when this image is a placed signature whose name/date labels can be
  // re-edited without touching the ink. `src` is the composite derived from it.
  sig?: SignatureData
}

// A "Request signature" placeholder box. Until it is signed it renders as a
// dashed "Sign here" box (plus optional Name / Date lines). When the user
// clicks it and signs, `signed` is filled with a single baked PNG (the ink
// plus any requested name/date beneath it), which then renders — and exports —
// contained inside the box.
export type SignatureFieldAnnotation = Base & {
  type: 'sigfield'
  x: number
  y: number
  width: number
  height: number
  // Which extra lines the box asks for, chosen before it was drawn.
  requireName?: boolean
  requireDate?: boolean
  // True for boxes re-detected from a flattened/exported PDF, where the outline
  // is already baked into the page. Locked boxes stay put (non-movable /
  // resizable / deletable) so moving them can't leave a baked "ghost" behind —
  // they're still click-to-sign. A `.unipdf` backup restores the original
  // editable (unlocked) annotations instead, keeping them movable.
  locked?: boolean
  // Populated once signed. `src` is a PNG data URL already composited with the
  // name/date labels; width/height are its logical (unscaled) pixel size, used
  // to preserve aspect when fitting it inside the box.
  signed?: {
    src: string
    width: number
    height: number
    // Present for boxes signed in-app (not re-detected from a flattened PDF):
    // the untouched ink + label options, so the name/date can be re-edited
    // (double-tap) or restyled (size/alignment pill) and `src` re-composed
    // without altering the strokes.
    data?: SignatureData
  }
}

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | RedactAnnotation
  | MarkAnnotation
  | ImageAnnotation
  | SignatureFieldAnnotation
