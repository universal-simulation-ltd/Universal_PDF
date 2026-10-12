import type { ReactNode } from 'react'

/**
 * The look of a tool in the toolbar, shared by the desktop bar, the phone's
 * bottom bar and the Sign button (2026-10-12, the "highlighter + blue" canvas).
 *
 * - The active tool is a cobalt chip with a white icon and a short orange
 *   highlighter stroke under it — the app icon's mark. It was an orange
 *   square, which is also what the red Export square looked like from across
 *   the room.
 * - A tool with a second menu shows a 7px triangle in its bottom-right corner
 *   (Photoshop's and Illustrator's mark), faint until the tool is picked, then
 *   white. It replaced grey "+" badges that read as "add" and made the bar
 *   busy. The menu opens as it always has: click the picked tool again,
 *   press and hold, or click the triangle itself.
 */

/** Classes for a picked tool's chip. Pair with `<ActiveStroke />` inside. */
export const ACTIVE_CHIP = 'bg-cobalt text-white'

/**
 * The highlighter stroke under a picked tool. The button it sits in needs
 * `relative`; the stroke hangs just below the button, so the bar must leave
 * 6px under its buttons (the desktop row has `py-2`).
 */
export function ActiveStroke({ className = 'left-[6px] right-[6px] -bottom-[6px] h-[5px]' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pdf-highlighter rounded-[2px_5px_3px_2px] -rotate-3 ${className}`}
      // Solid orange-500, as on the canvas: the headline's 75% stroke reads
      // brown on the dark slate bar.
      style={{ background: '#f97316' }}
    />
  )
}

/**
 * The corner triangle, as a button of its own: clicking it opens the tool's
 * menu straight away (what the "+" did), and it carries the "Open … options"
 * name a screen reader and the e2e suite know the "+" by. Laid over the
 * tool button's corner, so the parent needs `relative`.
 *
 * `lit` = the tool is picked or its menu is open: white. Otherwise faint.
 */
export function ToolNotch({
  lit,
  expanded,
  label,
  onClick,
  className = 'right-px bottom-px'
}: {
  lit: boolean
  expanded: boolean
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      className={`group/notch absolute z-[1] w-[14px] h-[14px] flex items-end justify-end p-[3px] rounded-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}
    >
      <span
        aria-hidden="true"
        className={`block w-[7px] h-[7px] [clip-path:polygon(100%_0,100%_100%,0_100%)] transition-colors ${
          lit ? 'bg-white' : 'bg-slate-200/45 group-hover/notch:bg-white'
        }`}
      />
    </button>
  )
}

/**
 * A phone bottom-bar slot's face: the icon in a chip when the tool is picked,
 * the stroke under the chip, the name below. Inactive, it is the plain icon
 * and name it always was.
 */
export function MobileToolFace({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <>
      <span
        className={`relative flex items-center justify-center w-11 h-7 rounded-lg transition-colors ${
          active ? ACTIVE_CHIP : ''
        }`}
      >
        {icon}
        {active && <ActiveStroke className="left-[8px] right-[8px] -bottom-[5px] h-[4px]" />}
      </span>
      <span
        className={`mt-[6px] text-[10px] font-medium leading-tight tracking-tight max-w-full truncate px-0.5 ${
          active ? 'text-white' : ''
        }`}
      >
        {label}
      </span>
    </>
  )
}
