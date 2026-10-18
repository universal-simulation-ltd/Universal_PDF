// The phone screens' icons: one-path line drawings from the boards, drawn at
// 24×24 with a round 2px stroke. `Icon` takes the path; the named paths below
// are the ones more than one screen uses.

export const PATHS = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8h8v8H8z',
  example: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  compress: 'M12 3v7M9 7l3 3 3-3M12 21v-7M9 17l3-3 3 3M4 12h16',
  sign: 'M3 17c3-1 4-9 7-9s1 7 4 7 3-5 5-5M3 21h18',
  send: 'M4 12l16-8-6 16-3-7zM11 13l9-9',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  form: 'M4 5h16v6H4zM4 15h16v4H4zM8 7v2',
  merge: 'M5 4h6v8H5zM13 4h6v8h-6zM12 14v6M9 17l3 3 3-3',
  blackout: 'M3 9h18v6H3z',
  pages: 'M8 3h10v14H8zM5 7v14h10',
  photos: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  compare: 'M4 4h7v16H4zM13 4h7v16h-7z',
  markup: 'M15 4l5 5-9 9H6v-5zM4 20h8',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  tune: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  // Fill: a form's labelled box with a typing cursor in it — typing INTO the
  // boxes, not writing on the page (James, 2026-10-18; it was a pencil, which
  // read as Mark up's pen).
  fill: 'M3 4.5h8M5 8h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8 10.5v6M6.5 10.5h3M6.5 16.5h3',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  chevron: 'M9 5l7 7-7 7',
  help: 'M12 18h.01M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5',
  images: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  rename: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
  close: 'M6 6l12 12M18 6L6 18',
  tick: 'M5 13l4 4 10-10',
  never: 'M5 5l14 14M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  put: 'M3 7h18M5 7l1 13h12l1-13M9 11v5M15 11v5',
} as const

export function Icon({
  d,
  size = 22,
  stroke = 'currentColor',
  width = 2,
  className,
}: {
  d: string
  size?: number
  stroke?: string
  width?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}

/** The three-dot "options" glyph, filled. */
export function Dots({ size = 20, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

/** The app's own mark: a cream page and the orange highlighter on cobalt. */
export function AppMark({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        background: '#2353c9',
        boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5)',
        position: 'relative',
        overflow: 'hidden',
        display: 'inline-block',
        flex: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: size * 0.23,
          top: size * 0.15,
          width: size * 0.58,
          height: size * 0.85,
          background: '#fbf6ee',
          transform: 'rotate(-8deg)',
          borderRadius: 1,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: size * 0.23,
          top: size * 0.5,
          width: size * 0.58,
          height: Math.max(2, size * 0.12),
          background: '#f97316',
          transform: 'rotate(-8deg)',
        }}
      />
    </span>
  )
}

/** A drawn signature squiggle, for the moments and the share page's page. */
export const SQUIGGLE = 'M14 78c14-4 18-58 34-58s2 52 16 52 14-38 28-38 2 26 16 26 18-30 30-30 6 28 22 28c12 0 22-10 34-20'
