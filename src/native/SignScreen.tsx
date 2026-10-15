import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useSignatureStore } from '../stores/signatureStore'
import { renderInkSignature } from '../lib/renderInk'
import { DEFAULT_LABEL_SCALE, DEFAULT_SIG_ALIGN } from '../lib/composeSignature'
import type { SignatureData } from '../types/annotations'
import { BackLink, Hl } from './parts'
import { useNav } from './nav'

// Board 4 · Sign, a page of its own: "Make your mark", Draw / Type / Photo of
// paper, a white slip to sign on with a line and an ×, the drawer of saved
// signatures, and "Put it on the page". From the Signatures tab the same page
// only keeps what you draw (`mode="drawer"`).
//
// The drawing becomes a library signature through the same renderer the
// website's pad uses (`renderInkSignature`), so a signature drawn here looks
// and behaves exactly like one drawn there — re-editable, recolourable, placed
// by tapping the page.

type How = 'draw' | 'type' | 'photo'

const INK = '#173a94'
const PAD_H = 240

export default function SignScreen({ mode = 'document', onDone }: { mode?: 'document' | 'drawer'; onDone: () => void }) {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const signatures = useSignatureStore((s) => s.signatures)
  const [how, setHow] = useState<How>('draw')
  const [lines, setLines] = useState<number[][]>([])
  const [pressures, setPressures] = useState<number[][]>([])
  const [typed, setTyped] = useState('')
  const [keep, setKeep] = useState(mode === 'drawer')
  const [busy, setBusy] = useState(false)
  const typeId = useId()
  const keepId = useId()

  const ready = how === 'draw' ? lines.length > 0 : how === 'type' ? typed.trim().length > 0 : false

  /** Put a library signature in hand and go back to the page to place it. */
  function placeSaved(id: string) {
    useSignatureStore.getState().setActive(id)
    const a = useAnnotationStore.getState()
    a.setSelected(null)
    a.setTool('signature')
    useNav.getState().setAwaitingSignature(true)
    useNav.getState().say(t('phone.place_hint'))
    onDone()
  }

  async function finish() {
    if (!ready || busy) return
    setBusy(true)
    try {
      let made: { dataUrl: string; width: number; height: number } | null = null
      let sig: SignatureData | undefined
      if (how === 'draw') {
        made = renderInkSignature(lines, INK, false, pressures)
        if (made) {
          sig = {
            ink: made.dataUrl,
            inkWidth: made.width,
            inkHeight: made.height,
            align: DEFAULT_SIG_ALIGN,
            labelScale: DEFAULT_LABEL_SCALE,
            color: INK,
            strokes: lines,
            pressures: pressures.some((p) => p.length > 0) ? pressures : undefined,
            realistic: false,
          }
        }
      } else {
        made = await renderTyped(typed.trim())
      }
      if (!made) return
      const store = useSignatureStore.getState()
      const name = how === 'type' ? typed.trim() : t('sign.default_signature_name', { n: store.signatures.length + 1 })
      const id = store.add({ name, dataUrl: made.dataUrl, width: made.width, height: made.height, sig })
      if (mode === 'drawer') {
        onDone()
        return
      }
      if (!keep) {
        // Placed once and not kept: it leaves the drawer as soon as it lands.
        const off = useAnnotationStore.subscribe((s, prev) => {
          if (s.annotations.length > prev.annotations.length) {
            off()
            window.setTimeout(() => useSignatureStore.getState().remove(id), 0)
          }
        })
      }
      placeSaved(id)
    } finally {
      setBusy(false)
    }
  }

  function photo() {
    // The website's own photo importer: it lifts the ink off the paper and
    // puts the signature in hand, ready to place on the page.
    if (mode === 'document') useNav.getState().setAwaitingSignature(true)
    onDone()
    useSignatureStore.getState().openImport('signature')
  }

  const tabs: { id: How; label: string }[] = [
    { id: 'draw', label: t('phone.sign_draw') },
    { id: 'type', label: t('phone.sign_type') },
    { id: 'photo', label: t('phone.sign_photo') },
  ]

  const saved = signatures.filter((s) => !s.id.startsWith('uid-main:'))

  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col" style={{ background: 'var(--np-paper)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink
          label={mode === 'drawer' ? t('phone.tab_signatures') : (fileName ?? '').replace(/\.pdf$/i, '') || t('phone.sign_back')}
          onClick={onDone}
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-3 flex flex-col gap-4">
        <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
          {t('phone.sign_lead')} <Hl>{t('phone.sign_hl')}</Hl>
        </h1>

        <div role="tablist" aria-label={t('phone.sign_how_aria')} className="grid grid-cols-3 rounded-xl p-[3px]" style={{ background: '#e8e3d8' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={how === tab.id}
              onClick={() => setHow(tab.id)}
              className="min-h-[38px] rounded-[10px] text-[14px] leading-tight px-1"
              style={
                how === tab.id
                  ? { background: 'var(--np-slip)', fontWeight: 700, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                  : { fontWeight: 600, color: 'var(--np-ink-2)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {how === 'draw' && (
          <DrawPad
            lines={lines}
            onStroke={(pts, ps) => {
              setLines((l) => [...l, pts])
              setPressures((p) => [...p, ps])
            }}
            onClear={() => {
              setLines([])
              setPressures([])
            }}
          />
        )}

        {how === 'type' && (
          <div className="np-tilt bg-white rounded-[3px] px-5 pt-4 pb-5 flex flex-col gap-3" style={{ boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}>
            <label htmlFor={typeId} className="text-[13px] text-[color:var(--np-muted)]">{t('phone.type_label')}</label>
            <input
              id={typeId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t('phone.type_placeholder')}
              autoComplete="name"
              className="w-full text-[17px] py-1.5 bg-transparent outline-none"
              style={{ borderBottom: '2px solid var(--np-line)' }}
            />
            <div className="h-[86px] flex items-end" style={{ borderBottom: '1.5px solid var(--np-ink)' }}>
              <span className="np-hand text-[52px] leading-none truncate" style={{ color: INK, fontWeight: 700 }}>
                {typed.trim() || ' '}
              </span>
            </div>
          </div>
        )}

        {how === 'photo' && (
          <div className="np-tilt bg-white rounded-[3px] px-5 py-5 flex flex-col gap-4" style={{ boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}>
            <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.photo_note')}</p>
            <button
              type="button"
              onClick={photo}
              className="min-h-[50px] rounded-2xl text-[16px] font-bold"
              style={{ background: 'var(--np-slip)', border: '1.5px solid var(--np-cobalt)', color: 'var(--np-cobalt-deep)' }}
            >
              {t('phone.photo_button')}
            </button>
          </div>
        )}

        {mode === 'document' && (
          <div className="flex flex-col gap-2.5 mt-1">
            <h2 className="np-serif m-0 text-[19px] font-bold">{t('phone.drawer')}</h2>
            {saved.length === 0 ? (
              <p className="m-0 text-[14px] text-[color:var(--np-muted)]">{t('phone.drawer_empty')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {saved.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={t('phone.use_saved_aria', { name: s.name })}
                    onClick={() => placeSaved(s.id)}
                    className="np-tilt bg-white rounded-[3px] h-[66px] flex items-center justify-center p-2"
                    style={{ boxShadow: '0 4px 10px rgba(23,30,50,0.12)', transform: `rotate(${['-2deg', '1.5deg', '-1deg'][i % 3]})` }}
                  >
                    <img src={s.dataUrl} alt="" className="max-w-full max-h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {how !== 'photo' && (
        <div className="flex-none px-5 pt-3 flex flex-col gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
          {mode === 'document' && (
            <label htmlFor={keepId} className="flex items-center gap-2.5 text-[15px] min-h-[44px]">
              <input
                id={keepId}
                type="checkbox"
                checked={keep}
                onChange={(e) => setKeep(e.target.checked)}
                className="w-[22px] h-[22px]"
                style={{ accentColor: 'var(--np-cobalt)' }}
              />
              {t('phone.keep_in_drawer')}
            </label>
          )}
          <button
            type="button"
            onClick={() => void finish()}
            disabled={!ready || busy}
            className="min-h-[56px] rounded-[18px] text-white text-[17px] font-bold disabled:opacity-50"
            style={{ background: 'var(--np-cobalt)' }}
          >
            {mode === 'drawer' ? t('phone.keep_it') : t('phone.put_on_page')}
          </button>
        </div>
      )}
    </div>
  )
}

/** The white slip you sign on: a line, an ×, and your finger or a pencil. */
function DrawPad({
  lines,
  onStroke,
  onClear,
}: {
  lines: number[][]
  onStroke: (points: number[], pressures: number[]) => void
  onClear: () => void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef<{ pts: number[]; ps: number[]; pen: boolean } | null>(null)

  // Redraw everything whenever the strokes change (and on size changes).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK
      ctx.lineWidth = 3
      for (const pts of lines) strokePath(ctx, pts)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [lines])

  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = point(e)
    const pen = e.pointerType === 'pen'
    live.current = { pts: [x, y], ps: pen ? [e.pressure] : [], pen }
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = live.current
    if (!cur) return
    const [x, y] = point(e)
    cur.pts.push(x, y)
    if (cur.pen) cur.ps.push(e.pressure)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) {
      const n = cur.pts.length
      ctx.beginPath()
      ctx.moveTo(cur.pts[n - 4], cur.pts[n - 3])
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
  function onUp() {
    const cur = live.current
    live.current = null
    if (!cur) return
    // A tap with no movement still leaves a dot.
    const pts = cur.pts.length === 2 ? [...cur.pts, cur.pts[0] + 0.5, cur.pts[1] + 0.5] : cur.pts
    onStroke(pts, cur.ps)
  }

  return (
    <div className="np-tilt bg-white rounded-[3px] relative" style={{ height: PAD_H, boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}>
      <span aria-hidden="true" className="np-hand absolute left-[22px] bottom-[50px] text-[30px] text-[color:var(--np-orange-ink)]">×</span>
      <div aria-hidden="true" className="absolute left-11 right-6 bottom-[58px]" style={{ borderBottom: '1.5px solid var(--np-ink)' }} />
      {lines.length === 0 && (
        <span className="np-hand absolute left-11 bottom-6 text-[22px] text-[color:var(--np-muted)]">{t('phone.sign_on_line')}</span>
      )}
      <canvas
        ref={canvasRef}
        aria-label={t('phone.sign_pad_aria')}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {lines.length > 0 && (
        <button type="button" onClick={onClear} className="absolute top-2.5 right-3 min-h-9 px-2.5 text-[14px] text-[color:var(--np-cobalt)]">
          {t('phone.start_again')}
        </button>
      )}
    </div>
  )
}

function strokePath(ctx: CanvasRenderingContext2D, pts: number[]) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.stroke()
}

/** A typed name in the handwriting face, cropped to the ink, as a PNG. */
async function renderTyped(name: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const size = 72
  const font = `700 ${size}px Caveat, cursive`
  try {
    await document.fonts.load(font, name)
  } catch {
    // The fallback face still makes a usable signature.
  }
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null
  probe.font = font
  const w = Math.ceil(probe.measureText(name).width) + 16
  const h = Math.ceil(size * 1.3)
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.font = font
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 8, h / 2)
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
}
