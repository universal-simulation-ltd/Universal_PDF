import { useId } from 'react'
import { useT } from '../i18n'
import { ocrModelsBundled } from '../lib/ocr'
import { OCR_LANGUAGES } from '../lib/ocrLanguages'
import { openFiles } from '../stores/tabStore'
import { useOcr } from '../components/Ocr/useOcr'
import { Icon, PATHS } from './icons'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, JobPage, Progress, Slip } from './parts'
import { useNav } from './nav'
import { useJobBackLabel, useJobs } from './jobs'
import { baseName, handOver } from './output'

// Make the text searchable, a page (was the website's dialog): the document
// as a slip, the language it is written in, then the pass with the
// highlighter filling as it reads, and the answer with Open it / Share. The
// same pass as the website (`useOcr`), all on this phone.

export default function OcrScreen() {
  const dialog = useJobs((s) => s.dialog)
  if (dialog?.kind !== 'ocr') return null
  return <OcrPage bytes={dialog.bytes} name={dialog.name} />
}

function OcrPage({ bytes, name }: { bytes: ArrayBuffer; name: string }) {
  const t = useT()
  const langId = useId()
  const { phase, lang, setLang, pickedRef, progress, result, error, mode, run, alreadySearchable } = useOcr(bytes, name)
  const back = () => useNav.getState().pop()
  const backLabel = useJobBackLabel()

  async function open() {
    if (!result) return
    const file = new File([result.bytes as BlobPart], result.fileName, { type: 'application/pdf' })
    if (await openFiles([file])) useNav.getState().say(t('phone.ocr_opened'))
  }

  const footer =
    phase === 'choose' ? (
      <button
        type="button"
        className={BTN_PRIMARY}
        style={BTN_PRIMARY_STYLE}
        onClick={() => {
          pickedRef.current = true
          run('auto', lang)
        }}
      >
        {t('tools.ocr.start')}
      </button>
    ) : phase === 'done' && result && !alreadySearchable ? (
      <>
        <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} onClick={() => void open()}>
          {t('tools.ocr.open')}
        </button>
        <button type="button" className={BTN_SECOND} style={BTN_SECOND_STYLE} onClick={() => void handOver(result.bytes, result.fileName)}>
          {t('phone.share')}
        </button>
      </>
    ) : phase === 'done' && alreadySearchable && mode === 'auto' ? (
      <>
        <button type="button" className={BTN_SECOND} style={BTN_SECOND_STYLE} onClick={() => run('all', lang)}>
          {t('tools.ocr.run_anyway')}
        </button>
        <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} onClick={back}>
          {t('phone.done')}
        </button>
      </>
    ) : phase === 'done' || phase === 'error' ? (
      <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} onClick={back}>
        {t('phone.done')}
      </button>
    ) : null

  return (
    <JobPage
      backLabel={backLabel}
      onBack={back}
      lead={t('phone.ocr_lead')}
      hl={t('phone.ocr_hl')}
      note={t(ocrModelsBundled ? 'tools.ocr.intro_offline' : 'tools.ocr.intro')}
      footer={footer}
    >
      <FileSlip name={name} />

      {phase === 'choose' && (
        <Slip label={t('phone.ocr_written_in')} tilt="0.6deg">
          <label htmlFor={langId} className="relative w-full flex items-center gap-3 min-h-[54px] px-4">
            <span className="flex-1 text-[16px]">{t('tools.ocr.language')}</span>
            <span className="text-[15px] text-[color:var(--np-muted)] truncate max-w-[45%]">
              {OCR_LANGUAGES.find((l) => l.code === lang)?.label ?? lang}
            </span>
            <Icon d={PATHS.chevron} size={16} stroke="#9a9ca3" width={2.4} />
            <select
              id={langId}
              data-testid="ocr-language"
              value={lang}
              onChange={(e) => {
                pickedRef.current = true
                setLang(e.target.value)
              }}
              className="absolute inset-0 w-full h-full opacity-0"
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </Slip>
      )}

      {phase === 'running' && <Progress fraction={progress.fraction} label={progress.message} />}

      {phase === 'done' && result && (
        <div className="flex flex-col gap-1.5">
          <p className="np-hand np-tilt m-0 text-[26px] leading-tight text-[color:var(--np-cobalt-deep)]" style={{ transform: 'rotate(-1.5deg)' }}>
            {alreadySearchable ? t('tools.ocr.already_searchable') : t.plural('tools.ocr.added', result.pagesOcred)}
          </p>
          {alreadySearchable && <p className="m-0 text-[14px] text-[color:var(--np-muted)]">{t('tools.ocr.run_anyway_hint')}</p>}
          {!alreadySearchable && result.pagesSkipped > 0 && (
            <p className="m-0 text-[14px] text-[color:var(--np-muted)]">{t.plural('tools.ocr.skipped', result.pagesSkipped)}</p>
          )}
        </div>
      )}

      {phase === 'error' && <p className="m-0 text-[15px] text-[#b42318]">{t('tools.ocr.failed', { message: error ?? '' })}</p>}
    </JobPage>
  )
}

/** The file a job works on, as a slip with its name. */
export function FileSlip({ name, note, tilt = '-1deg' }: { name: string; note?: string; tilt?: string }) {
  return (
    <div className="np-tilt bg-white rounded-[3px] px-4 py-3 flex items-center gap-3" style={{ transform: `rotate(${tilt})`, boxShadow: '0 6px 14px rgba(60,45,20,0.14)' }}>
      <span aria-hidden="true" className="flex-none w-9 h-11 rounded-[2px] flex flex-col gap-[3px] px-1.5 pt-2" style={{ background: '#f6f2e8', boxShadow: 'inset 0 0 0 1px #e3ded3' }}>
        <span className="h-[3px] w-[80%] rounded-sm" style={{ background: '#d5d9e2' }} />
        <span className="h-[3px] w-[60%] rounded-sm" style={{ background: '#d5d9e2' }} />
        <span className="h-[3px] w-[70%] rounded-sm" style={{ background: '#d5d9e2' }} />
      </span>
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[16px] font-semibold truncate">{baseName(name)}</span>
        {note && <span className="text-[13px] text-[color:var(--np-muted)] truncate">{note}</span>}
      </span>
    </div>
  )
}
