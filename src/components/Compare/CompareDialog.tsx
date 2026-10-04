import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPdf, type PDFDocumentProxy } from '../../lib/pdfjs'
import { diffPixels, diffWords, joinWords, toHunks, tokenize, type DiffRun, type Word } from '../../lib/compare'
import { useT } from '../../i18n'

// Compare two PDFs: what changed between two versions of a document.
//
// Three views of one pair of documents, sharing a page cursor:
//   • Side by side — the same page of each, at the same width.
//   • Overlay — one picture: ink only in the first in red, only in the second
//     in green, everything unchanged washed out to grey. The fastest way to
//     spot a moved signature line or a changed figure.
//   • Text — a word-by-word diff of the whole text, when both have text.
//
// Everything runs on this device. Both documents are opened through `openPdf`,
// so they share the app's one pdf.js worker (and its CMaps and fonts) with the
// viewer instead of starting another, and both are destroyed on close.
//
// The first document is the one open in the app, as it was last loaded or
// saved; the second is picked here.

type Mode = 'side' | 'overlay' | 'text'

interface Side {
  name: string
  doc: PDFDocumentProxy
}

/** Width the summary scan renders at — enough to see a changed word, cheap
 *  enough to sweep a long document in seconds. */
const SCAN_WIDTH = 360

/** Render one page into a fresh canvas `width` CSS px wide (×dpr), white
 *  under it. Null when the document has no such page. */
async function renderPage(doc: PDFDocumentProxy, pageNo: number, width: number, dpr = 1): Promise<HTMLCanvasElement | null> {
  if (pageNo < 1 || pageNo > doc.numPages) return null
  const page = await doc.getPage(pageNo)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: (width * dpr) / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

/** Both pages at the same width, padded to the taller, as RGBA. */
async function pagePair(a: PDFDocumentProxy, b: PDFDocumentProxy, pageNo: number, width: number, dpr = 1) {
  const [ca, cb] = await Promise.all([renderPage(a, pageNo, width, dpr), renderPage(b, pageNo, width, dpr)])
  const w = Math.round(width * dpr)
  const h = Math.max(ca?.height ?? 0, cb?.height ?? 0, 1)
  const flat = (c: HTMLCanvasElement | null) => {
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    if (c) ctx.drawImage(c, 0, 0)
    return ctx.getImageData(0, 0, w, h)
  }
  return { a: flat(ca), b: flat(cb), hasA: !!ca, hasB: !!cb, w, h }
}

async function documentText(doc: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    let text = ''
    for (const it of content.items) {
      if (!('str' in it)) continue
      text += it.str
      if (it.hasEOL) text += '\n'
    }
    pages.push(text)
  }
  return pages
}

export default function CompareDialog({
  firstBytes,
  firstName,
  onClose,
}: {
  firstBytes: ArrayBuffer
  firstName: string
  onClose: () => void
}) {
  const t = useT()
  const [first, setFirst] = useState<Side | null>(null)
  const [second, setSecond] = useState<Side | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('side')
  const [pageNo, setPageNo] = useState(1)
  // Per page (1-based): the share of pixels that changed, filled in by the scan.
  const [scan, setScan] = useState<{ ratios: Map<number, number>; done: boolean }>({ ratios: new Map(), done: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const docsRef = useRef<PDFDocumentProxy[]>([])

  // The open document, through the shared worker.
  useEffect(() => {
    let live = true
    openPdf(firstBytes.slice(0))
      .promise.then((doc) => {
        docsRef.current.push(doc)
        if (live) setFirst({ name: firstName, doc })
      })
      .catch((e) => live && setError(t('tools.compare.failed', { message: (e as Error).message })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Free both documents in the worker when the dialog goes.
  useEffect(
    () => () => {
      for (const d of docsRef.current) void d.destroy()
      docsRef.current = []
    },
    [],
  )

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = useCallback(
    async (file: File) => {
      setError(null)
      setLoading(true)
      try {
        const bytes = await file.arrayBuffer()
        const doc = await openPdf(bytes).promise
        docsRef.current.push(doc)
        if (second) {
          void second.doc.destroy()
          docsRef.current = docsRef.current.filter((d) => d !== second.doc)
        }
        setSecond({ name: file.name, doc })
        setPageNo(1)
        setScan({ ratios: new Map(), done: false })
      } catch (e) {
        setError(t('tools.compare.failed', { message: (e as Error).message }))
      } finally {
        setLoading(false)
      }
    },
    [second, t],
  )

  const total = first && second ? Math.max(first.doc.numPages, second.doc.numPages) : 0

  // The summary: every page compared at a small size, in the background, so
  // the pages that changed can be listed and jumped to.
  useEffect(() => {
    if (!first || !second) return
    let live = true
    const ratios = new Map<number, number>()
    ;(async () => {
      for (let p = 1; p <= total && live; p++) {
        try {
          const pair = await pagePair(first.doc, second.doc, p, SCAN_WIDTH)
          const changed = pair.hasA && pair.hasB ? diffPixels(pair.a.data, pair.b.data) : pair.w * pair.h
          ratios.set(p, changed / (pair.w * pair.h))
        } catch {
          ratios.set(p, 1)
        }
        if (live && (p % 4 === 0 || p === total)) setScan({ ratios: new Map(ratios), done: p === total })
        // Let the page breathe between renders.
        await new Promise((r) => setTimeout(r, 0))
      }
    })()
    return () => {
      live = false
    }
  }, [first, second, total])

  const changedPages = useMemo(
    () => [...scan.ratios.entries()].filter(([, r]) => r > 0).map(([p]) => p),
    [scan],
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-title"
      data-compare-dialog
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <h2 id="compare-title" className="text-lg font-semibold text-slate-900">
          {t('tools.compare.title')}
        </h2>
        {first && second && (
          <div role="tablist" aria-label={t('tools.compare.title')} className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(
              [
                ['side', t('tools.compare.side_by_side')],
                ['overlay', t('tools.compare.overlay')],
                ['text', t('tools.compare.text')],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                data-compare-mode={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 font-medium ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          aria-label={t('tools.common.close')}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ×
        </button>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-compare-input
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void pick(f)
        }}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {!second ? (
          <div className="mx-auto mt-10 max-w-md px-4 text-center">
            <p className="mb-1 text-sm text-slate-500">{t('tools.compare.first_is', { name: firstName })}</p>
            <p className="mb-5 text-sm text-slate-700">{t('tools.compare.intro')}</p>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={loading || !first}
              className="rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {loading ? t('tools.compare.opening') : t('tools.compare.pick')}
            </button>
            {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </div>
        ) : (
          first && (
            <>
              <NamesBar first={first.name} second={second.name} onChange={() => inputRef.current?.click()} />
              {mode === 'text' ? (
                <TextView first={first.doc} second={second.doc} onPage={(p) => { setPageNo(p); setMode('side') }} />
              ) : (
                <VisualView mode={mode} first={first} second={second} pageNo={pageNo} />
              )}
              {error && <p className="mx-4 mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            </>
          )
        )}
      </div>

      {first && second && mode !== 'text' && (
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPageNo((p) => Math.max(1, p - 1))}
                disabled={pageNo <= 1}
                aria-label={t('tools.compare.prev')}
                className="h-9 w-9 rounded hover:bg-slate-100 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="tabular-nums text-slate-700" data-compare-page>
                {t('tools.compare.page_of', { page: pageNo, total })}
              </span>
              <button
                onClick={() => setPageNo((p) => Math.min(total, p + 1))}
                disabled={pageNo >= total}
                aria-label={t('tools.compare.next')}
                className="h-9 w-9 rounded hover:bg-slate-100 disabled:opacity-30"
              >
                ›
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-compare-summary>
              {!scan.done ? (
                <span className="text-slate-500">{t('tools.compare.scanning', { done: scan.ratios.size, total })}</span>
              ) : changedPages.length === 0 ? (
                <span className="font-medium text-emerald-700" data-compare-no-changes>
                  {t('tools.compare.no_changes')}
                </span>
              ) : (
                <>
                  <span className="text-slate-600">{t('tools.compare.changed_pages')}</span>
                  {changedPages.slice(0, 40).map((p) => (
                    <button
                      key={p}
                      data-compare-changed={p}
                      onClick={() => setPageNo(p)}
                      className={`min-w-8 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${p === pageNo ? 'bg-orange-700 text-white' : 'bg-orange-100 text-orange-800 hover:bg-orange-200'}`}
                    >
                      {p}
                    </button>
                  ))}
                  {changedPages.length > 40 && <span className="text-xs text-slate-500">…</span>}
                </>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>,
    document.body,
  )
}

function NamesBar({ first, second, onChange }: { first: string; second: string; onChange: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-xs text-slate-600">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm bg-red-600" />
        <span className="truncate">{t('tools.compare.only_in', { name: first })}</span>
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm bg-green-600" />
        <span className="truncate">{t('tools.compare.only_in', { name: second })}</span>
      </span>
      <button onClick={onChange} className="ml-auto text-orange-800 underline-offset-2 hover:underline">
        {t('tools.compare.change_second')}
      </button>
    </div>
  )
}

/** The pages as pictures: side by side, or one overlay. */
function VisualView({ mode, first, second, pageNo }: { mode: Mode; first: Side; second: Side; pageNo: number }) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pics, setPics] = useState<{ a: HTMLCanvasElement | null; b: HTMLCanvasElement | null; overlay: HTMLCanvasElement | null; ratio: number } | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const narrow = width < 640
  useEffect(() => {
    if (!width) return
    let live = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ;(async () => {
      if (mode === 'side') {
        const each = narrow ? Math.min(width - 32, 900) : Math.min((width - 48) / 2, 900)
        const [a, b] = await Promise.all([
          renderPage(first.doc, pageNo, each, dpr),
          renderPage(second.doc, pageNo, each, dpr),
        ])
        for (const c of [a, b]) if (c) c.style.width = `${each}px`
        if (live) setPics({ a, b, overlay: null, ratio: 0 })
      } else {
        const w = Math.min(width - 32, 1000)
        const pair = await pagePair(first.doc, second.doc, pageNo, w, dpr)
        const out = new ImageData(pair.w, pair.h)
        const changed = diffPixels(pair.a.data, pair.b.data, out.data)
        const canvas = document.createElement('canvas')
        canvas.width = pair.w
        canvas.height = pair.h
        canvas.getContext('2d')!.putImageData(out, 0, 0)
        canvas.style.width = `${w}px`
        if (live) setPics({ a: null, b: null, overlay: canvas, ratio: changed / (pair.w * pair.h) })
      }
    })().catch((e) => console.error('compare render', e))
    return () => {
      live = false
    }
  }, [mode, first, second, pageNo, width, narrow])

  return (
    <div ref={boxRef} className="p-4">
      {mode === 'side' ? (
        <div className={`flex gap-4 ${narrow ? 'flex-col items-center' : 'items-start justify-center'}`} data-compare-side>
          {[
            [first.name, pics?.a] as const,
            [second.name, pics?.b] as const,
          ].map(([name, canvas], i) => (
            <figure key={i} className="min-w-0">
              <figcaption className="mb-1 truncate text-xs font-medium text-slate-600">{name}</figcaption>
              {canvas ? (
                <CanvasHost canvas={canvas} />
              ) : (
                pics && (
                  <div className="flex h-40 w-64 items-center justify-center rounded bg-white text-sm text-slate-500 shadow">
                    {t('tools.compare.no_page', { page: pageNo })}
                  </div>
                )
              )}
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center" data-compare-overlay>
          {pics?.overlay && (
            <>
              <p className="mb-2 text-xs text-slate-600" data-compare-ratio={pics.ratio}>
                {pics.ratio === 0
                  ? t('tools.compare.identical_page')
                  : t('tools.compare.changed_pct', { pct: Math.max(0.1, Math.round(pics.ratio * 1000) / 10) })}
              </p>
              <CanvasHost canvas={pics.overlay} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CanvasHost({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    canvas.className = 'block max-w-full h-auto bg-white shadow'
    host.replaceChildren(canvas)
  }, [canvas])
  return <div ref={ref} />
}

/** The word-by-word diff of the two documents' text. */
function TextView({ first, second, onPage }: { first: PDFDocumentProxy; second: PDFDocumentProxy; onPage: (page: number) => void }) {
  const t = useT()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'no-text' }
    | { kind: 'too-different' }
    | { kind: 'ready'; runs: DiffRun<Word>[]; added: number; removed: number }
  >({ kind: 'loading' })

  useEffect(() => {
    let live = true
    ;(async () => {
      const [ta, tb] = await Promise.all([documentText(first), documentText(second)])
      const chars = (p: string[]) => p.join('').replace(/\s/g, '').length
      if (chars(ta) < 20 || chars(tb) < 20) return live && setState({ kind: 'no-text' })
      // Let the "comparing" line paint before a long diff.
      await new Promise((r) => setTimeout(r, 0))
      const runs = diffWords(tokenize(ta), tokenize(tb))
      if (!live) return
      if (!runs) return setState({ kind: 'too-different' })
      let added = 0
      let removed = 0
      for (const r of runs) {
        if (r.kind === 'insert') added += r.items.length
        if (r.kind === 'delete') removed += r.items.length
      }
      setState({ kind: 'ready', runs, added, removed })
    })().catch((e) => {
      console.error('compare text', e)
      if (live) setState({ kind: 'no-text' })
    })
    return () => {
      live = false
    }
  }, [first, second])

  if (state.kind === 'loading') return <p className="p-6 text-center text-sm text-slate-500">{t('tools.compare.reading_text')}</p>
  if (state.kind === 'no-text')
    return (
      <p className="mx-auto max-w-lg p-6 text-center text-sm text-slate-600" data-compare-text="none">
        {t('tools.compare.text_unavailable')}
      </p>
    )
  if (state.kind === 'too-different')
    return <p className="mx-auto max-w-lg p-6 text-center text-sm text-slate-600">{t('tools.compare.too_different')}</p>
  if (state.added === 0 && state.removed === 0)
    return (
      <p className="p-6 text-center text-sm font-medium text-emerald-700" data-compare-text="same">
        {t('tools.compare.text_same')}
      </p>
    )

  const { hunks, skippedAfter } = toHunks(state.runs)
  return (
    <div className="mx-auto max-w-3xl p-4" data-compare-text="diff">
      <p className="mb-3 text-sm text-slate-700" data-compare-text-summary>
        {t('tools.compare.text_summary', { added: state.added, removed: state.removed })}
      </p>
      <div className="space-y-3">
        {hunks.map((h, i) => (
          <div key={i}>
            {h.skippedBefore > 0 && (
              <p className="mb-2 text-center text-xs text-slate-400">{t.plural('tools.compare.skipped', h.skippedBefore)}</p>
            )}
            <div className="rounded-lg bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-sm">
              <button
                onClick={() => onPage(h.page + 1)}
                className="mb-1 block text-xs font-semibold text-orange-800 hover:underline"
              >
                {t(h.pageIn === 'a' ? 'tools.compare.page_in_first' : 'tools.compare.page_in_second', { page: h.page + 1 })}
              </button>
              <span className="whitespace-pre-wrap break-words">
                {h.runs.map((r, j) => {
                  const text = joinWords(r.items, j > 0)
                  if (r.kind === 'equal') return <span key={j}>{text}</span>
                  if (r.kind === 'delete')
                    return (
                      <del key={j} data-diff="delete" className="rounded bg-red-100 text-red-800 decoration-red-500">
                        {text}
                      </del>
                    )
                  return (
                    <ins key={j} data-diff="insert" className="rounded bg-green-100 text-green-800 no-underline">
                      {text}
                    </ins>
                  )
                })}
              </span>
            </div>
          </div>
        ))}
        {skippedAfter > 0 && <p className="text-center text-xs text-slate-400">{t.plural('tools.compare.skipped', skippedAfter)}</p>}
      </div>
    </div>
  )
}
