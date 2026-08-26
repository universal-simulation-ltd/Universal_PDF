import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { UnisimQr, useUniversal } from '@unisim/sdk'
import { useSignatureStore, type SignatureExtras } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { inkColorFor, renderInkSignature } from '../../lib/renderInk'
import {
  composeSignatureWithLabels,
  detailLines,
  labelsForOptions,
  DEFAULT_LABEL_SCALE,
  DEFAULT_SIG_ALIGN
} from '../../lib/composeSignature'
import type { SignatureData } from '../../types/annotations'
import { importImageAsSignature } from '../../lib/imageSignature'
import {
  mobileSignChannel,
  mobileSignUrl,
  randomPin,
  randomToken,
  type MobileSignPayload
} from '../../lib/mobileSign'

const PAD_W = 600
const PAD_H = 240

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

// A prefix box for one label line — "Signed by:", "Signed on". Sits beside its
// toggle and is disabled while that label is off, so it can never be typed into
// with no effect.
function PrefixField({
  value,
  onChange,
  enabled,
  placeholder,
  suggestion,
  label
}: {
  value: string
  onChange: (v: string) => void
  enabled: boolean
  placeholder: string
  suggestion: string
  label: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        disabled={!enabled}
        className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      {/* One tap for the wording nearly everyone wants, typing for the rest. */}
      {value.trim() === '' && (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className="shrink-0 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
        >
          {suggestion}
        </button>
      )}
    </div>
  )
}

export default function SignaturePad() {
  const open = useSignatureStore((s) => s.padOpen)
  const closePad = useSignatureStore((s) => s.closePad)
  const add = useSignatureStore((s) => s.add)
  // Id of the "Request signature" box being fulfilled, if any. When set the pad
  // fills that box (rather than adding a library signature) and offers the same
  // name/date options every other signature gets.
  const signingFieldId = useSignatureStore((s) => s.signingFieldId)
  const { supabase } = useUniversal()

  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [padW, setPadW] = useState(PAD_W)
  const [lines, setLines] = useState<number[][]>([])
  const drawingRef = useRef(false)
  const [name, setName] = useState('')
  // Advanced options: which extras to attach, and how they're placed. All of
  // them start OFF — a fresh pad produces exactly what the user drew, and the
  // extras are opt-in under "Advanced options".
  const [includeName, setIncludeName] = useState(false)
  const [includeDate, setIncludeDate] = useState(false)
  // Free text under the name — role, email, company. No toggle of its own:
  // typing something is the decision to show it.
  const [details, setDetails] = useState('')
  // Optional wording in front of the name and date lines.
  const [namePrefix, setNamePrefix] = useState('')
  const [datePrefix, setDatePrefix] = useState('')
  // Realistic ink (blue, blemishes, variable width) vs a clean plain-black line.
  const [realistic, setRealistic] = useState(false)
  // false → bake name/date into the signature image (one click places all).
  // true  → keep the image ink-only and drop name/date as separate text the
  //         user positions with extra clicks (e.g. into a form's name field).
  const [separatePlacement, setSeparatePlacement] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // True when the box being fulfilled asked for live ink. Surfaced to the signer
  // so the requirement is visible to the person it constrains; the pad's own
  // Draw / Sign-on-phone modes already produce nothing but drawn ink, so there
  // is no upload path here to disable.
  const [fieldRequiresLive, setFieldRequiresLive] = useState(false)

  // ── Sign-on-phone handoff (mirrors Ergo Assess) ───────────────────────────
  const [mode, setMode] = useState<'draw' | 'phone'>('draw')
  const [token, setToken] = useState(randomToken)
  const [pin, setPin] = useState(randomPin)
  const [phoneStatus, setPhoneStatus] = useState<'waiting' | 'received'>('waiting')

  // Fresh token + PIN every time the pad opens, so a QR from an earlier
  // session can't feed a signature into this one.
  useEffect(() => {
    if (!open) return
    setMode('draw')
    setToken(randomToken())
    setPin(randomPin())
    setPhoneStatus('waiting')
  }, [open])

  // Fulfilling a "Request signature" box: seed the same name/date options the
  // box asked for (and surface them) so the signer gets exactly the options
  // every other signature gets, rather than having them silently dictated by
  // the request. They stay editable — the signer can add or drop either one.
  useEffect(() => {
    if (!open || !signingFieldId) {
      setFieldRequiresLive(false)
      return
    }
    const ann = useAnnotationStore
      .getState()
      .annotations.find((a) => a.id === signingFieldId)
    if (ann?.type !== 'sigfield') return
    setIncludeName(!!ann.requireName)
    setIncludeDate(!!ann.requireDate)
    setFieldRequiresLive(!!ann.requireLive)
    // Baked into the box (never a separate click) — a request box is a fixed
    // slot, so the labels always travel inside it.
    setSeparatePlacement(false)
    if (ann.requireName || ann.requireDate) setAdvancedOpen(true)
  }, [open, signingFieldId])

  // While in phone mode: listen for the phone's signature. (The QR draws
  // itself — see <UnisimQr> below.)
  useEffect(() => {
    if (!open || mode !== 'phone') return
    const channel = supabase.channel(mobileSignChannel(token))
    channel
      .on('broadcast', { event: 'signature' }, (msg) => {
        const payload = msg.payload as MobileSignPayload
        if (payload?.pin !== pin || !payload.signature) return
        setPhoneStatus('received')
        // The phone canvas has a white background — run it through the same
        // clean-up as imported signature images (crop + background removal)
        // so it places like an ink signature.
        const bytes = Uint8Array.from(atob(payload.signature), (c) => c.charCodeAt(0))
        const file = new File([bytes], 'phone-signature.png', { type: 'image/png' })
        importImageAsSignature(file, { removeBg: true })
          .then((res) => {
            // Signing a specific request box: drop the phone signature straight
            // into it after a beat, so the "received ✓" tick is visible.
            const fieldId = useSignatureStore.getState().signingFieldId
            if (fieldId) {
              setTimeout(() => { fillField(fieldId, res, name.trim()) }, 700)
              return
            }
            const count = useSignatureStore.getState().signatures.length
            add({ name: `Signature ${count + 1}`, dataUrl: res.dataUrl, width: res.width, height: res.height })
            setTimeout(() => {
              closePad()
              // Arm the signature tool so the user can immediately place it.
              useAnnotationStore.getState().setTool('signature')
            }, 700)
          })
          .catch(() => setPhoneStatus('waiting'))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [open, mode, token, pin, supabase, add, closePad])

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
    // `mode` is a dep so the draw container is re-measured when switching
    // back from the phone view (it remounts fresh).
  }, [open, mode])

  const padH = Math.round((padW / PAD_W) * PAD_H)
  // Whether there's anything to place separately (gates the placement control).
  const hasExtras = (includeName && !!name.trim()) || includeDate
  // Ink colour follows the realism toggle (deep blue vs plain near-black).
  const inkColor = inkColorFor(realistic)

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
    setIncludeName(false)
    setIncludeDate(false)
    setDetails('')
    setNamePrefix('')
    setDatePrefix('')
    setSeparatePlacement(false)
    setRealistic(false)
    setAdvancedOpen(false)
  }

  function cancel() {
    resetForm()
    closePad()
  }

  // Bake the ink (plus the field's requested name/date labels) into a single
  // PNG and drop it into the signature-request box the user clicked, then
  // return to the editor. Used when the pad was opened by clicking a field.
  // `strokes` is the raw pen path behind `sig` when it came from this pad. It
  // rides along so the placed signature's realism can still be toggled later;
  // a phone/imported image arrives already rasterised and passes nothing.
  async function fillField(
    fieldId: string,
    sig: { dataUrl: string; width: number; height: number },
    trimmedName: string,
    strokes?: number[][]
  ) {
    const ann = useAnnotationStore.getState().annotations.find((a) => a.id === fieldId)
    if (!ann || ann.type !== 'sigfield') {
      resetForm()
      closePad()
      return
    }
    // The signer's chosen options (seeded from the request, but freely
    // adjustable in the pad) decide which labels get baked in.
    const wantName = includeName && !!trimmedName
    const wantDate = includeDate
    const detail = detailLines(details)
    const wantDetails = detail.length > 0
    // Built through the same helper the re-edit path uses, so a signature looks
    // identical whether it was just drawn or restyled an hour later.
    const labels = labelsForOptions({
      name: trimmedName,
      showName: wantName,
      details,
      showDetails: wantDetails,
      showDate: wantDate,
      namePrefix,
      datePrefix
    })

    let src = sig.dataUrl
    let w = sig.width
    let h = sig.height
    if (labels.length > 0) {
      const composed = await composeSignatureWithLabels(sig.dataUrl, sig.width, sig.height, labels, inkColor)
      src = composed.dataUrl
      w = composed.width
      h = composed.height
    }
    // Carry the untouched ink + options so the box's name/date stay re-editable
    // (double-tap) and restyleable (size/alignment pill) later.
    const data: SignatureData = {
      ink: sig.dataUrl,
      inkWidth: sig.width,
      inkHeight: sig.height,
      name: trimmedName || undefined,
      showName: wantName,
      details: details || undefined,
      showDetails: wantDetails,
      showDate: wantDate,
      namePrefix: namePrefix.trim() || undefined,
      datePrefix: datePrefix.trim() || undefined,
      align: DEFAULT_SIG_ALIGN,
      labelScale: DEFAULT_LABEL_SCALE,
      color: inkColor,
      strokes: strokes && strokes.length > 0 ? strokes : undefined,
      realistic
    }
    useAnnotationStore.getState().update(fieldId, { signed: { src, width: w, height: h, data } })
    resetForm()
    closePad()
    useAnnotationStore.getState().setTool('select')
  }

  async function save() {
    if (lines.length === 0) return
    const ink = renderInkSignature(lines, inkColor, realistic)
    if (!ink) return

    const trimmed = name.trim()

    // If the pad was opened by clicking a signature-request box, fill that box
    // instead of adding a reusable library signature.
    const fieldId = useSignatureStore.getState().signingFieldId
    if (fieldId) {
      await fillField(fieldId, ink, trimmed, lines)
      return
    }

    const sigName = trimmed || `Signature ${useSignatureStore.getState().signatures.length + 1}`
    const wantName = includeName && !!trimmed
    const wantDate = includeDate
    const wantDetails = detailLines(details).length > 0

    let finalUrl = ink.dataUrl
    let finalW = ink.width
    let finalH = ink.height
    let extras: SignatureExtras | undefined

    // ⚠️ Details are never placed separately, only baked. They are a block that
    // belongs under the ink, and the separate-placement flow drops ONE text
    // piece per click — three clicks to land a role and an email is not an
    // interaction anyone wants.
    if ((wantName || wantDate) && separatePlacement && !wantDetails) {
      // Image stays ink-only; the name/date are placed by extra clicks. The
      // date is resolved at placement time ("date of signing").
      extras = { name: wantName ? trimmed : undefined, date: wantDate, color: inkColor }
    } else if (wantName || wantDate || wantDetails) {
      // Bake the labels beneath the ink so they travel as one image.
      const labels = labelsForOptions({
        name: trimmed,
        showName: wantName,
        details,
        showDetails: wantDetails,
        showDate: wantDate,
        namePrefix,
        datePrefix
      })
      const composed = await composeSignatureWithLabels(ink.dataUrl, ink.width, ink.height, labels, inkColor)
      finalUrl = composed.dataUrl
      finalW = composed.width
      finalH = composed.height
    }

    // Carry the untouched ink + baked-label options onto the library signature
    // so, once placed, its name/date can be re-edited (double-tap) and restyled
    // (size/alignment pill) without ever redrawing the strokes. Separately-
    // placed labels aren't baked into the image, so the image starts label-free.
    const sig: SignatureData = {
      ink: ink.dataUrl,
      inkWidth: ink.width,
      inkHeight: ink.height,
      name: wantName ? trimmed : undefined,
      showName: wantName && !separatePlacement,
      details: details || undefined,
      showDetails: wantDetails,
      showDate: wantDate && !separatePlacement,
      namePrefix: namePrefix.trim() || undefined,
      datePrefix: datePrefix.trim() || undefined,
      align: DEFAULT_SIG_ALIGN,
      labelScale: DEFAULT_LABEL_SCALE,
      color: inkColor,
      // Keep the pen path so realism stays a toggle after placement, not a
      // decision frozen at draw time.
      strokes: lines,
      realistic
    }

    add({ name: sigName, dataUrl: finalUrl, width: finalW, height: finalH, extras, sig })
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
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'phone' ? 'Sign on your phone' : 'Draw signature'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('draw')}
                className={`rounded-md px-2.5 py-1 transition ${mode === 'draw' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Draw
              </button>
              {/* Orange + phone icon so the "sign on your phone" option is easy
                  to spot — signing with a mouse on desktop is fiddly. */}
              <button
                type="button"
                onClick={() => setMode('phone')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${mode === 'phone' ? 'bg-orange-700 text-white' : 'text-orange-700 hover:bg-orange-700/10 hover:text-orange-800'}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="2" width="10" height="20" rx="2.5" /><line x1="11" y1="18" x2="13" y2="18" />
                </svg>
                Sign on phone
              </button>
            </div>
            <button
              onClick={cancel}
              className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
        {/* The box asked for live ink. Worded as what the document asks for —
            NOT as a guarantee the ink is verified — because this is a
            client-side constraint, the same class of claim as the signing
            certificate page. */}
        {fieldRequiresLive && (
          <p className="mb-3 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800" style={{ maxWidth: padW }}>
            This box asks to be signed here rather than with an uploaded image.
            Drawing it on your phone counts — that is drawn ink too.
          </p>
        )}
        {mode === 'phone' ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center" style={{ width: padW }}>
            {/* Click enlarges it — this dialog is a small window on a big
                screen, and the code is being read by a camera held up to it. */}
            <UnisimQr
              value={mobileSignUrl(token)}
              size={192}
              label="signing on your phone"
              className="rounded-lg"
              lightbox={{
                title: "Point your phone's camera at this code",
                hint: (
                  <>
                    Then enter this PIN on your phone:
                    <span className="mt-1 block text-2xl font-bold tracking-[0.3em] text-white">{pin}</span>
                  </>
                )
              }}
            />
            <p className="text-sm text-slate-600">Scan with your phone, then enter this PIN:</p>
            <p className="text-2xl font-bold tracking-[0.3em] text-slate-900">{pin}</p>
            <p className={`text-xs ${phoneStatus === 'received' ? 'text-green-600' : 'text-slate-400'}`}>
              {phoneStatus === 'received' ? 'Signature received ✓' : 'Waiting for your phone…'}
            </p>
            <button
              type="button"
              onClick={cancel}
              className="mt-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
        <>
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
              className="px-4 py-2 bg-orange-700 hover:bg-orange-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
            >
              Save
            </button>
          </div>

          {/* Anything else that belongs under the name: a role, an email, a
              company. Multi-line, because a signature block is lines — each one
              typed becomes its own line under the signature. */}
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Add your role, email address, etc. (optional)"
            aria-label="Details to show under the signature"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500"
          />

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
                <PrefixField
                  value={namePrefix}
                  onChange={setNamePrefix}
                  enabled={includeName}
                  placeholder="Wording before the name (optional)"
                  suggestion="Signed by:"
                  label="Wording before the name"
                />
                <OptionToggle checked={includeDate} onChange={setIncludeDate} label="Add date (today)" />
                <PrefixField
                  value={datePrefix}
                  onChange={setDatePrefix}
                  enabled={includeDate}
                  placeholder="Wording before the date (optional)"
                  suggestion="Signed on"
                  label="Wording before the date"
                />

                <div className={hasExtras ? '' : 'opacity-50 pointer-events-none'}>
                  <div className="text-xs font-medium text-slate-500 mb-1">When placed</div>
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => setSeparatePlacement(false)}
                      className={`px-3 py-1.5 ${!separatePlacement ? 'bg-orange-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      With signature
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeparatePlacement(true)}
                      className={`px-3 py-1.5 border-l border-slate-300 ${separatePlacement ? 'bg-orange-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
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
        </>
        )}
      </div>
    </div>
  )
}
