import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { currentPdfBytes } from '../../lib/hostedStore'
import { downloadPdfBytes } from '../../lib/download'
import { nextExportName, previewExportName } from '../../lib/exportName'
import { markSaved } from '../../lib/unsavedChanges'
import { isNativeShell } from '../../lib/nativeOpen'
import { certifiedSignatureHere, isDesktopApp } from '../../lib/accounts'
import { REDACT_CONFIRM_WORD } from '../../lib/redactGate'
import LockedOriginNote from '../Lock/LockedOriginNote'
import { useT } from '../../i18n'

/**
 * "Send for signature" — the PLAIN route, and the default everywhere
 * (James, 2026-10-12): no account, nothing uploaded.
 *
 * The sender has placed "Sign here" boxes (and perhaps signed their own); this
 * hands the file over the way the platform hands over any file — the share
 * sheet on a phone, a download or Save dialog on the web and the desktop, plus
 * the Web Share sheet where the browser has one. Each unsigned box leaves as a
 * REAL PDF signature field (lib/export.ts `addSignatureFields`), so whoever
 * receives it can sign in Universal PDF, Acrobat/Reader or Apple Preview, and
 * Universal PDF opens such a field as a tap-to-sign box.
 *
 * The certified route (stored copy, emailed link, certificate, 7-year audit
 * trail — SendToSignDialog) is offered beneath it as the optional upgrade, on
 * the website and in the desktop app, where the sender can sign in with a
 * Universal ID. The phone apps and the extension do not mention it (App Store
 * 4.3: no link out).
 */
export default function SendForSignatureDialog() {
  const t = useT()
  const open = usePdfStore((s) => s.sendForSignatureOpen)
  const setOpen = usePdfStore((s) => s.setSendForSignatureOpen)
  const setCertifiedOpen = usePdfStore((s) => s.setSendToSignOpen)
  const fileName = usePdfStore((s) => s.fileName)
  const doc = usePdfStore((s) => s.doc)
  const hasBox = useAnnotationStore((s) => s.annotations.some((a) => a.type === 'sigfield' && !a.signed))
  const redactCount = useAnnotationStore((s) => s.annotations.filter((a) => a.type === 'redact').length)
  const isXfa = usePdfStore((s) => s.isXfa)
  const needsRedactConfirm = !isXfa && redactCount > 0

  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [redactConfirm, setRedactConfirm] = useState('')
  const redactConfirmed = !needsRedactConfirm || redactConfirm.trim().toUpperCase() === REDACT_CONFIRM_WORD

  // Built as the dialog opens, not on the click: the Web Share sheet must be
  // raised inside the click's user activation, and building a PDF can take
  // long enough to spend it. The dialog is modal, so nothing changes under it.
  useEffect(() => {
    if (!open || !doc) return
    let cancelled = false
    setBytes(null)
    setError(null)
    setDone(false)
    currentPdfBytes()
      .then(({ bytes: b }) => { if (!cancelled) setBytes(b) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [open, doc])

  if (!open) return null

  const native = isNativeShell()
  const desktop = isDesktopApp()
  const outName = () => nextExportName(fileName)
  const file = bytes ? new File([bytes as BlobPart], previewExportName(fileName), { type: 'application/pdf' }) : null
  const canWebShare = !native && !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const ready = !!bytes && hasBox && redactConfirmed

  function close() {
    setOpen(false)
    setRedactConfirm('')
    setDone(false)
  }

  async function onSave() {
    if (!bytes || !ready) return
    const savePdf = window.desktop?.savePdf
    if (savePdf) {
      const result = await savePdf(previewExportName(fileName), bytes)
      if (!result.ok) {
        if (!result.cancelled) setError(result.error ?? null)
        return
      }
      nextExportName(fileName)
    } else {
      // A download in a browser; the share sheet in the phone apps
      // (@unisim/media/save).
      downloadPdfBytes(bytes, outName())
    }
    markSaved()
    setDone(true)
  }

  async function onWebShare() {
    if (!file || !ready) return
    try {
      await navigator.share({ files: [file], title: file.name })
      nextExportName(fileName)
      markSaved()
      setDone(true)
    } catch (e) {
      // Closing the sheet is an answer, not a failure.
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const primaryClass =
    'w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed'
  const secondaryClass =
    'w-full rounded-lg border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed'

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
      data-send-for-signature
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sfs-title"
        className="flex w-full max-w-md max-h-[min(100%,100dvh)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="sfs-title" className="text-base font-bold text-slate-900">{t('sign.send_for_signature')}</h2>
          <button onClick={close} aria-label={t('sign.close')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-slate-700">{t('sign.sfs_intro')}</p>
          <p className="text-xs text-slate-500">{t('sign.sfs_private')}</p>
          <LockedOriginNote kind="send" />

          {!hasBox ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{t('sign.send_add_box_first')}</p>
              <p className="mt-1 text-xs text-amber-800">
                {t.rich('sign.send_add_box_body', {
                  menu: <strong>{t('sign.menu_sign')} ▾</strong>,
                  item: <strong>{t('sign.menu_place_box')}</strong>,
                })}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">{t('sign.sfs_sign_first')}</p>
              {needsRedactConfirm && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-900">{t.plural('sign.send_redactions', redactCount)}</p>
                  <p className="mt-1 text-xs text-red-800">
                    {t.rich('sign.sfs_redact_body', { word: <strong>{REDACT_CONFIRM_WORD}</strong> })}
                  </p>
                  <input
                    value={redactConfirm}
                    onChange={(e) => setRedactConfirm(e.target.value)}
                    placeholder={REDACT_CONFIRM_WORD}
                    className="mt-2 w-full rounded-lg border border-red-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}
              <div className="space-y-2">
                {native ? (
                  <button type="button" onClick={onSave} disabled={!ready} className={primaryClass} data-sfs-share>
                    {bytes ? t('sign.sfs_share') : t('sign.sfs_preparing')}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={onSave} disabled={!ready} className={primaryClass} data-sfs-download>
                      {!bytes ? t('sign.sfs_preparing') : desktop ? t('sign.sfs_save') : t('sign.sfs_download')}
                    </button>
                    {canWebShare && (
                      <button type="button" onClick={onWebShare} disabled={!ready} className={secondaryClass} data-sfs-share>
                        {t('sign.sfs_share')}
                      </button>
                    )}
                  </>
                )}
              </div>
              {done && (
                <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  {t('sign.sfs_done')}
                </p>
              )}
            </>
          )}

          {error && <p className="text-sm text-rose-600">{t('sign.sfs_failed', { error })}</p>}

          {/* The optional upgrade, on the website and in the desktop app:
              opens the certified route here. Phone apps and the extension:
              nothing at all — no link out (App Store 4.3). */}
          {certifiedSignatureHere() && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-sfs-certified>
              <p className="text-sm font-semibold text-slate-900">{t('sign.sfs_certified_title')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('sign.sfs_certified_body')}</p>
              <button
                type="button"
                onClick={() => { close(); setCertifiedOpen(true) }}
                className="mt-3 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                {t('sign.sfs_certified_button')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
