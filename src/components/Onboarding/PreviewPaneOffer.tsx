import type { PreviewPaneOffer as Offer } from '../../hooks/usePreviewPane'

function label(offer: Offer) {
  if (offer.busy) return 'Waiting for Windows…'
  if (offer.enabled) return 'Stop showing PDFs in the Explorer preview pane'
  return 'Show PDFs in the Explorer preview pane — needs admin once'
}

function OutcomeLine({ offer }: { offer: Offer }) {
  if (!offer.outcome) return null
  if (offer.outcome.kind === 'enabled') {
    return (
      <p className="mt-1 px-1 text-[13px] text-emerald-700">
        Done. Turn the pane on in Explorer with <kbd className="font-mono">Alt</kbd>+
        <kbd className="font-mono">P</kbd> and select a PDF.
      </p>
    )
  }
  if (offer.outcome.kind === 'disabled') {
    return <p className="mt-1 px-1 text-[13px] text-slate-600">Turned off.</p>
  }
  if (offer.outcome.kind === 'declined') {
    // Not an error: someone was asked for administrator rights and said no.
    return (
      <p className="mt-1 px-1 text-[13px] text-slate-600">
        Left as it was — the change needs the administrator prompt.
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
  if (!offer.available) return null
  return (
    <>
      <button type="button" onClick={() => void offer.toggle()} disabled={offer.busy} className={className}>
        <span aria-hidden="true">👁️</span>
        {label(offer)}
      </button>
      {offer.incomplete && (
        <p className="mt-1 px-1 text-[13px] text-amber-700">
          Half registered — reinstall Universal PDF to finish setting this up.
        </p>
      )}
      <OutcomeLine offer={offer} />
    </>
  )
}
