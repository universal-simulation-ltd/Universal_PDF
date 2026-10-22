import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { scrollToPage } from '../lib/links'
import { usePageThumbnails } from '../hooks/usePageThumbnails'
import { Icon, PATHS } from './icons'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, JobPage } from './parts'
import { useNav } from './nav'
import { baseName } from './output'

// The pages, a page of its own (was the website's page navigator, a pane
// sliding up from the foot). Every page lies on the desk as a sheet, two
// across: tap one to go to it; ← and → move it, × takes it out (asked on the
// sheet itself). Moves are only staged until "Put them in this order", which
// rewrites the file once — the website's reasoning (PageNavigator).

const TILTS = ['-1.2deg', '1deg', '0.6deg', '-0.8deg']

export default function PagesScreen() {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const fileName = usePdfStore((s) => s.fileName)
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbFor = usePageThumbnails(doc, numPages, true, rootRef)
  const [order, setOrder] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const slots = order ?? Array.from({ length: numPages }, (_, i) => i)
  const pending = order !== null
  const back = () => useNav.getState().pop()

  // Staged moves belong to the document they were staged on.
  useEffect(() => {
    setOrder(null)
    setDeleting(null)
  }, [doc, numPages])

  function move(from: number, to: number) {
    if (busy || to < 0 || to >= slots.length) return
    const next = slots.slice()
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    setOrder(next.every((idx, i) => idx === i) ? null : next)
  }

  async function apply() {
    if (!order || busy) return
    setBusy(true)
    try {
      await usePdfStore.getState().applyPageOrder(order)
      setOrder(null)
      useNav.getState().say(t('phone.pages_reordered'))
    } catch (err) {
      console.error(err)
      useNav.getState().say(t('viewer.nav.reorder_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(pageIndex: number) {
    setDeleting(null)
    if (busy || numPages <= 1 || pending) return
    setBusy(true)
    try {
      await usePdfStore.getState().deletePage(pageIndex)
      useNav.getState().say(t('phone.page_removed', { page: pageIndex + 1 }))
    } catch (err) {
      console.error(err)
      useNav.getState().say(t('viewer.nav.delete_failed'))
    } finally {
      setBusy(false)
    }
  }

  function go(pageIndex: number) {
    back()
    // After the page has gone, so the viewer is the one being scrolled.
    window.setTimeout(() => scrollToPage(pageIndex), 60)
  }

  return (
    <JobPage
      backLabel={baseName(fileName)}
      onBack={back}
      lead={t('phone.pages_lead')}
      hl={t('phone.pages_hl')}
      note={pending ? t('phone.pages_pending') : t('phone.pages_note')}
      background="var(--np-grey-desk)"
      footer={
        pending ? (
          <div className="grid grid-cols-[auto_1fr] gap-2.5">
            <button type="button" className={`${BTN_SECOND} px-4`} style={BTN_SECOND_STYLE} disabled={busy} onClick={() => setOrder(null)}>
              {t('phone.pages_put_back')}
            </button>
            <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={busy} onClick={() => void apply()}>
              {busy ? t('viewer.nav.applying') : t('viewer.nav.apply_order')}
            </button>
          </div>
        ) : undefined
      }
    >
      <div ref={rootRef}>
        <ol className="m-0 p-0 list-none grid grid-cols-2 gap-x-4 gap-y-5">
          {slots.map((pageIndex, i) => {
            const thumb = thumbFor(pageIndex)
            const asking = deleting === pageIndex
            return (
              <li key={pageIndex} data-thumb-page={pageIndex} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => go(pageIndex)}
                  aria-label={t('viewer.nav.page', { page: i + 1 })}
                  className="np-tilt relative bg-white block"
                  style={{ transform: `rotate(${TILTS[i % 4]})`, boxShadow: '0 8px 18px rgba(60,45,20,0.2)' }}
                >
                  {thumb ? (
                    <img src={thumb} alt="" draggable={false} className="block w-full" />
                  ) : (
                    <span className="block w-full aspect-[1/1.41] bg-white" />
                  )}
                  <span className="np-hand absolute right-2 bottom-0.5 text-[22px] text-[color:var(--np-orange-ink)]">{i + 1}</span>
                </button>
                {asking ? (
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setDeleting(null)} className="flex-1 min-h-[40px] rounded-xl text-[14px] font-semibold" style={{ background: 'var(--np-slip)' }}>
                      {t('phone.cancel')}
                    </button>
                    <button type="button" onClick={() => void remove(pageIndex)} className="flex-1 min-h-[40px] rounded-xl text-white text-[14px] font-bold" style={{ background: '#b42318' }}>
                      {t('phone.page_remove_yes')}
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <SheetAction label={t('viewer.nav.move_up', { page: i + 1 })} disabled={i === 0 || busy} onClick={() => move(i, i - 1)}>
                      <Icon d={PATHS.back} size={18} width={2.4} />
                    </SheetAction>
                    <SheetAction
                      label={pending ? t('viewer.nav.delete_blocked') : t('viewer.nav.delete_page', { page: i + 1 })}
                      disabled={numPages <= 1 || busy || pending}
                      onClick={() => setDeleting(pageIndex)}
                      danger
                    >
                      <Icon d={PATHS.trash} size={18} width={2.2} />
                    </SheetAction>
                    <SheetAction label={t('viewer.nav.move_down', { page: i + 1 })} disabled={i === slots.length - 1 || busy} onClick={() => move(i, i + 1)}>
                      <Icon d={PATHS.chevron} size={18} width={2.4} />
                    </SheetAction>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </JobPage>
  )
}

function SheetAction({ label, disabled, onClick, danger, children }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30"
      style={{ background: 'var(--np-slip)', boxShadow: '0 1px 4px rgba(60,45,20,0.14)', color: danger ? '#b42318' : 'var(--np-cobalt)' }}
    >
      {children}
    </button>
  )
}
