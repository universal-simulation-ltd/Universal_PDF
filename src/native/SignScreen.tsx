import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useSignatureStore } from '../stores/signatureStore'
import { inkColorFor, pressureWidth, renderInkSignature } from '../lib/renderInk'
import { renderTypedSignature } from '../lib/renderTyped'
import { composeSignatureWithLabels, dateLineSeed, DEFAULT_LABEL_SCALE, DEFAULT_SIG_ALIGN, labelsForOptions } from '../lib/composeSignature'
import { importImageAsSignature, type ImportedSignature } from '../lib/imageSignature'
import { unlockSignatures } from '../lib/signatureLock'
import { useVaultStore } from '../lib/signatureVault'
import type { SignatureData } from '../types/annotations'
import { useScrollHint } from '@unisim/sdk'
import { StampPreview } from '../components/Signature/StampPicker'
import { STAMPS, STAMP_COLORS, STAMP_H, STAMP_SUFFIX, STAMP_W, isStampName, renderStampDataUrl, type StampShape } from '../lib/stamps'
import { Icon, PATHS } from './icons'
import { BackLink, Hl, Segmented, SwitchRow } from './parts'
import { useNav } from './nav'
import { pickFiles } from './jobs'

// Board 4 · Sign, a page of its own: "Make your mark", Draw / Type / Photo of
// paper / Stamps, a white slip to sign on with a line and an ×, the drawer of
// saved signatures, and "Put it on the page". The slip takes most of a
// phone's height (James, 2026-10-25: "make the drawing area bigger"). Stamps
// are the website's (lib/stamps, StampPicker's set): a tap puts one in hand to
// place, the way the website does. From the Signatures tab the same page
// only keeps what you draw (`mode="drawer"`).
//
// The drawing becomes a library signature through the same renderer the
// website's pad uses (`renderInkSignature`), so a signature drawn here looks
// and behaves exactly like one drawn there — re-editable, recolourable, placed
// by tapping the page.

type How = 'draw' | 'type' | 'photo' | 'stamps'

const INK = '#173a94'
/**
 * The slip's height: most of the screen a phone has under the heading and the
 * tabs, never less than the old 240 (landscape scrolls to it), never more than
 * an iPad needs. `dvh` follows the browser's own bars where it has them.
 */
const PAD_H = 'clamp(240px, 48dvh, 500px)'

export default function SignScreen({ mode = 'document', onDone }: { mode?: 'document' | 'drawer'; onDone: () => void }) {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const signatures = useSignatureStore((s) => s.signatures)
  const locked = useVaultStore((s) => s.enabled && s.locked)
  // Signing a "Sign here" box someone left (a tap on the box): what is made
  // here fills that box, rather than going in hand to be placed. Read once —
  // the page belongs to that box for as long as it is open.
  const [fieldId] = useState(() => (mode === 'document' ? useSignatureStore.getState().signingFieldId : null))
  const [how, setHow] = useState<How>('draw')
  const [lines, setLines] = useState<number[][]>([])
  const [pressures, setPressures] = useState<number[][]>([])
  const [typed, setTyped] = useState('')
  const [keep, setKeep] = useState(mode === 'drawer')
  const [busy, setBusy] = useState(false)
  const typeId = useId()
  const keepId = useId()
  // Name and date under the ink (James, 2026-10-18: "they may still need to
  // add their name and date"). Drawn INTO the signature, so they always sit
  // lined up beneath it — one thing to place, not three — and stay editable
  // on the page (double-tap) like any signature's labels.
  const [nameUnder, setNameUnder] = useState('')
  // A typed signature fills the name under it as you type, until you change
  // that name yourself — usually they are the same name, and two boxes asking
  // for it felt clumsy (James, 2026-10-19: "the name field should autofill from
  // their signature name and then they can change it if needed").
  const [nameOwn, setNameOwn] = useState(false)
  // A box that asked for the date starts with it on (still a choice).
  const [dateUnder, setDateUnder] = useState(() => {
    const box = fieldId ? useAnnotationStore.getState().annotations.find((a) => a.id === fieldId) : null
    return box?.type === 'sigfield' && !!box.requireDate
  })
  const nameId = useId()
  const dateId = useId()
  // Photo of paper, on this page (was the website's importer dialog): the ink
  // is lifted off the paper and shown on the slip before it is used.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoInk, setPhotoInk] = useState<ImportedSignature | null>(null)
  const [keepWhite, setKeepWhite] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Leaving by any road puts the website's pad request down (a tap on a box
  // raises it; NativeApp turned it into this page).
  useEffect(() => () => {
    if (useSignatureStore.getState().padOpen) useSignatureStore.getState().closePad()
  }, [])

  useEffect(() => {
    if (!photoFile) return
    let live = true
    setPhotoBusy(true)
    setPhotoError(null)
    importImageAsSignature(photoFile, { removeBg: !keepWhite })
      .then((r) => { if (live) setPhotoInk(r) })
      .catch((e: Error) => {
        if (!live) return
        setPhotoInk(null)
        setPhotoError(e.message || t('sign.import_could_not'))
      })
      .finally(() => { if (live) setPhotoBusy(false) })
    return () => { live = false }
  }, [photoFile, keepWhite, t])

  const ready = how === 'draw' ? lines.length > 0 : how === 'type' ? typed.trim().length > 0 : how === 'photo' ? !!photoInk && !photoBusy : false
  // Stamps only where a stamp can go: on the document, not into a "Sign here"
  // box and not from the Signatures tab.
  const stamps = mode === 'document' && !fieldId

  /**
   * Fill the "Sign here" box this page was opened for, with the name and date
   * under the ink when asked for, as the website's pad does (`fillField`).
   */
  async function fillBox(id: string, made: { dataUrl: string; width: number; height: number }, base?: SignatureData) {
    const name = nameUnder.trim()
    const dateText = dateUnder ? dateLineSeed() : undefined
    const color = base?.color ?? INK
    const labels = labelsForOptions({ name, showName: !!name, showDate: dateUnder, dateText })
    let src = made.dataUrl
    let w = made.width
    let h = made.height
    if (labels.length) {
      const c = await composeSignatureWithLabels(made.dataUrl, made.width, made.height, labels, color)
      src = c.dataUrl
      w = c.width
      h = c.height
    }
    const data: SignatureData = {
      ...(base ?? { ink: made.dataUrl, inkWidth: made.width, inkHeight: made.height, align: DEFAULT_SIG_ALIGN, labelScale: DEFAULT_LABEL_SCALE, color }),
      name: name || undefined,
      showName: !!name,
      showDate: dateUnder,
      dateText,
    }
    useAnnotationStore.getState().update(id, { signed: { src, width: w, height: h, data } })
    useSignatureStore.getState().closePad()
    useAnnotationStore.getState().setTool('select')
    // Straight to the moment: the box is already where it belongs.
    useNav.getState().replaceTop('signed')
  }

  /** A stamp in hand, and back to the page to place it: no Signed moment, it isn't a signature. */
  function placeStamp(id: string) {
    useSignatureStore.getState().setActive(id)
    const a = useAnnotationStore.getState()
    a.setSelected(null)
    a.setTool('signature')
    useNav.getState().say(t('phone.place_hint'))
    onDone()
  }

  /** One of the website's stamps, drawn in the reader's language; kept once in the drawer. */
  function pickPreset(text: string, color: string, shape: StampShape, label: string) {
    const dataUrl = renderStampDataUrl(text, color, shape)
    const store = useSignatureStore.getState()
    const name = label + STAMP_SUFFIX
    const had = store.signatures.find((x) => x.name === name && x.dataUrl === dataUrl)
    placeStamp(had ? had.id : store.add({ name, dataUrl, width: STAMP_W, height: STAMP_H }))
  }

  /** Put a library signature in hand and go back to the page to place it (or fill the box). */
  function placeSaved(id: string) {
    if (fieldId) {
      const saved = useSignatureStore.getState().signatures.find((s) => s.id === id)
      if (saved) void fillBox(fieldId, { dataUrl: saved.dataUrl, width: saved.width, height: saved.height }, saved.sig)
      return
    }
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
        // Drawn signatures start with the realistic look (blue ink, uneven
        // pressure, a hand wobble: James, 2026-10-22). The strokes are kept, so
        // the placed signature's "Make it look more realistic" switch can
        // still turn it into a plain line.
        const ink = inkColorFor(true)
        made = renderInkSignature(lines, ink, true, pressures)
        if (made) {
          sig = {
            ink: made.dataUrl,
            inkWidth: made.width,
            inkHeight: made.height,
            align: DEFAULT_SIG_ALIGN,
            labelScale: DEFAULT_LABEL_SCALE,
            color: ink,
            strokes: lines,
            pressures: pressures.some((p) => p.length > 0) ? pressures : undefined,
            realistic: true,
          }
        }
      } else if (how === 'photo') {
        if (photoInk) made = { dataUrl: photoInk.dataUrl, width: photoInk.width, height: photoInk.height }
      } else {
        // Typed ones start realistic too, and keep the name so the placed
        // signature's switch can set it plain again (James, 2026-10-22).
        const name = typed.trim()
        const ink = inkColorFor(true)
        made = await renderTypedSignature(name, ink, true)
        if (made) sig = { ink: made.dataUrl, inkWidth: made.width, inkHeight: made.height, align: DEFAULT_SIG_ALIGN, labelScale: DEFAULT_LABEL_SCALE, color: ink, typed: name, realistic: true }
      }
      if (!made) return
      if (fieldId) {
        // Into the box, and kept in the drawer only when asked.
        if (keep) {
          const store = useSignatureStore.getState()
          store.add({ name: t('sign.default_signature_name', { n: store.signatures.length + 1 }), dataUrl: made.dataUrl, width: made.width, height: made.height, sig })
        }
        await fillBox(fieldId, made, sig)
        return
      }
      // The name and date go under the signature as their own lines when it
      // lands, so each can be dragged on its own (James, 2026-10-22). They are
      // no longer baked into the picture. The date is worked out on the day
      // it is placed.
      const extras = nameUnder.trim() || dateUnder
        ? { name: nameUnder.trim() || undefined, date: dateUnder, color: sig?.color ?? INK }
        : undefined
      const store = useSignatureStore.getState()
      const name = how === 'type' ? typed.trim() : how === 'photo' && photoFile ? photoFile.name.replace(/\.[^.]+$/, '').trim() || t('sign.default_signature_name', { n: store.signatures.length + 1 }) : t('sign.default_signature_name', { n: store.signatures.length + 1 })
      const id = store.add({ name, dataUrl: made.dataUrl, width: made.width, height: made.height, sig, extras })
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
    // Straight from the tap: iOS only opens a picker inside the gesture.
    void pickFiles('image/*,.heic,.heif').then(([f]) => {
      if (!f) return
      if (f.type && !/^image\//.test(f.type) && !/\.hei[cf]$/i.test(f.name)) {
        setPhotoError(t('sign.import_not_image'))
        return
      }
      setPhotoInk(null)
      setPhotoFile(f)
    })
  }

  const tabs: { id: How; label: string }[] = [
    { id: 'draw', label: t('phone.sign_draw') },
    { id: 'type', label: t('phone.sign_type') },
    { id: 'photo', label: t('phone.sign_photo') },
    ...(stamps ? [{ id: 'stamps' as const, label: t('phone.sign_stamps') }] : []),
  ]

  const saved = signatures.filter((s) => !s.id.startsWith('uid-main:') && !isStampName(s.name))
  const savedStamps = signatures.filter((s) => isStampName(s.name))

  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col" style={{ background: 'var(--np-paper)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink
          label={mode === 'drawer' ? t('phone.tab_signatures') : (fileName ?? '').replace(/\.pdf$/i, '') || t('phone.sign_back')}
          onClick={onDone}
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-3 flex flex-col gap-4">
        {/* The drawer first, as one sideways row, so the pad sits mid-screen
            where a thumb reaches it (James, 2026-10-22: "can the drawer be at
            the top (carousel don't stack) so the signing pad is more central").
            Left out while empty: "Keep it in my drawer" below says what it is. */}
        {mode === 'document' && locked && <LockedRow />}
        {mode === 'document' && !locked && saved.length > 0 && <SavedRow saved={saved} onPick={placeSaved} />}
        <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
          {t('phone.sign_lead')} <Hl>{t('phone.sign_hl')}</Hl>
        </h1>

        <div role="tablist" aria-label={t('phone.sign_how_aria')} className="grid rounded-xl p-[3px]" style={{ background: '#e8e3d8', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
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
            pressures={pressures}
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
              onChange={(e) => {
                setTyped(e.target.value)
                if (!nameOwn) setNameUnder(e.target.value)
              }}
              placeholder={t('phone.type_placeholder')}
              autoComplete="name"
              className="w-full text-[17px] py-1.5 bg-transparent outline-none"
              style={{ borderBottom: '2px solid var(--np-line)' }}
            />
            <div className="h-[86px] flex items-end" style={{ borderBottom: '1.5px solid var(--np-ink)' }}>
              {/* Room either side: a handwriting face's last stroke reaches past
                  its advance width, and truncate's overflow clip cut the tail of
                  a final k (James, 2026-10-19). */}
              <span className="np-hand text-[52px] leading-none truncate px-[0.12em]" style={{ color: INK, fontWeight: 700 }}>
                {typed.trim() || ' '}
              </span>
            </div>
          </div>
        )}

        {how === 'photo' && (
          <div className="np-tilt bg-white rounded-[3px] px-5 py-5 flex flex-col gap-4" style={{ boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}>
            {photoFile ? (
              <div
                className="h-[120px] rounded-[2px] flex items-center justify-center p-2"
                style={{ background: keepWhite ? '#ffffff' : 'repeating-conic-gradient(#f3efe6 0% 25%, #ffffff 0% 50%) 50% / 14px 14px' }}
              >
                {photoBusy ? (
                  <span className="text-[14px] text-[color:var(--np-muted)]">{t('sign.import_processing')}</span>
                ) : photoInk ? (
                  <img src={photoInk.dataUrl} alt={t('sign.import_preview_alt')} className="max-w-full max-h-full object-contain" />
                ) : null}
              </div>
            ) : (
              <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.photo_note')}</p>
            )}
            {photoError && <p className="m-0 text-[14px] text-[#b42318]">{photoError}</p>}
            <button
              type="button"
              onClick={photo}
              className="min-h-[50px] rounded-2xl text-[16px] font-bold"
              style={{ background: 'var(--np-slip)', border: '1.5px solid var(--np-cobalt)', color: 'var(--np-cobalt-deep)' }}
            >
              {photoFile ? t('sign.import_choose_different') : t('phone.photo_button')}
            </button>
            {photoFile && (
              <div className="-mx-3.5 -mb-2">
                <SwitchRow first label={t('sign.import_keep_bg')} checked={keepWhite} onChange={setKeepWhite} />
              </div>
            )}
          </div>
        )}

        {how === 'stamps' && (
          <StampsTab
            saved={savedStamps}
            onPreset={pickPreset}
            onSaved={placeStamp}
          />
        )}

        {(how === 'draw' || how === 'type' || photoInk) && how !== 'stamps' && (
          <div className="flex flex-col gap-2.5">
            <h2 className="np-serif m-0 text-[19px] font-bold">{t('phone.sign_under')}</h2>
            <label htmlFor={nameId} className="text-[13px] text-[color:var(--np-muted)]">{t('phone.sign_name_label')}</label>
            <input
              id={nameId}
              value={nameUnder}
              onChange={(e) => {
                setNameUnder(e.target.value)
                setNameOwn(true)
              }}
              placeholder={t('phone.type_placeholder')}
              autoComplete="name"
              className="w-full text-[17px] px-3 py-2.5 rounded-xl bg-white outline-none"
              style={{ border: '1px solid var(--np-line)' }}
            />
            <label htmlFor={dateId} className="flex items-center gap-2.5 text-[15px] min-h-[44px]">
              <input
                id={dateId}
                type="checkbox"
                checked={dateUnder}
                onChange={(e) => setDateUnder(e.target.checked)}
                className="w-[22px] h-[22px]"
                style={{ accentColor: 'var(--np-cobalt)' }}
              />
              {t('phone.sign_date_label', { date: dateLineSeed() })}
            </label>
          </div>
        )}

      </div>

      {how !== 'stamps' && (how !== 'photo' || photoFile) && (
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
            {mode === 'drawer' ? t('phone.keep_it') : fieldId ? t('phone.put_in_box') : t('phone.put_on_page')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The signatures in the drawer, one sideways row: a tap puts that one in hand
 * to place. The cut-off card and the faded edge (`useScrollHint`) say
 * "there's more".
 */
function SavedRow({ saved, onPick }: { saved: { id: string; name: string; dataUrl: string }[]; onPick: (id: string) => void }) {
  const t = useT()
  const hint = useScrollHint<HTMLDivElement>()
  return (
    <section aria-label={t('phone.drawer')} className="flex flex-col gap-2">
      <h2 className="np-serif m-0 text-[17px] font-bold">{t('phone.drawer')}</h2>
      <div
        ref={hint.ref}
        data-swipe-x
        className={`-mx-5 px-5 pt-1 pb-2 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 ${hint.className}`}
        style={hint.style}
      >
        {saved.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={t('phone.use_saved_aria', { name: s.name })}
            onClick={() => onPick(s.id)}
            className="np-tilt flex-none snap-start bg-white rounded-[3px] w-[100px] h-[62px] flex items-center justify-center p-2"
            style={{ boxShadow: '0 4px 10px rgba(23,30,50,0.12)', transform: `rotate(${['-2deg', '1.5deg', '-1deg'][i % 3]})` }}
          >
            <img src={s.dataUrl} alt="" className="max-w-full max-h-full object-contain" />
          </button>
        ))}
      </div>
    </section>
  )
}

/** The white slip you sign on: a line, an ×, and your finger or a pencil. */
function DrawPad({
  lines,
  pressures,
  onStroke,
  onClear,
}: {
  lines: number[][]
  /** Apple Pencil pressure per point, one array per stroke (empty for a finger). */
  pressures: number[][]
  onStroke: (points: number[], pressures: number[]) => void
  onClear: () => void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef<{ pts: number[]; ps: number[]; pen: boolean; id: number } | null>(null)
  // Palm rejection: once the Pencil has touched the pad, a hand resting on
  // the glass is not ink (the website's pad does the same).
  const penSeen = useRef(false)

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
      lines.forEach((pts, i) => strokePath(ctx, pts, pressures[i]))
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [lines, pressures])

  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const pen = e.pointerType === 'pen'
    if (pen) penSeen.current = true
    else if (penSeen.current && e.pointerType === 'touch') return
    if (live.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = point(e)
    live.current = { pts: [x, y], ps: pen ? [e.pressure] : [], pen, id: e.pointerId }
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = live.current
    if (!cur || e.pointerId !== cur.id) return
    const [x, y] = point(e)
    cur.pts.push(x, y)
    if (cur.pen) cur.ps.push(e.pressure)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) {
      const n = cur.pts.length
      // The Pencil's pressure shows as it is drawn, not only once placed.
      if (cur.pen) ctx.lineWidth = 3 * pressureWidth(e.pressure)
      ctx.beginPath()
      ctx.moveTo(cur.pts[n - 4], cur.pts[n - 3])
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.lineWidth = 3
    }
  }
  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = live.current
    if (cur && e.pointerId !== cur.id) return
    live.current = null
    if (!cur) return
    // A tap with no movement still leaves a dot.
    const pts = cur.pts.length === 2 ? [...cur.pts, cur.pts[0] + 0.5, cur.pts[1] + 0.5] : cur.pts
    onStroke(pts, cur.ps)
  }

  return (
    <div className="np-tilt bg-white rounded-[3px] relative flex-none" style={{ height: PAD_H, boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}>
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

function strokePath(ctx: CanvasRenderingContext2D, pts: number[], ps?: number[]) {
  if (pts.length < 2) return
  if (ps && ps.length) {
    // Pencil strokes segment by segment, each as wide as its pressure.
    for (let i = 2; i + 1 < pts.length; i += 2) {
      ctx.lineWidth = 3 * pressureWidth(ps[i / 2] ?? ps[ps.length - 1])
      ctx.beginPath()
      ctx.moveTo(pts[i - 2], pts[i - 1])
      ctx.lineTo(pts[i], pts[i + 1])
      ctx.stroke()
    }
    ctx.lineWidth = 3
    return
  }
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.stroke()
}

/** The drawer while it is locked (Tune ▸ Lock saved signatures): unlock it here, with Face ID. */
function LockedRow() {
  const t = useT()
  return (
    <section aria-label={t('phone.drawer')} className="flex items-center gap-3 rounded-[3px] bg-white px-4 py-3" style={{ boxShadow: '0 4px 10px rgba(23,30,50,0.1)' }}>
      <span className="flex-1 text-[14px] leading-snug text-[color:var(--np-ink-2)]">{t('phone.sigs_locked')}</span>
      <button
        type="button"
        onClick={() => void unlockSignatures(t('sign.vault_reason_unlock')).catch(() => {})}
        className="flex-none min-h-[44px] px-4 rounded-xl text-white text-[15px] font-bold"
        style={{ background: 'var(--np-cobalt)' }}
      >
        {t('phone.sigs_unlock')}
      </button>
    </section>
  )
}

/**
 * Stamps (the website's StampPicker, on the phone's Sign page): the eight
 * ready-made ones in the reader's language, a stamp of your own, and the ones
 * already in the drawer. A tap puts one in hand; the page takes it as the
 * website does (a stamp is a signature whose name ends " Stamp").
 */
function StampsTab({
  saved,
  onPreset,
  onSaved,
}: {
  saved: { id: string; name: string; dataUrl: string }[]
  onPreset: (text: string, color: string, shape: StampShape, label: string) => void
  onSaved: (id: string) => void
}) {
  const t = useT()
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [color, setColor] = useState(STAMP_COLORS[0])
  const [shape, setShape] = useState<StampShape>('oval')
  const textId = useId()
  const shown = text.trim().toLocaleUpperCase(t.lang)
  const shownName = (name: string) => (isStampName(name) ? t('sign.stamp_named', { name: name.slice(0, -STAMP_SUFFIX.length) }) : name)
  const slip = 'np-tilt bg-white rounded-[3px] flex items-center justify-center p-3 min-h-[78px]'

  function save() {
    if (!shown) return
    const dataUrl = renderStampDataUrl(shown, color, shape)
    // Saved, then shown under "Your saved stamps" to pick, as on the website.
    useSignatureStore.getState().add({ name: shown + STAMP_SUFFIX, dataUrl, width: STAMP_W, height: STAMP_H })
    setCreating(false)
    setText('')
  }

  if (creating) {
    return (
      <div data-stamp-new className="np-tilt bg-white rounded-[3px] px-4 py-4 flex flex-col gap-3.5" style={{ boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-0.6deg)' }}>
        <h2 className="np-serif m-0 text-[20px] font-bold">{t('sign.stamp_new')}</h2>
        <label htmlFor={textId} className="text-[13px] text-[color:var(--np-muted)] -mb-2">{t('sign.stamp_text')}</label>
        <input
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          maxLength={20}
          placeholder={t('sign.stamp_text_placeholder')}
          className="w-full text-[17px] px-3 py-2.5 rounded-xl bg-white outline-none uppercase placeholder:normal-case"
          style={{ border: '1px solid var(--np-line)' }}
        />
        <Segmented
          label={t('sign.stamp_border_shape')}
          value={shape}
          onChange={setShape}
          options={[
            { id: 'oval', label: t('sign.stamp_shape_oval') },
            { id: 'rect', label: t('sign.stamp_shape_rect') },
          ]}
        />
        <div role="radiogroup" aria-label={t('sign.stamp_colour')} className="flex flex-wrap gap-2.5">
          {STAMP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t('sign.stamp_colour_named', { color: c })}
              onClick={() => setColor(c)}
              className="w-9 h-9 rounded-full"
              style={{ background: c, boxShadow: color === c ? '0 0 0 3px #ffffff, 0 0 0 5px var(--np-ink)' : undefined }}
            />
          ))}
        </div>
        <div className="rounded-xl flex items-center justify-center min-h-[78px] p-3" style={{ background: 'var(--np-paper)' }}>
          {shown ? <StampPreview def={{ text: shown, color, shape }} /> : <span className="text-[13px] text-[color:var(--np-muted)]">{t('sign.stamp_preview_empty')}</span>}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <button type="button" onClick={() => setCreating(false)} className="min-h-[48px] px-4 rounded-2xl text-[15px] font-semibold" style={{ border: '1px solid var(--np-line)' }}>
            {t('phone.cancel')}
          </button>
          <button type="button" onClick={save} disabled={!shown} className="min-h-[48px] rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: 'var(--np-cobalt)' }}>
            {t('sign.stamp_save_mine')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-stamps className="flex flex-col gap-3">
      <p className="m-0 text-[14px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.stamps_note')}</p>
      <div className="grid grid-cols-2 gap-3">
        {STAMPS.map((def, i) => (
          <button
            key={def.text}
            type="button"
            aria-label={t(def.label)}
            onClick={() => onPreset(t(def.text), def.color, def.shape, t(def.label))}
            className={slip}
            style={{ boxShadow: '0 4px 10px rgba(23,30,50,0.12)', transform: `rotate(${['-1.2deg', '1deg', '0.8deg', '-0.8deg'][i % 4]})` }}
          >
            <StampPreview def={{ text: t(def.text), color: def.color, shape: def.shape }} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-[3px] min-h-[78px] flex flex-col items-center justify-center gap-1 text-[14px] font-semibold"
          style={{ border: '2px dashed var(--np-line)', color: 'var(--np-cobalt-deep)' }}
        >
          <Icon d={PATHS.plus} size={20} width={2.4} />
          {t('sign.stamp_new')}
        </button>
      </div>
      {saved.length > 0 && (
        <section className="flex flex-col gap-2 pt-1">
          <h2 className="np-serif m-0 text-[17px] font-bold">{t('sign.stamp_saved')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {saved.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  aria-label={shownName(s.name)}
                  onClick={() => onSaved(s.id)}
                  className={`${slip} w-full`}
                  style={{ boxShadow: '0 4px 10px rgba(23,30,50,0.12)' }}
                >
                  <img src={s.dataUrl} alt="" className="h-12 max-w-full object-contain" />
                </button>
                <button
                  type="button"
                  aria-label={t('sign.stamp_remove_named', { name: shownName(s.name) })}
                  onClick={() => useSignatureStore.getState().remove(s.id)}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: '#b42318' }}
                >
                  <Icon d={PATHS.close} size={14} width={2.4} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
