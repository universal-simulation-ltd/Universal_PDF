// Universal PDF brand icon — icon-only by design. The SDK's UniversalAppsNavBar
// renders the product name ("Universal PDF") from the catalogue beside this
// slot, and wraps logo+name in a single home-link when App.tsx passes
// productHomeHref. So no anchor, no wordmark, just the icon.
export default function ProductLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#ea580c" />
      <polygon points="4,2.5 14.5,2.5 14.5,8 20,8 20,21.5 4,21.5" fill="white" />
      <polygon points="14.5,2.5 20,8 14.5,8" fill="#fdba74" />
      <text x="12" y="18" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6" fontWeight="900" fill="#ea580c" letterSpacing="0.4">
        PDF
      </text>
    </svg>
  )
}
