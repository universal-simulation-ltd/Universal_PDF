import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import CropEditor from '../components/Scan/CropEditor'
import { useScanSession } from '../components/Scan/ScanDialog'
import type { ScanPage } from '../lib/scan'
import { Icon, PATHS } from './icons'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, JobPage, Segmented, Slip, SwitchRow } from './parts'
import { goBack, useNav } from './nav'
import { pickFiles, useJobBackLabel, useJobs } from './jobs'

// Scan paper, a page (was the website's dialog). The pages lie on the desk as
// prints, each with ✂ (adjust the corners), ↻ and ×; "Scan more pages" (the
// phone's own scanner) or "Add a photo" (the corner editor, here on the page);
// the paper size, "Make it searchable", and Make the PDF at the foot. Going
// back with pages scanned asks first, on the page — never a browser box.

export default function ScanScreen() {
  const dialog = useJobs((s) => s.dialog)
  if (dialog?.kind !== 'scan') return null
  return <ScanPageView key={keyFor(dialog)} source={dialog.source} initialPages={dialog.pages} />
}

// A new scan (the Shortcut, say) over this one starts afresh.
const keys = new WeakMap<object, number>()
let nextKey = 1
function keyFor(d: object): number {
  let k = keys.get(d)
  if (!k) keys.set(d, (k = nextKey++))
  return k
}

const TILTS = ['-2deg', '1.5deg', '-1deg', '2deg', '-1.5deg', '1deg']

function ScanPageView({ source, initialPages }: { source: 'camera' | 'photo'; initialPages?: ScanPage[] }) {
  const t = useT()
  const backLabel = useJobBackLabel()
  const [asking, setAsking] = useState(false)
  const s = useScanSession(initialPages, () => {
    /* The PDF is open: the page goes with the document's arrival. */
  })
  // Every way back asks first while there are pages to lose, on the page.
  const guard = useRef<() => boolean>(() => true)
  guard.current = () => {
    if (s.working) return false
    if (s.cropping) {
      s.setPhoto(null)
      return false
    }
    if (s.pages.length > 0 && !asking) {
      setAsking(true)
      return false
    }
    return true
  }
  useEffect(() => {
    useNav.getState().setBackGuard(() => guard.current())
    return () => useNav.getState().setBackGuard(null)
  }, [])
  const back = () => void goBack()
  const discard = () => {
    useNav.getState().setBackGuard(null)
    useNav.getState().pop()
  }

  function addPhoto() {
    void pickFiles('image/*,.heic,.heif', true).then(s.addPhotos)
  }

  if (s.photo) {
    return (
      <JobPage
        backLabel={t('phone.scan_pages')}
        onBack={back}
        lead={t('phone.crop_lead')}
        hl={t('phone.crop_hl')}
        background="var(--np-grey-desk)"
      >
        <div className="np-borrowed">
          <CropEditor
            key={s.photo.key}
            photo={s.photo.canvas}
            initialQuad={s.photo.quad}
            colour={s.colour}
            onColourChange={s.setColour}
            onDone={s.addPage}
            onSkip={() => s.setPhoto(null)}
            skipLabel={s.photo.replaceId !== undefined ? t('tools.common.cancel') : undefined}
          />
          {s.queue.length > 0 && (
            <p className="mt-2 text-[13px] text-[color:var(--np-muted)] text-right">{t.plural('tools.scan.queue_more', s.queue.length)}</p>
          )}
        </div>
      </JobPage>
    )
  }

  return (
    <JobPage
      backLabel={backLabel}
      onBack={back}
      lead={t('phone.scan_lead')}
      hl={t('phone.scan_hl')}
      note={source === 'camera' ? t('tools.scan.intro_camera') : t('tools.scan.intro_photo')}
      background="var(--np-grey-desk)"
      footer={
        asking ? undefined : (
          <button
            type="button"
            className={BTN_PRIMARY}
            style={BTN_PRIMARY_STYLE}
            disabled={s.pages.length === 0 || s.working || s.decoding}
            onClick={() => void s.create()}
          >
            {s.busy ?? (s.pages.length > 0 ? t.plural('tools.scan.create', s.pages.length) : t('tools.scan.create_empty'))}
          </button>
        )
      }
    >
      {asking && (
        <div className="flex flex-col gap-2 rounded-2xl p-3.5" style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}>
          <p className="m-0 text-[16px] font-semibold">{t('tools.scan.discard_confirm')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAsking(false)} className="min-h-[44px] rounded-xl text-[15px] font-semibold" style={{ border: '1px solid var(--np-line)' }}>
              {t('phone.scan_keep')}
            </button>
            <button type="button" onClick={discard} className="min-h-[44px] rounded-xl text-white text-[15px] font-bold" style={{ background: '#b42318' }}>
              {t('phone.scan_discard')}
            </button>
          </div>
        </div>
      )}

      {s.pages.length > 0 && (
        <ol className="m-0 p-0 list-none grid grid-cols-3 gap-x-3 gap-y-4" aria-label={t.plural('tools.scan.pages', s.pages.length)}>
          {s.pages.map((e, i) => (
            <li key={e.id} className="flex flex-col gap-1.5 items-stretch">
              <div className="np-tilt relative bg-white p-1" style={{ transform: `rotate(${TILTS[i % TILTS.length]})`, boxShadow: '0 6px 14px rgba(60,45,20,0.2)' }}>
                <img src={e.url} alt={t('tools.scan.page_n', { n: i + 1 })} className="block w-full aspect-[3/4] object-contain bg-white" />
                <span className="np-hand absolute left-1.5 top-0 text-[20px] text-[color:var(--np-orange-ink)]">{i + 1}</span>
              </div>
              <div className="flex justify-between">
                <PageAction label={t('tools.scan.adjust', { n: i + 1 })} disabled={s.working || s.decoding} onClick={() => void s.adjust(e.id)}>✂</PageAction>
                <PageAction label={t('tools.scan.rotate', { n: i + 1 })} disabled={s.working} onClick={() => void s.rotate(e.id)}>↻</PageAction>
                <PageAction label={t('tools.scan.remove', { n: i + 1 })} disabled={s.working} onClick={() => s.removePage(e.id)}>
                  <Icon d={PATHS.close} size={16} width={2.6} />
                </PageAction>
              </div>
            </li>
          ))}
        </ol>
      )}

      {source === 'camera' ? (
        <button type="button" className={BTN_SECOND} style={BTN_SECOND_STYLE} disabled={s.working} onClick={() => void s.scanMore()}>
          {t('tools.scan.scan_more')}
        </button>
      ) : (
        <button
          type="button"
          onClick={addPhoto}
          disabled={s.working || s.decoding}
          className="rounded-[14px] min-h-[64px] px-4 py-3 flex items-center gap-3 text-left disabled:opacity-60"
          style={{ border: '2px dashed var(--np-orange)', background: 'rgba(249,115,22,0.06)' }}
          data-testid="scan-photo-button"
        >
          <span className="flex-none w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--np-orange)' }}>
            <Icon d={PATHS.photos} size={22} stroke="#ffffff" width={2.2} />
          </span>
          <span className="flex flex-col">
            <span className="text-[16px] font-bold text-[color:var(--np-orange-ink)]">{s.decoding ? t('tools.scan.opening_photo') : t('tools.scan.choose_photo')}</span>
            <span className="text-[13px] text-[color:var(--np-muted)]">{t('tools.scan.photo_hint')}</span>
          </span>
        </button>
      )}

      {s.pages.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            <span className="np-hand text-[22px] leading-none text-[color:var(--np-cobalt-deep)] px-1">{t('phone.scan_paper')}</span>
            <Segmented
              label={t('tools.scan.paper')}
              value={s.paper}
              disabled={s.working}
              onChange={s.setPaper}
              options={[
                { id: 'a4', label: t('tools.scan.paper_a4') },
                { id: 'letter', label: t('tools.scan.paper_letter') },
              ]}
            />
          </div>
          <Slip tilt="0.5deg">
            <SwitchRow
              first
              label={t('tools.scan.make_searchable')}
              note={t('tools.scan.make_searchable_hint')}
              checked={s.ocr}
              disabled={s.working}
              onChange={s.setOcr}
            />
          </Slip>
        </>
      )}
    </JobPage>
  )
}

function PageAction({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-10 h-10 rounded-full flex items-center justify-center text-[17px] text-[color:var(--np-ink-2)] disabled:opacity-40"
      style={{ background: 'var(--np-slip)', boxShadow: '0 1px 4px rgba(60,45,20,0.14)' }}
    >
      {children}
    </button>
  )
}
