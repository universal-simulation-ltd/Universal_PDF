import { useT } from '../../i18n'
import type { PagesChoice } from '../../lib/pageRange'

// Which pages: All · This page · Choose [1-3, 5]. Shared by the Export dialog
// (for Print) and Advanced export (for the file and its Print), James
// 2026-11-03. Hidden on a one-page document, where there is nothing to choose.
//
// `invalid` is the caller's verdict on a typed range (it knows the page count);
// the field turns red and says what it takes.
export default function PagesPicker({
  label,
  value,
  onChange,
  numPages,
  invalid
}: {
  // Defaults to "Pages"; the Export dialog says "Pages to print".
  label?: string
  value: PagesChoice
  onChange: (next: PagesChoice) => void
  numPages: number
  invalid: boolean
}) {
  const t = useT()
  if (numPages < 2) return null
  const heading = label ?? t('tools.export.pages')
  const text = value.kind === 'custom' ? value.text : ''
  const seg = (kind: PagesChoice['kind'], label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value.kind === kind}
      onClick={() => onChange(kind === 'custom' ? { kind, text } : { kind })}
      className={[
        'flex-1 min-w-0 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
        value.kind === kind ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      ].join(' ')}
    >
      {label}
    </button>
  )
  return (
    <div className="mt-4" data-pages-picker>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-600 shrink-0">{heading}</span>
        <div role="radiogroup" aria-label={heading} className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-1">
          {seg('all', t('tools.export.pages_all'))}
          {seg('current', t('tools.export.pages_current'))}
          {seg('custom', t('tools.export.pages_custom'))}
        </div>
      </div>
      {value.kind === 'custom' && (
        <>
          <input
            autoFocus
            value={text}
            onChange={(e) => onChange({ kind: 'custom', text: e.target.value })}
            placeholder={t('tools.export.pages_placeholder')}
            aria-label={heading}
            aria-invalid={invalid}
            inputMode="numeric"
            spellCheck={false}
            className={[
              'mt-2 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-1',
              invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-orange-600 focus:ring-orange-600'
            ].join(' ')}
          />
          {invalid && text.trim() !== '' && (
            <p className="mt-1 text-[11px] text-red-600">{t('tools.export.pages_invalid', { count: numPages })}</p>
          )}
        </>
      )}
    </div>
  )
}
