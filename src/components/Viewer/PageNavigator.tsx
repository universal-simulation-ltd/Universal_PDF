import { useEffect, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'

// ── Thumbnails are sized to the pixels they actually occupy ─────────────
// The pane renders each page into an <img> capped at 180 CSS px wide (see
// PageThumb). A fixed pdf.js scale can't know that: 0.22 gave A4 ~131px, so
// the browser stretched it to 180 and the device stretched THAT again on a
// HiDPI screen — a ~2.7x upscale of a JPEG already at quality 0.6. Render at
// the CSS width times the device pixel ratio instead, and the image is 1:1
// with the physical pixels. Capped at 2x: beyond that the file grows faster
// than anyone can see, and a long document holds one data URL per page.
const THUMB_CSS_WIDTH = 180
const THUMB_MAX_DPR = 2
const THUMB_QUALITY = 0.85

type DropPosition = 'before' | 'after'

export default function PageNavigator() {
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const open = usePdfStore((s) => s.pageNavOpen)
  const setOpen = usePdfStore((s) => s.setPageNavOpen)
  const deletePage = usePdfStore((s) => s.deletePage)
  const applyPageOrder = usePdfStore((s) => s.applyPageOrder)

  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; pos: DropPosition } | null>(null)

  // ── The new order is STAGED, not applied ────────────────────────────────
  // Every reorder rewrites the whole PDF and reloads it through pdf.js — a
  // second or more on a big file, which is a long time to wait for the first
  // of five drags. Dragging now only shuffles this array (thumbnails are
  // already rendered, so it is instant), and the tick at the bottom of the
  // pane commits the lot in ONE rewrite.
  //
  // `null` means "no changes staged". The entries are indices into the
  // document as it stands, which is exactly what applyPageOrder takes.
  const [order, setOrder] = useState<number[] | null>(null)
  const slots = order ?? Array.from({ length: numPages }, (_, i) => i)
  const pending = order !== null

  // Rebuild thumbnails whenever the doc identity or page count changes (a
  // delete/reorder swaps the underlying PDFDocumentProxy).
  useEffect(() => {
    if (!doc) {
      setThumbs([])
      return
    }
    // Drop stale thumbs so a delete/reorder doesn't briefly render old
    // images in their previous slots before the new doc finishes rendering.
    setThumbs([])
    // Staged moves belong to the document they were staged against.
    setOrder(null)
    let cancelled = false
    const acc: string[] = []
    async function go() {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled || !doc) return
        try {
          const page = await doc.getPage(i)
          const dpr = Math.min(window.devicePixelRatio || 1, THUMB_MAX_DPR)
          const unscaled = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({
            scale: (THUMB_CSS_WIDTH * dpr) / unscaled.width
          })
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          // JPEG has no alpha, and an untouched canvas is transparent — a PDF
          // that draws no background of its own would come out black.
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
          acc.push(canvas.toDataURL('image/jpeg', THUMB_QUALITY))
          setThumbs([...acc])
        } catch {
          // ignore individual page failures
        }
      }
    }
    go()
    return () => {
      cancelled = true
    }
  }, [doc, numPages])

  if (!doc || !open) return null

  function scrollToPage(i: number) {
    const el = document.querySelector(`[data-page-index="${i}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (window.matchMedia('(max-width: 767px)').matches) {
      setOpen(false)
    }
  }

  async function handleDelete(i: number) {
    // Deleting mid-reorder would mean two rewrites and two sets of indices to
    // keep straight. The pane asks for the order to be settled first.
    if (busy || numPages <= 1 || pending) return
    const ok = window.confirm(
      `Delete page ${i + 1}? Any annotations on this page will also be removed.`
    )
    if (!ok) return
    setBusy(true)
    try {
      await deletePage(i)
    } catch (err) {
      console.error(err)
      alert('Failed to delete page')
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
      // applyPageOrder swaps the document, and the thumbnail effect clears the
      // staging with it — but it returns early for a no-op order, so clear it
      // here too rather than leaving a confirm bar over nothing to confirm.
      setOrder(null)
    } catch (err) {
      console.error(err)
      alert('Failed to reorder pages')
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
        className="fixed z-40 bg-white shadow-2xl overflow-y-auto
          left-0 right-0 bottom-16 max-h-[55vh] rounded-t-2xl border-t border-slate-200
          md:right-auto md:left-0 md:top-[104px] md:bottom-0 md:w-56 md:max-h-none
          md:rounded-none md:border-t-0 md:border-r md:border-slate-200"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 flex items-center justify-between z-10">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Pages
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-700 w-7 h-7"
            aria-label="Close pages"
          >
            ✕
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
              thumb={thumbs[pageIndex]}
              busy={busy}
              pending={pending}
              dragging={dragIndex === i}
              dropIndicator={
                dropTarget && dropTarget.index === i ? dropTarget.pos : null
              }
              // The document has not moved yet, so scrolling has to aim at
              // where the page still IS, not at the slot it is being dragged to.
              onClick={() => scrollToPage(pageIndex)}
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
              title="Discard the new page order"
              className="w-8 h-8 shrink-0 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={applyOrder}
              disabled={busy}
              title="Apply the new page order"
              className="flex-1 h-8 rounded-md bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? 'Applying…' : (<><span aria-hidden="true">✓</span> Apply new order</>)}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

interface ThumbProps {
  index: number
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
      className={`relative group ${dragging ? 'opacity-40' : ''}`}
      draggable={!busy}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{ cursor: busy ? 'wait' : 'grab' }}
      title="Drag to reorder"
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
            alt={`Page ${index + 1}`}
            className="block w-full max-w-[180px] shadow-sm border border-slate-200"
            draggable={false}
          />
        ) : (
          <div className="w-full max-w-[180px] aspect-[1/1.41] bg-slate-100 animate-pulse rounded" />
        )}
        <span className="text-xs text-slate-500">Page {index + 1}</span>
      </button>

      {/* Action overlay — always visible so the controls are discoverable. */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-20">
        <button
          type="button"
          onClick={actionHandler(onDelete)}
          disabled={!canDelete}
          title={pending ? 'Apply or discard the new page order first' : 'Delete page'}
          aria-label={`Delete page ${index + 1}`}
          className="w-6 h-6 rounded-full bg-white text-red-600 hover:bg-red-600 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✕
        </button>
      </div>
      <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
        <button
          type="button"
          onClick={actionHandler(onMoveUp)}
          disabled={!canMoveUp}
          title="Move page up"
          aria-label={`Move page ${index + 1} up`}
          className="w-6 h-6 rounded-full bg-white text-slate-700 hover:bg-slate-700 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={actionHandler(onMoveDown)}
          disabled={!canMoveDown}
          title="Move page down"
          aria-label={`Move page ${index + 1} down`}
          className="w-6 h-6 rounded-full bg-white text-slate-700 hover:bg-slate-700 hover:text-white border border-slate-300 shadow text-xs leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↓
        </button>
      </div>
    </div>
  )
}
