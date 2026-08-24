/**
 * The drop circle's backdrop on phones — a page being filled in and signed,
 * drawn as a watermark rather than a picture.
 *
 * ⚠️ This exists because PdfIllustration CANNOT be reused here, and the reason
 * is worth keeping: that artwork is a WHITE page with a dark header bar, built
 * to sit on the light page background as a solid object. Put behind the white
 * card at low opacity it disappears entirely, and turned up all that appears is
 * its one dark element — a stray grey arc across the top of the ring. Tried at
 * 25%, 30% and 70%; none of them read as anything.
 *
 * So this is stroke-only. No fills at all: every mark is a thin line, which is
 * what survives being knocked back to a fraction of full opacity on white. It
 * is also drawn deliberately SPARSE through the middle, because the ring's own
 * copy ("Drop a PDF here") sits on top of it and has to stay the first thing
 * read — the page outline passes behind the text, the busy strokes do not.
 *
 * Pure CSS, no rAF clock. PdfIllustration drives a JS clock because it reacts
 * to hover; nothing here reacts to anything, so a keyframe loop costs less and
 * cannot leak a timer.
 */

/** One full pass: draw the page, fill it in, sign it, hold, fade, repeat. */
const LOOP_MS = 9000

// ⚠️ Every animated path carries pathLength={100}, so each dash value below is
// a PERCENTAGE of that stroke rather than a measured length. Without it every
// number here would have to be re-derived whenever a curve is nudged, and a
// wrong one does not error — it just stops the stroke mid-draw.
const CSS = `
  .dw-page, .dw-fold, .dw-line, .dw-sig {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation-duration: ${LOOP_MS}ms;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }
  @keyframes dw-draw {
    0%           { stroke-dashoffset: 100; opacity: 0; }
    4%           { opacity: 1; }
    22%, 82%     { stroke-dashoffset: 0; opacity: 1; }
    94%, 100%    { stroke-dashoffset: 0; opacity: 0; }
  }
  /* Each element gets the same keyframes on a later delay, so the page draws,
     then its lines, then the signature — one gesture, not five at once. */
  .dw-page { animation-name: dw-draw; animation-delay: 0ms; }
  .dw-fold { animation-name: dw-draw; animation-delay: 500ms; }
  .dw-line-1 { animation-name: dw-draw; animation-delay: 900ms; }
  .dw-line-2 { animation-name: dw-draw; animation-delay: 1150ms; }
  .dw-line-3 { animation-name: dw-draw; animation-delay: 1400ms; }
  .dw-sig    { animation-name: dw-draw; animation-delay: 2300ms; }

  /* ⚠️ Reduced motion gets the FINISHED page, not a slower loop and not frame
     0 — frame 0 is a blank rectangle, the least useful still of the set. Same
     rule PdfIllustration follows. */
  @media (prefers-reduced-motion: reduce) {
    .dw-page, .dw-fold, .dw-line, .dw-sig {
      animation: none;
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }
`

const INK = '#94a3b8'    // slate-400 — the page and its text
const ACCENT = '#f97316' // orange-500 — the signature and the tick

export default function DropRingWatermark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true" focusable="false">
      <style>{CSS}</style>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* The page: drawn as one open path from the fold so it draws in a
            single continuous gesture rather than four sides appearing at once. */}
        <path
          className="dw-page"
          pathLength={100}
          d="M74 14 H36 a4 4 0 0 0-4 4 v84 a4 4 0 0 0 4 4 h48 a4 4 0 0 0 4-4 V28 Z"
          stroke={INK}
          strokeWidth="1.6"
        />
        <path className="dw-fold" pathLength={100} d="M74 14 v14 h14" stroke={INK} strokeWidth="1.6" />

        {/* Text lines. Short and unevenly ended, like real text — equal bars
            read as a placeholder, which is what this is trying not to be. Three
            of them, not four: the ring's own copy covers the lower band, so a
            fourth was a mark nobody would ever see crowding the signature. */}
        <path className="dw-line dw-line-1" pathLength={100} d="M42 44 H74" stroke={INK} strokeWidth="1.4" />
        <path className="dw-line dw-line-2" pathLength={100} d="M42 53 H78" stroke={INK} strokeWidth="1.4" />
        <path className="dw-line dw-line-3" pathLength={100} d="M42 62 H68" stroke={INK} strokeWidth="1.4" />

        {/* The signature — the one thing that makes this a PDF *editor* rather
            than a viewer, so it gets the accent colour and the longest draw. */}
        <path
          className="dw-sig"
          pathLength={100}
          d="M42 95 c5-7 9 5 14 0 s9-6 13 1 s7 4 11-2"
          stroke={ACCENT}
          strokeWidth="2"
        />
      </g>
    </svg>
  )
}
