import { useId, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { formatSize } from '../components/Export/formatSize'
import { Icon, PATHS } from './icons'
import { Card, LinkRow, Sheet } from './parts'
import { useNav } from './nav'
import { leaveDocument } from './DocumentScreen'
import { DocThumb } from './DeskScreen'

// Board 6 · ⋯ What else: a sheet over the document in place of the website's
// Actions menu. Four big jobs, then a short list. The tools the phone has no
// page of its own for yet (searchable text, compare, merge, pictures) open the
// website's dialog for them.

export default function MoreSheet() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const numPages = usePdfStore((s) => s.numPages)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(() => (fileName ?? '').replace(/\.pdf$/i, ''))
  const renameId = useId()
  const nav = useNav.getState()
  const pdf = usePdfStore.getState()
  const close = () => useNav.getState().closeSheet()

  function arm(tool: 'sigfield' | 'redact', colour?: string) {
    const a = useAnnotationStore.getState()
    a.setSelected(null)
    if (colour) a.setColor(colour)
    a.setTool(tool)
  }

  const big = [
    {
      label: t('phone.more_smaller'), note: t('phone.more_smaller_note'), tint: '#dfe7fb', ink: '#173a94', icon: PATHS.compress,
      run: () => nav.push('smaller'),
    },
    {
      label: t('phone.more_lock'), note: t('phone.more_lock_note'), tint: '#fde3cf', ink: '#b4480a', icon: PATHS.lock,
      run: () => {
        nav.setSharePassword(true)
        nav.push('share')
      },
    },
    {
      label: t('phone.more_send_sign'), note: t('phone.more_send_sign_note'), tint: '#dcefd9', ink: '#2f6b3a', icon: PATHS.mail,
      run: () => {
        close()
        arm('sigfield')
        pdf.setSendForSignatureOpen(true)
      },
    },
    {
      label: t('phone.more_blackout'), note: t('phone.more_blackout_note'), tint: '#e4e2e8', ink: '#1b1d22', icon: PATHS.blackout,
      run: () => {
        arm('redact', '#000000')
        nav.openSheet('markup')
      },
    },
  ]

  const rows = [
    // Pages lives here, not in the bar (James, 2026-10-18: "fill mark up sign
    // share and pages in …").
    { label: t('phone.job_pages'), icon: PATHS.pages, run: () => { close(); pdf.setPageNavOpen(true) } },
    { label: t('phone.more_ocr'), icon: PATHS.search, run: () => { close(); pdf.setOcrOpen(true) } },
    { label: t('phone.more_compare'), icon: PATHS.compare, run: () => { close(); pdf.setCompareOpen(true) } },
    { label: t('phone.more_merge'), icon: PATHS.merge, run: () => { close(); pdf.setMergeOpen(true) } },
    { label: t('phone.more_images'), icon: PATHS.images, run: () => { close(); pdf.setConvertOpen(true) } },
    { label: t('phone.more_rename'), icon: PATHS.rename, run: () => setRenaming(true) },
    { label: t('phone.more_howto'), icon: PATHS.help, run: () => nav.push('kb') },
    { label: t('phone.more_put_away'), icon: PATHS.put, run: () => { close(); leaveDocument() } },
  ]

  return (
    <Sheet label={t('phone.more_title')} onClose={close}>
      <div className="flex items-center gap-3.5 px-1">
        <DocThumb tilt="-4deg" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="np-serif m-0 text-[22px] font-bold">{t('phone.more_title')}</h2>
          <span className="text-[13px] text-[color:var(--np-muted)] truncate">
            {(fileName ?? '').replace(/\.pdf$/i, '')} · {t.plural('phone.pages', numPages)}
            {sourceBytes ? ` · ${formatSize(t, sourceBytes.byteLength)}` : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {big.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.run}
            className="rounded-[18px] p-3.5 min-h-[104px] flex flex-col justify-between text-left gap-2"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
          >
            <span className="w-[38px] h-[38px] rounded-xl flex items-center justify-center" style={{ background: b.tint }}>
              <Icon d={b.icon} size={22} stroke={b.ink} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">{b.label}</span>
              <span className="text-[12px] text-[color:var(--np-muted)]">{b.note}</span>
            </span>
          </button>
        ))}
      </div>

      {renaming ? (
        <form
          className="flex flex-col gap-2 rounded-2xl p-3.5"
          style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
          onSubmit={(e) => {
            e.preventDefault()
            const next = newName.trim()
            if (next) void usePdfStore.getState().renameFile(`${next}.pdf`)
            setRenaming(false)
          }}
        >
          <label htmlFor={renameId} className="text-[13px] font-semibold text-[color:var(--np-ink-2)]">{t('phone.rename_label')}</label>
          <input
            id={renameId}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-11 px-3 rounded-lg text-[16px] outline-none"
            style={{ background: 'var(--np-paper)', border: '1px solid var(--np-line)' }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRenaming(false)} className="min-h-[44px] rounded-xl text-[15px] font-semibold" style={{ border: '1px solid var(--np-line)' }}>
              {t('phone.cancel')}
            </button>
            <button type="submit" className="min-h-[44px] rounded-xl text-white text-[15px] font-bold" style={{ background: 'var(--np-cobalt)' }}>
              {t('phone.done')}
            </button>
          </div>
        </form>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <LinkRow key={r.label} label={r.label} icon={r.icon} onClick={r.run} first={i === 0} />
          ))}
        </Card>
      )}
      <div className="h-1" />
    </Sheet>
  )
}
