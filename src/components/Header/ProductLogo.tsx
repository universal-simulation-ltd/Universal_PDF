// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Mark: Universal PDF — A page with a folded corner, named.
// Hover: The folded corner lifts.
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.

const CSS = `
  /* Resting states */
  .uam-pdf-fold { transform: scale(0.55); transform-origin: 38px 6px; transition: transform .5s cubic-bezier(0.16,1,0.3,1); transform-box: fill-box; }

  /* Active states */
  .uam-host-pdf:hover .uam-pdf-fold,
  .uam-host-pdf:focus-visible .uam-pdf-fold { transform: scale(1); }

  @media (prefers-reduced-motion: reduce) {
    .uam-pdf-fold { transition: none !important; }
  }
`

export default function ProductLogo() {
  return (
    <span
      className="uam-host-pdf inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
        <defs>
          <linearGradient id="uam-nav-pdf-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fe8c01" />
            <stop offset="1" stopColor="#e05504" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#uam-nav-pdf-tile)" />
        <polygon points="10,6 38,6 38,22 54,22 54,58 10,58" fill="#ffffff" />
        <polygon points="38,6 54,22 38,22" fill="#fdba74" className="uam-pdf-fold" />
        <text x={32} y={50} textAnchor="middle" fontFamily="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fontSize={17} fontWeight={900} letterSpacing={1} fill="#e05504">PDF</text>
      </svg>
    </span>
  )
}
