import { useState } from 'react'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import { buildPageNumbers, isPageNumber, pageNumberText, type PageNumberAlign } from '../../lib/pageNumbers'
import type { PageSize } from '../../lib/everyPage'
import { LINE_HEIGHT, textBoxSize } from '../../lib/textLayout'
import { useT } from '../../i18n'

// "Advanced → Page numbers" (James, 2026-10-18): a number at the foot of every
// page, left, centre or right, as "1" or "Page 1 of 3". They go on as ordinary
// text marks (lib/pageNumbers), so they show at once and export as they look;
// using the dialog again re-does them all, and Remove takes them all off.

interface Props {
  onClose: () => void
}

export default function PageNumbersDialog({ onClose }: Props) {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const annotations = useAnnotationStore((s) => s.annotations)
  const swapMany = useAnnotationStore((s) => s.swapMany)
  const removeMany = useAnnotationStore((s) => s.removeMany)
  const existing = annotations.filter(isPageNumber)
  const first = existing[0]?.pageNumber
  const pageOf = t('tools.page_numbers.template_page_of')
  const [align, setAlign] = useState<PageNumberAlign>(first?.align ?? 'centre')
  const [template, setTemplate] = useState<string>(first?.template ?? '{n}')
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!doc) return
    setBusy(true)
    try {
      const sizes: PageSize[] = await Promise.all(
        Array.from({ length: doc.numPages }, (_, i) =>
          doc.getPage(i + 1).then((p) => {
            const v = p.getViewport({ scale: 1 })
            return { w: v.width, h: v.height }
          })
        )
      )
      const marks = buildPageNumbers(sizes, template, align, (a) => textBoxSize(a).width, () => crypto.randomUUID(), LINE_HEIGHT)
      swapMany(existing.map((a) => a.id), marks)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const choice = (on: boolean) =>
    `flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
      on ? 'border-orange-700 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
    }`
  // A little page with the number where it would go.
  const pageGlyph = (where: PageNumberAlign) => (
    <svg viewBox="0 0 24 30" className="w-5 h-6 mx-auto mb-1" aria-hidden="true">
      <rect x="1" y="1" width="22" height="28" rx="2" fill="#fff" stroke="currentColor" strokeWidth="1.5" />
      <rect x={where === 'left' ? 4 : where === 'right' ? 15 : 9.5} y="23" width="5" height="2.5" rx="1" fill="currentColor" />
    </svg>
  )
  const aligns: [PageNumberAlign, string][] = [
    ['left', t('tools.page_numbers.left')],
    ['centre', t('tools.page_numbers.centre')],
    ['right', t('tools.page_numbers.right')]
  ]
  const total = doc?.numPages ?? 3

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="page-numbers-title" className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 id="page-numbers-title" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">#</span>
            {t('tools.page_numbers.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label={t('tools.common.close')}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <fieldset className="mb-4">
          <legend className="text-xs font-medium text-slate-500 mb-1.5">{t('tools.page_numbers.where')}</legend>
          <div className="flex gap-2">
            {aligns.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={align === value} onClick={() => setAlign(value)} className={choice(align === value)}>
                {pageGlyph(value)}
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-5">
          <legend className="text-xs font-medium text-slate-500 mb-1.5">{t('tools.page_numbers.wording')}</legend>
          <div className="flex gap-2">
            {(['{n}', pageOf] as const).map((tpl) => (
              <button key={tpl} type="button" aria-pressed={template === tpl} onClick={() => setTemplate(tpl)} className={choice(template === tpl)}>
                {pageNumberText(tpl, 1, total)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2 justify-end">
          {existing.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => { removeMany(existing.map((a) => a.id)); onClose() }}
              className="mr-auto px-3 py-2 rounded text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {t('tools.page_numbers.remove')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {t('tools.common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || !doc}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            {existing.length > 0 ? t('tools.page_numbers.update') : t('tools.page_numbers.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
