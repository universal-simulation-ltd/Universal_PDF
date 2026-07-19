import type { FontFamily } from '../types/annotations'

// The nearest PDF "standard 14" family each on-screen font maps to on export.
// pdf-lib can only embed the standard fonts without a fontkit dependency, so the
// extra web-safe families render faithfully in the editor but fall back to their
// closest standard cousin when baked into the PDF.
export type PdfBaseFont = 'helvetica' | 'times' | 'courier'

export interface FontDef {
  id: FontFamily
  label: string
  // Short glyph sample shown on the toolbar chip.
  preview: string
  // CSS font stack used on-screen (Konva + the edit input).
  css: string
  // Closest standard PDF font for export.
  base: PdfBaseFont
  // Extra fonts revealed by the "+ more fonts" expander; the first three are the
  // always-visible core set.
  extended?: boolean
}

export const FONT_DEFS: FontDef[] = [
  { id: 'sans', label: 'Sans', preview: 'Aa', css: 'Helvetica, Arial, sans-serif', base: 'helvetica' },
  { id: 'serif', label: 'Serif', preview: 'Aa', css: '"Times New Roman", Times, serif', base: 'times' },
  { id: 'mono', label: 'Mono', preview: 'Aa', css: '"Courier New", Courier, monospace', base: 'courier' },
  { id: 'georgia', label: 'Georgia', preview: 'Aa', css: 'Georgia, "Times New Roman", serif', base: 'times', extended: true },
  { id: 'verdana', label: 'Verdana', preview: 'Aa', css: 'Verdana, Geneva, sans-serif', base: 'helvetica', extended: true },
  { id: 'comic', label: 'Comic', preview: 'Aa', css: '"Comic Sans MS", "Comic Sans", cursive', base: 'helvetica', extended: true },
  { id: 'impact', label: 'Impact', preview: 'Aa', css: 'Impact, Haettenschweiler, "Arial Narrow", sans-serif', base: 'helvetica', extended: true }
]

// CSS lookup by family id, used wherever text is rendered on-screen. Any unknown
// id falls back to the sans stack.
export const FONT_CSS: Record<FontFamily, string> = FONT_DEFS.reduce(
  (acc, f) => {
    acc[f.id] = f.css
    return acc
  },
  {} as Record<FontFamily, string>
)

export function fontBase(id?: FontFamily): PdfBaseFont {
  return FONT_DEFS.find((f) => f.id === id)?.base ?? 'helvetica'
}
