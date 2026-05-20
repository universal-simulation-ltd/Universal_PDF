import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from '../../lib/pdfjs'
import { useFormStore } from '../../stores/formStore'

interface FieldInfo {
  fieldName: string
  fieldType: string
  rect: [number, number, number, number]
  // Canvas-coordinate box
  cx: number
  cy: number
  cw: number
  ch: number
}

interface Props {
  page: PDFPageProxy
  pageIndex: number
  scale: number
  pageHeight: number
}

export default function FormFieldLayer({ page, pageIndex, scale, pageHeight }: Props) {
  const [fields, setFields] = useState<FieldInfo[]>([])
  // Subscribe to the values array so the inputs re-render as the user types.
  // Subscribing to `getValue` alone returns a stable function reference and
  // never wakes the component, so the controlled inputs would silently lose
  // keystrokes after the first one.
  const values = useFormStore((s) => s.values)
  const setValue = useFormStore((s) => s.setValue)
  // track which field is active for inline editing
  const [activeField, setActiveField] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    page.getAnnotations().then((anns) => {
      if (cancelled) return
      const detected: FieldInfo[] = []
      for (const ann of anns) {
        if (ann.subtype !== 'Widget') continue
        if (!ann.rect || !ann.fieldName) continue
        const [x1, y1, x2, y2] = ann.rect as [number, number, number, number]
        // PDF points → canvas pixels (Y axis flipped)
        const pdfPageHeightPts = pageHeight / scale
        const cx = x1 * scale
        const cy = (pdfPageHeightPts - y2) * scale
        const cw = (x2 - x1) * scale
        const ch = (y2 - y1) * scale
        detected.push({
          fieldName: ann.fieldName as string,
          fieldType: (ann.fieldType as string) ?? 'Tx',
          rect: [x1, y1, x2, y2],
          cx, cy, cw, ch
        })
      }
      setFields(detected)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [page, scale, pageHeight])

  useEffect(() => {
    if (activeField && inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeField])

  if (fields.length === 0) return null

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      {fields.map((f) => {
        const isActive = activeField === f.fieldName
        const val =
          values.find((v) => v.pageIndex === pageIndex && v.fieldName === f.fieldName)?.value ?? ''
        // iOS Safari zooms the page when an input's font-size is below 16px.
        // We always render at 16px and scale the element down via CSS transform.
        const desiredFontSize = Math.min(14, f.ch * 0.65)
        const fontScale = desiredFontSize / 16
        return (
          <div
            key={f.fieldName}
            className="absolute pointer-events-auto overflow-hidden"
            style={{
              left: f.cx,
              top: f.cy,
              width: f.cw,
              height: f.ch,
            }}
          >
            {isActive ? (
              <input
                ref={inputRef}
                type="text"
                value={val}
                onChange={(e) => setValue(pageIndex, f.fieldName, e.target.value)}
                onBlur={() => setActiveField(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault()
                    setActiveField(null)
                  }
                }}
                className="px-1 border-2 border-orange-500 bg-orange-50/80 text-slate-900 outline-none"
                style={{
                  fontSize: 16,
                  transform: `scale(${fontScale})`,
                  transformOrigin: 'left top',
                  width: `${f.cw / fontScale}px`,
                  height: `${f.ch / fontScale}px`,
                }}
              />
            ) : (
              <div
                onClick={() => setActiveField(f.fieldName)}
                title={`Click to fill: ${f.fieldName}`}
                className="w-full h-full flex items-center px-1 cursor-text border border-dashed border-blue-400 bg-blue-50/40 hover:bg-blue-50/80 transition-colors"
                style={{ fontSize: Math.min(14, f.ch * 0.65) }}
              >
                {val ? (
                  <span className="text-slate-800 truncate">{val}</span>
                ) : (
                  <span className="text-blue-400 text-xs truncate">{f.fieldName}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
