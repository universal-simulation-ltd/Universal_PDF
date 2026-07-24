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

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}

// The concrete label lines (text + relative scale) implied by a set of options.
function labelsFor(opts: SignatureLabelOptions): { text: string; scale: number }[] {
  const out: { text: string; scale: number }[] = []
  const name = opts.name?.trim()
  if (opts.showName && name) out.push({ text: name, scale: 1 })
  if (opts.showDate) out.push({ text: formatSigningDate(), scale: 0.8 })
  return out
}

// Whether a signature currently shows any name/date labels — gates the
// size/alignment pill (styling only applies when there's something to style).
export function sigHasLabels(opts: SignatureLabelOptions): boolean {
  return labelsFor(opts).length > 0
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
  const labels = labelsFor(data)
  if (labels.length === 0) return { width: data.inkWidth, height: data.inkHeight }
  const { outW, outH } = layout(data.inkWidth, data.inkHeight, labels, data.labelScale ?? 1)
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
  align: SigAlign = 'center',
  labelScale = 1
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
  const labels = labelsFor(data)
  if (labels.length === 0) {
    return { dataUrl: data.ink, width: data.inkWidth, height: data.inkHeight }
  }
  return composeSignatureWithLabels(
    data.ink,
    data.inkWidth,
    data.inkHeight,
    labels,
    data.color ?? '#0f172a',
    data.align ?? 'center',
    data.labelScale ?? 1
  )
}
