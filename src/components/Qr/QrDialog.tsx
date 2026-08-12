import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import {
  DEFAULT_DESIGN,
  QR_PRESETS,
  qrContrastIssue,
  qrDisplayName,
  type QrDesign,
  type QrPreset
} from '../../lib/qr/design'
import { PLACEMENT_SIZE, renderQrPng } from '../../lib/qr/render'
import {
  loadSavedQrDesigns,
  readQrBackupFile,
  UNIVERSAL_QR_URL,
  type SavedQrDesign
} from '../../lib/qr/library'

// A simplified Universal QR: the same design model and the same six presets,
// with a link box instead of the full studio. Generating the code produces a
// PNG, which is armed for click-to-place through the existing image-annotation
// path — so it moves, resizes, undoes and bakes into the export like any other
// placed picture, with no new annotation type.

const PREVIEW_SIZE = 224
// Long enough that typing a URL doesn't render a code per keystroke, short
// enough that the preview still feels attached to the box.
const PREVIEW_DEBOUNCE_MS = 250

/** A cheap, drawn impression of a preset — plate silhouette, finder eyes and a
 *  few modules in the preset's own colours. Not a real QR: rendering six live
 *  codes on every keystroke would cost more than the chips are worth, and a
 *  chip only has to say "circle, dotted, orange eyes". */
function PresetGlyph({ preset }: { preset: QrPreset }) {
  const p = { ...DEFAULT_DESIGN, ...preset.patch }
  const eye = p.matchCornerColor ? p.fgColor : p.cornerColor
  const shaped = p.frameShape !== 'square'
  // Shaped plates hold a smaller code, the same way the renderer does.
  const s = shaped ? 0.66 : 1
  const o = (1 - s) / 2
  const u = (v: number) => (o + v * s) * 32

  const plate =
    p.frameShape === 'circle' ? (
      <circle cx={16} cy={16} r={16} fill={p.bgColor} />
    ) : p.frameShape === 'star' ? (
      <polygon
        points={Array.from({ length: 10 }, (_, i) => {
          const r = i % 2 === 0 ? 16 : 16 * 0.62
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          return `${16 + r * Math.cos(a)},${16 + r * Math.sin(a)}`
        }).join(' ')}
        fill={p.bgColor}
      />
    ) : (
      <rect width={32} height={32} rx={p.dotType === 'square' ? 0 : 3} fill={p.bgColor} />
    )

  // Module rounding follows the preset's dot style, so Classic reads square and
  // Dots reads round at a glance.
  const dotR = p.dotType === 'dots' ? 1.6 : p.dotType === 'square' ? 0 : 1
  const eyeR = p.cornerSquareType === 'square' ? 0 : p.cornerSquareType === 'dot' ? 4.5 : 2.5
  const MODULES = [
    [0.62, 0.62], [0.78, 0.62], [0.62, 0.78], [0.9, 0.78], [0.78, 0.9],
    [0.46, 0.14], [0.46, 0.3], [0.46, 0.62], [0.14, 0.46], [0.3, 0.46], [0.62, 0.46], [0.9, 0.46]
  ]

  return (
    <svg viewBox="0 0 32 32" className="w-9 h-9 shrink-0" aria-hidden="true">
      {plate}
      {([[0.02, 0.02], [0.66, 0.02], [0.02, 0.66]] as const).map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.32 * s * 32}
          height={0.32 * s * 32}
          rx={eyeR * s}
          fill="none"
          stroke={eye}
          strokeWidth={2.2 * s}
        />
      ))}
      {MODULES.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.1 * s * 32}
          height={0.1 * s * 32}
          rx={dotR * s}
          fill={p.fgColor}
        />
      ))}
    </svg>
  )
}

export default function QrDialog() {
  const open = usePdfStore((s) => s.qrOpen)
  const setOpen = usePdfStore((s) => s.setQrOpen)
  const setUploadedImageSrc = useAnnotationStore((s) => s.setUploadedImageSrc)
  const setTool = useAnnotationStore((s) => s.setTool)

  const [design, setDesign] = useState<QrDesign>(DEFAULT_DESIGN)
  const [presetName, setPresetName] = useState<string | null>('Rounded')
  const [preview, setPreview] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedQrDesign[]>([])
  const [adding, setAdding] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)

  const data = design.data.trim()
  const issue = data ? qrContrastIssue(design) : null

  // Fresh dialog every time, seeded with the app's default look and whatever
  // Universal QR has saved on this device.
  useEffect(() => {
    if (!open) return
    setDesign({ ...DEFAULT_DESIGN, ...(QR_PRESETS.find((p) => p.name === 'Rounded')?.patch ?? {}) })
    setPresetName('Rounded')
    setPreview(null)
    setError(null)
    setAdding(false)
    setSaved(loadSavedQrDesigns())
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // Live preview, debounced. `cancelled` guards the async gap: a fast typist
  // can start several renders, and without it the slowest one wins.
  useEffect(() => {
    if (!open || !data) {
      setPreview(null)
      setRendering(false)
      return
    }
    let cancelled = false
    setRendering(true)
    const timer = window.setTimeout(() => {
      renderQrPng(design, PREVIEW_SIZE * 2)
        .then((png) => {
          if (cancelled) return
          setPreview(png)
          setError(null)
        })
        .catch((e: Error) => {
          if (cancelled) return
          setPreview(null)
          setError(e.message || 'Could not draw that code.')
        })
        .finally(() => {
          if (!cancelled) setRendering(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, data, design])

  if (!open) return null

  function applyPreset(preset: QrPreset) {
    setDesign((d) => ({ ...d, ...preset.patch }))
    setPresetName(preset.name)
  }

  // A saved design is restored whole — its own link, colours, plate and logo —
  // so what lands on the page is the code the user designed next door, not an
  // approximation of it.
  function pickSaved(entry: SavedQrDesign) {
    setDesign(entry.design)
    setPresetName(null)
    setError(null)
  }

  async function onBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { design: imported } = await readQrBackupFile(file)
      setDesign(imported)
      setPresetName(null)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  /** Render at placement resolution and arm it for click-to-place. */
  async function addToPage() {
    if (!data) return
    setAdding(true)
    try {
      const png = await renderQrPng(design, PLACEMENT_SIZE)
      setUploadedImageSrc(png)
      setTool('image')
      setOpen(false)
    } catch (err) {
      setError((err as Error).message || 'Could not draw that code.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Add a QR code</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 pb-5 flex flex-col sm:flex-row gap-5">
          {/* Preview */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="QR code preview"
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                  className={`w-full h-full object-contain transition-opacity ${rendering ? 'opacity-60' : ''}`}
                />
              ) : (
                <span className="text-xs text-slate-400 px-6 text-center">
                  {data ? 'Drawing…' : 'Enter a link or some text to see the code'}
                </span>
              )}
            </div>
            {data && (
              <div className="text-xs text-slate-500 max-w-[224px] truncate" title={design.data}>
                {qrDisplayName(design)}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div>
              <label htmlFor="qr-data" className="block text-sm font-medium text-slate-700 mb-1">
                Link or text
              </label>
              <input
                id="qr-data"
                autoFocus
                value={design.data}
                onChange={(e) => setDesign((d) => ({ ...d, data: e.target.value }))}
                placeholder="https://example.com"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <div className="block text-sm font-medium text-slate-700 mb-1.5">Style</div>
              {/* Two up on a phone — three columns truncates every name to
                  "Cla…", which is worse than one more row of scroll. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    title={`${preset.name} — ${preset.shape.toLowerCase()}`}
                    className={`border-2 rounded-lg px-2 py-2 flex items-center gap-2 transition-colors ${
                      presetName === preset.name
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <PresetGlyph preset={preset} />
                    <span className="min-w-0 text-left">
                      <span className="block text-xs font-medium text-slate-700 truncate">{preset.name}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{preset.shape}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={design.unisimMark}
                onChange={(e) => setDesign((d) => ({ ...d, unisimMark: e.target.checked }))}
                className="accent-orange-600"
              />
              UNI·SIM mark {design.logoDataUrl ? 'in the corner' : 'in the centre'}
            </label>

            {issue && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {issue.kind === 'inverted'
                  ? 'These colours make an inverted code (light on dark). Some scanners refuse those — try a preset.'
                  : `Low contrast on the ${issue.where} (${issue.ratio.toFixed(1)}:1). It may scan on screen and fail in print — try a preset.`}
              </p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>

        {/* Your Universal QR codes — read straight out of this browser. */}
        <div className="px-6 pb-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your Universal QR codes
            </div>
            <a
              href={UNIVERSAL_QR_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-orange-600 hover:text-orange-700 underline-offset-2 hover:underline"
            >
              Design one in Universal QR ↗
            </a>
          </div>

          {saved.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {saved.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => pickSaved(entry)}
                  title={`${entry.name || 'Saved code'} — ${entry.design.data}`}
                  className="shrink-0 w-20 border-2 border-slate-200 rounded-lg p-1.5 hover:border-orange-400 hover:bg-slate-50 transition-colors"
                >
                  {entry.thumbnail ? (
                    <img src={entry.thumbnail} alt="" className="w-full aspect-square object-contain" />
                  ) : (
                    <div className="w-full aspect-square bg-slate-100 rounded" />
                  )}
                  <span className="block mt-1 text-[10px] text-slate-500 truncate">
                    {entry.name || qrDisplayName(entry.design)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Codes you save in Universal QR on this browser show up here — the two apps share
              storage on <span className="text-slate-600">opensource.unisim.co.uk</span>. Elsewhere,
              import the <code className="text-slate-600">.uniqr.json</code> backup it saves.
            </p>
          )}

          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="mt-2 text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
          >
            Import a Universal QR backup…
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={onBackupFile}
          />
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">Then click the page to place it.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addToPage}
              disabled={!data || adding}
              className="px-4 py-2 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding ? 'Adding…' : 'Add to page'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
