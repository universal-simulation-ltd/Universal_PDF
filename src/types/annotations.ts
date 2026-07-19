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

export type ImageAnnotation = Base & {
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  src: string
  rotation?: number
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
