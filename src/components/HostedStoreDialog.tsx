import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Chip } from '@unisim/sdk'
import { usePdfStore } from '../stores/pdfStore'
import LockedOriginNote from './Lock/LockedOriginNote'
import { downloadBackup, importBackup } from '../lib/pdfBackup'
import { useT } from '../i18n'

// "Back up this PDF" — both options are local: the automatic copy in this
// browser (recents) and a backup file the person downloads and re-imports.
// There is no online backup: James, 2026-10-03, "we don't want to be a file
// hoster when they have so many other free choices for that". The only PDF
// stored online is a Send to sign copy (SendToSignDialog, migration 0227).
export default function HostedStoreDialog() {
  const t = useT()
  const open = usePdfStore((s) => s.hostedStoreOpen)
  const setOpen = usePdfStore((s) => s.setHostedStoreOpen)
  const doc = usePdfStore((s) => s.doc)
  // A locked document is never put in recents, so "already kept on this
  // device" would be untrue — and believed.
  const openedLocked = usePdfStore((s) => s.openedLocked)

  const [importBusy, setImportBusy] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!open) return null

  function close() {
    setOpen(false)
    setImportErr(null)
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
        </div>
      </div>
    </div>,
    document.body,
  )
}
