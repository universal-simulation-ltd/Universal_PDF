import { useEffect, useRef, useState } from 'react'
import { useT, intlLocale } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { formatSize } from '../components/Export/formatSize'
import type { CompressQuality } from '../lib/export'
import { SQUIGGLE } from './icons'
import { useNav } from './nav'
import { buildAnnotated, handOver, makeSmaller } from './output'
import { leaveDocument } from './DocumentScreen'

// Boards 5 and 5b: the moments after the two jobs people most often open the
// app for. A page on the cobalt desk with a stamp on it, one word in the serif,
// a handwritten line under it, and what to do next.

const BTN_MAIN = 'min-h-[56px] rounded-[18px] bg-white text-[color:var(--np-cobalt-deep)] text-[17px] font-bold disabled:opacity-60'
const BTN_LINE = 'min-h-[50px] rounded-2xl text-[15px] font-semibold disabled:opacity-60'
const LINE_STYLE = { border: '1.5px solid rgba(255,255,255,0.55)' }

function MomentFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="np-moment-enter flex-1 min-h-0 flex flex-col gap-[22px] px-6 text-white"
      style={{
        background: 'var(--np-desk)',
        paddingTop: 'calc(env(safe-area-inset-top) + 40px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
      }}
    >
      {children}
    </div>
  )
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className="h-[5px] rounded-sm" style={{ width: w, background: '#d5d9e2' }} />
      ))}
    </>
  )
}

/** The latest signature on the pages, to draw on the moment's page. */
function latestSignature(): string | null {
  const anns = useAnnotationStore.getState().annotations
  for (let i = anns.length - 1; i >= 0; i--) {
    const a = anns[i]
    if (a.type === 'image' && a.sig) return a.src
    if (a.type === 'sigfield' && a.signed) return a.signed.src ?? null
  }
  return null
}

export function SignedMoment() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const [saving, setSaving] = useState(false)
  const [src] = useState(latestSignature)
  const date = new Intl.DateTimeFormat(intlLocale(t.lang), { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date())
    .toLocaleUpperCase(intlLocale(t.lang))

  async function save() {
    setSaving(true)
    try {
      await handOver(await buildAnnotated(), fileName ?? 'document.pdf')
    } catch (err) {
      useNav.getState().say(t('phone.failed', { message: String((err as Error).message || err) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MomentFrame>
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <div aria-hidden="true" className="np-tilt absolute w-[238px] h-[320px] rounded-sm" style={{ background: '#e9e2d2', transform: 'rotate(5deg) translate(14px, 6px)', boxShadow: '0 10px 24px rgba(5,15,50,0.35)' }} />
        <div
          aria-hidden="true"
          className="np-tilt relative w-[250px] h-[340px] bg-white rounded-sm px-5 pt-[22px] pb-[22px] box-border flex flex-col gap-[9px] text-[color:var(--np-ink)]"
          style={{ transform: 'rotate(-3deg)', boxShadow: '0 20px 44px rgba(5,15,50,0.5)' }}
        >
          <div className="h-[22px] -mx-5 -mt-[22px] mb-1.5" style={{ background: '#2f6b3a' }} />
          <Lines widths={['70%', '85%', '60%', '80%', '50%']} />
          <div className="mt-auto h-[46px] flex items-end" style={{ borderBottom: '1px solid var(--np-ink)' }}>
            {src ? (
              <img src={src} alt="" className="max-h-[44px] max-w-[150px] object-contain" />
            ) : (
              <svg width="130" height="40" viewBox="0 0 260 110" fill="none" stroke="#173a94" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                <path d={SQUIGGLE} />
              </svg>
            )}
          </div>
          <div
            className="np-tilt absolute right-3.5 top-[120px] rounded-[10px] px-3.5 py-2 flex flex-col items-center"
            style={{ border: '4px double #2353c9', color: '#2353c9', transform: 'rotate(-14deg)', background: 'rgba(255,255,255,0.6)' }}
          >
            <span className="text-[26px] font-black tracking-[0.14em]">{t('phone.stamp_signed')}</span>
            <span className="text-[11px] font-bold tracking-[0.1em]">{date}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="np-serif m-0 text-[40px] leading-none font-bold">{t('phone.signed_title')}</h1>
        <p className="np-hand np-tilt m-0 text-[26px]" style={{ color: 'var(--np-sticky)', transform: 'rotate(-1.5deg)' }}>{t('phone.signed_note')}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button type="button" className={BTN_MAIN} onClick={() => useNav.getState().replaceTop('share')}>
          {t('phone.send_on_its_way')}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={BTN_LINE} style={LINE_STYLE} onClick={() => void save()} disabled={saving}>
            {saving ? t('phone.preparing') : t('phone.save_to_files')}
          </button>
          <button type="button" className={BTN_LINE} style={LINE_STYLE} onClick={() => useNav.getState().pop()}>
            {t('phone.keep_going')}
          </button>
        </div>
      </div>
    </MomentFrame>
  )
}

export function SmallerMoment() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const smaller = useNav((s) => s.smaller)
  const [quality, setQuality] = useState<CompressQuality>('balanced')
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const run = useRef(0)

  useEffect(() => {
    const id = ++run.current
    setPct(0)
    setError(null)
    useNav.getState().setSmaller(null)
    ;(async () => {
      try {
        const annotated = await buildAnnotated()
        const result = await makeSmaller(annotated, fileName ?? 'document.pdf', quality, (f) => {
          if (id === run.current) setPct(Math.round(f * 100))
        })
        if (id !== run.current) return
        useNav.getState().setSmaller({ before: annotated.byteLength, after: result.bytes.byteLength, bytes: result.bytes })
      } catch (err) {
        if (id === run.current) setError(String((err as Error).message || err))
      }
    })()
  }, [quality, fileName])

  const saved = smaller ? 1 - smaller.after / smaller.before : 0
  const worthIt = saved >= 0.05

  async function save() {
    if (!smaller) return
    setSaving(true)
    try {
      await handOver(smaller.bytes, fileName ?? 'document.pdf')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MomentFrame>
      <div className="flex-1 min-h-0 relative" aria-hidden="true">
        <div className="absolute left-0 top-10 w-[150px] h-[300px]">
          {[
            { l: 10, tp: 18, bg: '#d9d1bf', r: '-8deg' },
            { l: 6, tp: 12, bg: '#e9e2d2', r: '-4deg' },
            { l: 2, tp: 6, bg: '#f3eee2', r: '1deg' },
          ].map((p, i) => (
            <div key={i} className="np-tilt absolute w-32 h-[172px] rounded-sm" style={{ left: p.l, top: p.tp, background: p.bg, transform: `rotate(${p.r})`, boxShadow: '0 8px 18px rgba(5,15,50,0.35)' }} />
          ))}
          <div className="np-tilt absolute left-0 top-0 w-32 h-[172px] bg-white rounded-sm px-3 box-border flex flex-col gap-[7px] overflow-hidden" style={{ transform: 'rotate(-2deg)', boxShadow: '0 10px 22px rgba(5,15,50,0.45)' }}>
            <div className="h-4 -mx-3 mb-1.5" style={{ background: '#2f6b3a' }} />
            <Lines widths={['80%', '65%', '75%', '55%']} />
          </div>
          {smaller && (
            <span className="np-hand np-tilt absolute left-3 top-[214px] text-[26px] whitespace-nowrap" style={{ color: '#d4defa', transform: 'rotate(-3deg)' }}>
              {t('phone.smaller_before', { size: formatSize(t, smaller.before) })}
            </span>
          )}
        </div>

        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke="#fde68a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[150px] top-[120px]">
          <path d="M6 40c16-26 40-32 62-20M56 10l13 10-12 10" />
        </svg>

        <div
          className="np-tilt absolute right-2 top-[130px] w-28 h-[150px] bg-white rounded-sm px-2.5 box-border flex flex-col gap-1.5"
          style={{ transform: 'rotate(4deg)', boxShadow: '0 18px 36px rgba(5,15,50,0.5)', opacity: smaller ? 1 : 0.35, transition: 'opacity 300ms' }}
        >
          <div className="h-3.5 -mx-2.5 mb-1" style={{ background: '#2f6b3a' }} />
          <Lines widths={['80%', '65%', '75%']} />
          {smaller && (
            <div
              className="np-tilt absolute -left-[26px] top-[58px] rounded-[10px] px-2.5 py-1.5 flex flex-col items-center"
              style={{ border: '4px double #f97316', color: '#c2410c', transform: 'rotate(-14deg)', background: 'rgba(255,255,255,0.88)' }}
            >
              <span className="text-[20px] font-black tracking-[0.14em]">{t('phone.stamp_smaller')}</span>
              <span className="text-[11px] font-extrabold tracking-[0.1em] whitespace-nowrap">
                {formatSize(t, smaller.after)}
                {worthIt ? ` · −${Math.round(saved * 100)}%` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-center" aria-live="polite">
        <h1 className="np-serif m-0 text-[40px] leading-none font-bold">
          {smaller ? t('phone.smaller_title') : pct > 0 ? t('phone.smaller_working_pct', { pct }) : t('phone.smaller_working')}
        </h1>
        {smaller && (
          <p className="np-hand np-tilt m-0 text-[26px]" style={{ color: 'var(--np-sticky)', transform: 'rotate(-1.5deg)' }}>
            {worthIt ? t('phone.smaller_note', { pct: Math.round(saved * 100) }) : t('phone.smaller_same')}
          </p>
        )}
        {error && <p className="m-0 text-[15px]">{t('phone.failed', { message: error })}</p>}
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className={BTN_MAIN}
          disabled={!smaller}
          onClick={() => {
            useNav.getState().setShareSmaller(true)
            useNav.getState().replaceTop('share')
          }}
        >
          {t('phone.send_on_its_way')}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={BTN_LINE} style={LINE_STYLE} disabled={!smaller || saving} onClick={() => void save()}>
            {t('phone.save_to_files')}
          </button>
          {quality === 'balanced' ? (
            <button type="button" className={BTN_LINE} style={LINE_STYLE} disabled={!smaller} onClick={() => setQuality('strong')}>
              {t('phone.smaller_still')}
            </button>
          ) : (
            <button type="button" className={BTN_LINE} style={LINE_STYLE} onClick={leaveDocument}>
              {t('phone.back_to_my_desk')}
            </button>
          )}
        </div>
      </div>
    </MomentFrame>
  )
}

/**
 * "Blacked out." — the moment after Black out (James, round 4: "Blacked out."
 * and "Sent." get their own moments). The page with its lines struck through
 * by black bars and a REDACTED stamp, and the one thing worth knowing: the
 * words go from the file for good when it is sent, not just hidden.
 */
export function BlackedMoment() {
  const t = useT()
  const count = useAnnotationStore((s) => s.annotations.filter((a) => a.type === 'redact').length)
  return (
    <MomentFrame>
      <div className="flex-1 min-h-0 relative flex items-center justify-center" aria-hidden="true">
        <div className="np-tilt absolute w-[238px] h-[320px] rounded-sm" style={{ background: '#e9e2d2', transform: 'rotate(-5deg) translate(-14px, 6px)', boxShadow: '0 10px 24px rgba(5,15,50,0.35)' }} />
        <div
          className="np-tilt relative w-[250px] h-[340px] bg-white rounded-sm px-5 pt-[22px] pb-[22px] box-border flex flex-col gap-[11px]"
          style={{ transform: 'rotate(2.5deg)', boxShadow: '0 20px 44px rgba(5,15,50,0.5)' }}
        >
          <div className="h-[22px] -mx-5 -mt-[22px] mb-1.5" style={{ background: '#2f6b3a' }} />
          {[
            ['70%', null], ['40%', '36%'], ['85%', null], ['20%', '55%'], ['62%', null], ['50%', '28%'], ['75%', null],
          ].map(([w, bar], i) => (
            <div key={i} className="relative h-[7px]">
              <div className="h-[5px] rounded-sm" style={{ width: w as string, background: '#d5d9e2' }} />
              {bar && <div className="absolute top-[-4px] h-[13px] rounded-[2px]" style={{ left: '8%', width: bar, background: '#111317', transform: `rotate(${i % 2 ? -1 : 1.2}deg)` }} />}
            </div>
          ))}
          <div
            className="np-tilt absolute right-3 top-[150px] rounded-[10px] px-3 py-2 flex flex-col items-center"
            style={{ border: '4px double #b42318', color: '#b42318', transform: 'rotate(-12deg)', background: 'rgba(255,255,255,0.8)' }}
          >
            <span className="text-[22px] font-black tracking-[0.12em]">{t('phone.stamp_blacked')}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="np-serif m-0 text-[40px] leading-none font-bold">{t('phone.blacked_title')}</h1>
        <p className="np-hand np-tilt m-0 text-[26px]" style={{ color: 'var(--np-sticky)', transform: 'rotate(-1.5deg)' }}>{t('phone.blacked_note')}</p>
        <p className="m-0 text-[14px] text-[#d4defa]">{t.plural('phone.blacked_count', count)}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button type="button" className={BTN_MAIN} onClick={() => useNav.getState().replaceTop('share')}>
          {t('phone.send_on_its_way')}
        </button>
        <button type="button" className={BTN_LINE} style={LINE_STYLE} onClick={() => useNav.getState().pop()}>
          {t('phone.keep_going')}
        </button>
      </div>
    </MomentFrame>
  )
}

/**
 * "Sent." — the moment after Send to sign has handed the file over: the page
 * with its empty Sign here box and a SENT TO SIGN stamp. They can sign it in
 * any PDF app; nothing went through us.
 */
export function SentMoment() {
  const t = useT()
  return (
    <MomentFrame>
      <div className="flex-1 min-h-0 relative flex items-center justify-center" aria-hidden="true">
        <svg width="90" height="60" viewBox="0 0 90 60" fill="none" stroke="#fde68a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2 top-6">
          <path d="M6 50c22-6 40-22 58-40M50 8l16 2-3 16" />
        </svg>
        <div
          className="np-tilt relative w-[250px] h-[340px] bg-white rounded-sm px-5 pt-[22px] pb-[22px] box-border flex flex-col gap-[9px]"
          style={{ transform: 'rotate(-4deg) translate(-6px, 10px)', boxShadow: '0 20px 44px rgba(5,15,50,0.5)' }}
        >
          <div className="h-[22px] -mx-5 -mt-[22px] mb-1.5" style={{ background: '#2f6b3a' }} />
          <Lines widths={['70%', '85%', '60%', '80%', '50%']} />
          <div className="mt-auto h-[54px] rounded-[4px] flex items-center px-3 gap-2" style={{ border: '2px dashed #2353c9', background: 'rgba(35,83,201,0.06)' }}>
            <span className="np-hand text-[24px] text-[color:var(--np-orange-ink)]">×</span>
            <span className="text-[12px] font-bold tracking-[0.08em] text-[#2353c9]">{t('phone.sign_here_box')}</span>
          </div>
          <div
            className="np-tilt absolute right-3 top-[96px] rounded-[10px] px-3 py-2 flex flex-col items-center"
            style={{ border: '4px double #f97316', color: '#c2410c', transform: 'rotate(-14deg)', background: 'rgba(255,255,255,0.88)' }}
          >
            <span className="text-[22px] font-black tracking-[0.12em] whitespace-nowrap">{t('phone.stamp_sent')}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="np-serif m-0 text-[40px] leading-none font-bold">{t('phone.sent_title')}</h1>
        <p className="np-hand np-tilt m-0 text-[26px]" style={{ color: 'var(--np-sticky)', transform: 'rotate(-1.5deg)' }}>{t('phone.sent_note')}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button type="button" className={BTN_MAIN} onClick={leaveDocument}>
          {t('phone.back_to_my_desk')}
        </button>
        <button type="button" className={BTN_LINE} style={LINE_STYLE} onClick={() => useNav.getState().pop()}>
          {t('phone.keep_going')}
        </button>
      </div>
    </MomentFrame>
  )
}
