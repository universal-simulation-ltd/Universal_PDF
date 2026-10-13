import type { TextAnnotation, TextRun } from '../types/annotations'
import { FONT_CSS } from './fonts'
import { effectiveRuns, runFontStyle } from './textRuns'

// Vertical advance between wrapped lines, as a multiple of the font size. The
// contentEditable editor overlay uses the same figure for its line-height and
// the export baked the same box height long before wrapping existed, so all
// three agree on where the second line starts.
export const LINE_HEIGHT = 1.25

// Shared offscreen 2D context for measuring run widths in unscaled model space.
// Konva itself measures with canvas measureText, so widths derived here match
// the on-canvas advance, keeping the per-run layout, the wrap points and the
// editor aligned.
const _measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
const _measureCtx = _measureCanvas?.getContext('2d') ?? null

// Width of one run's text at the annotation's (unscaled) font size + family.
export function runWidth(run: TextRun, fontSize: number, cssFamily: string): number {
  if (!run.text) return 0
  if (!_measureCtx) return run.text.length * fontSize * 0.6
  _measureCtx.font = `${runFontStyle(run)} ${fontSize}px ${cssFamily}`
  return _measureCtx.measureText(run.text).width
}

export function cssFamilyOf(a: TextAnnotation): string {
  return FONT_CSS[a.fontFamily ?? 'sans']
}

// One run as laid out on a line: the run itself plus its x offset from the
// annotation's left edge and its measured width.
export type PlacedRun = TextRun & { x: number; width: number }
export type TextLine = { runs: PlacedRun[]; width: number }

type Token = { run: TextRun; space: boolean }

// Split the runs into whitespace / non-whitespace tokens, each keeping the
// style of the run it came from, so a wrap can fall between two words that sit
// in differently-styled runs.
function tokenize(runs: TextRun[]): Token[] {
  const out: Token[] = []
  for (const run of runs) {
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue
      out.push({ run: { ...run, text: piece }, space: /^\s+$/.test(piece) })
    }
  }
  return out
}

// Place the runs of one line, left to right, measuring each to get the next
// one's offset (the same advance Konva will use when it draws them).
function placeLine(runs: TextRun[], fontSize: number, cssFamily: string): TextLine {
  const placed: PlacedRun[] = []
  let x = 0
  for (const run of runs) {
    const width = runWidth(run, fontSize, cssFamily)
    placed.push({ ...run, x, width })
    x += width
  }
  return { runs: placed, width: x }
}

/**
 * Lay a text annotation out into lines.
 *
 * Without a `wrapWidth` this is a single line — the layout the app had before
 * text boxes could be resized, preserved exactly. With one, the text is greedily
 * word-wrapped to that width (in model/point space, not screen pixels). A single
 * word wider than the box is left to overflow rather than being broken
 * mid-word, matching the contentEditable editor's own default.
 *
 * ⚠️ Shared with the PDF export deliberately: the wrap points have to be decided
 * ONCE, from canvas metrics, or the exported file would break its lines
 * somewhere other than the screen did. (Export still advances within a line
 * using pdf-lib's own metrics — see lib/export.ts.)
 */
export function layoutText(a: TextAnnotation): TextLine[] {
  const cssFamily = cssFamilyOf(a)
  const runs = effectiveRuns(a)
  // A sticky note is laid out by noteLayout (its size, its margin, centring).
  if (a.note) return noteLayout(a).lines
  const wrapWidth = a.wrapWidth
  if (!wrapWidth || !(wrapWidth > 0)) return [placeLine(runs, a.fontSize, cssFamily)]

  const lines: TextRun[][] = [[]]
  let width = 0
  for (const token of tokenize(runs)) {
    const w = runWidth(token.run, a.fontSize, cssFamily)
    const line = lines[lines.length - 1]
    if (!token.space && line.length > 0 && width + w > wrapWidth) {
      lines.push([token.run])
      width = w
      continue
    }
    // Whitespace that a wrap has pushed to the head of a line is dropped, the
    // way a browser drops it — otherwise every wrapped line would start indented
    // by the space that used to separate the two words.
    if (token.space && line.length === 0) continue
    line.push(token.run)
    width += w
  }
  return lines.map((l) => placeLine(l, a.fontSize, cssFamily))
}

// The laid-out box of a text annotation in model space: the wrap width when one
// is set (the box the user dragged), else the measured width of the single line.
export function textBoxSize(a: TextAnnotation): { width: number; height: number; lines: number } {
  const lines = layoutText(a)
  const measured = lines.reduce((max, l) => Math.max(max, l.width), 0)
  const textHeight = a.fontSize * LINE_HEIGHT * Math.max(1, lines.length)
  if (a.note) {
    const n = noteLayout(a)
    return { width: n.width, height: n.height, lines: n.lines.length }
  }
  return {
    width: a.wrapWidth && a.wrapWidth > 0 ? a.wrapWidth : measured,
    height: textHeight,
    lines: lines.length
  }
}

// ── Sticky notes ─────────────────────────────────────────────────────────────
// Shared by the editor and the export, so the card and its words land in the
// same place in both.

// A card is at least this tall for its width — and exactly this tall when its
// words are sized to fit it.
const NOTE_MIN_ASPECT = 0.8
// How much of the note's colour is in its paper; the rest is white.
const NOTE_TINT = 0.3
// The margin, as a share of the card's width — of the CARD, not the type, so a
// note whose words are sized to fit doesn't grow a giant margin with them.
const NOTE_INSET = 0.065
// Fit never shrinks the words below this (in points); past it they overflow.
const NOTE_FIT_MIN = 4
// See `top` in noteLayout.
const NOTE_OPTICAL_DROP = 0.175

/** The margin between a note's card and its words. */
export function noteInset(a: Pick<TextAnnotation, 'fontSize' | 'note' | 'wrapWidth'>): number {
  if (!a.note) return 0
  return a.wrapWidth && a.wrapWidth > 0 ? a.wrapWidth * NOTE_INSET : a.fontSize * 0.7
}

export type NoteLayout = {
  /** The card. */
  width: number
  height: number
  /** The size the words are drawn at: `fontSize`, or the fitted size. */
  fontSize: number
  /** The lines, each with its runs at x from the line's own start. */
  lines: TextLine[]
  /** Where each line starts, from the card's top-left (centring included). */
  lineX: number[]
  /** The first line's top, from the card's top. */
  top: number
  /** The margin, and the width the words wrap to inside it. */
  inset: number
  innerWidth: number
}

const noteCache = new WeakMap<TextAnnotation, NoteLayout>()

/**
 * A sticky note, laid out: the card, the size of its words, and where each line
 * goes. The ONE answer for the canvas, the live editor (so what is typed looks
 * the way it will once the editor closes) and the export.
 *
 * Annotations are never mutated in place, so the result is cached per object —
 * a fitted note runs a dozen trial layouts, and several things ask per render.
 */
export function noteLayout(a: TextAnnotation): NoteLayout {
  const hit = noteCache.get(a)
  if (hit) return hit
  const inset = noteInset(a)
  const width = a.wrapWidth && a.wrapWidth > 0 ? a.wrapWidth : 180
  const innerWidth = Math.max(1, width - 2 * inset)
  const linesAt = (size: number) =>
    layoutText({ ...a, note: undefined, fontSize: size, wrapWidth: innerWidth })
  let fontSize = a.fontSize
  if (a.noteFit && effectiveRuns(a).some((r) => r.text.trim())) {
    // The biggest size whose lines fit the card both ways — a word too long
    // for the width shrinks the lot rather than spilling over the edge.
    const innerHeight = Math.max(1, width * NOTE_MIN_ASPECT - 2 * inset)
    const fits = (size: number) => {
      const ls = linesAt(size)
      return ls.length * size * LINE_HEIGHT <= innerHeight && ls.every((l) => l.width <= innerWidth + 0.5)
    }
    let lo = NOTE_FIT_MIN
    let hi = innerHeight / LINE_HEIGHT
    if (!fits(lo)) hi = lo
    for (let i = 0; i < 14 && hi - lo > 0.25; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    fontSize = lo
  }
  const lines = linesAt(fontSize)
  const textHeight = fontSize * LINE_HEIGHT * Math.max(1, lines.length)
  const height = a.noteFit ? width * NOTE_MIN_ASPECT : Math.max(textHeight + 2 * inset, width * NOTE_MIN_ASPECT)
  // Centred, the LETTERS are centred, not their line boxes: a line's capitals
  // fill its box from about 0.1 to 0.8 of the type size, out of 1.25, so the
  // block is dropped by the difference — 0.175 of the size, for any number of
  // lines. (Centring the boxes left big fitted words visibly high.)
  const top = inset + (a.noteCentre ? Math.max(0, (height - 2 * inset - textHeight) / 2) + fontSize * NOTE_OPTICAL_DROP : 0)
  // Centred on the line's INK: a space left hanging at the end of a wrapped
  // line doesn't count, as the browser doesn't count it in the editor — or the
  // words would shift half a space sideways when the editor closed.
  const css = cssFamilyOf(a)
  const inkWidth = (l: TextLine) => {
    for (let i = l.runs.length - 1; i >= 0; i--) {
      const r = l.runs[i]
      const kept = r.text.replace(/\s+$/, '')
      if (kept) return r.x + runWidth({ ...r, text: kept }, fontSize, css)
    }
    return 0
  }
  const lineX = lines.map((l) => inset + (a.noteCentre ? Math.max(0, (innerWidth - inkWidth(l)) / 2) : 0))
  const out = { width, height, fontSize, lines, lineX, top, inset, innerWidth }
  noteCache.set(a, out)
  return out
}

/** A note's paper: a pastel of the colour it was made in. */
export function notePaper(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#fef9c3'
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c * NOTE_TINT + 255 * (1 - NOTE_TINT))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/** The ink a note is written in: dark, whatever the paper. */
export const NOTE_INK = '#1f2937'
