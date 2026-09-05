import { useState } from 'react'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'

type Shape = 'oval' | 'rect'

interface StampDef {
  label: string
  text: string
  color: string
  shape: Shape
}

const STAMPS: StampDef[] = [
  { label: 'Approved', text: 'APPROVED', color: '#16a34a', shape: 'oval' },
  { label: 'Confidential', text: 'CONFIDENTIAL', color: '#dc2626', shape: 'oval' },
  { label: 'Draft', text: 'DRAFT', color: '#ea580c', shape: 'rect' },
  { label: 'Received', text: 'RECEIVED', color: '#2563eb', shape: 'rect' },
  { label: 'Reviewed', text: 'REVIEWED', color: '#7c3aed', shape: 'oval' },
  { label: 'Void', text: 'VOID', color: '#dc2626', shape: 'rect' },
  { label: 'Paid', text: 'PAID', color: '#16a34a', shape: 'rect' },
  { label: 'Not Approved', text: 'NOT APPROVED', color: '#9f1239', shape: 'oval' },
]

// Palette offered in the custom-stamp creator.
const STAMP_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#9f1239', '#0f172a']

// The stamp's LOGICAL size — the aspect ratio a placed stamp is fitted to, and
// the numbers the drawing below is written in.
const STAMP_W = 240
const STAMP_H = 96

// ⚠️ …but it is rasterised at this multiple of that (James, 2026-09-05: "the
// preset stamps lose a lot of quality on stretch, maybe they need to be SVG?").
// A stamp is placed as an ordinary `image` annotation, and every path it
// travels — the Konva canvas, `pdf-lib`'s embedPng on export, the `.unipdf`
// backup, the hosted upload — takes a raster. Making the stamp itself an SVG
// would have to be undone at each of those, so instead the raster simply
// carries enough pixels to survive being stretched: at 4x, a stamp dragged out
// to a third of an A4 page still exports at roughly 300dpi, where the 1x
// version went visibly soft the moment it grew past the size it was dropped at.
//
// Everything below is drawn in logical units and scaled once by ctx.scale, so
// the geometry, the stroke weights and the font all supersample together — do
// NOT hard-code a device pixel anywhere in here.
const STAMP_SUPERSAMPLE = 4

function renderStampDataUrl(text: string, color: string, shape: Shape): string {
  const W = STAMP_W
  const H = STAMP_H
  const canvas = document.createElement('canvas')
  canvas.width = W * STAMP_SUPERSAMPLE
  canvas.height = H * STAMP_SUPERSAMPLE
  const ctx = canvas.getContext('2d')!
  ctx.scale(STAMP_SUPERSAMPLE, STAMP_SUPERSAMPLE)
  ctx.clearRect(0, 0, W, H)

  // Choose font size based on text length
  const fontSize = text.length > 10 ? 20 : text.length > 7 ? 24 : 28
  ctx.font = `bold ${fontSize}px Arial, sans-serif`

  const textW = ctx.measureText(text).width
  const padX = Math.max(20, (W - textW) / 2 - 4)
  const padY = 14

  ctx.strokeStyle = color
  ctx.lineWidth = 4

  if (shape === 'oval') {
    const rx = W / 2 - padX
    const ry = H / 2 - padY
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, rx - 5, ry - 5, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.strokeRect(padX - 4, padY - 4, W - (padX - 4) * 2, H - (padY - 4) * 2)
    ctx.lineWidth = 1.5
    ctx.strokeRect(padX, padY, W - padX * 2, H - padY * 2)
  }

  ctx.fillStyle = color
  ctx.font = `bold ${fontSize}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, W / 2, H / 2)

  return canvas.toDataURL('image/png')
}

export default function StampPicker() {
  const open = useSignatureStore((s) => s.stampPickerOpen)
  const closeStampPicker = useSignatureStore((s) => s.closeStampPicker)
  const addSignature = useSignatureStore((s) => s.add)
  const setActive = useSignatureStore((s) => s.setActive)
  const setTool = useAnnotationStore((s) => s.setTool)
  const signatures = useSignatureStore((s) => s.signatures)
  const removeSignature = useSignatureStore((s) => s.remove)

  // The "saved stamps" list is signatures whose name carries the " Stamp"
  // suffix (the same convention the Sign-menu Stamps tab uses). Stamps created
  // here land in that one list, so they show up in both places.
  const savedStamps = signatures.filter((s) => s.name.endsWith(' Stamp'))

  // Custom-stamp creator state
  const [creating, setCreating] = useState(false)
  const [newText, setNewText] = useState('')
  const [newColor, setNewColor] = useState(STAMP_COLORS[0])
  const [newShape, setNewShape] = useState<Shape>('oval')

  if (!open) return null

  function pickStamp(text: string, color: string, shape: Shape, label: string) {
    const dataUrl = renderStampDataUrl(text, color, shape)
    // Logical size, not the raster's: `width`/`height` are only ever read as
    // an aspect ratio when the stamp is placed (see AnnotationLayer), so the
    // supersampled pixels must not leak into it or every stamp would drop at
    // STAMP_SUPERSAMPLE times its intended size.
    const id = addSignature({ name: label + ' Stamp', dataUrl, width: STAMP_W, height: STAMP_H })
    setActive(id)
    setTool('signature')
    closeStampPicker()
  }

  // Arm an already-saved stamp for placing.
  function pickSignature(id: string) {
    setActive(id)
    setTool('signature')
    closeStampPicker()
  }

  function resetCreator() {
    setCreating(false)
    setNewText('')
    setNewColor(STAMP_COLORS[0])
    setNewShape('oval')
  }

  // Render the custom stamp and add it to the saved-stamps list, then drop back
  // to the grid so it shows under "Your saved stamps" (and in the Sign menu).
  function saveCustomStamp() {
    const text = newText.trim().toUpperCase()
    if (!text) return
    const dataUrl = renderStampDataUrl(text, newColor, newShape)
    addSignature({ name: text + ' Stamp', dataUrl, width: STAMP_W, height: STAMP_H })
    resetCreator()
  }

  const previewText = newText.trim().toUpperCase()

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => { if (e.target === e.currentTarget) closeStampPicker() }}
    >
      {/* ⚠️ A flex COLUMN capped at the viewport, not one box that scrolls.
          `max-h-[min(100%,100dvh)]`: 100% is the overlay's content box and
          100dvh shrinks with iOS's browser chrome, so min() takes whichever is
          actually visible — a `vh` cap does not, because `vh` is the LARGE
          viewport on iOS. The title row and its Close button are pinned
          OUTSIDE the scrolling body, so a tall dialog can no longer scroll its
          own way out off the top of a 390x844 screen. */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 flex max-h-[min(100%,100dvh)] flex-col">
        <div className="flex shrink-0 items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {creating ? 'New stamp' : 'Choose a Stamp'}
          </h2>
          <button
            onClick={() => { resetCreator(); closeStampPicker() }}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        {creating ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stamp text</label>
              <input
                autoFocus
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveCustomStamp() }}
                maxLength={20}
                placeholder="e.g. URGENT"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Border shape</label>
              <div className="flex gap-2">
                {([['oval', 'Oval'], ['rect', 'Rectangle']] as const).map(([sh, lbl]) => (
                  <button
                    key={sh}
                    type="button"
                    onClick={() => setNewShape(sh)}
                    className={`flex-1 border-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      newShape === sh
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Colour</label>
              <div className="flex gap-2 flex-wrap">
                {STAMP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      newColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c, borderColor: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preview</label>
              <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 min-h-[72px]">
                {previewText
                  ? <StampPreview def={{ text: previewText, color: newColor, shape: newShape }} />
                  : <span className="text-xs text-slate-400">Type some text to preview</span>}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => resetCreator()}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomStamp}
                disabled={!previewText}
                className="px-4 py-2 text-sm font-medium rounded-md bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save to my stamps
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {STAMPS.map((def) => (
                <button
                  key={def.text}
                  onClick={() => pickStamp(def.text, def.color, def.shape, def.label)}
                  className="border-2 rounded-lg p-3 hover:bg-slate-50 transition-colors flex items-center justify-center"
                  style={{ borderColor: def.color + '60' }}
                >
                  <StampPreview def={def} />
                </button>
              ))}

              <button
                onClick={() => setCreating(true)}
                className="border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-50 hover:border-orange-400 transition-colors flex flex-col items-center justify-center gap-1 text-slate-500 min-h-[72px]"
              >
                <span className="text-2xl leading-none">＋</span>
                <span className="text-xs font-medium">New stamp</span>
              </button>
            </div>

            {savedStamps.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  Your saved stamps
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {savedStamps.map((s) => (
                    <div key={s.id} className="relative">
                      <button
                        onClick={() => pickSignature(s.id)}
                        className="w-full border-2 border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors flex items-center justify-center min-h-[72px]"
                      >
                        <img src={s.dataUrl} alt={s.name} className="h-12 max-w-full object-contain" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSignature(s.id) }}
                        title="Remove saved stamp"
                        aria-label={`Remove ${s.name}`}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-600 hover:border-red-300 shadow-sm flex items-center justify-center text-sm leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400 text-center">
              Click a stamp then click on the PDF to place it. Resize with handles.
            </p>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

function StampPreview({ def }: { def: { text: string; color: string; shape: Shape } }) {
  const fontSize = def.text.length > 10 ? 11 : def.text.length > 7 ? 13 : 15

  if (def.shape === 'oval') {
    return (
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 48 }}>
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: def.color }}
        />
        <div
          className="absolute rounded-full border"
          style={{ inset: 4, borderColor: def.color }}
        />
        <span
          className="relative font-bold tracking-wide"
          style={{ color: def.color, fontSize }}
        >
          {def.text}
        </span>
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 48 }}>
      <div
        className="absolute inset-0 border-2 rounded-sm"
        style={{ borderColor: def.color }}
      />
      <div
        className="absolute border rounded-sm"
        style={{ inset: 4, borderColor: def.color }}
      />
      <span
        className="relative font-bold tracking-wide"
        style={{ color: def.color, fontSize }}
      >
        {def.text}
      </span>
    </div>
  )
}
