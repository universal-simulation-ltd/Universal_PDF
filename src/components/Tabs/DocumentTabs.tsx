import { useEffect, useReducer, useRef } from 'react'
import {
  activateTab,
  closeTab,
  cycleTab,
  openFiles,
  tabIsAmended,
  useTabStore,
  type DocTab
} from '../../stores/tabStore'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import { onSavedStateChanged } from '../../lib/unsavedChanges'
import { PDF_OR_OFFICE_ACCEPT } from '../../lib/officeToPdf'
import { useT } from '../../i18n'

// The strip of open documents, shown only while the window holds two or more
// (a lone document has no tabs at all — see stores/tabStore.ts).
//
// It sits ABOVE the tools bar, as a browser's tabs sit above its toolbar: the
// tools act on whichever document is in front, so they belong under the thing
// that chooses it.
//
// A dot on a tab means it has amendments no saved file contains — the same
// question the exit guard asks, so a tab with a dot is exactly a tab that will
// ask before it closes.

export default function DocumentTabs() {
  const t = useT()
  const tabs = useTabStore((s) => s.tabs)
  const activeId = useTabStore((s) => s.activeId)
  const liveName = usePdfStore((s) => s.fileName ?? s.lockedFile?.file.name ?? null)
  const liveLocked = usePdfStore((s) => !s.doc && !!s.lockedFile)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  // The dots read the edit stores and the saved baseline, neither of which is
  // state this component subscribes to — so re-render when either moves.
  // Annotation changes only: the store also carries the tool and the
  // selection, which change far more often and never move a dot.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const offs = [
      useAnnotationStore.subscribe((s, prev) => {
        if (s.annotations !== prev.annotations) refresh()
      }),
      useFormStore.subscribe(refresh),
      onSavedStateChanged(refresh)
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Keep the tab in front visible when the strip is wider than the window.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  // Ctrl+Tab / Ctrl+Shift+Tab and Ctrl+PageDown / Ctrl+PageUp, as in a browser
  // and in Acrobat. (A browser keeps Ctrl+Tab for its own tabs, so on the web
  // only the PageDown/PageUp pair reaches here; the desktop app gets both.)
  // Not while a dialog is up — whatever it is about is on the tab in front.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      let step: 1 | -1 | 0 = 0
      if (e.key === 'Tab') step = e.shiftKey ? -1 : 1
      else if (e.key === 'PageDown') step = 1
      else if (e.key === 'PageUp') step = -1
      if (!step) return
      if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
      e.preventDefault()
      cycleTab(step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function labelFor(tab: DocTab, active: boolean): string {
    if (tab.snapshot) return tab.snapshot.fileName ?? tab.snapshot.lockedFile?.file.name ?? tab.name
    return (active && liveName) || tab.name
  }

  return (
    <div className="bg-slate-900 text-white border-b border-slate-700/70">
      <div
        role="tablist"
        aria-label={t('app.tabs_aria')}
        className="flex items-end gap-1 px-2 pt-1.5 overflow-x-auto [scrollbar-width:thin]"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const name = labelFor(tab, active)
          const locked = tab.snapshot ? !tab.snapshot.doc && !!tab.snapshot.lockedFile : liveLocked
          const amended = tabIsAmended(tab)
          return (
            <div
              key={tab.id}
              ref={active ? activeRef : undefined}
              data-tab-id={tab.id}
              // Middle-click closes, as it does on a browser tab.
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                closeTab(tab.id)
              }}
              onMouseDown={(e) => {
                // Stops the middle button's autoscroll cursor from starting.
                if (e.button === 1) e.preventDefault()
              }}
              className={`group flex items-center shrink-0 max-w-[15rem] rounded-t-md border-b-2 transition-colors ${
                active
                  ? 'bg-slate-700 border-orange-500 text-white'
                  : 'bg-slate-800/70 border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={name}
                onClick={() => activateTab(tab.id)}
                className="flex items-center gap-1.5 min-w-0 h-8 pl-3 pr-1.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-tl-md"
              >
                {locked && (
                  <span aria-hidden="true" className="shrink-0 text-[11px]">
                    🔒
                  </span>
                )}
                <span className="truncate">{name}</span>
                {amended && (
                  <>
                    <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="sr-only">{t('app.tab_unsaved_sr')}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                aria-label={t('app.tab_close_aria', { name })}
                title={t('app.tab_close')}
                onClick={() => closeTab(tab.id)}
                className={`mr-1 shrink-0 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                  active ? '' : 'opacity-70 group-hover:opacity-100'
                }`}
              >
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )
        })}
        <button
          type="button"
          aria-label={t('app.tab_open_another_aria')}
          title={t('app.tab_open_another')}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 mb-0.5 w-8 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={PDF_OR_OFFICE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            // Materialised before the value is cleared — `files` is a LIVE list
            // and empties with it (see LandingPage's onCompressFile).
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length > 0) void openFiles(files)
          }}
        />
      </div>
    </div>
  )
}
