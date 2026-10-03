import { useEffect, useRef, useState } from 'react'
import { defaultQuad, fullQuad, isConvexQuad, type Quad } from '../../lib/scanGeometry'
import { flattenPhoto, type ScanColour, type ScanPage } from '../../lib/scan'
import { useT, type MessageKey } from '../../i18n'

interface Props {
  /** The decoded photo (see `decodePhoto`). */
  photo: HTMLCanvasElement
  colour: ScanColour
  onColourChange: (c: ScanColour) => void
  onDone: (page: ScanPage) => void
  onSkip: () => void
}

const CORNER_LABELS: MessageKey[] = [
  'tools.scan.corner_tl',
  'tools.scan.corner_tr',
  'tools.scan.corner_br',
  'tools.scan.corner_bl',
]

// Handle size in SCREEN pixels. 44 is the touch target both platforms' design
// guides ask for; the visible dot inside it is smaller so it does not hide the
// very corner it is being placed on.
const HIT_PX = 44
const DOT_PX = 11

/**
 * Drag four corners onto the corners of the page in a photo.
 *
 * The photo is shown as an <img> and the outline as an SVG laid exactly over
 * it, sharing its coordinate system: the SVG's viewBox is the photo's own
 * pixel size, so a corner is stored in photo pixels and nothing has to be
 * converted when it is handed to `flattenPhoto`. Only the pointer needs
 * scaling, from screen to photo, at the moment it moves.
 */
export default function CropEditor({ photo, colour, onColourChange, onDone, onSkip }: Props) {
  const t = useT()
  const w = photo.width
  const h = photo.height
  const [quad, setQuad] = useState<Quad>(() => defaultQuad(w, h))
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Photo pixels per screen pixel, so handles stay a constant size on screen.
  const [scale, setScale] = useState(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)

  useEffect(() => {
    let revoked = false
    let made: string | null = null
    photo.toBlob(
      (b) => {
        if (!b || revoked) return
        made = URL.createObjectURL(b)
        setUrl(made)
      },
      'image/jpeg',
      0.85,
    )
    setQuad(defaultQuad(photo.width, photo.height))
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [photo])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0) setScale(w / r.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, url])

  function toPhoto(e: React.PointerEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(w, Math.max(0, ((e.clientX - r.left) / r.width) * w)),
      y: Math.min(h, Math.max(0, ((e.clientY - r.top) / r.height) * h)),
    }
  }

  function move(i: number, p: { x: number; y: number }) {
    setQuad((q) => {
      const next = [...q] as Quad
      next[i] = p
      return next
    })
  }

  function onKey(i: number, e: React.KeyboardEvent) {
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.max(w, h)
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    const c = quad[i]
    move(i, { x: Math.min(w, Math.max(0, c.x + d[0])), y: Math.min(h, Math.max(0, c.y + d[1])) })
  }

  const valid = isConvexQuad(quad)

  async function addPage() {
    if (!valid || busy) return
    setBusy(true)
    try {
      // Let the "Straightening…" label paint before the pixel loop holds the
      // main thread.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      onDone(await flattenPhoto(photo, quad, colour))
    } catch (err) {
      console.error(err)
      alert(t('tools.scan.failed', { message: (err as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const hit = HIT_PX * scale
  const dot = DOT_PX * scale
  const stroke = 2 * scale
  const points = quad.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">{t('tools.scan.crop_hint')}</p>
      <div className="flex justify-center rounded-lg bg-slate-900/90 p-2">
        {/* `touch-none` on the overlay stops a drag from scrolling the dialog
            or pinch-zooming the page out from under the finger. */}
        <div className="relative inline-block max-w-full">
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="block max-w-full max-h-[50dvh] w-auto h-auto select-none"
            />
          ) : (
            <div className="w-64 h-64" />
          )}
          {url && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full touch-none"
              data-testid="scan-crop-overlay"
              onPointerMove={(e) => {
                if (dragging.current === null) return
                move(dragging.current, toPhoto(e))
              }}
              onPointerUp={() => (dragging.current = null)}
              onPointerCancel={() => (dragging.current = null)}
            >
              {/* Dim everything outside the outline: evenodd punches the page
                  out of a full-frame rectangle. */}
              <path
                d={`M0 0H${w}V${h}H0Z M${points.replace(/ /g, ' L')}Z`}
                fillRule="evenodd"
                fill="rgba(15,23,42,0.45)"
              />
              <polygon
                points={points}
                fill="none"
                stroke={valid ? '#f97316' : '#ef4444'}
                strokeWidth={stroke}
              />
              {quad.map((p, i) => (
                <g
                  key={i}
                  role="slider"
                  tabIndex={0}
                  aria-label={t(CORNER_LABELS[i])}
                  aria-valuetext={`${Math.round((p.x / w) * 100)}%, ${Math.round((p.y / h) * 100)}%`}
                  data-corner={i}
                  className="cursor-grab focus:outline-none"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    ;(e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId)
                    dragging.current = i
                  }}
                  onKeyDown={(e) => onKey(i, e)}
                >
                  <circle cx={p.x} cy={p.y} r={hit / 2} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={dot} fill="white" stroke="#f97316" strokeWidth={stroke * 1.5} />
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* ⚠️ Always rendered, and only hidden when the outline is fine. The
          dialog is centred, so a line that came and went would move the photo
          — mid-drag, the moment the corners stopped crossing — and the corner
          would land somewhere other than under the finger. */}
      <p
        aria-live="polite"
        className={`mt-2 min-h-[2lh] text-xs text-red-600 ${valid ? 'invisible' : ''}`}
      >
        {t('tools.scan.crop_bad')}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
        {([
          ['colour', t('tools.scan.colour')],
          ['grey', t('tools.scan.grey')],
          ['bw', t('tools.scan.bw')],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onColourChange(value)}
            disabled={busy}
            aria-pressed={colour === value}
            className={[
              'rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
              colour === value ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => setQuad(fullQuad(w, h))}
          disabled={busy}
          className="mr-auto px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          {t('tools.scan.whole_photo')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {t('tools.scan.skip_photo')}
        </button>
        <button
          type="button"
          onClick={addPage}
          disabled={!valid || busy || !url}
          className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? t('tools.scan.straightening') : t('tools.scan.add_page')}
        </button>
      </div>
    </div>
  )
}
