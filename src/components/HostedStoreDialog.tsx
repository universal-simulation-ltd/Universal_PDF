import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Chip, SignInDialog, useUniversal, useUser, useOrg, useCredits, useHostedUploads, useAppFreeToken, type HostedUpload } from '@unisim/sdk'
import { usePdfStore } from '../stores/pdfStore'
import LockedOriginNote from './Lock/LockedOriginNote'
// App Review 3.1.1: the phone app must not point people to buying tokens on
// the web. The web and desktop builds keep the link and the wording.
import { isNativeShell } from '../lib/nativeOpen'
import { storeCurrentPdf, deleteHostedPdf, openHostedPdf, HostedObjectMissingError } from '../lib/hostedStore'
import { downloadBackup, importBackup } from '../lib/pdfBackup'
import { useT, intlLocale } from '../i18n'
import { useFreeAllowance, nearFreeLimit } from '../lib/useFreeAllowance'

// ⚠️ The HREF ONLY — never a plain navigation. In a Capacitor shell an
// <a> to another origin is handed to the system browser, so the tap left the
// app for a Custom Tab, signed in there, and (a bare /login honours no
// ?return=) landed on the Assess portal with the app still signed out —
// which is exactly what James hit on the Android build, 2026-09-16. The row
// opens the SDK's in-app <SignInDialog /> instead; the href survives so a
// middle- or ctrl-click on the web still opens the hub in a tab.
const SIGNIN_URL = 'https://app.unisim.co.uk/login'
// Was /subscription.html until 2026-09-07, when the marketing site split its
// one pricing page in two. The token card moved to /everyday; /subscription is
// now the Assess Suite's seats and licences and sells no tokens at all — so a
// link left pointing there sends someone who wants one upload to a £5,000/year
// enterprise plan. Not a 404: it renders fine, which is why it needed finding.
const GET_TOKENS_URL = 'https://www.unisim.co.uk/everyday'
// Where a signed-in Universal ID with no company sets one up. Opened in a new
// tab so the PDF open here is not navigated away from.
const SET_UP_COMPANY_URL = 'https://app.unisim.co.uk/branding'

// "Store this PDF" — the free local option (already automatic via recents) plus
// the paid "Hosted by UNI·SIM" cloud option (one token per upload, refunded on
// delete) gated behind a Universal ID. Backend: 0041 + the SDK hosted helpers.
export default function HostedStoreDialog() {
  const t = useT()
  const open = usePdfStore((s) => s.hostedStoreOpen)
  const setOpen = usePdfStore((s) => s.setHostedStoreOpen)
  const doc = usePdfStore((s) => s.doc)
  // A locked document is never put in recents, so "already kept on this
  // device" would be untrue — and believed.
  const openedLocked = usePdfStore((s) => s.openedLocked)

  const { supabase, session, activeOrgId } = useUniversal()
  // Online copies are kept with a company, so a signed-in ID that belongs to
  // none has nowhere to store one. Only a SUCCESSFUL empty read counts as "no
  // company" — a failed read is unknown, and never a reason to offer one.
  const { orgs, loading: orgsLoading, error: orgsError } = useOrg()
  const noCompany = !orgsLoading && !orgsError && orgs.length === 0
  const { user } = useUser()
  const { credits, refresh: refreshCredits } = useCredits()
  // Every org gets one free returnable PDF token (migration 0045) — the RPC
  // spends it before the purchased wallet, so the button gates on either.
  const { status: freeToken, refresh: refreshFreeToken } = useAppFreeToken('pdf')
  const { uploads, loading: listLoading, refresh: refreshList } = useHostedUploads('pdf')
  // The shared free "files" pool's numbers — only for the near-the-limit line.
  const { status: allowance, refresh: refreshAllowance } = useFreeAllowance('pdf', open)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justStored, setJustStored] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  // The id of a backup whose file turned out not to exist. Held per-row rather
  // than in `error` so the explanation and the "Remove it" button sit against
  // the entry they are about — there can be several in the list, and a message
  // at the bottom of the panel would not say which one it meant.
  const [missingId, setMissingId] = useState<string | null>(null)
  const [signInOpen, setSignInOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!open) return null

  const signedIn = !!session?.user && session.user.is_anonymous !== true
  const native = isNativeShell()
  // App Review 3.1.1 (1.0.4, 2026-09-25): the phone app may not use tokens
  // bought on the web, because it sells none through In-App Purchase. So in a
  // native shell only the free per-app token counts — the purchased balance is
  // neither shown nor offered, and the button stays off once the free token is
  // held (the server spends the free token first, so gating here is enough).
  const tokens = native ? 0 : (credits ?? 0)
  const canStore = freeToken === 'available' || tokens > 0
  // Talk about the limit only once it is close: 80%+ used and still room. At
  // the limit the existing at-limit message takes over instead.
  const near = signedIn && !noCompany && freeToken !== 'held' ? nearFreeLimit(allowance) : null
  const fmt = new Intl.NumberFormat(intlLocale(t.lang))

  function close() {
    setOpen(false)
    setError(null)
    setJustStored(false)
    setImportErr(null)
    setMissingId(null)
  }

  function onDownloadBackup() {
    if (!doc) return
    downloadBackup()
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setImportErr(null)
    setImportBusy(true)
    try {
      await importBackup(file)
      close() // the restored PDF + edits are now in the editor
    } catch (err) {
      setImportErr((err as Error).message)
    } finally {
      setImportBusy(false)
    }
  }

  async function onStore() {
    if (!doc || !activeOrgId || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await storeCurrentPdf(supabase, activeOrgId)
      if (!res.ok) {
        setError(
          res.error === 'no_credits'
            ? (isNativeShell() ? t('sign.no_tokens_left') : t('sign.hosted_no_tokens_get_more'))
            : res.error ?? t('sign.could_not_store'),
        )
      } else {
        setJustStored(true)
        refreshCredits()
        refreshFreeToken()
        refreshAllowance()
        refreshList()
        window.setTimeout(() => setJustStored(false), 2200)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onOpen(upload: HostedUpload) {
    if (busy) return
    setBusy(true)
    setError(null)
    setMissingId(null)
    try {
      await openHostedPdf(supabase, upload)
      close()
    } catch (e) {
      // A genuinely absent file is not an error to shrug at the user — it is a
      // dead entry, and the only useful thing to say is which one and what to
      // do about it. Anything else (offline, session expired) still surfaces as
      // an ordinary message, because deleting the backup would be the wrong
      // advice.
      if (e instanceof HostedObjectMissingError) setMissingId(upload.id)
      else setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(upload: HostedUpload) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await deleteHostedPdf(supabase, upload)
      if (!res.ok) setError(res.error ?? t('sign.hosted_could_not_delete'))
      else {
        setMissingId((id) => (id === upload.id ? null : id))
        refreshCredits()
        refreshFreeToken()
        refreshAllowance()
        refreshList()
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      {/* ⚠️ One box that scrolls would take the title and the Close button with
          it. This is a flex column capped at the viewport instead, with the
          title row pinned OUTSIDE the scrolling body.
          `max-h-[min(100%,100dvh)]`: 100% is the overlay's content box and
          100dvh shrinks with iOS's browser chrome, so min() takes whichever is
          actually visible — a `vh` cap does not, because `vh` is the LARGE
          viewport on iOS. */}
      <div className="flex w-full max-w-lg max-h-[min(100%,100dvh)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{t('sign.hosted_title')}</h2>
          <button onClick={close} aria-label={t('sign.close')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <LockedOriginNote kind="save" />
          {/* Tier 1 — Save to browser (local, temporary): automatic recents. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{t('sign.hosted_browser')}</span>
              <Chip size="sm">{t('sign.hosted_browser_chip')}</Chip>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {openedLocked ? t('sign.hosted_browser_body_locked') : t('sign.hosted_browser_body')}
            </p>
          </div>

          {/* Tier 2 — Save to desktop: a re-importable backup file the guest keeps. */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{t('sign.hosted_desktop')}</span>
              <Chip size="sm">{t('sign.hosted_desktop_chip')}</Chip>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t('sign.hosted_desktop_body')}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownloadBackup}
                disabled={!doc || importBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M4 16h12" />
                </svg>
                {t('sign.hosted_download_backup')}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 17V7m0 0L6.5 10.5M10 7l3.5 3.5M4 4h12" />
                </svg>
                {importBusy ? t('sign.hosted_importing') : t('sign.hosted_import_backup')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={onImportFile}
                className="hidden"
              />
            </div>
            {!doc && <p className="mt-2 text-xs text-slate-400">{t('sign.hosted_open_to_backup_or_import')}</p>}
            {importErr && <p className="mt-2 text-sm text-rose-600">{importErr}</p>}
          </div>

          {/* Tier 3 — Universal subscription: paid "Hosted by UNI·SIM" cloud. */}
          <div className="rounded-xl border border-orange-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{t('sign.hosted_cloud')}</span>
              {/* "Universal subscription" names a paid plan: not in the phone app (3.1.1). */}
              {!native && <Chip size="sm">{t('sign.hosted_cloud_chip')}</Chip>}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t('sign.hosted_cloud_body')}
            </p>

            {!signedIn ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-700">{t.rich('sign.hosted_sign_in', { id: <strong>Universal ID</strong> })}</p>
                <a
                  // ⚠️ No href in a native shell — `installExternalLinkHandler`
                  // is a document-level CAPTURE listener, so it would take this
                  // click into an in-app browser before React's onClick ran and
                  // the guard below would stand down on `defaultPrevented`.
                  // Without an href its `closest('a[href]')` misses the row.
                  href={native ? undefined : SIGNIN_URL}
                  role={native ? 'button' : undefined}
                  tabIndex={0}
                  onClick={(e) => {
                    // Modified clicks keep the link's own new-tab behaviour.
                    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    setSignInOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (!native) return
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    setSignInOpen(true)
                  }}
                  className="mt-2 inline-flex cursor-pointer rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
                >
                  {t('sign.hosted_sign_in_button')}
                </a>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-center justify-between rounded-lg bg-orange-50/60 px-3 py-2 text-sm">
                  <span className="text-slate-600">{user?.email}</span>
                  {/* No allowance talk while the free allowance covers it — only a
                      neutral count of purchased tokens, when there are any
                      (always 0 in a native shell, see `tokens`). */}
                  {tokens > 0 && (
                  <span className="font-semibold text-orange-700">
                    {t.plural('sign.hosted_tokens', tokens)}
                  </span>
                  )}
                </div>

                {noCompany ? (
                  <div className="mt-3" data-testid="hosted-no-company">
                    <p className="text-sm text-slate-600">{t('sign.hosted_no_company')}</p>
                    <a href={SET_UP_COMPANY_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800">
                      {t('sign.setup_company_button')}
                    </a>
                  </div>
                ) : doc ? (
                  canStore ? (
                    <button
                      onClick={onStore}
                      disabled={busy}
                      className="mt-3 w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
                    >
                      {busy ? t('sign.hosted_backing_up') : justStored ? t('sign.hosted_backed_up') : t('sign.hosted_back_up_online')}
                    </button>
                  ) : freeToken === null ? null : (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm text-amber-800">
                        {freeToken === 'held'
                          ? (isNativeShell() ? t('sign.hosted_token_held_native') : t('sign.hosted_token_held'))
                          : t('sign.no_tokens_left')}
                      </p>
                      {!isNativeShell() && (
                        <a href={GET_TOKENS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-orange-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-800">
                          {t('sign.get_tokens')}
                        </a>
                      )}
                    </div>
                  )
                ) : (
                  <p className="mt-3 text-xs text-slate-500">{t('sign.hosted_open_to_backup')}</p>
                )}

                {near && (
                  <p className="mt-2 text-xs text-slate-500" data-testid="free-storage-near-limit">
                    {t('sign.free_storage_near_limit', { used: fmt.format(near.usedMb), limit: fmt.format(near.limitMb) })}
                  </p>
                )}

                {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

                {/* The user's hosted PDFs */}
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('sign.hosted_your_backups')}</p>
                  {listLoading ? (
                    <p className="text-xs text-slate-400">{t('sign.loading')}</p>
                  ) : uploads.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('sign.none_yet')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {uploads.map((u) => (
                        <li key={u.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-slate-700">{u.file_name || 'document.pdf'}</span>
                              <span className="block text-[10px] text-slate-400">{new Date(u.created_at).toLocaleDateString(intlLocale(t.lang))}</span>
                            </span>
                            <button onClick={() => onOpen(u)} disabled={busy} className="shrink-0 rounded-md bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-50">{t('sign.hosted_open')}</button>
                            <button onClick={() => onDelete(u)} disabled={busy} className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50" title={t('sign.hosted_delete_title')}>{t('sign.delete')}</button>
                          </div>

                          {/* A backup with nothing behind it. Say which file,
                              say plainly that the upload never finished, and
                              make clearing it up one click — removing it frees
                              the space it holds, so there is nothing to lose by
                              tidying. This replaces storage's bare "Object not
                              found", which read like the app had mislaid the
                              user's document. */}
                          {missingId === u.id && (
                            <div
                              role="alert"
                              data-testid="hosted-missing"
                              className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2"
                            >
                              <p className="text-[11px] leading-snug text-amber-900">
                                {t.rich('sign.hosted_missing', { file: <strong className="font-semibold">{u.file_name || 'document.pdf'}</strong> })}
                              </p>
                              <button
                                type="button"
                                onClick={() => onDelete(u)}
                                disabled={busy}
                                className="mt-2 inline-flex rounded-md bg-amber-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                              >
                                {t('sign.hosted_remove_entry')}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sits inside this panel's portal so signing in never closes it: the
          upload card is the reason the person is signing in, and it re-renders
          signed-in under them the moment the session lands. */}
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        hubLoginHref={SIGNIN_URL}
      />
    </div>,
    document.body,
  )
}
