import type { PreviewPaneOffer as Offer } from '../../hooks/usePreviewPane'
import { useT, type Translator } from '../../i18n'

function label(t: Translator, offer: Offer) {
  if (offer.busy) return t('app.preview_pane_waiting')
  if (offer.enabled) return t('app.preview_pane_stop')
  return t('app.preview_pane_show')
}

function OutcomeLine({ offer }: { offer: Offer }) {
  const t = useT()
  if (!offer.outcome) return null
  if (offer.outcome.kind === 'enabled') {
    return (
      <p className="mt-1 px-1 text-[13px] text-emerald-700">
        {t.rich('app.preview_pane_enabled', {
          shortcut: (
            <>
              <kbd className="font-mono">Alt</kbd>+<kbd className="font-mono">P</kbd>
            </>
          )
        })}
      </p>
    )
  }
  if (offer.outcome.kind === 'disabled') {
    return <p className="mt-1 px-1 text-[13px] text-slate-600">{t('app.preview_pane_disabled')}</p>
  }
  if (offer.outcome.kind === 'declined') {
    // Not an error: someone was asked for administrator rights and said no.
    return (
      <p className="mt-1 px-1 text-[13px] text-slate-600">
        {t('app.preview_pane_declined')}
      </p>
    )
  }
  return <p className="mt-1 px-1 text-[13px] text-red-700">{offer.outcome.message}</p>
}

/**
 * The preview-pane switch, kept with the other desktop conveniences.
 *
 * ⚠️ Deliberately NOT a proactive offer like the default-app bar. Turning it on
 * costs a Windows administrator prompt, because the key that makes a preview
 * handler visible to the shell is machine-wide — so it waits to be looked for
 * rather than interrupting to ask.
 */
export function PreviewPanePill({ offer, className }: { offer: Offer; className: string }) {
  const t = useT()
  if (!offer.available) return null
  return (
    <>
      <button type="button" onClick={() => void offer.toggle()} disabled={offer.busy} className={className}>
        <span aria-hidden="true">👁️</span>
        {label(t, offer)}
      </button>
      {offer.incomplete && (
        <p className="mt-1 px-1 text-[13px] text-amber-700">
          {t('app.preview_pane_incomplete')}
        </p>
      )}
      <OutcomeLine offer={offer} />
      {/* ⚠️ The caveat that makes a working preview pane look broken. Windows
          refuses to preview a file carrying the "downloaded from the internet"
          mark and shows a safety message INSTEAD of asking any handler — so the
          first PDF someone tries, straight out of their downloads folder, shows
          nothing and the switch looks like it did nothing. Said here, while the
          switch is on, because that is where the disappointment happens; it
          cost an afternoon to work out from the other side. */}
      {offer.enabled && (
        <p className="mt-1 px-1 text-[13px] text-slate-500">
          {t.rich('app.preview_pane_unblock', {
            unblock: <strong className="font-medium">{t('app.preview_pane_unblock_label')}</strong>
          })}
        </p>
      )}
    </>
  )
}
