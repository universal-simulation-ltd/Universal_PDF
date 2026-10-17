import { useRef, useState } from 'react'
import { saveBlob } from '@unisim/media/save'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import { useT } from '../../i18n'

// "Advanced → Export to Word" (James, 2026-10-18: Word only, not Excel or
// PowerPoint). The PDF's text as an editable .docx: headings, paragraphs,
// bold and italic (lib/pdfToDocx). Layout, columns, tables and pictures don't
// come across; a scanned page comes across as a picture of the page.
//
// ⚠️ Converted from the document AS EXPORTED, not the original bytes, whenever
// anything has been added to it: a redaction must not come back as text in
// the Word file, and filled-in form fields and typed text belong in it.

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXPORT_SCALE = 1.0

type Phase = { kind: 'ready' } | { kind: 'working'; page: number; total: number } | { kind: 'done'; pictures: number; pages: number } | { kind: 'error'; message: string }

export default function WordExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const annotations = useAnnotationStore((s) => s.annotations)
  const formValues = useFormStore((s) => s.values)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const live = useRef(true)

  async function run() {
    if (!sourceBytes) return
    setPhase({ kind: 'working', page: 0, total: 0 })
    try {
      let bytes: Uint8Array = new Uint8Array(sourceBytes.slice(0))
      if (annotations.length > 0 || formValues.length > 0) {
        const { buildAnnotatedPdfBytes } = await import('../../lib/export')
        bytes = await buildAnnotatedPdfBytes(sourceBytes.slice(0), annotations, EXPORT_SCALE, formValues)
      }
      const { pdfToDocx } = await import('../../lib/pdfToDocx/extract')
      const out = await pdfToDocx(bytes, (page, total) => {
        if (live.current) setPhase({ kind: 'working', page, total })
      })
      const name = (fileName ?? 'document.pdf').replace(/\.pdf$/i, '') + '.docx'
      saveBlob(new Blob([out.bytes as BlobPart], { type: DOCX_TYPE }), name)
      if (live.current) setPhase({ kind: 'done', pictures: out.pictures, pages: out.pages })
    } catch (err) {
      console.error(err)
      if (live.current) setPhase({ kind: 'error', message: (err as Error).message || t('tools.word.failed') })
    }
  }

  const busy = phase.kind === 'working'
  const close = () => {
    live.current = false
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="word-export-title" className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h2 id="word-export-title" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">📝</span>
            {t('tools.word.title')}
          </h2>
          {!busy && (
            <button onClick={close} aria-label={t('tools.common.close')} className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center">
              ×
            </button>
          )}
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{t('tools.word.explain')}</p>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{t('tools.word.not_layout')}</p>

        {phase.kind === 'working' && (
          <p role="status" className="mt-4 text-sm text-slate-600">
            {phase.total ? t('tools.word.reading', { page: phase.page, total: phase.total }) : t('tools.word.preparing')}
          </p>
        )}
        {phase.kind === 'done' && (
          <div role="status" className="mt-4 rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
            {t('tools.word.saved')}
            {phase.pictures > 0 && (
              <span className="block mt-1 text-xs text-emerald-900/80">
                {phase.pictures === phase.pages ? t('tools.word.all_scans') : t.plural('tools.word.some_scans', phase.pictures)}
              </span>
            )}
          </div>
        )}
        {phase.kind === 'error' && <div className="mt-4 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{phase.message}</div>}

        <div className="mt-5 flex items-center gap-2 justify-end">
          <button onClick={close} disabled={busy} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700 disabled:opacity-50">
            {phase.kind === 'done' ? t('tools.common.done') : t('tools.common.cancel')}
          </button>
          {phase.kind !== 'done' && (
            <button
              onClick={() => void run()}
              disabled={busy || !sourceBytes}
              className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {busy ? t('tools.word.working') : t('tools.word.export')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
