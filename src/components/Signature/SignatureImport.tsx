import { useEffect, useRef, useState } from 'react'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { importImageAsSignature, type ImportedSignature } from '../../lib/imageSignature'

export default function SignatureImport() {
  const open = useSignatureStore((s) => s.importOpen)
  const importTarget = useSignatureStore((s) => s.importTarget)
  const closeImport = useSignatureStore((s) => s.closeImport)
  const add = useSignatureStore((s) => s.add)
  const isStamp = importTarget === 'stamp'

  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportedSignature | null>(null)
  const [removeBg, setRemoveBg] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setName('')
      setFile(null)
      setPreview(null)
      setRemoveBg(true)
      setBusy(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setBusy(true)
    setError(null)
    importImageAsSignature(file, { removeBg })
      .then((res) => {
        if (cancelled) return
        setPreview(res)
        setName((current) => {
          if (current) return current
          const base = file.name.replace(/\.[^.]+$/, '').trim()
          if (base) return base
          const list = useSignatureStore.getState().signatures
          if (isStamp) {
            const stampCount = list.filter((s) => s.name.endsWith(' Stamp')).length
            return `Stamp ${stampCount + 1}`
          }
          return `Signature ${list.length + 1}`
        })
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message || 'Could not import image')
        setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [file, removeBg, isStamp])

  if (!open) return null

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      if (!/^image\//.test(f.type)) {
        setError('Please choose an image file (PNG, JPG, etc.)')
      } else {
        setFile(f)
      }
    }
    e.target.value = ''
  }

  function save() {
    if (!preview) return
    const list = useSignatureStore.getState().signatures
    const trimmed = name.trim()
    let finalName: string
    if (isStamp) {
      const stampCount = list.filter((s) => s.name.endsWith(' Stamp')).length
      const base = trimmed || `Stamp ${stampCount + 1}`
      finalName = base.endsWith(' Stamp') ? base : `${base} Stamp`
    } else {
      finalName = trimmed || `Signature ${list.length + 1}`
    }
    add({
      name: finalName,
      dataUrl: preview.dataUrl,
      width: preview.width,
      height: preview.height
    })
    closeImport()
    // Arm the signature tool so the user can immediately drop the new
    // signature — the active signature was set by add() above.
    useAnnotationStore.getState().setTool('signature')
  }

  const previewBg =
    'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 16px 16px'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeImport()
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {isStamp ? 'Import stamp' : 'Import signature'}
          </h2>
          <button
            onClick={closeImport}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full p-8 border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-lg text-slate-500 hover:text-orange-700 transition-colors flex flex-col items-center gap-2"
          >
            <div className="text-3xl">🖼️</div>
            <div className="font-medium">Choose an image</div>
            <div className="text-xs opacity-70">PNG, JPG, JPEG, GIF, WEBP</div>
          </button>
        ) : (
          <div>
            <div
              className="border-2 border-dashed border-slate-300 rounded p-3 flex items-center justify-center"
              style={{ minHeight: 160, background: previewBg }}
            >
              {busy ? (
                <div className="text-slate-500 text-sm">Processing…</div>
              ) : preview ? (
                <img
                  src={preview.dataUrl}
                  alt="Signature preview"
                  className="max-h-40 max-w-full object-contain"
                />
              ) : (
                <div className="text-slate-400 text-sm">No preview</div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-3 text-sm">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={(e) => setRemoveBg(e.target.checked)}
                />
                Remove white background
              </label>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-auto text-xs text-slate-500 hover:text-orange-700 underline-offset-2 hover:underline"
              >
                Choose different file
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
        />

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="flex-1 min-w-40 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={closeImport}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!preview || busy}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
