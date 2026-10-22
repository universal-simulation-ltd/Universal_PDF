import { useId, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { currentPdfBytes } from '../lib/hostedStore'
import { nextExportName } from '../lib/exportName'
import { isRedactConfirmed, REDACT_CONFIRM_WORD } from '../lib/redactGate'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, Sheet } from './parts'
import { useNav } from './nav'
import { handOver } from './output'

// Send to sign on the phone: the plain route (James, 2026-10-13) — no
// account, no upload, the phone's share sheet, and each empty "Sign here" box
// leaves as a real PDF signature field. A sheet that leaves the page above it
// usable (like Mark up), rather than the website's dialog over everything, so
// the boxes are put down with it open: "Sign here" is in hand while it is up.
//
// ⚠️ Sharing does NOT wait for a box (round 4's open question, decided
// 2026-10-22): the button works with none. Whoever gets the file can still
// sign it anywhere in Universal PDF, Acrobat's Fill & Sign or Preview; a box
// only says where. So the sheet says so in a handwritten line instead of
// greying the button out — a disabled button with no visible reason was the
// thing that read as broken.

export default function SendSignSheet() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const isXfa = usePdfStore((s) => s.isXfa)
  const boxes = useAnnotationStore((s) => s.annotations.filter((a) => a.type === 'sigfield' && !a.signed).length)
  const redactions = useAnnotationStore((s) => s.annotations.filter((a) => a.type === 'redact').length)
  const tool = useAnnotationStore((s) => s.tool)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const redactId = useId()
  const needsConfirm = !isXfa && redactions > 0
  const ready = !busy && (!needsConfirm || isRedactConfirmed(typed))

  const close = () => {
    useNav.getState().closeSheet()
    const a = useAnnotationStore.getState()
    if (a.tool === 'sigfield') a.setTool('select')
  }

  async function share() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const { bytes } = await currentPdfBytes()
      await handOver(bytes, nextExportName(fileName))
      const a = useAnnotationStore.getState()
      if (a.tool === 'sigfield') a.setTool('select')
      // `push` takes the sheet down with it, in one step: the sheet's history
      // entry becomes the moment's, so Android's back still counts right.
      useNav.getState().push('sent')
    } catch (err) {
      setError(t('sign.sfs_failed', { error: String((err as Error).message || err) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet label={t('phone.sendsign_title')} onClose={close} scrim={false} background="var(--np-sheet)">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="np-serif m-0 text-[22px] leading-tight font-bold">{t('phone.sendsign_title')}</h2>
        <button
          type="button"
          onClick={() => {
            const a = useAnnotationStore.getState()
            a.setSelected(null)
            a.setTool(tool === 'sigfield' ? 'select' : 'sigfield')
          }}
          aria-pressed={tool === 'sigfield'}
          className="min-h-[40px] px-3 rounded-xl text-[14px] font-bold"
          style={tool === 'sigfield' ? { background: 'var(--np-cobalt)', color: '#fff' } : { background: 'var(--np-slip)', color: 'var(--np-cobalt-deep)', border: '1px solid var(--np-line)' }}
        >
          {t('phone.sendsign_box_tool')}
        </button>
      </div>
      <p className="np-hand np-tilt m-0 text-[22px] leading-tight text-[color:var(--np-cobalt-deep)]" style={{ transform: 'rotate(-1deg)' }}>
        {boxes > 0 ? t.plural('phone.sendsign_boxes', boxes) : t('phone.sendsign_no_box')}
      </p>
      <p className="m-0 text-[13px] leading-snug text-[color:var(--np-muted)]">{t('sign.sfs_private')}</p>

      {needsConfirm && (
        <div className="bg-white rounded-[3px] px-3.5 py-3 flex flex-col gap-2" style={{ boxShadow: '0 4px 10px rgba(60,45,20,0.14)' }}>
          <span className="text-[14px] font-semibold">{t.plural('sign.send_redactions', redactions)}</span>
          <label htmlFor={redactId} className="text-[13px] text-[color:var(--np-ink-2)]">
            {t.rich('sign.sfs_redact_body', { word: <strong>{REDACT_CONFIRM_WORD}</strong> })}
          </label>
          <input
            id={redactId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={REDACT_CONFIRM_WORD}
            autoCapitalize="characters"
            className="h-11 px-3 rounded-lg text-[16px] outline-none"
            style={{ background: 'var(--np-paper)', border: '1px solid var(--np-line)' }}
          />
        </div>
      )}

      {error && <p className="m-0 text-[14px] text-[#b42318]">{error}</p>}

      <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={!ready} onClick={() => void share()} data-sfs-share>
        {busy ? t('sign.sfs_preparing') : t('phone.sendsign_share')}
      </button>
    </Sheet>
  )
}
