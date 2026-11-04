import type { ReactNode } from 'react'
import { buttonClass } from '@unisim/sdk'

// The suite's key buttons and tray tabs (SDK 0.216, BRANDING.md → Buttons,
// Tabs, 2026-11-04); main.tsx installs their CSS. Primary is once per view.
// The look sits in a cascade layer, so a Tailwind utility on the element wins:
// add layout only (w-full, flex-1, shrink-0, ml-auto), never colour, padding
// or font size. Not for the phone screens (src/native has its own design).
export const btnPrimary = buttonClass('primary')
export const btnSecondary = buttonClass()
export const btnSoft = buttonClass('soft')
export const btnQuiet = buttonClass('quiet')
export const btnDanger = buttonClass('danger')
export const btnPrimarySm = buttonClass('primary', 'sm')
export const btnSecondarySm = buttonClass(undefined, 'sm')
export const btnQuietSm = buttonClass('quiet', 'sm')

/** A key button's icon block, its first child (primary, secondary, danger). */
export function Key({ children }: { children: ReactNode }) {
  return (
    <span className="u-btn__key" aria-hidden="true">
      {children}
    </span>
  )
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
export const PlusIcon = () => icon('M12 5v14M5 12h14')
export const CheckIcon = () => icon('M5 12.5l4.5 4.5L19 7.5')
export const BinIcon = () => icon('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3')
export const DownloadIcon = () => icon('M12 4v11M7 10l5 5 5-5M5 20h14')
export const UploadIcon = () => icon('M12 16V4M7 9l5-5 5 5M5 20h14')
export const LockIcon = () => icon('M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3')
export const SendIcon = () => icon('M4 12l16-8-6 16-3-7z')
export const PenIcon = () => icon('M4 20h4L19 9l-4-4L4 16zM14 6l4 4')
