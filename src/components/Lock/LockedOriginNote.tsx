import { usePdfStore } from '../../stores/pdfStore'
import { useT } from '../../i18n'

// Said wherever a document opened from a password-locked file is about to leave
// the app WITHOUT that password — saved, stored, uploaded or sent.
//
// ⚠️ Nothing here re-locks anything. The password the user typed to open the
// file is deliberately not kept (it would have to sit in memory, or worse, for
// as long as the document is open), so the app cannot quietly put the lock
// back. What it can do is say so before the copy is made, rather than letting
// somebody find out from the recipient that their protected contract arrived
// open. Where a lock can be added on the spot, `onRelock` offers it.
//
// Renders nothing for an ordinary document.

type Kind = 'save' | 'send' | 'advanced'

const KEYS = {
  save: 'tools.locked.origin_save',
  send: 'tools.locked.origin_send',
  advanced: 'tools.locked.origin_advanced'
} as const

export default function LockedOriginNote({ kind, onRelock, className = '' }: { kind: Kind; onRelock?: () => void; className?: string }) {
  const t = useT()
  const openedLocked = usePdfStore((s) => s.openedLocked)
  if (!openedLocked) return null
  return (
    <div role="note" className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ${className}`}>
      <span aria-hidden="true">🔓 </span>
      {t(KEYS[kind])}
      {onRelock && (
        <>
          {' '}
          <button type="button" onClick={onRelock} className="font-medium underline underline-offset-2 hover:text-amber-700">
            {t('tools.locked.relock')}
          </button>
        </>
      )}
    </div>
  )
}
