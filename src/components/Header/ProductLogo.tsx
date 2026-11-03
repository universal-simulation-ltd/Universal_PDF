// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Icon: Universal PDF's own icon (published beyond the web) — own-icons/pdf.svg
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.
// Static markup from the generator, never user input, hence the innerHTML.

const ICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\" width=\"24\" height=\"24\" aria-hidden=\"true\"><defs><clipPath id=\"uam-nav-pdf-tile\"><rect width=\"1024\" height=\"1024\" rx=\"224\"/></clipPath></defs><g clip-path=\"url(#uam-nav-pdf-tile)\"><defs>\n    <linearGradient id=\"uam-nav-pdf-bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3b7cf0\"/><stop offset=\"1\" stop-color=\"#173a94\"/></linearGradient>\n    <linearGradient id=\"uam-nav-pdf-cream\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fbf6ee\"/><stop offset=\"1\" stop-color=\"#d9cbb6\"/></linearGradient>\n    <linearGradient id=\"uam-nav-pdf-orange\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fe8c01\"/><stop offset=\"1\" stop-color=\"#e05504\"/></linearGradient>\n  </defs>\n  <rect x=\"-340\" y=\"-340\" width=\"1704\" height=\"1704\" fill=\"url(#uam-nav-pdf-bg)\"/>\n  <g transform=\"rotate(-8 512 600)\">\n    <path d=\"M150 130H680L900 350V1500H150Z\" fill=\"#000\" fill-opacity=\"0.25\" transform=\"translate(14 20)\"/>\n    <path d=\"M150 130H680L900 350V1500H150Z\" fill=\"url(#uam-nav-pdf-cream)\"/>\n    <path d=\"M680 130V350H900Z\" fill=\"#c4b192\"/>\n    <path d=\"M680 350H900L872 378H708Z\" fill=\"#000\" fill-opacity=\"0.07\"/>\n    <rect x=\"216\" y=\"620\" width=\"660\" height=\"100\" rx=\"14\" fill=\"url(#uam-nav-pdf-orange)\" fill-opacity=\"0.92\" transform=\"rotate(-1.4 540 670)\"/>\n    <rect x=\"240\" y=\"404\" width=\"560\" height=\"52\" rx=\"26\" fill=\"#173a94\" fill-opacity=\"0.24\"/>\n    <rect x=\"240\" y=\"524\" width=\"470\" height=\"52\" rx=\"26\" fill=\"#173a94\" fill-opacity=\"0.24\"/>\n    <rect x=\"240\" y=\"644\" width=\"600\" height=\"52\" rx=\"26\" fill=\"#173a94\" fill-opacity=\"0.55\"/>\n    <rect x=\"240\" y=\"764\" width=\"420\" height=\"52\" rx=\"26\" fill=\"#173a94\" fill-opacity=\"0.24\"/>\n    <rect x=\"240\" y=\"884\" width=\"540\" height=\"52\" rx=\"26\" fill=\"#173a94\" fill-opacity=\"0.24\"/>\n  </g></g></svg>"

export default function ProductLogo() {
  return (
    <span
      className="uam-host-pdf inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON }}
    />
  )
}
