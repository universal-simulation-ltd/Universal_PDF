import { useState } from 'react'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useT } from '../../i18n'
import { STAMPS, STAMP_COLORS, STAMP_H, STAMP_W, renderStampDataUrl, type StampShape } from '../../lib/stamps'

type Shape = StampShape

export default function StampPicker() {
  const t = useT()
  // Saved stamps carry an English " Stamp" suffix as their marker (see
  // SignatureMenu); shown in the reader's language.
  const shownName = (name: string) =>
    name.endsWith(' Stamp') ? t('sign.stamp_named', { name: name.slice(0, -' Stamp'.length) }) : name
  const open = useSignatureStore((s) => s.stampPickerOpen)
  const closeStampPicker = useSignatureStore((s) => s.closeStampPicker)
  const addSignature = useSignatureStore((s) => s.add)
  const setActive = useSignatureStore((s) => s.setActive)
  const setTool = useAnnotationStore((s) => s.setTool)
  const signatures = useSignatureStore((s) => s.signatures)
  const removeSignature = useSignatureStore((s) => s.remove)

  // The "saved stamps" list is signatures whose name carries the " Stamp"
  // suffix (the same convention the Sign-menu Stamps tab uses). Stamps created
  // here land in that one list, so they show up in both places.
  const savedStamps = signatures.filter((s) => s.name.endsWith(' Stamp'))

  // Custom-stamp creator state
  const [creating, setCreating] = useState(false)
  const [newText, setNewText] = useState('')
  const [newColor, setNewColor] = useState(STAMP_COLORS[0])
  const [newShape, setNewShape] = useState<Shape>('oval')

  if (!open) return null

  function pickStamp(text: string, color: string, shape: Shape, label: string) {
    const dataUrl = renderStampDataUrl(text, color, shape)
    // Logical size, not the raster's: `width`/`height` are only ever read as
    // an aspect ratio when the stamp is placed (see AnnotationLayer), so the
    // supersampled pixels must not leak into it or every stamp would drop at
    // STAMP_SUPERSAMPLE times its intended size.
    const id = addSignature({ name: label + ' Stamp', dataUrl, width: STAMP_W, height: STAMP_H })
    setActive(id)
    setTool('signature')
    closeStampPicker()
  }

  // Arm an already-saved stamp for placing.
  function pickSignature(id: string) {
    setActive(id)
    setTool('signature')
    closeStampPicker()
  }

  function resetCreator() {
    setCreating(false)
    setNewText('')
    setNewColor(STAMP_COLORS[0])
    setNewShape('oval')
  }

  // Render the custom stamp and add it to the saved-stamps list, then drop back
  // to the grid so it shows under "Your saved stamps" (and in the Sign menu).
  function saveCustomStamp() {
    const text = newText.trim().toLocaleUpperCase(t.lang)
    if (!text) return
    const dataUrl = renderStampDataUrl(text, newColor, newShape)
    addSignature({ name: text + ' Stamp', dataUrl, width: STAMP_W, height: STAMP_H })
    resetCreator()
  }

  const previewText = newText.trim().toLocaleUpperCase(t.lang)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => { if (e.target === e.currentTarget) closeStampPicker() }}
    >
      {/* ⚠️ A flex COLUMN capped at the viewport, not one box that scrolls.
          `max-h-[min(100%,100dvh)]`: 100% is the overlay's content box and
          100dvh shrinks with iOS's browser chrome, so min() takes whichever is
          actually visible — a `vh` cap does not, because `vh` is the LARGE
          viewport on iOS. The title row and its Close button are pinned
          OUTSIDE the scrolling body, so a tall dialog can no longer scroll its
          own way out off the top of a 390x844 screen. */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 flex max-h-[min(100%,100dvh)] flex-col">
        <div className="flex shrink-0 items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {creating ? t('sign.stamp_new') : t('sign.stamp_choose')}
          </h2>
          <button
            onClick={() => { resetCreator(); closeStampPicker() }}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label={t('sign.close')}
          >
            ×
          </button>
        </div>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        {creating ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('sign.stamp_text')}</label>
              <input
                autoFocus
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveCustomStamp() }}
                maxLength={20}
                placeholder={t('sign.stamp_text_placeholder')}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('sign.stamp_border_shape')}</label>
              <div className="flex gap-2">
                {([['oval', t('sign.stamp_shape_oval')], ['rect', t('sign.stamp_shape_rect')]] as const).map(([sh, lbl]) => (
                  <button
                    key={sh}
                    type="button"
                    onClick={() => setNewShape(sh)}
                    aria-pressed={newShape === sh}
                    className={`flex-1 border-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      newShape === sh
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('sign.stamp_colour')}</label>
              <div className="flex gap-2 flex-wrap">
                {STAMP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      newColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c, borderColor: c }}
                    aria-label={t('sign.stamp_colour_named', { color: c })}
                    aria-pressed={newColor === c}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('sign.stamp_preview')}</label>
              <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 min-h-[72px]">
                {previewText
                  ? <StampPreview def={{ text: previewText, color: newColor, shape: newShape }} />
                  : <span className="text-xs text-slate-400">{t('sign.stamp_preview_empty')}</span>}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => resetCreator()}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {t('sign.cancel')}
              </button>
              <button
                type="button"
                onClick={saveCustomStamp}
                disabled={!previewText}
                className="px-4 py-2 text-sm font-medium rounded-md bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('sign.stamp_save_mine')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {STAMPS.map((def) => (
                <button
                  key={def.text}
                  onClick={() => pickStamp(t(def.text), def.color, def.shape, t(def.label))}
                  className="border-2 rounded-lg p-3 hover:bg-slate-50 transition-colors flex items-center justify-center"
                  style={{ borderColor: def.color + '60' }}
                >
                  <StampPreview def={{ text: t(def.text), color: def.color, shape: def.shape }} />
                </button>
              ))}

              <button
                onClick={() => setCreating(true)}
                className="border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-50 hover:border-orange-400 transition-colors flex flex-col items-center justify-center gap-1 text-slate-500 min-h-[72px]"
              >
                <span className="text-2xl leading-none" aria-hidden="true">＋</span>
                <span className="text-xs font-medium">{t('sign.stamp_new')}</span>
              </button>
            </div>

            {savedStamps.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  {t('sign.stamp_saved')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {savedStamps.map((s) => (
                    <div key={s.id} className="relative">
                      <button
                        onClick={() => pickSignature(s.id)}
                        className="w-full border-2 border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors flex items-center justify-center min-h-[72px]"
                      >
                        <img src={s.dataUrl} alt={shownName(s.name)} className="h-12 max-w-full object-contain" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSignature(s.id) }}
                        title={t('sign.stamp_remove')}
                        aria-label={t('sign.stamp_remove_named', { name: shownName(s.name) })}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-600 hover:border-red-300 shadow-sm flex items-center justify-center text-sm leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400 text-center">
              {t('sign.stamp_place_hint')}
            </p>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

export function StampPreview({ def }: { def: { text: string; color: string; shape: Shape } }) {
  const fontSize = def.text.length > 10 ? 11 : def.text.length > 7 ? 13 : 15

  if (def.shape === 'oval') {
    return (
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 48 }}>
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: def.color }}
        />
        <div
          className="absolute rounded-full border"
          style={{ inset: 4, borderColor: def.color }}
        />
        <span
          className="relative font-bold tracking-wide"
          style={{ color: def.color, fontSize }}
        >
          {def.text}
        </span>
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 48 }}>
      <div
        className="absolute inset-0 border-2 rounded-sm"
        style={{ borderColor: def.color }}
      />
      <div
        className="absolute border rounded-sm"
        style={{ inset: 4, borderColor: def.color }}
      />
      <span
        className="relative font-bold tracking-wide"
        style={{ color: def.color, fontSize }}
      >
        {def.text}
      </span>
    </div>
  )
}
