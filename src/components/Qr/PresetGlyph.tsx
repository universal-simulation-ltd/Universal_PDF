import { DEFAULT_DESIGN, STAR_BEHIND_CODE_SCALE, starIsBehind } from '@unisim/qr'
import type { QrPreset } from '../../lib/qr/design'
import type { MessageKey } from '../../i18n'

// Shared by the website's QR dialog and the phone's QR page (src/native/QrScreen).

/** The presets' names come from @unisim/qr in English, and the name is also its
 *  identifier — so they are translated only where shown, through these. */
export const QR_PRESET_KEYS: Record<string, MessageKey> = {
  Classic: 'tools.qr.preset_classic',
  Rounded: 'tools.qr.preset_rounded',
  Dots: 'tools.qr.preset_dots',
  Sunset: 'tools.qr.preset_sunset',
  Radial: 'tools.qr.preset_radial',
  Star: 'tools.qr.preset_star',
}

/** A cheap, drawn impression of a preset — plate silhouette, finder eyes and a
 *  few modules in the preset's own colours. Not a real QR: rendering six live
 *  codes on every keystroke would cost more than the chips are worth, and a
 *  chip only has to say "circle, dotted, orange eyes". */
export default function PresetGlyph({ preset }: { preset: QrPreset }) {
  const p = { ...DEFAULT_DESIGN, ...preset.patch }
  const eye = p.matchCornerColor ? p.fgColor : p.cornerColor
  const shaped = p.frameShape !== 'square'
  // A star BEHIND the code is not a plate: the code sits IN FRONT of it and is
  // bigger than any inscribed square, so the glyph has to follow the renderer's
  // layering here too or the chip advertises a design the preset does not draw.
  const behind = starIsBehind(p.frameShape, p.starPlacement)
  // Shaped plates hold a smaller code, the same way the renderer does.
  const s = behind ? STAR_BEHIND_CODE_SCALE : shaped ? 0.66 : 1
  const o = (1 - s) / 2
  const u = (v: number) => (o + v * s) * 32

  const starPoints = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 16 : 16 * 0.62
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return `${16 + r * Math.cos(a)},${16 + r * Math.sin(a)}`
  }).join(' ')

  const plate = behind ? (
    // Ground first, then the star on top of it in its own colour — the code is
    // drawn over both by the markup below.
    <>
      <rect width={32} height={32} fill={p.bgColor} />
      <polygon points={starPoints} fill={p.starColor} />
    </>
  ) : p.frameShape === 'circle' ? (
    <circle cx={16} cy={16} r={16} fill={p.bgColor} />
  ) : p.frameShape === 'star' ? (
    <polygon points={starPoints} fill={p.bgColor} />
  ) : (
    <rect width={32} height={32} rx={p.dotType === 'square' ? 0 : 3} fill={p.bgColor} />
  )

  // Module rounding follows the preset's dot style, so Classic reads square and
  // Dots reads round at a glance.
  const dotR = p.dotType === 'dots' ? 1.6 : p.dotType === 'square' ? 0 : 1
  const eyeR = p.cornerSquareType === 'square' ? 0 : p.cornerSquareType === 'dot' ? 4.5 : 2.5
  const MODULES = [
    [0.62, 0.62], [0.78, 0.62], [0.62, 0.78], [0.9, 0.78], [0.78, 0.9],
    [0.46, 0.14], [0.46, 0.3], [0.46, 0.62], [0.14, 0.46], [0.3, 0.46], [0.62, 0.46], [0.9, 0.46]
  ]

  return (
    <svg viewBox="0 0 32 32" className="w-9 h-9 shrink-0" aria-hidden="true">
      {plate}
      {([[0.02, 0.02], [0.66, 0.02], [0.02, 0.66]] as const).map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.32 * s * 32}
          height={0.32 * s * 32}
          rx={eyeR * s}
          fill="none"
          stroke={eye}
          strokeWidth={2.2 * s}
        />
      ))}
      {MODULES.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={u(x)}
          y={u(y)}
          width={0.1 * s * 32}
          height={0.1 * s * 32}
          rx={dotR * s}
          fill={p.fgColor}
        />
      ))}
    </svg>
  )
}
