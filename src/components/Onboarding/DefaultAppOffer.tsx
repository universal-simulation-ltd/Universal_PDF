import type { DefaultAppOffer as Offer } from '../../hooks/useDefaultPdfApp'

// What the button will actually do. On Windows an app is not allowed to change
// the association — see electron/defaultApp.cjs — so the label must not promise
// a switch it cannot perform.
function actionLabel(offer: Offer) {
  return offer.canSet ? 'Make default' : 'Open Windows Settings'
}

function explanation(offer: Offer) {
  return offer.canSet
    ? 'Double-clicking a PDF will open it here.'
    : "Windows only lets you change this in Settings — we'll open it at the right page."
}

function OutcomeLine({ offer }: { offer: Offer }) {
  if (!offer.outcome) return null
  if (offer.outcome.kind === 'done') {
    return <p className="text-[13px] text-emerald-700">Done — PDFs now open in Universal PDF.</p>
  }
  if (offer.outcome.kind === 'settings') {
    return (
      <p className="text-[13px] text-slate-600">
        Settings is open. Choose <strong className="font-medium">Universal PDF</strong> for{' '}
        <code className="font-mono">.pdf</code>, then come back — this will update on its own.
      </p>
    )
  }
  return <p className="text-[13px] text-red-700">{offer.outcome.message}</p>
}

/**
 * The one-time offer, at the top of the landing page. Not a modal: it is a
 * convenience, and nothing in the app is waiting on the answer.
 */
export function DefaultAppBar({ offer }: { offer: Offer }) {
  // `showOffer` covers the unprompted ask; the outcome keeps the bar up long
  // enough to say what happened, including after `dismiss` marks it asked.
  if (!offer.showOffer && !offer.outcome) return null

  return (
    <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-lg" aria-hidden="true">
        📄
      </span>
      <div className="flex-1 min-w-[15rem]">
        <p className="text-sm font-medium text-slate-900">Open PDFs with Universal PDF?</p>
        {offer.outcome ? <OutcomeLine offer={offer} /> : (
          <p className="text-[13px] text-slate-600">{explanation(offer)}</p>
        )}
      </div>
      {offer.available && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void offer.makeDefault()}
            disabled={offer.busy}
            className="inline-flex items-center rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {offer.busy ? 'Working…' : actionLabel(offer)}
          </button>
          <button
            type="button"
            onClick={offer.dismiss}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-orange-100/60 transition-colors"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The same action, kept somewhere it can be found again. The bar above is
 * asked once and then gone for good; someone who said "not now" and changed
 * their mind a month later needs a way back to it that is not reinstalling.
 */
export function DefaultAppPill({ offer, className }: { offer: Offer; className: string }) {
  if (!offer.available) return null
  return (
    <>
      <button type="button" onClick={() => void offer.makeDefault()} disabled={offer.busy} className={className}>
        <span aria-hidden="true">📌</span>
        {offer.canSet
          ? 'Set as default PDF app — open .pdf files here'
          : 'Set as default PDF app — opens Windows Settings'}
      </button>
      {offer.outcome && offer.outcome.kind === 'error' && (
        <p className="mt-1 px-1 text-[13px] text-red-700">{offer.outcome.message}</p>
      )}
    </>
  )
}
