import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { useSignatureStore, type SignatureExtras } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { SIGNATURE_INK, formatSigningDate } from '../../lib/signature'

const PAD_W = 600
const PAD_H = 240

const FONT = 'Helvetica, Arial, sans-serif'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}

// Small seeded PRNG (mulberry32) so the ink jitter/speckles are deterministic
// for a given drawing — no flicker, stable output.
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stroke a smooth path through points using midpoint quadratics (matches the
// clean, tension-smoothed look of the on-screen preview).
function strokeSmooth(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
  ctx.stroke()
}

// Render the captured pen strokes. With `realistic` on, lays down deep-blue ink
// with a faint bleed, a shaky-hand wobble, per-segment width variation (thinner
// when moving fast) and a couple of speckles — subtle cues that read as a real
// signature. With it off, draws a clean uniform smoothed line. Returns a
// cropped PNG + its logical (CSS-px) size.
function renderInkSignature(
  lines: number[][],
  color: string,
  realistic: boolean
): { dataUrl: string; width: number; height: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const ln of lines) {
    for (let i = 0; i < ln.length; i += 2) {
      const x = ln[i], y = ln[i + 1]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (!isFinite(minX)) return null

  const pad = 6
  minX -= pad; minY -= pad; maxX += pad; maxY += pad
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const RS = 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * RS)
  canvas.height = Math.ceil(h * RS)
  const ctx = canvas.getContext('2d')!
  ctx.scale(RS, RS)
  ctx.translate(-minX, -minY)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.fillStyle = color

  const rnd = mulberry32(0x5eed)
  const JITTER = realistic ? 0.6 : 0
  const BASE_W = 2.4

  for (const ln of lines) {
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < ln.length; i += 2) {
      pts.push({
        x: ln[i] + (rnd() * 2 - 1) * JITTER,
        y: ln[i + 1] + (rnd() * 2 - 1) * JITTER
      })
    }
    if (pts.length === 0) continue
    if (pts.length === 1) {
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, BASE_W * 0.6, 0, Math.PI * 2)
      ctx.fill()
      continue
    }

    // Clean mode: one uniform smoothed stroke, no bleed/variation/speckles.
    if (!realistic) {
      ctx.globalAlpha = 1
      ctx.lineWidth = 2.5
      strokeSmooth(ctx, pts)
      continue
    }

    // Faint, slightly-wider blurred underlay → ink bleed.
    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.lineWidth = BASE_W * 1.9
    try { ctx.filter = 'blur(0.6px)' } catch { /* filter unsupported — plain wide line */ }
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    ctx.restore()

    // Main pass: per-segment width + subtle alpha/width noise.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      let segW = BASE_W * (1 - Math.min(0.45, d / 45))
      segW *= 0.85 + rnd() * 0.3
      ctx.globalAlpha = 0.82 + rnd() * 0.18
      ctx.lineWidth = Math.max(0.8, segW)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // A couple of tiny ink speckles near the stroke.
    const speckles = 1 + Math.floor(rnd() * 2)
    for (let k = 0; k < speckles; k++) {
      const p = pts[Math.floor(rnd() * pts.length)]
      ctx.globalAlpha = 0.35 + rnd() * 0.3
      ctx.beginPath()
      ctx.arc(p.x + (rnd() * 2 - 1) * 2, p.y + (rnd() * 2 - 1) * 2, 0.4 + rnd() * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
}

// Stack one or more text labels (name, then date) centered beneath the
// signature image, returning a new PNG + logical size. Rendered at 2×.
async function composeSignatureWithLabels(
  sigDataUrl: string,
  sigW: number,
  sigH: number,
  labels: { text: string; scale: number }[],
  color: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(sigDataUrl)
  const RS = 2
  const baseFont = Math.min(28, Math.max(14, sigH * 0.4))
  const gap = Math.max(4, sigH * 0.08)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  let maxTextW = 0
  const lineHeights = labels.map((l) => {
    const fs = baseFont * l.scale
    ctx.font = `${fs * RS}px ${FONT}`
    maxTextW = Math.max(maxTextW, ctx.measureText(l.text).width / RS)
    return fs * 1.3
  })
  const outW = Math.max(sigW, maxTextW)
  const outH = sigH + (labels.length ? gap : 0) + lineHeights.reduce((a, b) => a + b, 0)
  canvas.width = Math.ceil(outW * RS)
  canvas.height = Math.ceil(outH * RS)

  ctx.drawImage(img, ((outW - sigW) / 2) * RS, 0, sigW * RS, sigH * RS)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let y = sigH + gap
  labels.forEach((l, i) => {
    ctx.font = `${baseFont * l.scale * RS}px ${FONT}`
    ctx.fillText(l.text, (outW / 2) * RS, y * RS)
    y += lineHeights[i]
  })

  return { dataUrl: canvas.toDataURL('image/png'), width: outW, height: outH }
}

// iOS-style toggle used by the advanced options.
function OptionToggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative w-9 h-5 rounded-full bg-slate-300 transition-colors peer-checked:bg-orange-500 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      <span>{label}</span>
    </label>
  )
}

export default function SignaturePad() {
  const open = useSignatureStore((s) => s.padOpen)
  const closePad = useSignatureStore((s) => s.closePad)
  const add = useSignatureStore((s) => s.add)

  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [padW, setPadW] = useState(PAD_W)
  const [lines, setLines] = useState<number[][]>([])
  const drawingRef = useRef(false)
  const [name, setName] = useState('')
  // Advanced options: which extras to attach, and how they're placed.
  const [includeName, setIncludeName] = useState(true)
  const [includeDate, setIncludeDate] = useState(false)
  // Realistic ink (blue, blemishes, variable width) vs a clean plain-black line.
  const [realistic, setRealistic] = useState(true)
  // false → bake name/date into the signature image (one click places all).
  // true  → keep the image ink-only and drop name/date as separate text the
  //         user positions with extra clicks (e.g. into a form's name field).
  const [separatePlacement, setSeparatePlacement] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const available = Math.max(200, Math.min(PAD_W, el.clientWidth))
      setPadW(Math.floor(available))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const padH = Math.round((padW / PAD_W) * PAD_H)
  // Whether there's anything to place separately (gates the placement control).
  const hasExtras = (includeName && !!name.trim()) || includeDate
  // Ink colour follows the realism toggle (deep blue vs plain near-black).
  const inkColor = realistic ? SIGNATURE_INK : '#0f172a'

  if (!open) return null

  function pos(e: Konva.KonvaEventObject<PointerEvent>) {
    return e.target.getStage()!.getPointerPosition()!
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    drawingRef.current = true
    const p = pos(e)
    setLines((prev) => [...prev, [p.x, p.y]])
  }

  function onPointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!drawingRef.current) return
    const p = pos(e)
    setLines((prev) => {
      const out = prev.slice(0, -1)
      const last = prev[prev.length - 1]
      out.push([...last, p.x, p.y])
      return out
    })
  }

  function onPointerUp() {
    drawingRef.current = false
  }

  function clear() {
    setLines([])
  }

  function resetForm() {
    setLines([])
    setName('')
    setIncludeName(true)
    setIncludeDate(false)
    setSeparatePlacement(false)
    setRealistic(true)
    setAdvancedOpen(false)
  }

  function cancel() {
    resetForm()
    closePad()
  }

  async function save() {
    if (lines.length === 0) return
    const ink = renderInkSignature(lines, inkColor, realistic)
    if (!ink) return

    const trimmed = name.trim()
    const sigName = trimmed || `Signature ${useSignatureStore.getState().signatures.length + 1}`
    const wantName = includeName && !!trimmed
    const wantDate = includeDate

    let finalUrl = ink.dataUrl
    let finalW = ink.width
    let finalH = ink.height
    let extras: SignatureExtras | undefined

    if ((wantName || wantDate) && separatePlacement) {
      // Image stays ink-only; the name/date are placed by extra clicks. The
      // date is resolved at placement time ("date of signing").
      extras = { name: wantName ? trimmed : undefined, date: wantDate, color: inkColor }
    } else if (wantName || wantDate) {
      // Bake the name (and date) beneath the ink so they travel as one image.
      const labels: { text: string; scale: number }[] = []
      if (wantName) labels.push({ text: trimmed, scale: 1 })
      if (wantDate) labels.push({ text: formatSigningDate(), scale: 0.8 })
      const composed = await composeSignatureWithLabels(ink.dataUrl, ink.width, ink.height, labels, inkColor)
      finalUrl = composed.dataUrl
      finalW = composed.width
      finalH = composed.height
    }

    add({ name: sigName, dataUrl: finalUrl, width: finalW, height: finalH, extras })
    resetForm()
    closePad()
    useAnnotationStore.getState().setTool('signature')
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) cancel() }}
    >
      <div className="bg-white rounded-lg shadow-2xl p-5 max-w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Draw signature</h2>
          <button
            onClick={cancel}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div ref={containerRef} className="border-2 border-dashed border-slate-300 rounded bg-slate-50 w-full">
          <Stage
            ref={stageRef}
            width={padW}
            height={padH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ touchAction: 'none', cursor: 'crosshair' }}
          >
            <Layer>
              {lines.map((points, i) => (
                <Line
                  key={i}
                  points={points}
                  stroke={inkColor}
                  strokeWidth={2.5}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                />
              ))}
            </Layer>
          </Stage>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="flex-1 min-w-40 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={clear}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
            >
              Clear
            </button>
            <button
              onClick={cancel}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={lines.length === 0}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
            >
              Save
            </button>
          </div>

          {/* Advanced options — name/date extras and how they're placed. */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
              aria-expanded={advancedOpen}
            >
              <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▸</span>
              Advanced options
            </button>

            {advancedOpen && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <OptionToggle checked={realistic} onChange={setRealistic} label="Make it look more realistic" />
                <OptionToggle checked={includeName} onChange={setIncludeName} label="Add name" />
                <OptionToggle checked={includeDate} onChange={setIncludeDate} label="Add date (today)" />

                <div className={hasExtras ? '' : 'opacity-50 pointer-events-none'}>
                  <div className="text-xs font-medium text-slate-500 mb-1">When placed</div>
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => setSeparatePlacement(false)}
                      className={`px-3 py-1.5 ${!separatePlacement ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      With signature
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeparatePlacement(true)}
                      className={`px-3 py-1.5 border-l border-slate-300 ${separatePlacement ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      Separate click
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    “Separate click” drops the name/date after the signature, so you can place them in form fields.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
