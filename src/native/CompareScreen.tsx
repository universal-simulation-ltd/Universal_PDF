import { useT } from '../i18n'
import { TextView, useCompare, VisualView, type CompareMode } from '../components/Compare/CompareDialog'
import { Icon, PATHS } from './icons'
import { JobPage, Segmented } from './parts'
import { useNav } from './nav'
import { pickFiles, useJobBackLabel, useJobs } from './jobs'
import { AddSlip } from './MergeScreen'
import { FileSlip } from './OcrScreen'

// Spot the difference, a page (was the website's full-screen Compare dialog):
// the first document as a slip, the other one picked with the orange ring,
// then the three ways of looking — side by side, one overlay, the words — and
// the page cursor with the pages that changed at the foot. The same pass as
// the website (`useCompare`), on this phone.

export default function CompareScreen() {
  const dialog = useJobs((s) => s.dialog)
  if (dialog?.kind !== 'compare') return null
  return <ComparePage bytes={dialog.bytes} name={dialog.name} />
}

function ComparePage({ bytes, name }: { bytes: ArrayBuffer; name: string }) {
  const t = useT()
  const backLabel = useJobBackLabel()
  const { first, second, error, loading, mode, setMode, pageNo, setPageNo, scan, pick, total, changedPages } = useCompare(bytes, name)
  const back = () => useNav.getState().pop()

  function choose() {
    void pickFiles('application/pdf,.pdf').then(([f]) => {
      if (f) void pick(f)
    })
  }

  const both = !!first && !!second

  return (
    <JobPage
      backLabel={backLabel}
      onBack={back}
      lead={t('phone.compare_lead')}
      hl={t('phone.compare_hl')}
      note={both ? undefined : t('tools.compare.intro')}
      bodyClass="gap-4"
      footer={both && mode !== 'text' ? cursor() : undefined}
    >
      <div className="flex flex-col gap-2.5">
        <Legend colour="#dc2626">
          <FileSlip name={name} note={t('phone.compare_first')} />
        </Legend>
        {second ? (
          <Legend colour="#16a34a">
            <button type="button" onClick={choose} className="text-left w-full" aria-label={t('tools.compare.change_second')}>
              <FileSlip name={second.name} note={t('tools.compare.change_second')} tilt="0.8deg" />
            </button>
          </Legend>
        ) : (
          <AddSlip label={loading ? t('tools.compare.opening') : t('tools.compare.pick')} onClick={choose} disabled={loading || !first} />
        )}
      </div>

      {error && <p className="m-0 text-[14px] text-[#b42318]">{error}</p>}

      {both && (
        <>
          <Segmented<CompareMode>
            label={t('tools.compare.title')}
            value={mode}
            onChange={setMode}
            options={[
              { id: 'side', label: t('tools.compare.side_by_side') },
              { id: 'overlay', label: t('tools.compare.overlay') },
              { id: 'text', label: t('tools.compare.text') },
            ]}
          />
          <div className="-mx-5 np-compare">
            {mode === 'text' ? (
              <TextView first={first.doc} second={second.doc} onPage={(p) => { setPageNo(p); setMode('side') }} />
            ) : (
              <VisualView mode={mode} first={first} second={second} pageNo={pageNo} />
            )}
          </div>
        </>
      )}
    </JobPage>
  )

  function cursor() {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label={t('tools.compare.prev')}
            disabled={pageNo <= 1}
            onClick={() => setPageNo(Math.max(1, pageNo - 1))}
            className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ background: 'var(--np-slip)', boxShadow: '0 2px 6px rgba(60,45,20,0.12)' }}
          >
            <Icon d={PATHS.back} size={22} width={2.4} stroke="var(--np-cobalt)" />
          </button>
          <span className="min-w-[120px] text-center text-[15px] font-semibold tabular-nums" data-compare-page>
            {t('tools.compare.page_of', { page: pageNo, total })}
          </span>
          <button
            type="button"
            aria-label={t('tools.compare.next')}
            disabled={pageNo >= total}
            onClick={() => setPageNo(Math.min(total, pageNo + 1))}
            className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ background: 'var(--np-slip)', boxShadow: '0 2px 6px rgba(60,45,20,0.12)' }}
          >
            <Icon d={PATHS.chevron} size={22} width={2.4} stroke="var(--np-cobalt)" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px]" data-compare-summary>
          {!scan.done ? (
            <span className="text-[color:var(--np-muted)]">{t('tools.compare.scanning', { done: scan.ratios.size, total })}</span>
          ) : changedPages.length === 0 ? (
            <span className="np-hand text-[20px] text-[color:var(--np-cobalt-deep)]" data-compare-no-changes>{t('tools.compare.no_changes')}</span>
          ) : (
            <>
              <span className="text-[color:var(--np-muted)]">{t('tools.compare.changed_pages')}</span>
              {changedPages.slice(0, 24).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-compare-changed={p}
                  onClick={() => setPageNo(p)}
                  className="min-w-9 h-9 px-2 rounded-full text-[13px] font-bold tabular-nums"
                  style={p === pageNo ? { background: 'var(--np-orange)', color: '#fff' } : { background: '#fde3cf', color: '#9a3412' }}
                >
                  {p}
                </button>
              ))}
              {changedPages.length > 24 && <span className="text-[color:var(--np-muted)]">…</span>}
            </>
          )}
        </div>
      </div>
    )
  }
}

/** A slip with the colour its ink takes in the overlay, as a key. */
function Legend({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex-none w-3 h-3 rounded-sm" style={{ background: colour }} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
