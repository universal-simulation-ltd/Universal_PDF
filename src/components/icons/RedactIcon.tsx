// The single source of truth for the "redact" visual: two faint text lines
// with a solid bar struck through the middle — the universal censor-bar cue.
// Used everywhere redaction is offered (Actions menu, the per-shape pill, the
// find bar, the export confirm dialog) so the metaphor never drifts. Both the
// lines and the bar inherit `currentColor`; the lines are dimmed so the bar
// reads as "this text is gone", and the whole glyph recolours on hover.
export function RedactIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="11" height="2" rx="1" opacity="0.35" />
      <rect x="3" y="10.5" width="18" height="4" rx="1" />
      <rect x="3" y="18" width="13" height="2" rx="1" opacity="0.35" />
    </svg>
  )
}
