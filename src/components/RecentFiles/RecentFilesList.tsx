import { SelectCheckbox, SelectionBar, phoneConfirm, useSelection } from '@unisim/sdk'
import { usePdfStore } from '../../stores/pdfStore'
import { useT, type Translator } from '../../i18n'

function formatSize(t: Translator, bytes: number): string {
  if (bytes < 1024) return t('app.recent_size_b', { n: bytes })
  if (bytes < 1024 * 1024) return t('app.recent_size_kb', { n: Math.round(bytes / 1024) })
  return t('app.recent_size_mb', { n: (bytes / 1024 / 1024).toFixed(1) })
}

function formatRelative(t: Translator, ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return t('app.recent_just_now')
  if (diff < 3_600_000) return t('app.recent_minutes_ago', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('app.recent_hours_ago', { n: Math.floor(diff / 3_600_000) })
  return t('app.recent_days_ago', { n: Math.floor(diff / 86_400_000) })
}

// Every recent is listed (lib/recents keeps at most eight). It used to show two
// and say "+N more in File menu once you open one", but the File menu has no
// recents list, so the rest could not be reached at all; the list is behind
// the landing page's "Recent files" button now, so its length costs nothing
// until it is asked for, and Select all means every one.
export default function RecentFilesList({ className = 'mt-8 w-full max-w-md' }: { className?: string } = {}) {
  const t = useT()
  const recents = usePdfStore((s) => s.recents)
  const openRecent = usePdfStore((s) => s.openRecent)
  const removeRecent = usePdfStore((s) => s.removeRecent)
  // The suite's "every list: select several, then act" (SDK 0.227): a tick
  // box per row, Select all, then the count, Delete selected and Clear.
  const sel = useSelection(recents.map((r) => r.id))

  if (recents.length === 0) return null

  // Delete selected does what each row's Remove does — forgets the entry and
  // the copy (and unexported marks) this app keeps of it — so the confirm says
  // that, and that the file it was opened from is left alone, rather than the
  // SDK's generic "Delete 3 files? This cannot be undone."
  const confirmRemove = (_message: string, count: number) =>
    phoneConfirm({
      message: t.plural('app.recent_remove_many', count),
      confirmLabel: t('app.recent_remove_many_button'),
      danger: true,
    })

  return (
    <div className={className}>
      <div className="text-xs uppercase text-slate-500 font-medium mb-2 px-1 tracking-wide">
        {t('app.recent_heading')}
      </div>
      <SelectionBar
        sel={sel}
        noun={{ one: t('app.recent_noun_one'), other: t('app.recent_noun_other') }}
        onDelete={async (ids) => {
          for (const id of ids) await removeRecent(id)
        }}
        confirm={confirmRemove}
        className="mb-2 px-1"
      />
      {/* Each recent is a row you tap to open it: the suite's Orbit corner
          (BRANDING.md → Boxes, A). The tick box sits outside the row and
          Remove over its trailing end, so the row stays one button with the
          file's name as its name. */}
      <ul className="space-y-2">
        {recents.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5">
            <SelectCheckbox
              checked={sel.has(r.id)}
              onChange={() => sel.toggle(r.id)}
              label={t('app.recent_select_aria', { name: r.name })}
              className="ml-1 shrink-0"
            />
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => openRecent(r.id)}
                className="u-box u-box--orbit u-box--row w-full flex items-center gap-3 py-2.5 pl-3 pr-11 text-left"
              >
                <span className="text-2xl shrink-0" aria-hidden="true">📄</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-slate-900 truncate">{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    {formatSize(t, r.size)} · {formatRelative(t, r.lastOpened)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeRecent(r.id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2.5 py-2.5 text-slate-400 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                title={t('app.recent_remove')}
                aria-label={t('app.recent_remove_aria', { name: r.name })}
              >
                {/* SVG, not `✕`: U+2715 is a hollow ▯?▯ box in iOS's system
                    font — see the suite landmines. */}
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
