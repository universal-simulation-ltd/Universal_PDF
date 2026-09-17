import type { DefaultAppOffer as Offer } from '../../hooks/useDefaultPdfApp'
import { useT, type Translator } from '../../i18n'

// What the button will actually do. On Windows an app is not allowed to change
// the association — see electron/defaultApp.cjs — so the label must not promise
// a switch it cannot perform.
function actionLabel(t: Translator, offer: Offer) {
  return offer.canSet ? t('app.default_make') : t('app.default_open_settings')
}

function explanation(t: Translator, offer: Offer) {
  return offer.canSet
    ? t('app.default_explain_set')
    : t('app.default_explain_settings')
}

function OutcomeLine({ offer }: { offer: Offer }) {
  const t = useT()
  if (!offer.outcome) return null
  if (offer.outcome.kind === 'done') {
    return <p className="text-[13px] text-emerald-700">{t('app.default_done')}</p>
  }
  if (offer.outcome.kind === 'settings') {
    return (
      <p className="text-[13px] text-slate-600">
        {t.rich('app.default_settings_open', {
          app: <strong className="font-medium">Universal PDF</strong>,
          ext: <code className="font-mono">.pdf</code>
        })}
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
  const t = useT()
  if (!offer.showOffer && !offer.outcome) return null

  return (
    <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-lg" aria-hidden="true">
        📄
      </span>
      <div className="flex-1 min-w-[15rem]">
        <p className="text-sm font-medium text-slate-900">{t('app.default_offer_title')}</p>
        {offer.outcome ? <OutcomeLine offer={offer} /> : (
          <p className="text-[13px] text-slate-600">{explanation(t, offer)}</p>
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
            {offer.busy ? t('app.default_working') : actionLabel(t, offer)}
          </button>
          <button
            type="button"
            onClick={offer.dismiss}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-orange-100/60 transition-colors"
          >
            {t('app.default_not_now')}
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
  const t = useT()
  if (!offer.available) return null
  return (
    <>
      <button type="button" onClick={() => void offer.makeDefault()} disabled={offer.busy} className={className}>
        <span aria-hidden="true">📌</span>
        {offer.canSet
          ? t('app.default_pill_set')
          : t('app.default_pill_settings')}
      </button>
      {/* ⚠️ Naming what currently holds .pdf is what stops this reading as a
          nag. The offer showing at all means the association is not ours; said
          plainly, that is information rather than a question being asked twice.
          Investigated 2026-08-27 as "the detection never confirms" — it always
          confirmed correctly, the association simply had not changed, and
          nothing on screen said so. Note some readers re-claim the type later
          on their own, so this can go back to naming them without warning. */}
      {offer.currentName && (
        <p className="mt-1 px-1 text-[13px] text-slate-500">
          {t.rich('app.default_current_holder', {
            name: <strong className="font-medium">{offer.currentName}</strong>,
            ext: <code className="font-mono">.pdf</code>
          })}
        </p>
      )}
      {offer.outcome && offer.outcome.kind === 'error' && (
        <p className="mt-1 px-1 text-[13px] text-red-700">{offer.outcome.message}</p>
      )}
    </>
  )
}
