export type Tool =
  | 'select'
  | 'marquee'
  | 'hand'
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
  | 'form'

type Base = { id: string; pageIndex: number }

export type FontFamily = 'sans' | 'serif' | 'mono'

export type TextAnnotation = Base & {
  type: 'text'
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  fontFamily?: FontFamily
  rotation?: number
}

export type DrawAnnotation = Base & {
  type: 'draw'
  points: number[]
  color: string
  strokeWidth: number
  // Set for highlighter strokes so they render with a translucent fill.
  // Pencil strokes leave this undefined and render fully opaque.
  opacity?: number
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

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | RedactAnnotation
  | MarkAnnotation
  | ImageAnnotation
