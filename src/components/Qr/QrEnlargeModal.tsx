import { useEffect, useState } from 'react'
import { qrDisplayName, type QrDesign } from '@unisim/qr'
import { renderQrPng } from '../../lib/qr/render'

// The 224 px preview in the dialog is there to show you what the code LOOKS
// like; this is for scanning it. Same shape as Universal QR's EnlargeModal —
// dark backdrop, the code as big as the screen allows, and the two hints that
// fix most failed scans.
const ENLARGE_SIZE = 900

export default function QrEnlargeModal({
  design,
  initialPng,
  onClose
}: {
  design: QrDesign
  /** Whatever the dialog last drew, shown upscaled until the sharp render
   *  arrives — a blank white card for a few hundred ms reads as a broken modal,
   *  and a soft QR still scans. It is the preview the user was just looking at,
   *  so mid-edit it can be a keystroke behind `design`; the effect below
   *  replaces it either way. */
  initialPng: string | null
  onClose: () => void
}) {
  const [png, setPng] = useState<string | null>(initialPng)

  useEffect(() => {
    let cancelled = false
    renderQrPng(design, ENLARGE_SIZE)
      .then((sharp) => {
        if (!cancelled) setPng(sharp)
      })
      .catch(() => {
        /* keep the preview render — it is the same code, just softer */
      })
    return () => {
      cancelled = true
    }
  }, [design])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shaped = design.frameShape !== 'square'

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-slate-900/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Enlarged QR code for ${qrDisplayName(design)}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        // ⚠️ `top` clears the notch: this overlay is positioned against the
        // VIEWPORT, so it escapes the app root's safe-area padding and a flat
        // top-4 put the only way out under the Dynamic Island.
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl leading-none text-white hover:bg-white/25"
      >
        ×
      </button>

      {/* Dismiss hints down each side — the whole backdrop is clickable. */}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium tracking-wide text-white/60 sm:left-6">
        Click to dismiss
      </span>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium tracking-wide text-white/60 sm:right-6">
        Click to dismiss
      </span>

      {/* Clicks on the code itself don't close it, so a phone held against the
          screen doesn't dismiss what it came to scan. A shaped plate is drawn on
          transparency, so it gets white behind it rather than its own colour. */}
      <div
        className="relative w-full max-w-[min(88vw,70vh)] rounded-2xl p-4 shadow-lg ring-1 ring-slate-200"
        style={{ background: design.bgTransparent || shaped ? '#ffffff' : design.bgColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-square leading-[0]">
          {png && (
            <img
              src={png}
              alt={`QR code for ${qrDisplayName(design)}`}
              className="block h-full w-full object-contain"
            />
          )}
        </div>
      </div>

      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-white">Point another phone's camera at this code</p>
        <p className="mt-1 text-xs text-white/70">
          Struggling? Turn your screen brightness up to max, and make sure the camera isn't in
          close-up (macro) mode — pull back a little so the whole code is in frame.
        </p>
      </div>
    </div>
  )
}
