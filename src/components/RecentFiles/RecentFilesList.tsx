import { usePdfStore } from '../../stores/pdfStore'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const RECENTS_LIMIT = 2

export default function RecentFilesList({ className = 'mt-8 w-full max-w-md' }: { className?: string } = {}) {
  const recents = usePdfStore((s) => s.recents)
  const openRecent = usePdfStore((s) => s.openRecent)
  const removeRecent = usePdfStore((s) => s.removeRecent)

  if (recents.length === 0) return null

  const visible = recents.slice(0, RECENTS_LIMIT)
  const extra = recents.length - visible.length

  return (
    <div className={className}>
      <div className="text-xs uppercase text-slate-500 font-medium mb-2 px-1 tracking-wide">
        Recent
        {extra > 0 && (
          <span className="ml-2 normal-case text-slate-400 font-normal">
            +{extra} more in File menu once you open one
          </span>
        )}
      </div>
      <div className="space-y-1">
        {visible.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => openRecent(r.id)}
              className="flex-1 flex items-center gap-3 p-3 hover:bg-slate-100 text-left min-w-0"
            >
              <span className="text-2xl shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {formatSize(r.size)} · {formatRelative(r.lastOpened)}
                </div>
              </div>
            </button>
            <button
              onClick={() => removeRecent(r.id)}
              className="text-slate-300 hover:text-red-600 px-3 py-3"
              title="Remove from recents"
              aria-label={`Remove ${r.name} from recents`}
            >
              {/* SVG, not `✕`: U+2715 is a hollow ▯?▯ box in iOS's system
                  font — see the suite landmines. */}
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
