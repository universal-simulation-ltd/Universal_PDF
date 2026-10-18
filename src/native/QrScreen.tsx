import { useEffect, useId, useMemo, useState } from 'react'
import { DEFAULT_DESIGN, type QrDesign } from '@unisim/qr'
import { getT, useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { QR_PRESETS, withBranding, type QrPlacement, type QrPreset } from '../lib/qr/design'
import { PLACEMENT_SIZE, renderQrPng } from '../lib/qr/render'
import PresetGlyph, { QR_PRESET_KEYS } from '../components/Qr/PresetGlyph'
import type { Annotation } from '../types/annotations'
import { BackLink, Hl } from './parts'
import { useNav } from './nav'

// A QR code, a page of its own like Sign (James, 2026-10-18: "give QR a native
// screen like sign"): "Make a *QR code*", a white slip with the link on it, the
// code itself drawn as you type, the six looks, and "Put it on the page".
//
// The same design model and renderer as the website's dialog (@unisim/qr via
// lib/qr), so a code made here is the same picture, carries the same
// `ImageAnnotation.qr` and can be edited again from the page — the ✏️ on a
// placed code opens this page on that code. No saved-codes shelf and no
// company branding: both hang off a signed-in account, which the phone screens
// don't have. A code placed on the website keeps any branding it has when it is
// edited here.
//
// ⚠️ The link box is NOT focused on arrival (James: "don't auto focus on the
// input so the keyboard doesn't open, let them take in the page first").

const PREVIEW_PX = 200
const PREVIEW_DEBOUNCE_MS = 250

export default function QrScreen() {
  const t = useT()
  const fileName = usePdfStore((s) => s.fileName)
  const qrEdit = usePdfStore((s) => s.qrEdit)
  const linkId = useId()
  const [base, setBase] = useState<QrDesign>(() =>
    qrEdit ? qrEdit.placement.base : { ...DEFAULT_DESIGN, ...(QR_PRESETS.find((p) => p.name === 'Rounded')?.patch ?? {}) }
  )
  const [presetName, setPresetName] = useState<string | null>(() => (qrEdit ? qrEdit.placement.presetName : 'Rounded'))
  const branding = qrEdit?.placement.branding ?? null
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const design = useMemo(() => withBranding(base, branding), [base, branding])
  const data = design.data.trim()

  // Leaving the page by any road — the back link, Android's back, placing —
  // ends the QR request, so the ✏️ can open it again.
  useEffect(() => () => usePdfStore.getState().setQrOpen(false), [])

  useEffect(() => {
    if (!data) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      renderQrPng(design, PREVIEW_PX * 2)
        .then((png) => {
          if (cancelled) return
          setPreview(png)
          setError(null)
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message || getT()('tools.qr.draw_failed'))
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [data, design])

  function pick(preset: QrPreset) {
    setBase((d) => ({ ...d, ...preset.patch }))
    setPresetName(preset.name)
  }

  const placement = (): QrPlacement => ({ base, branding, presetName })

  async function finish() {
    if (!data || busy) return
    setBusy(true)
    try {
      const png = await renderQrPng(design, PLACEMENT_SIZE)
      const a = useAnnotationStore.getState()
      if (qrEdit) {
        const target = a.annotations.find((x) => x.id === qrEdit.id)
        if (!target || target.type !== 'image') {
          setError(t('tools.qr.no_longer_on_page'))
          return
        }
        // Where and how big it was: the point of editing a placed code is
        // that it stays placed.
        a.update(qrEdit.id, { src: png, qr: placement() } as Partial<Annotation>)
      } else {
        a.setSelected(null)
        a.setUploadedImageSrc(png, placement())
        // The page's own placement banner says "tap the page" (PlacementHint).
        a.setTool('image')
      }
      useNav.getState().pop()
    } catch (e) {
      setError((e as Error).message || t('tools.qr.draw_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col" style={{ background: 'var(--np-paper)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={(fileName ?? '').replace(/\.pdf$/i, '') || t('phone.sign_back')} onClick={() => useNav.getState().pop()} />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-3 flex flex-col gap-4">
        <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
          {t('phone.qr_lead')} <Hl>{t('phone.qr_hl')}</Hl>
        </h1>

        <div
          className="np-tilt bg-white rounded-[3px] px-5 pt-4 pb-5 flex flex-col gap-3"
          style={{ boxShadow: '0 10px 24px rgba(23,30,50,0.14)', transform: 'rotate(-1deg)' }}
        >
          <label htmlFor={linkId} className="text-[13px] text-[color:var(--np-muted)]">
            {t('phone.qr_link_label')}
          </label>
          <input
            id={linkId}
            value={base.data}
            onChange={(e) => setBase((d) => ({ ...d, data: e.target.value }))}
            placeholder={t('phone.qr_link_placeholder')}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-[17px] py-1.5 bg-transparent outline-none"
            style={{ borderBottom: '2px solid var(--np-line)' }}
          />
          <div className="flex justify-center pt-2">
            {preview && data ? (
              <img src={preview} alt={t('phone.qr_preview_alt', { data })} width={PREVIEW_PX} height={PREVIEW_PX} className="block" />
            ) : (
              <div
                className="flex items-center justify-center text-center px-6 text-[14px] leading-[1.4] text-[color:var(--np-muted)] rounded-xl"
                style={{ width: PREVIEW_PX, height: PREVIEW_PX, border: '2px dashed var(--np-line)' }}
              >
                {t('phone.qr_preview_empty')}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 mt-1">
          <h2 className="np-serif m-0 text-[19px] font-bold">{t('phone.qr_look')}</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {QR_PRESETS.map((preset) => {
              const on = presetName === preset.name
              const key = QR_PRESET_KEYS[preset.name]
              return (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(preset)}
                  className="min-h-[76px] rounded-2xl flex flex-col items-center justify-center gap-1.5 px-1"
                  style={
                    on
                      ? { background: 'var(--np-slip)', boxShadow: '0 0 0 2px var(--np-cobalt)' }
                      : { background: 'var(--np-slip)', border: '1px solid var(--np-line)' }
                  }
                >
                  <PresetGlyph preset={preset} />
                  <span className="text-[13px] leading-tight" style={{ fontWeight: on ? 700 : 600, color: on ? 'var(--np-cobalt-deep)' : 'var(--np-ink-2)' }}>
                    {key ? t(key) : preset.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="m-0 text-[14px] text-red-700">{error}</p>}
      </div>

      <div className="flex-none px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={!data || busy}
          className="w-full min-h-[56px] rounded-[18px] text-white text-[17px] font-bold disabled:opacity-50"
          style={{ background: 'var(--np-cobalt)' }}
        >
          {qrEdit ? t('phone.qr_save') : t('phone.put_on_page')}
        </button>
      </div>
    </div>
  )
}
