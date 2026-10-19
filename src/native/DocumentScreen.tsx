import { useEffect, useRef } from 'react'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useTabStore, closeTab } from '../stores/tabStore'
import { useExitGuard } from '../stores/exitGuard'
import { useUndo } from '../hooks/useUndo'
import { useToolPrefs } from '../stores/toolPrefsStore'
import { useSignatureStore } from '../stores/signatureStore'
import PdfViewer from '../components/Viewer/PdfViewer'
import PlacementHint from '../components/Viewer/PlacementHint'
import type { Annotation, Tool } from '../types/annotations'
import { Dots, Icon, PATHS } from './icons'
import { useNav } from './nav'
import MarkupSheet, { MARKUP_TOOLS } from './MarkupSheet'
import { BackLink } from './parts'
import { SELECT_SEVERAL_HINT_KEY } from '../lib/resetDefaults'

// Board 2 · A document open: the pages lie on the warm grey desk, a back
// chevron and the name at the top with ⋯, and four tools floating
// at the foot (Fill · Mark up · Sign · Share). The pages are the website's own
// viewer — every gesture, form field and annotation works as it does there;
// only the chrome around it is the phone's.

// Fill · Mark up · Sign · Share (James, 2026-10-18, after trying Sign's place
// going to Share: "actually fill mark up sign share and pages in …"). Share
// used to be an icon in the header; Pages is in What else (the ⋯).
type BarTool = 'fill' | 'markup' | 'sign' | 'share'

/** How many signatures are on the pages: placed ones, and signed request boxes. */
function signaturesOn(annotations: Annotation[]): number {
  let n = 0
  for (const a of annotations) {
    if (a.type === 'image' && a.sig) n++
    else if (a.type === 'sigfield' && a.signed) n++
  }
  return n
}

/** Leave the document for the desk, asking first if it has unsaved changes. */
export function leaveDocument(): void {
  // ⚠️ Down to the document first. The "Save your changes?" prompt is the
  // website's dialog (z-80) and the Signed and Smaller moments sit above it
  // (z-150), so their "Back to my desk" opened the prompt UNDER the moment
  // and the button looked dead (James, 2026-10-18, after Smaller still).
  useNav.getState().clearScreens()
  const { tabs, activeId } = useTabStore.getState()
  if (tabs.length > 1 && activeId) closeTab(activeId)
  else useExitGuard.getState().requestExit('close', usePdfStore.getState().reset)
}

export default function DocumentScreen() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const numPages = usePdfStore((s) => s.numPages)
  const tool = useAnnotationStore((s) => s.tool)
  const setTool = useAnnotationStore((s) => s.setTool)
  const sheet = useNav((s) => s.sheet)
  const openSheet = useNav((s) => s.openSheet)
  const closeSheet = useNav((s) => s.closeSheet)
  const push = useNav((s) => s.push)
  const { canUndo, undo } = useUndo()
  const markingUp = sheet === 'markup'

  // A signature from the Sign page lands on the page, and the Signed moment
  // follows once it is where it should be — kept with its ✓ (James,
  // 2026-10-18: "force the user to click a tick button once it's correctly
  // placed"). Not on landing (it nearly always wants moving), and not on a tap
  // off it either: a tap elsewhere to move the page along counted as done.
  // The signature's name and date pieces, placed straight after it, count as
  // part of it, so their ✓ does too.
  const before = useRef(signaturesOn(useAnnotationStore.getState().annotations))
  const placed = useRef<Set<string>>(new Set())
  useEffect(
    () =>
      useAnnotationStore.subscribe((s, prev) => {
        const now = signaturesOn(s.annotations)
        const nav = useNav.getState()
        if (now > before.current && nav.awaitingSignature) {
          nav.setAwaitingSignature(false)
          const known = new Set(prev.annotations.map((a) => a.id))
          placed.current = new Set(s.annotations.filter((a) => !known.has(a.id)).map((a) => a.id))
        } else if (placed.current.size && useSignatureStore.getState().pendingExtras.length > 0 && s.annotations.length > prev.annotations.length) {
          // A name or date piece put down while the signature's pieces are
          // still being placed.
          const known = new Set(prev.annotations.map((a) => a.id))
          for (const a of s.annotations) if (!known.has(a.id) && a.type === 'text') placed.current.add(a.id)
        }
        before.current = now
        const c = s.confirmed
        if (c && c !== prev.confirmed && placed.current.has(c.id)) {
          placed.current = new Set()
          window.setTimeout(() => useNav.getState().push('signed'), 250)
        }
      }),
    []
  )

  // Selecting several marks is a press-and-hold then a drag on empty page
  // (James, 2026-10-19: "On mobile need a tap and drag to select multiple
  // annotations"), which nothing on screen shows. So the first time a mark is
  // tapped on a page that has others, a line says how, once. Using the
  // gesture counts as having learnt it. Tune's Reset to defaults brings it
  // back (SELECT_SEVERAL_HINT_KEY in lib/resetDefaults).
  useEffect(
    () =>
      useAnnotationStore.subscribe((s, prev) => {
        if (s.selectedIds === prev.selectedIds) return
        let known: string | null
        try {
          known = localStorage.getItem(SELECT_SEVERAL_HINT_KEY)
        } catch {
          return
        }
        if (known) return
        const remember = () => {
          try {
            localStorage.setItem(SELECT_SEVERAL_HINT_KEY, '1')
          } catch {
            // Not remembered, so it may show again — harmless.
          }
        }
        // Several marks that were already there, selected together: only the
        // box does that (several put down at once, by a paste or "on every
        // page", arrive selected too, and teach nothing).
        if (s.selectedIds.length > 1) {
          if (s.selectedIds.every((id) => prev.annotations.some((a) => a.id === id))) remember()
          return
        }
        if (s.selectedIds.length !== 1 || prev.selectedIds.length !== 0) return
        // A tap on a mark that was already there — not one just put down,
        // which `add` selects too.
        const id = s.selectedIds[0]
        const mark = prev.annotations.find((a) => a.id === id)
        if (!mark) return
        if (s.annotations.filter((a) => a.pageIndex === mark.pageIndex).length < 2) return
        remember()
        useNav.getState().say(t('phone.select_several_hint'))
      }),
    [t]
  )

  // While the sheet is open it carries the selected mark's colour and width,
  // so the page's own Colour pill stands down; and Black out is drawn like the
  // highlighter on the phone (the website's stays a box).
  useEffect(() => {
    const a = useAnnotationStore.getState()
    a.setToolSheetOpen(markingUp)
    return () => a.setToolSheetOpen(false)
  }, [markingUp])
  useEffect(() => {
    useAnnotationStore.getState().setRedactStroke(true)
    return () => useAnnotationStore.getState().setRedactStroke(false)
  }, [])

  const active: BarTool | null = markingUp || MARKUP_TOOLS.includes(tool as Tool) ? 'markup' : tool === 'text' || tool === 'select' ? 'fill' : null
  // Under the Mark up sheet the bar is only ever seen while the sheet is pulled
  // away, and putting it away leaves Select in hand: so it already shows Fill
  // lit, as it will be, rather than switching from Mark up as the sheet goes
  // (James, 2026-10-19).
  const barActive: BarTool | null = markingUp ? 'fill' : active

  function onBar(id: BarTool) {
    if (id === 'fill') {
      if (markingUp) closeSheet()
      // Typing straight into a form's boxes works with any tool; Text adds
      // words anywhere else on the page as well.
      useAnnotationStore.getState().setSelected(null)
      setTool('text')
      useNav.getState().say(t('phone.fill_hint'))
    } else if (id === 'markup') {
      if (markingUp) {
        closeSheet()
        return
      }
      // Open with a marker in hand — the highlighter, as on the board —
      // unless one from the sheet already is.
      if (!MARKUP_TOOLS.includes(useAnnotationStore.getState().tool)) {
        const a = useAnnotationStore.getState()
        a.setSelected(null)
        a.setColor(useToolPrefs.getState().highlightColours[0])
        a.setTool('highlight')
      }
      openSheet('markup')
    } else if (id === 'sign') {
      push('sign')
    } else {
      push('share')
    }
  }

  const tools: { id: BarTool; label: string; icon: string }[] = [
    { id: 'fill', label: t('phone.tool_fill'), icon: PATHS.fill },
    { id: 'markup', label: t('phone.tool_markup'), icon: PATHS.pen },
    { id: 'sign', label: t('phone.tool_sign'), icon: PATHS.sign },
    { id: 'share', label: t('phone.tool_share'), icon: PATHS.share },
  ]

  return (
    <div className="np-doc flex-1 min-h-0 flex flex-col relative" style={{ background: 'var(--np-grey-desk)' }}>
      <header
        className="flex-none flex items-center gap-0.5 px-1.5 pb-1.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}
      >
        {markingUp ? (
          <>
            {/* The way back to Fill · Mark up · Sign · Pages is the back
                chevron every other page here has — "Done" on the right didn't
                read as the way out (James, 2026-10-18). */}
            <BackLink
              label={t('phone.done')}
              onClick={() => {
                closeSheet()
                setTool('select')
              }}
            />
            <span className="np-serif flex-1 text-center text-[17px] font-bold">{t('phone.markup_title')}</span>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="min-h-[44px] px-3 mr-1 flex items-center gap-1 text-[16px] font-semibold text-[color:var(--np-cobalt)] disabled:opacity-40"
            >
              <Icon d={PATHS.undo} size={20} width={2.2} stroke="var(--np-cobalt)" />
              {t('phone.undo')}
            </button>
          </>
        ) : (
          <>
            <button type="button" aria-label={t('phone.back_to_desk')} onClick={leaveDocument} className="w-11 h-11 flex items-center justify-center">
              <Icon d={PATHS.back} size={24} width={2.4} stroke="var(--np-cobalt)" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col items-center">
              <span className="np-serif text-[17px] font-bold truncate max-w-full">{(fileName ?? '').replace(/\.pdf$/i, '')}</span>
              {numPages > 0 && <span className="text-[12px] text-[color:var(--np-muted)]">{t.plural('phone.pages', numPages)}</span>}
            </div>
            {/* Balances the back chevron, so the name stays centred now Share is in the bar. */}
            <span aria-hidden="true" className="w-11 h-11" />
            <button type="button" aria-label={t('phone.more_aria')} onClick={() => openSheet('more')} className="w-11 h-11 flex items-center justify-center">
              <Dots size={22} fill="var(--np-cobalt)" />
            </button>
          </>
        )}
      </header>

      <main
        className="flex-1 min-h-0 relative isolate"
        style={{ paddingBottom: markingUp ? 0 : 'calc(env(safe-area-inset-bottom) + 96px)' }}
      >
        <PdfViewer />
        <PlacementHint />
      </main>

      {/* The bar stays under the Mark up sheet rather than going away, so
          pulling the sheet down uncovers it as the sheet comes down (James,
          2026-10-19: "reveal the main toolbar instead of only showing it when
          fully hidden"). Out of reach while it's covered. */}
      <nav
        aria-label={t('phone.tools_aria')}
        aria-hidden={markingUp || undefined}
        {...(markingUp ? { inert: '' } : {})}
        className={`absolute left-3.5 right-3.5 grid grid-cols-4 px-1.5 py-2 rounded-3xl ${markingUp ? 'z-[50]' : 'z-[60]'}`}
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 18px)',
          background: 'var(--np-sheet)',
          boxShadow: '0 10px 26px rgba(60,45,20,0.2)',
        }}
      >
        {tools.map((b) => {
          const on = barActive === b.id
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === 'fill' || b.id === 'markup' ? on : undefined}
              onClick={() => onBar(b.id)}
              className="flex flex-col items-center justify-center gap-1.5 min-h-[58px]"
              style={{ color: on ? 'var(--np-cobalt-deep)' : 'var(--np-ink-2)' }}
            >
              <span
                className="relative w-[50px] h-8 rounded-xl flex items-center justify-center"
                style={{ background: on ? 'var(--np-cobalt)' : 'transparent' }}
              >
                <Icon d={b.icon} size={22} stroke={on ? '#ffffff' : 'var(--np-ink-2)'} />
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[9px] right-[9px] -bottom-1.5 h-1 rounded-[2px_4px_3px_2px]"
                    style={{ background: 'var(--np-orange)', transform: 'rotate(-3deg)' }}
                  />
                )}
              </span>
              <span className="text-[12px] font-bold">{b.label}</span>
            </button>
          )
        })}
      </nav>

      {markingUp && <MarkupSheet />}
    </div>
  )
}
