// The desktop toolbar's Export button: a floppy disk with a download arrow
// through its label — "save this to your computer", which is what Export ends
// in. Strokes inherit `currentColor`.
export function SaveDiskIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* The disk, its top-right corner clipped like the real thing. */}
      <path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z" />
      {/* The shutter. */}
      <path d="M8 3v4h7V3" />
      {/* Download arrow in the label area. */}
      <path d="M12 10.5v6.5" />
      <path d="M9 14.5l3 3 3-3" />
    </svg>
  )
}
