import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from '../../lib/pdfjs'
import { useFormStore, type FormFieldValue } from '../../stores/formStore'
import { useT } from '../../i18n'

// The page's own AcroForm fields, as something to fill in.
//
// ⚠️ Each kind of widget gets its own control. Every widget used to be shown as
// a text box: a checkbox or a dropdown could only be typed into, and the export
// only ever wrote TEXT fields, so whatever was "ticked" was silently dropped.
// Radio buttons share one field name across their widgets, so they all showed
// the same typed value too.
//
// Values are stored the way the export writes them back (lib/export.ts
// `fillForm`): text as typed; a checkbox as its export value, or 'Off'; a radio
// group as the chosen widget's "on" state name; a choice as the option's export
// value. A field only gets an entry once the reader changes it, so an untouched
// field keeps whatever the PDF arrived with.

type Kind = 'text' | 'checkbox' | 'radio' | 'choice'

interface FieldInfo {
  /** pdf.js's widget id — unique per widget, where `fieldName` is not. */
  id: string
  fieldName: string
  kind: Kind
  label: string
  /** What the PDF itself holds, until the reader changes it. */
  initial: string
  /** checkbox: the value it takes when ticked. radio: this widget's own value. */
  onValue: string
  multiLine: boolean
  options: { value: string; label: string }[]
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

interface WidgetData {
  id?: string
  subtype?: string
  rect?: number[]
  fieldName?: string
  fieldType?: string
  fieldValue?: string | string[] | null
  alternativeText?: string
  readOnly?: boolean
  hidden?: boolean
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  exportValue?: string
  buttonValue?: string | null
  multiLine?: boolean
  options?: { exportValue?: string; displayValue?: string }[]
}

function toField(ann: WidgetData, box: { cx: number; cy: number; cw: number; ch: number }): FieldInfo | null {
  if (!ann.fieldName) return null
  const raw = Array.isArray(ann.fieldValue) ? ann.fieldValue[0] : ann.fieldValue
  const base = {
    id: ann.id ?? `${ann.fieldName}:${box.cx}:${box.cy}`,
    fieldName: ann.fieldName,
    label: ann.alternativeText || ann.fieldName,
    multiLine: !!ann.multiLine,
    options: [] as FieldInfo['options'],
    onValue: '',
    ...box
  }
  switch (ann.fieldType) {
    case 'Btn':
      if (ann.pushButton) return null // a button runs a script; there is nothing to fill
      if (ann.checkBox) {
        const on = ann.exportValue || 'Yes'
        return { ...base, kind: 'checkbox', onValue: on, initial: raw && raw !== 'Off' ? on : 'Off' }
      }
      if (ann.radioButton) {
        return { ...base, kind: 'radio', onValue: ann.buttonValue ?? '', initial: raw ?? 'Off' }
      }
      return null
    case 'Ch':
      return {
        ...base,
        kind: 'choice',
        initial: raw ?? '',
        options: (ann.options ?? []).map((o) => ({
          value: o.exportValue ?? o.displayValue ?? '',
          label: o.displayValue ?? o.exportValue ?? ''
        }))
      }
    default:
      return { ...base, kind: 'text', initial: raw ?? '' }
  }
}

// The reader's value for a field, else the PDF's. A field name means ONE field
// however many widgets show it (a name repeated in every page's header; a radio
// group), so an entry made on another page counts too — this page's first.
function currentValue(values: FormFieldValue[], pageIndex: number, f: FieldInfo): string {
  const hit =
    values.find((v) => v.pageIndex === pageIndex && v.fieldName === f.fieldName) ??
    values.find((v) => v.fieldName === f.fieldName)
  return hit ? hit.value : f.initial
}

export default function FormFieldLayer({ page, pageIndex, scale }: Props) {
  const t = useT()
  const [fields, setFields] = useState<FieldInfo[]>([])
  // Subscribe to the values array so the inputs re-render as the user types.
  // Subscribing to `getValue` alone returns a stable function reference and
  // never wakes the component, so the controlled inputs would silently lose
  // keystrokes after the first one.
  const values = useFormStore((s) => s.values)
  const setValue = useFormStore((s) => s.setValue)
  // track which text field is active for inline editing
  const [activeField, setActiveField] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    page.getAnnotations().then((anns) => {
      if (cancelled) return
      // ⚠️ Placed through the page's own viewport, which applies its /Rotate
      // and its CropBox origin. Flipping y against the page height (as this
      // did) is right only for an unrotated page cropped at (0, 0); anywhere
      // else the boxes sat beside the fields they were for.
      const viewport = page.getViewport({ scale })
      const detected: FieldInfo[] = []
      for (const ann of anns as WidgetData[]) {
        if (ann.subtype !== 'Widget' || !ann.rect || ann.readOnly || ann.hidden) continue
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(ann.rect)
        const field = toField(ann, {
          cx: Math.min(x1, x2),
          cy: Math.min(y1, y2),
          cw: Math.abs(x2 - x1),
          ch: Math.abs(y2 - y1)
        })
        if (field) detected.push(field)
      }
      setFields(detected)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [page, scale])

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
        const val = currentValue(values, pageIndex, f)
        const set = (v: string) => setValue(pageIndex, f.fieldName, v)
        const box = { left: f.cx, top: f.cy, width: f.cw, height: f.ch }
        // iOS Safari zooms the page when an input's font-size is below 16px.
        // We always render at 16px and scale the element down via CSS transform.
        const desiredFontSize = Math.min(14, f.ch * 0.65)
        const fontScale = desiredFontSize / 16

        // ⚠️ The tick and choice controls are OPAQUE. The page canvas already
        // draws the PDF's own state of the widget underneath, so a see-through
        // control would show the old tick beside the new one.
        if (f.kind === 'checkbox' || f.kind === 'radio') {
          const checked = f.kind === 'checkbox' ? val !== 'Off' && val !== '' : val === f.onValue
          return (
            <button
              key={f.id}
              type="button"
              role={f.kind}
              aria-checked={checked}
              aria-label={f.label}
              title={f.label}
              // A radio set by mistake can be cleared the same way, as a PDF
              // viewer's would not allow but a paper form would.
              onClick={() => set(checked ? 'Off' : f.onValue)}
              className={`absolute pointer-events-auto flex items-center justify-center border border-blue-400 bg-white text-slate-900 hover:bg-blue-50 ${f.kind === 'radio' ? 'rounded-full' : ''}`}
              style={{ ...box, fontSize: Math.min(f.cw, f.ch) * 0.8, lineHeight: 1 }}
            >
              {checked && <span aria-hidden="true">{f.kind === 'radio' ? '●' : '✓'}</span>}
            </button>
          )
        }

        if (f.kind === 'choice') {
          return (
            <select
              key={f.id}
              aria-label={f.label}
              title={f.label}
              value={val}
              onChange={(e) => set(e.target.value)}
              className="absolute pointer-events-auto border border-blue-400 bg-white text-slate-900 outline-none focus:border-orange-500"
              style={{ ...box, fontSize: 16, transform: `scale(${fontScale})`, transformOrigin: 'left top', width: f.cw / fontScale, height: f.ch / fontScale }}
            >
              {!f.options.some((o) => o.value === val) && <option value={val}>{val}</option>}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )
        }

        const isActive = activeField === f.id
        const Input = f.multiLine ? 'textarea' : 'input'
        return (
          <div
            key={f.id}
            className="absolute pointer-events-auto overflow-hidden"
            style={box}
          >
            {isActive ? (
              <Input
                ref={inputRef}
                type={f.multiLine ? undefined : 'text'}
                value={val}
                aria-label={f.label}
                onChange={(e) => set(e.target.value)}
                onBlur={() => setActiveField(null)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' && !f.multiLine) || e.key === 'Escape') {
                    e.preventDefault()
                    setActiveField(null)
                  }
                }}
                className="px-1 border-2 border-orange-500 bg-orange-50 text-slate-900 outline-none resize-none"
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
                role="button"
                tabIndex={0}
                onClick={() => setActiveField(f.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveField(f.id)
                  }
                }}
                title={t('viewer.form.click_to_fill', { name: f.label })}
                aria-label={t('viewer.form.click_to_fill', { name: f.label })}
                // Opaque once there is a value of OUR drawing to show, for the
                // same reason as the tick boxes: the canvas still has the PDF's.
                className={`w-full h-full flex items-center px-1 cursor-text border border-dashed border-blue-400 hover:bg-blue-50/80 transition-colors ${val !== f.initial ? 'bg-white' : 'bg-blue-50/40'}`}
                style={{ fontSize: Math.min(14, f.ch * 0.65) }}
              >
                {val !== f.initial ? (
                  <span className="text-slate-800 truncate">{val}</span>
                ) : (
                  !val && <span className="text-blue-400 text-xs truncate">{f.label}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
