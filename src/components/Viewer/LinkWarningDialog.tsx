import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PdfLinkVerdict, UrlWarning } from '../../lib/links'
import { useT, type MessageKey } from '../../i18n'

// Asked before a PDF's link is followed, when there is something to notice.
//
// A link annotation's address comes out of the file, and the underlined words
// it sits on can say anything — "Sign in to your bank" over
// `https://yourbank.com@evil.example`. So the click shows where the link REALLY
// goes (the host the address bar will show) and why it might not be what it
// looks like, and opening it is a second, deliberate choice. Links with nothing
// to say about them open straight away, as before; a blocked scheme
// (`javascript:`, `data:`, `file:`…) can only be acknowledged, never opened.

const WARNING_KEYS: Record<UrlWarning, MessageKey> = {
  insecure: 'viewer.link.warn_insecure',
  lookalike: 'viewer.link.warn_lookalike',
  credentials: 'viewer.link.warn_credentials',
  ip: 'viewer.link.warn_ip',
  shortener: 'viewer.link.warn_shortener',
}

export default function LinkWarningDialog({
  verdict,
  onOpen,
  onClose,
}: {
  verdict: PdfLinkVerdict
  /** Called from the "Open anyway" click itself, so a popup keeps its user activation. */
  onOpen: () => void
  onClose: () => void
}) {
  const t = useT()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // The safe choice has the focus, so Enter on a keyboard never opens the link.
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const blocked = verdict.kind === 'blocked'
  const host = verdict.kind === 'follow' ? verdict.host ?? '' : ''

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      // ⚠️ React events bubble through a portal to the REACT parent — here the
      // page under the link — so a click in this box would otherwise also
      // reach the page's own pointer handlers (deselect, place an armed item).
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="link-warning-title"
        data-link-warning={blocked ? 'blocked' : 'check'}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
      >
        <h2 id="link-warning-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span aria-hidden="true">{blocked ? '⛔' : '⚠️'}</span>
          {blocked ? t('viewer.link.blocked_title') : t('viewer.link.check_title')}
        </h2>

        {verdict.kind === 'blocked' ? (
          <p className="text-sm leading-relaxed text-slate-700">
            {t('viewer.link.blocked', { scheme: verdict.scheme })}
          </p>
        ) : (
          <>
            <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {t('viewer.link.goes_to')}
              </div>
              {/* `dir="ltr"` and break-all: a host is never prose, and a long
                  lookalike must stay visible end to end. */}
              <div dir="ltr" className="break-all font-mono text-base font-semibold text-slate-900" data-link-host>
                {host}
              </div>
            </div>
            <ul className="mb-1 space-y-2">
              {verdict.warnings.map((w) => (
                <li key={w} data-link-warning-item={w} className="flex gap-2 text-sm leading-snug text-amber-900">
                  <span aria-hidden="true" className="mt-0.5 text-amber-600">•</span>
                  <span>{t(WARNING_KEYS[w], { host })}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {blocked ? t('tools.common.close') : t('viewer.common.cancel')}
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={() => {
                onOpen()
                onClose()
              }}
              className="rounded bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
            >
              {t('viewer.link.open_anyway')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
