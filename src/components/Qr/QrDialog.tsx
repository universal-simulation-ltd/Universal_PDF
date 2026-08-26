import { useEffect, useMemo, useState } from 'react'
import { useHostedUploads, useOrg, useOrgBranding, useUniversal, useUser } from '@unisim/sdk'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import {
  DEFAULT_DESIGN,
  isSafeQrAccent,
  QR_PRESETS,
  qrContrastIssue,
  qrDisplayName,
  withBranding,
  type QrDesign,
  type QrPlacement,
  type QrPreset
} from '../../lib/qr/design'
import { imageUrlToDataUrl, PLACEMENT_SIZE, renderQrPng } from '../../lib/qr/render'
import QrBrandingPanel from './QrBrandingPanel'
import { copyQrPngToClipboard, downloadQrPng } from '../../lib/qr/download'
import {
  loadHostedQrDesigns,
  loadSavedQrDesigns,
  UNIVERSAL_QR_URL,
  type HostedQrDesign,
  type SavedQrDesign
} from '../../lib/qr/library'
import QrEnlargeModal from './QrEnlargeModal'
import type { Annotation } from '../../types/annotations'

// A simplified Universal QR: the same design model and the same six presets,
// with a link box instead of the full studio. Generating the code produces a
// PNG, which is armed for click-to-place through the existing image-annotation
// path — so it moves, resizes, undoes and bakes into the export like any other
// placed picture, with no new annotation type.
//
// The same dialog doubles as the EDITOR for a code already on the page (the ✏️
// on the selected code). It is deliberately the same component rather than a
// second, smaller one: the thing you want to change after placing a code — a
// typo'd link, the wrong style, branding you meant to turn on — is exactly what
// this dialog already edits, and the state it edits is carried on the
// annotation (`ImageAnnotation.qr`). In edit mode it seeds from that state and
// re-renders the placed image in place instead of arming a new placement.

const PREVIEW_SIZE = 224
// Long enough that typing a URL doesn't render a code per keystroke, short
// enough that the preview still feels attached to the box.
const PREVIEW_DEBOUNCE_MS = 250

/** A cheap, drawn impression of a preset — plate silhouette, finder eyes and a
 *  few modules in the preset's own colours. Not a real QR: rendering six live
 *  codes on every keystroke would cost more than the chips are worth, and a
 *  chip only has to say "circle, dotted, orange eyes". */
function PresetGlyph({ preset }: { preset: QrPreset }) {
  const p = { ...DEFAULT_DESIGN, ...preset.patch }
  const eye = p.matchCornerColor ? p.fgColor : p.cornerColor
  const shaped = p.frameShape !== 'square'
  // Shaped plates hold a smaller code, the same way the renderer does.
  const s = shaped ? 0.66 : 1
  const o = (1 - s) / 2
  const u = (v: number) => (o + v * s) * 32

  const plate =
    p.frameShape === 'circle' ? (
      <circle cx={16} cy={16} r={16} fill={p.bgColor} />
    ) : p.frameShape === 'star' ? (
      <polygon
        points={Array.from({ length: 10 }, (_, i) => {
          const r = i % 2 === 0 ? 16 : 16 * 0.62
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          return `${16 + r * Math.cos(a)},${16 + r * Math.sin(a)}`
        }).join(' ')}
        fill={p.bgColor}
      />
    ) : (
      <rect width={32} height={32} rx={p.dotType === 'square' ? 0 : 3} fill={p.bgColor} />
    )

  // Module rounding follows the preset's dot style, so Classic reads square and
  // Dots reads round at a glance.
  const dotR = p.dotType === 'dots' ? 1.6 : p.dotType === 'square' ? 0 : 1
  const eyeR = p.cornerSquareType === 'square' ? 0 : p.cornerSquareType === 'dot' ? 4.5 : 2.5
  const MODULES = [
    [0.62, 0.62], [0.78, 0.62], [0.62, 0.78], [0.9, 0.78], [0.78, 0.9],
    [0.46, 0.14], [0.46, 0.3], [0.46, 0.62], [0.14, 0.46], [0.3, 0.46], [0.62, 0.46], [0.9, 0.46]
  ]

  return (
    <svg viewBox="0 0 32 32" className="w-9 h-9 shrink-0" aria-hidden="true">
      {plate}
      {([[0.02, 0.02], [0.66, 0.02], [0.02, 0.66]] as const).map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.32 * s * 32}
          height={0.32 * s * 32}
          rx={eyeR * s}
          fill="none"
          stroke={eye}
          strokeWidth={2.2 * s}
        />
      ))}
      {MODULES.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.1 * s * 32}
          height={0.1 * s * 32}
          rx={dotR * s}
          fill={p.fgColor}
        />
      ))}
    </svg>
  )
}

export default function QrDialog() {
  const open = usePdfStore((s) => s.qrOpen)
  const setOpen = usePdfStore((s) => s.setQrOpen)
  // Set when the ✏️ on a placed code opened this: the annotation to write the
  // re-rendered code back to, and the design it was placed with.
  const qrEdit = usePdfStore((s) => s.qrEdit)
  const setUploadedImageSrc = useAnnotationStore((s) => s.setUploadedImageSrc)
  const setTool = useAnnotationStore((s) => s.setTool)
  const updateAnnotation = useAnnotationStore((s) => s.update)

  // The design as the STYLE controls left it — presets, saved codes, the link.
  // Branding is overlaid on top rather than edited in (see `withBranding`), so
  // picking a different preset can't quietly drop the user's mark and turning
  // branding off can't leave a half-recoloured code behind.
  const [base, setBase] = useState<QrDesign>(DEFAULT_DESIGN)
  const [branded, setBranded] = useState(false)
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [brandColor, setBrandColor] = useState<string | null>(null)
  /** Set once the user edits the branding, pinning it against the org sync. */
  const [brandTouched, setBrandTouched] = useState(false)
  const [presetName, setPresetName] = useState<string | null>('Rounded')
  const [preview, setPreview] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedQrDesign[]>([])
  const [adding, setAdding] = useState(false)
  const [enlarged, setEnlarged] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  // Whether a real account is signed in (a guest/anonymous session doesn't
  // count). Gates the saved-codes shelf: for everyone else that section was a
  // paragraph explaining storage they don't have, which is noise.
  const { user } = useUser()
  const { session, supabase } = useUniversal()
  const signedIn = !!user && session?.user?.is_anonymous !== true

  // The codes saved to the ACCOUNT in Universal QR (hosted uploads, product
  // 'qr') — unlike the localStorage shelf these follow the user to any device
  // they sign in on. Resolved lazily while the dialog is open.
  const { uploads: qrUploads } = useHostedUploads('qr')
  const [hosted, setHosted] = useState<HostedQrDesign[]>([])

  // The signed-in company's branding, ready to drop onto a code. Guests and
  // orgs that never set one get nulls, and the panel says so.
  const { org } = useOrg()
  const orgBranding = useOrgBranding()
  const [orgLogo, setOrgLogo] = useState<string | null>(null)
  const orgColor = orgBranding.brand_color
  // The square icon first — it is the 1:1 mark, and the centre of a QR is a
  // square hole. A wide wordmark scaled to fit it would be unreadably small.
  const orgMarkUrl = orgBranding.icon_url ?? orgBranding.logo_url

  const design = useMemo(
    () => withBranding(base, branded ? { logo: brandLogo, color: brandColor } : null),
    [base, branded, brandLogo, brandColor]
  )
  const data = design.data.trim()
  const issue = data ? qrContrastIssue(design) : null
  // The brand colour was kept for the logo but refused by the code itself.
  const colorRejected = !!brandColor && !isSafeQrAccent(brandColor, design.bgColor)

  // Fresh dialog every time, seeded with the app's default look and whatever
  // Universal QR has saved on this device — or, when the ✏️ on a placed code
  // opened this, with that code's own state, so what comes up is the code you
  // clicked rather than a new one.
  useEffect(() => {
    if (!open) return
    if (qrEdit) {
      const { base: editBase, branding, presetName: editPreset } = qrEdit.placement
      setBase(editBase)
      setPresetName(editPreset)
      setBranded(!!branding)
      setBrandLogo(branding?.logo ?? null)
      setBrandColor(branding?.color ?? null)
      // Pinned from the off: this code's branding is a decision somebody
      // already made, and the org sync must not overwrite it on the way in.
      setBrandTouched(true)
    } else {
      setBase({ ...DEFAULT_DESIGN, ...(QR_PRESETS.find((p) => p.name === 'Rounded')?.patch ?? {}) })
      setPresetName('Rounded')
      // Branding starts OFF — a document gets the UNI·SIM mark until somebody
      // asks for something else — but the fields behind the switch are seeded,
      // so flipping it produces the company's own code rather than an empty
      // panel.
      setBranded(false)
      setBrandTouched(false)
    }
    setPreview(null)
    setError(null)
    setAdding(false)
    setEnlarged(false)
    setCopied('idle')
    setSaved(loadSavedQrDesigns())
  }, [open, qrEdit])

  // Resolve the account saves (sidecar design or stored PNG per upload) while
  // the dialog is up. `cancelled` guards the async gap across a close/reopen.
  useEffect(() => {
    if (!open || !signedIn || qrUploads.length === 0) {
      setHosted([])
      return
    }
    let cancelled = false
    loadHostedQrDesigns(supabase, qrUploads).then((entries) => {
      if (!cancelled) setHosted(entries)
    })
    return () => {
      cancelled = true
    }
  }, [open, signedIn, supabase, qrUploads])

  // Until the user edits the branding themselves it simply TRACKS the company's
  // — which also covers the mark arriving a moment after the dialog opened,
  // since it has to be fetched. The first edit pins it, so a late-resolving
  // company logo can never overwrite a mark somebody just chose.
  useEffect(() => {
    if (!open || brandTouched) return
    setBrandLogo(orgLogo)
    setBrandColor(orgColor)
  }, [open, brandTouched, orgLogo, orgColor])

  // Pull the company mark into a data URI once, so nothing downstream — the
  // preview, the placement render, the exported PDF — depends on that URL still
  // resolving. A host with no CORS header taints the canvas and throws; that is
  // simply "no mark available", not an error worth showing anyone.
  useEffect(() => {
    if (!orgMarkUrl) {
      setOrgLogo(null)
      return
    }
    let cancelled = false
    imageUrlToDataUrl(orgMarkUrl)
      .then((dataUrl) => {
        if (!cancelled) setOrgLogo(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setOrgLogo(null)
      })
    return () => {
      cancelled = true
    }
  }, [orgMarkUrl])

  // Escape closes the enlarged code first, not the whole dialog underneath it —
  // the modal has its own handler for that, and both listeners see the keypress.
  useEffect(() => {
    if (!open || enlarged) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, enlarged, setOpen])

  // Live preview, debounced. `cancelled` guards the async gap: a fast typist
  // can start several renders, and without it the slowest one wins.
  useEffect(() => {
    if (!open || !data) {
      setPreview(null)
      setRendering(false)
      return
    }
    let cancelled = false
    setRendering(true)
    const timer = window.setTimeout(() => {
      renderQrPng(design, PREVIEW_SIZE * 2)
        .then((png) => {
          if (cancelled) return
          setPreview(png)
          setError(null)
        })
        .catch((e: Error) => {
          if (cancelled) return
          setPreview(null)
          setError(e.message || 'Could not draw that code.')
        })
        .finally(() => {
          if (!cancelled) setRendering(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, data, design])

  if (!open) return null

  function applyPreset(preset: QrPreset) {
    setBase((d) => ({ ...d, ...preset.patch }))
    setPresetName(preset.name)
  }

  /** Take a design in from elsewhere — a code saved next door in Universal QR.
   *
   *  Restored whole, so what lands on the page is the code the user designed
   *  next door rather than an approximation of it. Its logo comes in through
   *  the branding switch instead of the base design: a design that already
   *  carries a brand mark IS a branded design, so the switch flips on showing
   *  that mark, and turning it off is how you take it back off again. Without
   *  this the overlay would strip an imported logo on arrival. */
  function adoptDesign(incoming: QrDesign) {
    setBase(incoming)
    setPresetName(null)
    setError(null)
    if (incoming.logoDataUrl) {
      setBranded(true)
      setBrandTouched(true)
      setBrandLogo(incoming.logoDataUrl)
      setBrandColor(incoming.matchCornerColor ? null : incoming.cornerColor)
    }
  }

  /** The editor state to hang on the annotation, so this code can be edited
   *  again once it is on the page. Branding stays an overlay here rather than
   *  being folded into the design — see `QrPlacement`. */
  function placement(): QrPlacement {
    return {
      base,
      branding: branded ? { logo: brandLogo, color: brandColor } : null,
      presetName
    }
  }

  /** Bring in a code saved to the account. With its design sidecar it adopts
   *  like a local save; a PNG-only legacy save has nothing to edit, so it goes
   *  straight to the page as a plain image instead (these entries are hidden
   *  in edit mode — a flat image can't replace an editable placed code). */
  function applyHostedEntry(entry: HostedQrDesign) {
    if (entry.design) {
      adoptDesign(entry.design)
    } else if (entry.png) {
      setUploadedImageSrc(entry.png)
      setTool('image')
      setOpen(false)
    }
  }

  /** Render at placement resolution and arm it for click-to-place. */
  async function addToPage() {
    if (!data) return
    setAdding(true)
    try {
      const png = await renderQrPng(design, PLACEMENT_SIZE)
      setUploadedImageSrc(png, placement())
      setTool('image')
      setOpen(false)
    } catch (err) {
      setError((err as Error).message || 'Could not draw that code.')
    } finally {
      setAdding(false)
    }
  }

  /** Re-render the code being edited and write it back to its annotation,
   *  leaving the box exactly where and how big it was — the point of editing a
   *  placed code is that it stays placed. (A QR renders square, so the aspect
   *  can't shift under a changed style either.) */
  async function saveEdit() {
    if (!data || !qrEdit) return
    const target = useAnnotationStore.getState().annotations.find((a) => a.id === qrEdit.id)
    if (!target || target.type !== 'image') {
      // Undone or deleted while the dialog was up. Say so rather than writing a
      // patch into nothing and closing as if it had worked.
      setError('That code is no longer on the page — close this and add a new one.')
      return
    }
    setAdding(true)
    try {
      const png = await renderQrPng(design, PLACEMENT_SIZE)
      updateAnnotation(qrEdit.id, { src: png, qr: placement() } as Partial<Annotation>)
      setOpen(false)
    } catch (err) {
      setError((err as Error).message || 'Could not draw that code.')
    } finally {
      setAdding(false)
    }
  }

  /** Save the code as a PNG — the same 1024 px render "Add to page" places. */
  async function download() {
    if (!data || downloading) return
    setDownloading(true)
    try {
      await downloadQrPng(design)
    } catch (err) {
      setError((err as Error).message || 'Could not save that code.')
    } finally {
      setDownloading(false)
    }
  }

  async function copy() {
    if (!data) return
    const ok = await copyQrPngToClipboard(design)
    setCopied(ok ? 'ok' : 'fail')
    window.setTimeout(() => setCopied('idle'), 1800)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {qrEdit ? 'Edit this QR code' : 'Add a QR code'}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 pb-5 flex flex-col sm:flex-row gap-5">
          {/* Preview — click it to enlarge for scanning, as in Universal QR. */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className={`group relative rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden ${
                preview ? 'cursor-zoom-in' : ''
              }`}
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              onClick={() => preview && setEnlarged(true)}
              role={preview ? 'button' : undefined}
              tabIndex={preview ? 0 : undefined}
              aria-label={preview ? 'Enlarge QR code for scanning' : undefined}
              onKeyDown={(e) => {
                if (preview && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setEnlarged(true)
                }
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="QR code preview"
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                  className={`w-full h-full object-contain transition-opacity ${rendering ? 'opacity-60' : ''}`}
                />
              ) : (
                <span className="text-xs text-slate-400 px-6 text-center">
                  {data ? 'Drawing…' : 'Enter a link or some text to see the code'}
                </span>
              )}

              {preview && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/70 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md">
                    <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
                      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M10.5 10.5 L14 14 M7 5 V9 M5 7 H9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    Tap to enlarge
                  </span>
                </div>
              )}
            </div>
            {data && (
              <div className="text-xs text-slate-500 max-w-[224px] truncate" title={design.data}>
                {qrDisplayName(design)}
              </div>
            )}

            {/* Taking the code away with you — the page isn't the only place a
                generated QR is wanted, and re-drawing it next door in Universal
                QR just to save a PNG is a silly round trip. */}
            <div className="flex flex-col gap-1.5 w-[224px]">
              <button
                type="button"
                onClick={download}
                disabled={!data || downloading}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:border-orange-400 hover:bg-orange-50/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M4 16h12" />
                </svg>
                {downloading ? 'Preparing…' : 'Download PNG'}
              </button>
              <button
                type="button"
                onClick={copy}
                disabled={!data}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:border-orange-400 hover:bg-orange-50/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {copied === 'ok'
                  ? '✓ Copied to clipboard'
                  : copied === 'fail'
                    ? 'Copy not supported — use Download'
                    : 'Copy PNG to clipboard'}
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div>
              <label htmlFor="qr-data" className="block text-sm font-medium text-slate-700 mb-1">
                Link or text
              </label>
              <input
                id="qr-data"
                autoFocus
                value={design.data}
                onChange={(e) => setBase((d) => ({ ...d, data: e.target.value }))}
                placeholder="https://example.com"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <div className="block text-sm font-medium text-slate-700 mb-1.5">Style</div>
              {/* Two up on a phone — three columns truncates every name to
                  "Cla…", which is worse than one more row of scroll. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    title={`${preset.name} — ${preset.shape.toLowerCase()}`}
                    className={`border-2 rounded-lg px-2 py-2 flex items-center gap-2 transition-colors ${
                      presetName === preset.name
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <PresetGlyph preset={preset} />
                    <span className="min-w-0 text-left">
                      <span className="block text-xs font-medium text-slate-700 truncate">{preset.name}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{preset.shape}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* The full studio next door, for anything this simplified dialog
                can't do. Centred on its own line, just above the branding. */}
            <a
              href={UNIVERSAL_QR_URL}
              target="_blank"
              rel="noreferrer"
              className="self-center text-xs text-orange-700 hover:text-orange-800 underline-offset-2 hover:underline"
            >
              Design one in Universal QR ↗
            </a>

            <QrBrandingPanel
              on={branded}
              onToggle={setBranded}
              logo={brandLogo}
              onLogo={(v) => {
                setBrandTouched(true)
                setBrandLogo(v)
              }}
              color={brandColor}
              onColor={(v) => {
                setBrandTouched(true)
                setBrandColor(v)
              }}
              orgName={org?.name ?? null}
              orgLogo={orgLogo}
              orgColor={orgColor}
              colorRejected={branded && colorRejected}
              onError={setError}
            />

            {issue && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {issue.kind === 'inverted'
                  ? 'These colours make an inverted code (light on dark). Some scanners refuse those — try a preset.'
                  : `Low contrast on the ${issue.where} (${issue.ratio.toFixed(1)}:1). It may scan on screen and fail in print — try a preset.`}
              </p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>

        {/* Your Universal QR codes — this browser's saves plus the ones backed
            up to the signed-in account next door in Universal QR. Only for a
            signed-in user who actually has codes; for everyone else the
            "Design one" link above the branding panel is the whole story.
            Account chips carry a small cloud mark; an account save whose
            design matches a local one is shown once (the local copy wins —
            it needed no download). */}
        {signedIn && (saved.length > 0 || hosted.length > 0) && (() => {
          const accountEntries = hosted
            .filter((e) => !qrEdit || e.design) // flat PNGs can't update a placed code
            .filter(
              (e) =>
                !e.design ||
                !saved.some((s) => s.design.data === e.design!.data && (s.name || '') === (e.name || ''))
            )
          if (saved.length === 0 && accountEntries.length === 0) return null
          return (
            <div className="px-6 pb-5 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Your Universal QR codes
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {saved.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => adoptDesign(entry.design)}
                    title={`${entry.name || 'Saved code'} — ${entry.design.data}`}
                    className="shrink-0 w-20 border-2 border-slate-200 rounded-lg p-1.5 hover:border-orange-400 hover:bg-slate-50 transition-colors"
                  >
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt="" className="w-full aspect-square object-contain" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-100 rounded" />
                    )}
                    <span className="block mt-1 text-[10px] text-slate-500 truncate">
                      {entry.name || qrDisplayName(entry.design)}
                    </span>
                  </button>
                ))}
                {accountEntries.map((entry) => (
                  <button
                    key={`hosted-${entry.id}`}
                    type="button"
                    onClick={() => applyHostedEntry(entry)}
                    title={
                      entry.design
                        ? `${entry.name || 'Saved code'} — ${entry.design.data} (saved to your account)`
                        : `${entry.name || 'Saved code'} — saved to your account (places as an image)`
                    }
                    className="relative shrink-0 w-20 border-2 border-slate-200 rounded-lg p-1.5 hover:border-orange-400 hover:bg-slate-50 transition-colors"
                  >
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt="" className="w-full aspect-square object-contain" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-100 rounded" />
                    )}
                    <svg
                      viewBox="0 0 20 20"
                      className="absolute top-1 right-1 w-3.5 h-3.5 text-slate-400"
                      fill="currentColor"
                      aria-label="Saved to your account"
                    >
                      <path d="M14.5 8.1a4.5 4.5 0 0 0-8.8-.9A3.5 3.5 0 0 0 6 14h8a3 3 0 0 0 .5-5.9z" />
                    </svg>
                    <span className="block mt-1 text-[10px] text-slate-500 truncate">
                      {entry.name || (entry.design ? qrDisplayName(entry.design) : 'Saved code')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {qrEdit
              ? 'The code on the page is replaced where it sits.'
              : 'Then click the page to place it.'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={qrEdit ? saveEdit : addToPage}
              disabled={!data || adding}
              className="px-4 py-2 text-sm font-medium rounded-md bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {qrEdit
                ? adding
                  ? 'Updating…'
                  : 'Update code'
                : adding
                  ? 'Adding…'
                  : 'Add to page'}
            </button>
          </div>
        </div>
      </div>

      {enlarged && (
        <QrEnlargeModal design={design} initialPng={preview} onClose={() => setEnlarged(false)} />
      )}
    </div>
  )
}
