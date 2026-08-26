// Shared signature compositing: stacks the requested name/date labels beneath a
// signature's ink and returns a single PNG. Used by BOTH the signature pad (when
// a signature is first created / a request box is signed) and the annotation
// layer (when a placed signature's options are re-edited via double-tap or the
// size/alignment pill). Keeping one implementation means the layout is identical
// however the composite is produced, so re-editing never shifts the ink.

import { formatSigningDate } from './signature'
import type { SignatureData, SignatureLabelOptions, SigAlign } from '../types/annotations'

// The label font. Matches the pad's original baked labels.
const FONT = 'Helvetica, Arial, sans-serif'

// 2× supersample so the baked text stays crisp.
const RS = 2

// Labels start at 70% of the base size. Full size is legible but heavy —
// it competes with the signature it is captioning. The size pill still
// reaches 50-250%, this is only where a new signature begins.
export const DEFAULT_LABEL_SCALE = 0.7

// New signatures left-align their labels under the ink. A signature block reads
// like an address block, not a caption — the pill still cycles all three.
export const DEFAULT_SIG_ALIGN: SigAlign = 'left'

// Seed text for the switch-gated inputs, shared by the pad's advanced options
// and the double-tap modal: turning a switch on with nothing typed pre-fills
// the box so the expected shape is visible. An untouched seed never bakes —
// see the unanswered-prompt filters below.
export const NAME_LINE_SEED = 'Signed by: '
export const DETAILS_SEED = 'Role: \nEmail: \nPhone: '
// The date line starts as "Signed on <today>" and is thereafter the user's own
// text, editable in full — the date included.
export function dateLineSeed(): string {
  return `Signed on ${formatSigningDate()}`
}

// True when a name line is still the untouched "Signed by: " seed — an
// unanswered prompt, not a name. Used both when composing and when deciding
// whether there is a name to place separately.
export function isUnansweredNameLine(line: string): boolean {
  return /^signed by:?$/i.test(line.trim())
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}

// A signature block is at most this many detail lines. Someone pasting a whole
// address would otherwise get a composite taller than the page it sits on, and
// the ink would shrink to nothing to fit.
const MAX_DETAIL_LINES = 6

// The details box opens pre-filled with these label lines; one left with
// nothing typed after it is an unanswered prompt, not content, so it never
// bakes into the signature.
const UNFILLED_TEMPLATE_LINE = /^(role|email|phone):$/i

// The detail lines a details string implies: blank lines and unfilled template
// labels dropped, so a trailing newline or an untouched "Phone:" never adds a
// line that looks like a rendering fault.
export function detailLines(details: string | undefined): string[] {
  if (!details) return []
  return details
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !UNFILLED_TEMPLATE_LINE.test(line))
    .slice(0, MAX_DETAIL_LINES)
}

// "Signed by:" + "Jane Smith" -> "Signed by: Jane Smith". One space, whatever
// punctuation the prefix already ends with — the user's wording is not
// second-guessed.
function withPrefix(prefix: string | undefined, value: string): string {
  const p = prefix?.trim()
  return p ? `${p} ${value}` : value
}

// The concrete label lines (text + relative scale) implied by a set of options.
// Order is the one a signature block is read in: who, then what they are, then
// when — so the date stays last however much detail is added above it.
export function labelsForOptions(opts: SignatureLabelOptions): { text: string; scale: number }[] {
  const out: { text: string; scale: number }[] = []
  const name = opts.name?.trim()
  if (opts.showName && name) {
    const line = withPrefix(opts.namePrefix, name)
    // The name box opens pre-filled with "Signed by: " — untouched, that line is
    // an unanswered prompt (same rule as the details template) and stays off.
    if (!isUnansweredNameLine(line)) out.push({ text: line, scale: 1 })
  }
  if (opts.showDetails) {
    for (const line of detailLines(opts.details)) out.push({ text: line, scale: 0.7 })
  }
  if (opts.showDate) {
    // `dateText` is the whole line as the user wrote it (date included). Older
    // signatures stored only the wording and resolve the date on each compose.
    out.push({
      text: withPrefix(opts.datePrefix, opts.dateText?.trim() || formatSigningDate()),
      scale: 0.8
    })
  }
  return out
}

// Whether a signature currently shows any name/date labels — gates the
// size/alignment pill (styling only applies when there's something to style).
export function sigHasLabels(opts: SignatureLabelOptions): boolean {
  return labelsForOptions(opts).length > 0
}

// Shared, canvas-free sizing math so the compositor and the (synchronous)
// measure helper below always agree. Returns the logical (CSS-px) composite
// size, plus everything the draw pass needs.
function measureCtx(): CanvasRenderingContext2D {
  const c = document.createElement('canvas')
  return c.getContext('2d')!
}

function layout(
  sigW: number,
  sigH: number,
  labels: { text: string; scale: number }[],
  labelScale: number
) {
  const ctx = measureCtx()
  const baseFont = Math.min(28, Math.max(14, sigH * 0.4))
  const gap = Math.max(4, sigH * 0.08)
  let maxTextW = 0
  const lineHeights = labels.map((l) => {
    const fs = baseFont * l.scale * labelScale
    ctx.font = `${fs * RS}px ${FONT}`
    maxTextW = Math.max(maxTextW, ctx.measureText(l.text).width / RS)
    return fs * 1.3
  })
  const outW = Math.max(sigW, maxTextW)
  const outH = sigH + (labels.length ? gap : 0) + lineHeights.reduce((a, b) => a + b, 0)
  return { baseFont, gap, lineHeights, outW, outH }
}

// Logical size of the composite for a given SignatureData WITHOUT drawing it.
// Lets callers preserve the ink's on-screen size across option edits (scale the
// display box by the before/after composite-size ratio).
export function measureComposite(data: SignatureData): { width: number; height: number } {
  const labels = labelsForOptions(data)
  if (labels.length === 0) return { width: data.inkWidth, height: data.inkHeight }
  const { outW, outH } = layout(
    data.inkWidth,
    data.inkHeight,
    labels,
    data.labelScale ?? DEFAULT_LABEL_SCALE
  )
  return { width: outW, height: outH }
}

// Composite ink + labels into a single PNG. `align` controls both where the ink
// sits within a wider box and how the label lines are justified.
export async function composeSignatureWithLabels(
  sigDataUrl: string,
  sigW: number,
  sigH: number,
  labels: { text: string; scale: number }[],
  color: string,
  align: SigAlign = DEFAULT_SIG_ALIGN,
  labelScale = DEFAULT_LABEL_SCALE
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(sigDataUrl)
  const { baseFont, gap, lineHeights, outW, outH } = layout(sigW, sigH, labels, labelScale)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(outW * RS)
  canvas.height = Math.ceil(outH * RS)
  const ctx = canvas.getContext('2d')!

  const inkX = align === 'left' ? 0 : align === 'right' ? outW - sigW : (outW - sigW) / 2
  ctx.drawImage(img, inkX * RS, 0, sigW * RS, sigH * RS)

  ctx.fillStyle = color
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'
  ctx.textBaseline = 'top'
  const textX = align === 'left' ? 0 : align === 'right' ? outW : outW / 2
  let y = sigH + gap
  labels.forEach((l, i) => {
    ctx.font = `${baseFont * l.scale * labelScale * RS}px ${FONT}`
    ctx.fillText(l.text, textX * RS, y * RS)
    y += lineHeights[i]
  })

  return { dataUrl: canvas.toDataURL('image/png'), width: outW, height: outH }
}

// Compose straight from a SignatureData. When no labels are showing it returns
// the raw ink unchanged (no needless re-encode).
export async function composeSignature(
  data: SignatureData
): Promise<{ dataUrl: string; width: number; height: number }> {
  const labels = labelsForOptions(data)
  if (labels.length === 0) {
    return { dataUrl: data.ink, width: data.inkWidth, height: data.inkHeight }
  }
  return composeSignatureWithLabels(
    data.ink,
    data.inkWidth,
    data.inkHeight,
    labels,
    data.color ?? '#0f172a',
    data.align ?? DEFAULT_SIG_ALIGN,
    data.labelScale ?? DEFAULT_LABEL_SCALE
  )
}
