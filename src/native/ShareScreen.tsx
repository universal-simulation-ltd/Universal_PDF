import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { formatSize } from '../components/Export/formatSize'
import { FLATTEN_BAR, LOSSLESS_BAR, worthOffering } from '../components/Export/worthOffering'
import { countRedactions, isRedactConfirmed, REDACT_CONFIRM_WORD } from '../lib/redactGate'
import { MIN_PASSWORD } from '../lib/lockPassword'
import { SQUIGGLE } from './icons'
import { BackLink, Hl } from './parts'
import { SigningRecordNote } from '../components/Export/SigningRecordNote'
import { useNav } from './nav'
import { baseName, buildAnnotated, estimateFlattened, handOver, inkTheAnswers, lockWithPassword, makeSmaller } from './output'

// Board 7 · Send it on its way, round 4: a tilted page with a READY TO SEND
// stamp, the name written on a form line, the two sizes as paper slips, the
// switches on a slip with a sticky note on it, and Save to Files / Share… at
// the foot. Both buttons hand the file to the phone; on a phone the share
// sheet is where "Save to Files" lives too, so they differ only in intent.
//
// Up to three size slips, the same three copies as the website's Export
// dialog (James, 2026-10-22: "show default, compressed and flatten images —
// hide if the difference is too small"): As it is, Smaller (the lossless
// re-save, text kept) and Flattened (every page a picture). A slip is on the
// page only when it is meaningfully smaller than the one before it; the bars
// are in `worthOffering.ts`.

type Size = 'as-is' | 'smaller' | 'flattened'

export default function ShareScreen() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const numPages = usePdfStore((s) => s.numPages)
  const isXfa = usePdfStore((s) => s.isXfa)
  const annotations = useAnnotationStore((s) => s.annotations)
  const startSmaller = useNav((s) => s.shareSmaller)
  const startPassword = useNav((s) => s.sharePassword)
  const fromMoment = useNav((s) => s.smaller)
  const [name, setName] = useState(() => baseName(fileName))
  // The Smaller moment makes its copy by turning the pages into pictures, so
  // arriving from it lands on Flattened, with that very file.
  const [size, setSize] = useState<Size>(startSmaller ? 'flattened' : 'as-is')
  const [annotated, setAnnotated] = useState<Uint8Array | null>(null)
  const [hasForm, setHasForm] = useState(false)
  const [smaller, setSmaller] = useState<Uint8Array | null>(null)
  const [flattened, setFlattened] = useState<Uint8Array | null>(startSmaller && fromMoment ? fromMoment.bytes : null)
  const [flattening, setFlattening] = useState(false)
  const [ink, setInk] = useState(false)
  const [lock, setLock] = useState(startPassword)
  const [password, setPassword] = useState('')
  const [redactTyped, setRedactTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const pwId = useId()
  const redactId = useId()
  const live = useRef(true)

  // The flags only steer how this page opens; the next visit starts plain.
  useEffect(() => {
    live.current = true
    useNav.getState().setShareSmaller(false)
    useNav.getState().setSharePassword(false)
    return () => {
      live.current = false
    }
  }, [])

  // Weigh every copy as soon as the page opens.
  useEffect(() => {
    live.current = true
    ;(async () => {
      try {
        const bytes = await buildAnnotated()
        if (!live.current) return
        setAnnotated(bytes)
        try {
          const { PDFDocument } = await import('pdf-lib')
          const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
          if (live.current) setHasForm(pdf.getForm().getFields().length > 0)
        } catch {
          /* no form to speak of */
        }
        const lossless = (await makeSmaller(bytes, fileName ?? 'document.pdf', 'light')).bytes
        if (!live.current) return
        setSmaller(lossless)
        if (flattened) return
        // ⚠️ The full pass only when one sampled page says it will clear the
        // bar: drawing every page is minutes on a long document, and on a
        // text document it only ever makes the file bigger.
        const best = worthOffering(lossless.byteLength, bytes.byteLength, LOSSLESS_BAR) ? lossless.byteLength : bytes.byteLength
        let estimate: number
        try {
          estimate = await estimateFlattened(bytes)
        } catch {
          return
        }
        if (!live.current || !worthOffering(estimate, best, FLATTEN_BAR)) return
        setFlattening(true)
        try {
          const r = await makeSmaller(bytes, fileName ?? 'document.pdf', 'balanced')
          if (live.current && !r.fellBackToLossless) setFlattened(r.bytes)
        } finally {
          if (live.current) setFlattening(false)
        }
      } catch (err) {
        if (live.current) setError(String((err as Error).message || err))
      }
    })()
    // Once, for the document as it is when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const redactions = isXfa ? 0 : countRedactions(annotations)
  const redactOk = redactions === 0 || isRedactConfirmed(redactTyped)
  const passwordOk = !lock || password.length >= MIN_PASSWORD
  const offerSmaller = !!annotated && !!smaller && worthOffering(smaller.byteLength, annotated.byteLength, LOSSLESS_BAR)
  const bestLossless = offerSmaller ? smaller!.byteLength : annotated?.byteLength ?? 0
  // On the page while the pass runs (the estimate said it is worth it). The
  // Smaller moment's copy was asked for in so many words, so it only has to
  // be smaller at all — not clear the flatten bar — to keep its slip.
  const offerFlattened = flattening || (!!flattened && (
    !annotated || !smaller ||
    worthOffering(flattened.byteLength, bestLossless, startSmaller && flattened === fromMoment?.bytes ? LOSSLESS_BAR : FLATTEN_BAR)
  ))
  // A slip that is not on the page hands its choice to the next one down.
  const pick: Size =
    size === 'flattened' && !offerFlattened
      ? offerSmaller ? 'smaller' : 'as-is'
      : size === 'smaller' && !offerSmaller
        ? 'as-is'
        : size
  const sizeKnown = pick === 'as-is' ? !!annotated : pick === 'smaller' ? !!smaller : !!flattened && !!annotated
  const canSend = sizeKnown && redactOk && passwordOk && !busy && name.trim().length > 0
  const slips = 1 + (offerSmaller ? 1 : 0) + (offerFlattened ? 1 : 0)

  async function send() {
    if (!canSend || !annotated) return
    setBusy(true)
    setError(null)
    try {
      let bytes: Uint8Array = annotated
      if (ink && hasForm) {
        bytes = await inkTheAnswers(bytes)
        if (pick !== 'as-is') bytes = (await makeSmaller(bytes, fileName ?? 'document.pdf', pick === 'smaller' ? 'light' : 'balanced')).bytes
      } else if (pick === 'smaller') {
        bytes = smaller!
      } else if (pick === 'flattened') {
        bytes = flattened!
      }
      if (lock) bytes = await lockWithPassword(bytes, password)
      await handOver(bytes, `${name.trim()}.pdf`)
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col" style={{ background: 'var(--np-grey-desk)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={baseName(fileName)} onClick={() => useNav.getState().pop()} />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-4 flex flex-col gap-[18px]">
        <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
          {t('phone.share_lead')} <Hl>{t('phone.share_hl')}</Hl>
        </h1>

        <div className="flex gap-[18px] items-center">
          <div aria-hidden="true" className="flex-none relative w-[104px] h-[136px]">
            <div className="np-tilt absolute inset-0 rounded-sm" style={{ background: '#f6f2e8', transform: 'rotate(5deg) translate(6px, 2px)', boxShadow: '0 6px 14px rgba(60,45,20,0.18)' }} />
            <div className="np-tilt absolute inset-0 bg-white rounded-sm px-2.5 pb-2.5 box-border flex flex-col gap-1.5 overflow-hidden" style={{ transform: 'rotate(-3deg)', boxShadow: '0 10px 22px rgba(60,45,20,0.24)' }}>
              <div className="h-3.5 -mx-2.5 mb-1" style={{ background: '#2f6b3a' }} />
              <div className="h-1 w-[80%] rounded-sm" style={{ background: '#d5d9e2' }} />
              <div className="h-1 w-[65%] rounded-sm" style={{ background: '#d5d9e2' }} />
              <div className="h-1 w-[75%] rounded-sm" style={{ background: '#d5d9e2' }} />
              <div className="mt-auto h-[18px] flex items-end" style={{ borderBottom: '1px solid var(--np-ink)' }}>
                <svg width="54" height="18" viewBox="0 0 260 110" fill="none" stroke="#173a94" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"><path d={SQUIGGLE} /></svg>
              </div>
            </div>
            <div
              className="np-tilt absolute left-1 top-[46px] rounded-md px-1.5 py-[3px] text-[10px] font-black tracking-[0.1em] leading-[1.1] text-center whitespace-pre-line"
              style={{ border: '3px double #2353c9', color: '#2353c9', transform: 'rotate(-12deg)', background: 'rgba(255,255,255,0.75)' }}
            >
              {t('phone.stamp_ready')}
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <label htmlFor={nameId} className="np-hand text-[22px] leading-none text-[color:var(--np-cobalt-deep)]">{t('phone.call_it')}</label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 bg-transparent outline-none text-[17px] font-semibold py-1.5"
              style={{ borderBottom: '2px solid var(--np-ink)' }}
            />
            <span className="text-[13px] text-[color:var(--np-muted)]">{t('phone.share_meta', { pages: t.plural('phone.pages', numPages) })}</span>
          </div>
        </div>

        <fieldset className="border-0 m-0 p-0">
          <legend className="np-hand text-[22px] leading-none text-[color:var(--np-cobalt-deep)] p-0 mb-2.5">{t('phone.how_big')}</legend>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${slips}, minmax(0, 1fr))` }}>
            <SizeSlip
              checked={pick === 'as-is'}
              onPick={() => setSize('as-is')}
              title={t('phone.as_is')}
              note={annotated ? t('phone.as_is_note', { size: formatSize(t, annotated.byteLength) }) : t('phone.sizing')}
              tilt="-1.2deg"
              art="stack"
            />
            {offerSmaller && (
              <SizeSlip
                checked={pick === 'smaller'}
                onPick={() => setSize('smaller')}
                title={t('phone.smaller')}
                note={t('phone.smaller_size_note', { size: formatSize(t, smaller!.byteLength) })}
                tilt="1.4deg"
                art="sheet"
              />
            )}
            {offerFlattened && (
              <SizeSlip
                checked={pick === 'flattened'}
                onPick={() => setSize('flattened')}
                title={t('phone.flattened')}
                note={flattened ? t('phone.flattened_note', { size: formatSize(t, flattened.byteLength) }) : t('phone.sizing')}
                tilt="-0.8deg"
                art="picture"
              />
            )}
          </div>
        </fieldset>

        <div className="np-tilt relative bg-white rounded-[3px] mt-1.5" style={{ transform: 'rotate(-0.6deg)', boxShadow: '0 8px 18px rgba(60,45,20,0.18)' }}>
          {hasForm && (
            <label className="flex items-center gap-3 min-h-[58px] px-4 py-2">
              <span className="flex-1 flex flex-col gap-0.5">
                <span className="text-[16px]">{t('phone.ink_answers')}</span>
                <span className="text-[13px] text-[color:var(--np-muted)]">{t('phone.ink_answers_note')}</span>
              </span>
              <input type="checkbox" role="switch" className="np-switch" checked={ink} onChange={(e) => setInk(e.target.checked)} />
            </label>
          )}
          <label className="flex items-center gap-3 min-h-[54px] px-4" style={{ borderTop: hasForm ? '1.5px dashed #d6d0c3' : 0 }}>
            <span className="flex-1 text-[16px]">{t('phone.needs_password')}</span>
            <input type="checkbox" role="switch" className="np-switch" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          </label>
          {lock && (
            <div className="px-4 pb-3.5 flex flex-col gap-1.5">
              <label htmlFor={pwId} className="text-[13px] font-semibold text-[color:var(--np-ink-2)]">{t('phone.password_label')}</label>
              <input
                id={pwId}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 px-3 rounded-lg text-[16px] outline-none"
                style={{ background: 'var(--np-paper)', border: '1px solid var(--np-line)' }}
              />
              <span className="text-[12px] text-[color:var(--np-muted)]">{t('phone.password_note')}</span>
            </div>
          )}
          {offerSmaller && pick === 'as-is' && (
            <div
              aria-hidden="true"
              className="np-hand np-tilt absolute -right-1.5 -top-[30px] w-[116px] px-[9px] pt-2 pb-2.5 text-[19px] leading-none"
              style={{ background: 'var(--np-sticky)', color: '#3a2a05', transform: 'rotate(6deg)', boxShadow: '0 6px 12px rgba(60,45,20,0.22)' }}
            >
              {t('phone.sticky_email')}
            </div>
          )}
        </div>

        {redactions > 0 && (
          <div className="bg-white rounded-[3px] px-4 py-3.5 flex flex-col gap-2" style={{ boxShadow: '0 8px 18px rgba(60,45,20,0.18)' }}>
            <span className="text-[16px] font-bold">{t('tools.export.redact_title')}</span>
            <span className="text-[14px] text-[color:var(--np-ink-2)]">{t.plural('tools.export.redact_body', redactions)}</span>
            <label htmlFor={redactId} className="sr-only">{t('tools.export.redact_confirm', { word: REDACT_CONFIRM_WORD })}</label>
            <input
              id={redactId}
              value={redactTyped}
              onChange={(e) => setRedactTyped(e.target.value)}
              placeholder={t('tools.export.redact_confirm', { word: REDACT_CONFIRM_WORD })}
              autoCapitalize="characters"
              className="h-11 px-3 rounded-lg text-[16px] outline-none"
              style={{ background: 'var(--np-paper)', border: '1px solid var(--np-line)' }}
            />
          </div>
        )}

        <SigningRecordNote className="m-0 bg-white rounded-[3px] px-4 py-3 text-[14px] text-[color:var(--np-ink-2)] shadow-[0_8px_18px_rgba(60,45,20,0.18)]" />

        {error && <p className="m-0 text-[14px] text-[#b42318]">{t('phone.failed', { message: error })}</p>}
        {lock && password.length > 0 && !passwordOk && (
          <p className="m-0 text-[14px] text-[color:var(--np-orange-ink)]">{t('phone.password_short')}</p>
        )}
      </div>

      <div className="flex-none px-5 pt-3 grid grid-cols-2 gap-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="min-h-[56px] rounded-[18px] text-[16px] font-bold disabled:opacity-50"
          style={{ background: 'var(--np-slip)', color: 'var(--np-cobalt-deep)', boxShadow: '0 2px 6px rgba(60,45,20,0.12)' }}
        >
          {t('phone.save_to_files')}
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="min-h-[56px] rounded-[18px] text-white text-[16px] font-bold disabled:opacity-50"
          style={{ background: 'var(--np-cobalt)' }}
        >
          {busy ? t('phone.preparing') : t('phone.share')}
        </button>
      </div>
    </div>
  )
}

function SizeSlip({
  checked,
  onPick,
  title,
  note,
  tilt,
  art,
}: {
  checked: boolean
  onPick: () => void
  title: string
  note: string
  tilt: string
  /** A stack of pages, one lighter sheet, or one sheet that is all picture. */
  art: 'stack' | 'sheet' | 'picture'
}) {
  return (
    <label
      className="np-tilt rounded-[3px] p-3.5 flex flex-col gap-3 relative cursor-pointer"
      style={{
        background: checked ? '#ffffff' : 'var(--np-slip)',
        transform: `rotate(${tilt})`,
        boxShadow: checked ? '0 8px 18px rgba(60,45,20,0.2)' : '0 4px 10px rgba(60,45,20,0.14)',
      }}
    >
      <input
        type="radio"
        name="np-size"
        checked={checked}
        onChange={onPick}
        className="absolute top-3 right-3 w-5 h-5"
        style={{ accentColor: 'var(--np-cobalt)' }}
      />
      <span aria-hidden="true" className="relative h-[54px]">
        {art === 'stack' ? (
          <>
            <span className="absolute left-1 top-0 w-[38px] h-[50px]" style={{ background: '#f6f2e8', boxShadow: '0 2px 5px rgba(23,30,50,0.2)', transform: 'rotate(-6deg)' }} />
            <span className="absolute left-3 top-0.5 w-[38px] h-[50px]" style={{ background: '#f6f2e8', boxShadow: '0 2px 5px rgba(23,30,50,0.2)', transform: 'rotate(3deg)' }} />
            <span className="absolute left-5 top-1 w-[38px] h-[50px] bg-white" style={{ boxShadow: '0 2px 5px rgba(23,30,50,0.2)' }} />
          </>
        ) : art === 'sheet' ? (
          <span className="absolute left-2.5 top-3.5 w-7 h-9 bg-white" style={{ boxShadow: '0 2px 5px rgba(23,30,50,0.2)', transform: 'rotate(-3deg)' }} />
        ) : (
          <span className="absolute left-2.5 top-3.5 w-7 h-9 bg-white p-[3px]" style={{ boxShadow: '0 2px 5px rgba(23,30,50,0.2)', transform: 'rotate(2deg)' }}>
            <span className="block w-full h-full" style={{ background: 'linear-gradient(160deg, #9fb7e6 0%, #d5d9e2 100%)' }} />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="self-start text-[16px] font-bold">{checked ? <Hl>{title}</Hl> : title}</span>
        <span className="text-[13px] text-[color:var(--np-muted)]">{note}</span>
      </span>
    </label>
  )
}
