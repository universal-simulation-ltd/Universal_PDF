import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUniversal } from '@unisim/sdk'
import { CONFIRM_PHRASE, deleteMyAccount, isConfirmed } from '../../lib/deleteAccount'
import { useT } from '../../i18n'

// "Delete my account": the signed-in person deletes their Universal ID, and
// with it their account in every UNI·SIM product.
//
// App Review 5.1.1(v) is why this exists. The suite's sign-in creates an
// account for any email it doesn't recognise, so an app that offers it must
// also let people delete the account from inside the app. The wording follows
// James's brief for the same screen in the Ergo Assess iPhone app (2026-09-12):
// "warning it's everywhere and confirmation with writing 'delete-all'".
//
// The request is lib/deleteAccount.ts; this file only asks the question and
// reports the answer.

/** Whether there is a real (not anonymous) account signed in to delete. */
export function useCanDeleteAccount(): boolean {
  const { session } = useUniversal()
  return !!session && session.user?.is_anonymous !== true
}

export default function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { supabase, session } = useUniversal()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // A fresh question every time. Cleared on CLOSE rather than on open, for the
  // reason UnsavedChangesDialog records: clearing on open leaves one painted
  // frame with the old phrase still typed and the button already live.
  useEffect(() => {
    if (!open) {
      setTyped('')
      setError(null)
      setDone(false)
    }
  }, [open])

  // Escape is Cancel. Not while the request is in flight: the account may
  // already be half gone, and the answer is worth waiting for.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || busy) return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, busy, onClose])

  if (!open) return null

  const email = session?.user?.email
  const confirmed = isConfirmed(typed)

  async function deleteAccount() {
    if (!confirmed || busy) return
    setBusy(true)
    setError(null)
    const result = await deleteMyAccount(supabase)
    setBusy(false)
    if (result.ok) setDone(true)
    else setError(result.error)
  }

  // ⚠️ A portal, because both callers sit inside a stacking context: the tools
  // bar is `relative z-[45]` and the landing navbar's wrapper is `z-50`. A
  // `fixed z-[90]` box inside either would be capped at its parent's level.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      data-testid="delete-account-dialog"
      onClick={(e) => {
        // The backdrop is Cancel, the safe answer, except mid-request.
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md flex max-h-[min(100%,100dvh)] flex-col">
        {done ? (
          <>
            <h2 id="delete-account-title" className="text-lg font-semibold text-slate-900">
              {t('menu.delete_done_title')}
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {t('menu.delete_done_body')}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                autoFocus
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800"
              >
                {t('menu.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="delete-account-title" className="shrink-0 text-lg font-semibold text-red-800">
              {t('menu.delete_title')}
            </h2>

            <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {email
                  ? t.rich('menu.delete_body_email', {
                      email: <span className="font-medium text-slate-900 break-all">{email}</span>,
                      every: <span className="font-semibold">{t('menu.delete_every')}</span>,
                    })
                  : t.rich('menu.delete_body', {
                      every: <span className="font-semibold">{t('menu.delete_every')}</span>,
                    })}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600 leading-relaxed list-disc pl-4">
                <li>{t('menu.delete_point_profile')}</li>
                <li>{t('menu.delete_point_sole_org')}</li>
                <li>{t('menu.delete_point_shared_org')}</li>
                <li>{t('menu.delete_point_files')}</li>
                <li>{t('menu.delete_point_subscription')}</li>
              </ul>

              <label className="mt-4 block text-xs font-medium text-slate-700" htmlFor="delete-account-confirm">
                {t.rich('menu.delete_confirm_label', {
                  phrase: <span className="font-mono font-semibold text-red-700">{CONFIRM_PHRASE}</span>,
                })}
              </label>
              <input
                id="delete-account-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                // 16px on purpose: iOS zooms the page in on focus below that,
                // and does not zoom back out.
                className="mt-1.5 w-full rounded-md border border-red-300 bg-white px-2.5 py-2 text-base outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder:text-red-200 disabled:opacity-60"
              />

              {error && (
                <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="mt-4 flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                autoFocus
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('menu.cancel')}
              </button>
              <button
                onClick={() => void deleteAccount()}
                disabled={!confirmed || busy}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? t('menu.deleting') : t('menu.delete_button')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
