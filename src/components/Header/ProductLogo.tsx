// Universal PDF brand icon — the click target the SuiteSwitcher dropdown
// attaches to inside <UniversalAppsNavBar />. Click navigates to the product
// home; hover opens the apps switcher.
//
// Icon-only by design: the navbar renders the product name ("Universal PDF")
// from its own apps catalogue right beside this logo, so adding the wordmark
// here would make the name appear twice. The href MUST be import.meta.env.BASE_URL
// (e.g. '/pdf/' in prod, '/' in dev, './' on desktop) — a bare '/' resolves to
// the origin root, which under path-routing is the opensource portal, not PDF.
export default function ProductLogo() {
  return (
    <a
      href={import.meta.env.BASE_URL}
      className="inline-flex items-center text-slate-900 no-underline p-0.5 rounded-md hover:bg-slate-50"
      aria-label="Universal PDF — home"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#ea580c" />
        <polygon points="4,2.5 14.5,2.5 14.5,8 20,8 20,21.5 4,21.5" fill="white" />
        <polygon points="14.5,2.5 20,8 14.5,8" fill="#fdba74" />
        <text x="12" y="18" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6" fontWeight="900" fill="#ea580c" letterSpacing="0.4">
          PDF
        </text>
      </svg>
    </a>
  )
}
