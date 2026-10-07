import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useT } from '../../i18n'
import { scrollToPage } from '../../lib/links'
import { usePageThumbnails } from '../../hooks/usePageThumbnails'

// Thumbnails — when they are drawn, how big, and how many are kept — live in
// `usePageThumbnails`. ⚠️ This component is ALWAYS mounted (App.tsx), so
// nothing here may do per-page work while the pane is closed.

type DropPosition = 'before' | 'after'

export default function PageNavigator() {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const open = usePdfStore((s) => s.pageNavOpen)
  const setOpen = usePdfStore((s) => s.setPageNavOpen)
  const deletePage = usePdfStore((s) => s.deletePage)
  const applyPageOrder = usePdfStore((s) => s.applyPageOrder)

  const paneRef = useRef<HTMLElement>(null)
  const thumbFor = usePageThumbnails(doc, numPages, open, paneRef)
  const [busy, setBusy] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; pos: DropPosition } | null>(null)

  // ── The new order is STAGED, not applied ────────────────────────────────
  // Every reorder rewrites the whole PDF and reloads it through pdf.js — a
  // second or more on a big file, which is a long time to wait for the first
  // of five drags. Dragging now only shuffles this array (thumbnails are
  // keyed by page, so nothing redraws and it is instant), and the tick at the
  // bottom of the pane commits the lot in ONE rewrite.
  //
  // `null` means "no changes staged". The entries are indices into the
  // document as it stands, which is exactly what applyPageOrder takes.
  const [order, setOrder] = useState<number[] | null>(null)
  const slots = order ?? Array.from({ length: numPages }, (_, i) => i)
  const pending = order !== null

  // Staged moves belong to the document they were staged against — a delete
  // or reorder swaps the underlying PDFDocumentProxy.
  useEffect(() => {
    setOrder(null)
  }, [doc, numPages])

  if (!doc || !open) return null

  function goToPage(i: number) {
    scrollToPage(i)
    if (window.matchMedia('(max-width: 767px)').matches) {
      setOpen(false)
    }
  }

  async function handleDelete(i: number) {
    // Deleting mid-reorder would mean two rewrites and two sets of indices to
    // keep straight. The pane asks for the order to be settled first.
    if (busy || numPages <= 1 || pending) return
    const ok = window.confirm(
      t('viewer.nav.delete_confirm', { page: i + 1 })
    )
    if (!ok) return
    setBusy(true)
    try {
      await deletePage(i)
    } catch (err) {
      console.error(err)
      alert(t('viewer.nav.delete_failed'))
    } finally {
      setBusy(false)
    }
  }

  // Staging only — nothing touches the PDF until the tick.
  function handleMove(from: number, to: number) {
    if (busy || from === to) return
    if (to < 0 || to >= slots.length) return
    const next = slots.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    // Back to where it started is not a change to confirm.
    setOrder(next.every((idx, i) => idx === i) ? null : next)
  }

  async function applyOrder() {
    if (!order || busy) return
    setBusy(true)
    try {
      await applyPageOrder(order)
      // applyPageOrder swaps the document, and the effect above clears the
      // staging with it — but it returns early for a no-op order, so clear it
      // here too rather than leaving a confirm bar over nothing to confirm.
      setOrder(null)
    } catch (err) {
      console.error(err)
      alert(t('viewer.nav.reorder_failed'))
    } finally {
      setBusy(false)
    }
  }

  function onDragStart(e: React.DragEvent, i: number) {
    if (busy) {
      e.preventDefault()
      return
    }
    setDragIndex(i)
    e.dataTransfer.effectAllowed = 'move'
    // Required for Firefox to allow drag.
    e.dataTransfer.setData('text/plain', String(i))
  }

  function onDragOver(e: React.DragEvent, i: number) {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pos: DropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget((prev) => (prev?.index === i && prev.pos === pos ? prev : { index: i, pos }))
  }

  function onDrop(e: React.DragEvent) {
    if (dragIndex === null || !dropTarget) {
      setDragIndex(null)
      setDropTarget(null)
      return
    }
    e.preventDefault()
    const from = dragIndex
    let to = dropTarget.pos === 'after' ? dropTarget.index + 1 : dropTarget.index
    // Account for the source slot disappearing when we splice it out: anything
    // landing past the original index needs to slide back by one.
    if (from < to) to -= 1
    setDragIndex(null)
    setDropTarget(null)
    if (from !== to) handleMove(from, to)
  }

  function onDragEnd() {
    setDragIndex(null)
    setDropTarget(null)
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/30 z-30"
        onClick={() => setOpen(false)}
      />
      <aside
        ref={paneRef}
        className="fixed z-40 bg-white shadow-2xl overflow-y-auto
          left-0 right-0 bottom-16 max-h-[55vh] rounded-t-2xl border-t border-slate-200
          md:right-auto md:left-0 md:top-[104px] md:bottom-0 md:w-56 md:max-h-none
          md:rounded-none md:border-t-0 md:border-r md:border-slate-200"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 flex items-center justify-between z-10">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('viewer.bar.pages')}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-700 w-7 h-7 flex items-center justify-center"
            aria-label={t('viewer.nav.close')}
          >
            {/* ⚠️ SVG, not `✕`: U+2715 has no glyph in iOS's system font, so
                the only way to close the page list on a phone — where this
                button is the ONLY one shown — was a hollow ▯?▯ box. */}
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div
          className="p-2 flex flex-col gap-2"
          onDragLeave={(e) => {
            // Only clear when leaving the whole strip, not when crossing children.
            const next = e.relatedTarget as Node | null
            if (next && (e.currentTarget as Node).contains(next)) return
            setDropTarget(null)
          }}
        >
          {slots.map((pageIndex, i) => (
            <PageThumb
              key={pageIndex}
              index={i}
              total={numPages}
              pageIndex={pageIndex}
              thumb={thumbFor(pageIndex)}
              busy={busy}
              pending={pending}
              dragging={dragIndex === i}
              dropIndicator={
                dropTarget && dropTarget.index === i ? dropTarget.pos : null
              }
              // The document has not moved yet, so scrolling has to aim at
              // where the page still IS, not at the slot it is being dragged to.
              onClick={() => goToPage(pageIndex)}
              onDelete={() => handleDelete(i)}
              onMoveUp={() => handleMove(i, i - 1)}
              onMoveDown={() => handleMove(i, i + 1)}
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>

        {/* The confirm bar. It only exists while something is staged, so the
            pane is unchanged for anyone who never reorders a page. */}
        {pending && (
          <div className="sticky bottom-0 z-10 bg-white border-t border-slate-200 px-2 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOrder(null)}
              disabled={busy}
              title={t('viewer.nav.discard_order')}
              className="w-8 h-8 shrink-0 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={applyOrder}
              disabled={busy}
              title={t('viewer.nav.apply_order_title')}
              className="flex-1 h-8 rounded-md bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? t('viewer.nav.applying') : (<><span aria-hidden="true">✓</span> {t('viewer.nav.apply_order')}</>)}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

interface ThumbProps {
  index: number
  /** The page's index in the document as it stands — what the thumbnail is of,
   *  and what `usePageThumbnails` watches it by. Differs from `index` while a
   *  reorder is staged. */
  pageIndex: number
  total: number
  thumb?: string
  busy: boolean
  /** Moves are staged and unconfirmed — deleting is off until they settle. */
  pending: boolean
  dragging: boolean
  dropIndicator: DropPosition | null
  onClick: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function PageThumb({
  index,
  pageIndex,
  total,
  thumb,
  busy,
  pending,
  dragging,
  dropIndicator,
  onClick,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: ThumbProps) {
  const t = useT()
  const canDelete = total > 1 && !busy && !pending
  const canMoveUp = index > 0 && !busy
  const canMoveDown = index < total - 1 && !busy

  // Stop click-through on action buttons so they don't also scroll the document.
  function actionHandler(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      fn()
    }
  }

  return (
    <div
      data-thumb-page={pageIndex}
      className={`relative group ${dragging ? 'opacity-40' : ''}`}
      draggable={!busy}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{ cursor: busy ? 'wait' : 'grab' }}
      title={t('viewer.nav.drag_to_reorder')}
    >
      {dropIndicator === 'before' && (
        <div className="absolute left-1 right-1 -top-1 h-0.5 bg-orange-500 rounded pointer-events-none z-10" />
      )}
      {dropIndicator === 'after' && (
        <div className="absolute left-1 right-1 -bottom-1 h-0.5 bg-orange-500 rounded pointer-events-none z-10" />
      )}
      <button
        type="button"
        onClick={onClick}
        className="w-full flex flex-col items-center gap-1 rounded-md p-1.5 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={t('viewer.nav.page', { page: index + 1 })}
            className="block w-full max-w-[180px] shadow-sm border border-slate-200"
            draggable={false}
          />
        ) : (
          <div className="w-full max-w-[180px] aspect-[1/1.41] bg-slate-100 animate-pulse rounded" />
        )}
        <span className="text-xs text-slate-500">{t('viewer.nav.page', { page: index + 1 })}</span>
      </button>

      {/* Action overlay — always visible so the controls are discoverable. */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-20">
        <button
          type="button"
          onClick={actionHandler(onDelete)}
          disabled={!canDelete}
          title={pending ? t('viewer.nav.delete_blocked') : t('viewer.nav.delete_page_title')}
          aria-label={t('viewer.nav.delete_page', { page: index + 1 })}
          className="w-6 h-6 rounded-full bg-white text-red-600 hover:bg-red-600 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {/* SVG, not `✕` — see the note on the Close pages button above. */}
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
        <button
          type="button"
          onClick={actionHandler(onMoveUp)}
          disabled={!canMoveUp}
          title={t('viewer.nav.move_up_title')}
          aria-label={t('viewer.nav.move_up', { page: index + 1 })}
          className="w-6 h-6 rounded-full bg-white text-slate-700 hover:bg-slate-700 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={actionHandler(onMoveDown)}
          disabled={!canMoveDown}
          title={t('viewer.nav.move_down_title')}
          aria-label={t('viewer.nav.move_down', { page: index + 1 })}
          className="w-6 h-6 rounded-full bg-white text-slate-700 hover:bg-slate-700 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↓
        </button>
      </div>
    </div>
  )
}
