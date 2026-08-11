import { useEffect, useRef } from 'react'

/** One sweep of the loop, frame 0 → frame 10, in ms. It runs straight back down. */
const SWEEP_MS = 4600
/** The glide back to frame 0 when the pointer arrives. */
const RETURN_MS = 480

/** Ease in and out. Used on the clock, and again per element inside the CSS. */
const smoothstep = (x: number) => x * x * (3 - 2 * x)

/**
 * Its exact inverse — needed when the pointer leaves mid-glide. The clock is
 * the thing that keeps running, so resuming means asking "which clock position
 * shows the frame currently on screen?"; without it the illustration snaps.
 */
const unSmoothstep = (y: number) => 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3)

/**
 * The signature stroke, written once and drawn three times — the ink, and the
 * two dots that ride its leading edge. They have to be the same path, or the
 * nib drifts off the line it is supposed to be drawing.
 *
 * ⚠️ All three carry `pathLength={100}`, so every dash number in the CSS is a
 * PERCENTAGE of the stroke rather than a guess at its length. The guess was
 * wrong: the ink was dashed against 360 units and the curve is 187, so the
 * signature finished at 52% of its window and then sat there — and a nib
 * offset against 360 would have been parked past the end of the path, drawing
 * nothing at all. Normalising also means the curve can be redrawn without
 * anything here needing to know.
 */
const SIGNATURE_D =
  'M92 506 C 108 488, 122 522, 138 502 S 168 488, 184 506 S 214 520, 232 498 L 252 504'

/**
 * The same curve with its start moved to the origin — what the pen rides.
 *
 * `offset-path` needs the path in the element's OWN coordinate system, and the
 * pen hangs inside a `translate(92 506)` group so that a browser without motion
 * path support still puts it somewhere sensible: parked at the start of the
 * signature, pen in hand, rather than dumped at the top-left corner of the SVG.
 * That fallback is the whole reason for the wrapper.
 */
const SIGNATURE_D_LOCAL =
  'M0 0 C 16 -18, 30 16, 46 -4 S 76 -18, 92 0 S 122 14, 140 -8 L 160 -2'

/**
 * The landing illustration: a document that writes itself, charts itself, is
 * signed by a pen that flies in for the job, gets ticked and stamped APPROVED,
 * then unwinds and does it again.
 *
 * ONE CLOCK, NOT NINE ANIMATIONS
 * ------------------------------
 * Everything on the page is a window on a single `--t`, 0 → 1, set here and
 * read by `index.css`. It used to be nine separate `@keyframes`/transitions
 * fired by `:hover`, and that shape cannot do what this needs: an element part
 * way through a `@keyframes` cannot be told to go back to its own first frame —
 * `animation-play-state: paused` freezes it wherever it stands, and removing
 * the animation snaps it. With one number, "return to frame 0" is one glide.
 *
 * WHY HOVER STOPS IT RATHER THAN STARTING IT
 * ------------------------------------------
 * This sits beside the drop circle, so the pointer arriving means the user is
 * reading or aiming, and a picture that keeps moving under the cursor competes
 * with the thing they came to click. It settles on frame 0 and stays there.
 */
export default function PdfIllustration() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (t: number) => el.style.setProperty('--t', t.toFixed(4))

    // ⚠️ Reduced motion gets the FINISHED frame, not frame 0 and not a slower
    // loop. An infinite animation has no honest "reduced" version, and frame 0
    // is a blank document — the least useful still of the set.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(1)
      return
    }

    let raf = 0
    let clock = 0 // 0 → 2. 0–1 draws the document, 1–2 undraws it.
    let shown = 0 // the eased value last written, so a mid-glide exit can resume from it
    let last = 0
    let hovering = false
    let from = 0 // where the glide back to frame 0 started
    let since = 0 // ms into that glide

    function frame(now: number) {
      // A backgrounded tab stops firing rAF entirely; the first frame back
      // would otherwise carry the whole gap and jump the loop forward.
      const dt = Math.min(now - last, 100)
      last = now

      if (hovering) {
        since += dt
        shown = from * (1 - smoothstep(Math.min(since / RETURN_MS, 1)))
        set(shown)
        // Parked on frame 0 — stop asking for frames until the pointer leaves.
        if (since >= RETURN_MS) {
          raf = 0
          return
        }
      } else {
        clock = (clock + dt / SWEEP_MS) % 2
        shown = smoothstep(clock <= 1 ? clock : 2 - clock)
        set(shown)
      }
      raf = requestAnimationFrame(frame)
    }

    function start() {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    function onEnter() {
      if (hovering) return
      hovering = true
      from = shown
      since = 0
      start()
    }

    function onLeave() {
      if (!hovering) return
      hovering = false
      // Pick up the clock wherever the glide left the picture, on the way up.
      clock = unSmoothstep(Math.min(Math.max(shown, 0), 1))
      start()
    }

    // Only on a real pointer. On a touch screen `pointerenter` fires on a tap
    // and there is no matching leave, which would park the loop for good.
    const canHover = window.matchMedia('(hover: hover)').matches
    if (canHover) {
      el.addEventListener('pointerenter', onEnter)
      el.addEventListener('pointerleave', onLeave)
    }
    start()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (canHover) {
        el.removeEventListener('pointerenter', onEnter)
        el.removeEventListener('pointerleave', onLeave)
      }
    }
  }, [])

  return (
    <div ref={ref} className="pdf-illu group relative w-full max-w-[480px] aspect-[5/6] select-none">
      <svg
        viewBox="0 0 500 600"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="page-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>
          <linearGradient id="img-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
          <linearGradient id="bar-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
          <filter id="page-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="14" stdDeviation="18" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.15" />
          </filter>
          <radialGradient id="halo-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.75" />
            <stop offset="45%" stopColor="#fb923c" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The warm ground the page sits on, growing with it. It fills the box:
            the page covers everything from x 60 to 440, so a halo any smaller
            than this only ever shows under the drop shadow, which is exactly
            where it cannot be seen. */}
        <ellipse className="pdf-halo" cx="250" cy="300" rx="250" ry="300" fill="url(#halo-grad)" />

        {/* Back sheet (peeking) */}
        <g className="pdf-back">
          <rect x="80" y="58" width="360" height="500" rx="14" fill="#ffffff" opacity="0.7" filter="url(#page-shadow)" />
        </g>

        {/* Main page */}
        <g className="pdf-page" style={{ transformOrigin: '250px 320px' }}>
          <rect x="60" y="40" width="380" height="520" rx="16" fill="url(#page-grad)" stroke="#e2e8f0" strokeWidth="1" filter="url(#page-shadow)" />

          {/* Header band */}
          <rect x="60" y="40" width="380" height="56" rx="16" fill="#0f172a" />
          <rect x="60" y="80" width="380" height="16" fill="#0f172a" />
          <circle cx="92" cy="68" r="12" fill="#fb923c" />
          <rect x="116" y="60" width="120" height="8" rx="3" fill="#fdba74" opacity="0.9" />
          <rect x="116" y="74" width="80" height="6" rx="3" fill="#fb923c" opacity="0.7" />

          {/* Title */}
          <rect className="pdf-line line-1" x="84" y="120" width="220" height="14" rx="4" fill="#0f172a" />
          <rect className="pdf-line line-2" x="84" y="146" width="160" height="8" rx="3" fill="#cbd5e1" />

          {/* Text block */}
          <g className="pdf-text">
            <rect className="pdf-line line-3" x="84" y="178" width="332" height="6" rx="3" fill="#e2e8f0" />
            <rect className="pdf-line line-4" x="84" y="194" width="316" height="6" rx="3" fill="#e2e8f0" />
            <rect className="pdf-line line-5" x="84" y="210" width="290" height="6" rx="3" fill="#e2e8f0" />
            <rect className="pdf-line line-6" x="84" y="226" width="260" height="6" rx="3" fill="#e2e8f0" />
          </g>

          {/* Image / chart card */}
          <g className="pdf-image" filter="url(#soft-shadow)">
            <rect x="84" y="256" width="332" height="150" rx="10" fill="url(#img-grad)" />
            <circle cx="138" cy="296" r="20" fill="#ffffff" opacity="0.7" />
            <path d="M84 376 L160 332 L210 360 L280 308 L340 348 L416 320 L416 406 L84 406 Z" fill="#ffffff" opacity="0.35" />
            <path d="M84 376 L160 332 L210 360 L280 308 L340 348 L416 320" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />

            {/* Mini bars, drawn part way through the sweep */}
            <g className="pdf-bars">
              <rect className="bar b1" x="106" y="380" width="14" height="18" rx="2" fill="url(#bar-grad)" />
              <rect className="bar b2" x="146" y="370" width="14" height="28" rx="2" fill="url(#bar-grad)" />
              <rect className="bar b3" x="186" y="360" width="14" height="38" rx="2" fill="url(#bar-grad)" />
              <rect className="bar b4" x="226" y="350" width="14" height="48" rx="2" fill="url(#bar-grad)" />
              <rect className="bar b5" x="266" y="340" width="14" height="58" rx="2" fill="url(#bar-grad)" />
            </g>
          </g>

          {/* Caption lines */}
          <rect className="pdf-line line-7" x="84" y="424" width="200" height="6" rx="3" fill="#e2e8f0" />
          <rect className="pdf-line line-8" x="84" y="440" width="280" height="6" rx="3" fill="#e2e8f0" />
          <rect className="pdf-line line-9" x="84" y="456" width="230" height="6" rx="3" fill="#e2e8f0" />

          {/* Signature line */}
          <line x1="84" y1="514" x2="260" y2="514" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 4" />
          <text x="84" y="530" fontSize="9" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Signature</text>

          {/* Animated signature stroke */}
          <path
            className="pdf-signature"
            d={SIGNATURE_D}
            pathLength={100}
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* The nib writing it: a bright dot with a soft one behind, both
              pinned to the ink's leading edge by the same dash arithmetic. */}
          <g className="pdf-nib-in">
            <g className="pdf-nib-out">
              <path className="pdf-nib-glow" d={SIGNATURE_D} pathLength={100} fill="none" stroke="#fb923c" strokeOpacity="0.35" strokeWidth="16" strokeLinecap="round" />
              <path className="pdf-nib" d={SIGNATURE_D} pathLength={100} fill="none" stroke="#f97316" strokeWidth="7" strokeLinecap="round" />
            </g>
          </g>

          {/* The pen that does the writing. It flies in from off to the right,
              rides the same curve the ink is drawn along, and leaves again.

              The tip is the group's own origin, which is why the wrapper below
              translates to the start of the signature: `offset-anchor` defaults
              to `transform-origin`, and with `transform-box: view-box` that is
              local 0,0 — so the tip, not the middle of the pen, is what sits on
              the path. `offset-rotate: 0deg` keeps it upright; following the
              tangent of a signature makes it cartwheel. */}
          <g transform="translate(92 506)">
            <g className="pdf-pen-in">
              <g className="pdf-pen-out">
                {/* `offset-path` is set here rather than in `index.css` so the
                    curve exists exactly once in the source. The window it moves
                    over, and everything else about it, is still in the
                    stylesheet with the rest of the sweep. */}
                <g className="pdf-pen-ride" style={{ offsetPath: `path("${SIGNATURE_D_LOCAL}")` }}>
                  <g transform="rotate(40)">
                    {/* Drawn pointing straight up from the tip at 0,0 and
                        rotated once, rather than every point being worked out
                        along a diagonal. */}
                    <path d="M0 0 L-4.5 -15 L4.5 -15 Z" fill="#1e293b" />
                    <rect x="-5.5" y="-21" width="11" height="6" fill="#cbd5e1" />
                    <rect x="-6" y="-56" width="12" height="35" rx="2.5" fill="#ea580c" />
                    <rect x="-6" y="-56" width="4.5" height="35" rx="2" fill="#fb923c" opacity="0.6" />
                    <rect x="-4.5" y="-64" width="9" height="9" rx="3" fill="#1e293b" />
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* APPROVED, slammed across the middle of the page — the last beat of
              the sweep and the only thing that overlaps the document's own
              content, which is what a real stamp does. */}
          <g className="pdf-stamp">
            <rect x="112" y="292" width="276" height="80" rx="10" fill="none" stroke="#059669" strokeWidth="5" />
            <rect x="122" y="302" width="256" height="60" rx="6" fill="none" stroke="#059669" strokeWidth="1.5" opacity="0.6" />
            <text
              x="250"
              y="345"
              textAnchor="middle"
              fontSize="38"
              fontWeight="800"
              letterSpacing="4"
              fill="#059669"
              fontFamily="ui-sans-serif, system-ui"
            >
              APPROVED
            </text>
          </g>

          {/* Tick stamp, and the ring it throws off as it lands */}
          <g className="pdf-tick-ring" style={{ transformOrigin: '380px 510px' }}>
            <circle cx="380" cy="510" r="22" fill="none" stroke="#10b981" strokeWidth="3" />
          </g>
          <g className="pdf-tick" style={{ transformOrigin: '380px 510px' }}>
            <circle cx="380" cy="510" r="22" fill="#ecfdf5" stroke="#10b981" strokeWidth="2" />
            <path d="M370 510 L378 518 L392 502" stroke="#10b981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>

        {/* Floating emoji-style reactions */}
        <g className="pdf-reactions" aria-hidden="true">
          <g className="react r1">
            <circle cx="56" cy="160" r="18" fill="#ffffff" filter="url(#soft-shadow)" />
            <text x="56" y="166" textAnchor="middle" fontSize="18">✏️</text>
          </g>
          <g className="react r2">
            <circle cx="450" cy="240" r="18" fill="#ffffff" filter="url(#soft-shadow)" />
            <text x="450" y="246" textAnchor="middle" fontSize="18">🖼️</text>
          </g>
          <g className="react r3">
            <circle cx="64" cy="430" r="18" fill="#ffffff" filter="url(#soft-shadow)" />
            <text x="64" y="436" textAnchor="middle" fontSize="18">✍️</text>
          </g>
        </g>

      </svg>
    </div>
  )
}
