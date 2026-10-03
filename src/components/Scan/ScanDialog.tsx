import { useEffect, useRef, useState } from 'react'
import CropEditor from './CropEditor'
import { decodePhoto, pageFromJpeg, rotatePage, scansToPdf, type ScanColour, type ScanPage } from '../../lib/scan'
import { fullQuad, paperForLocale, scanFileName, type Paper, type Quad } from '../../lib/scanGeometry'
import { scanWithCamera } from '../../lib/documentScanner'
import { makeSearchablePdf } from '../../lib/ocr'
import { openFiles } from '../../stores/tabStore'
import { useT } from '../../i18n'

export type ScanSource = 'camera' | 'photo'

interface Props {
  /**
   * `camera`: the pages came from the phone's own scanner, already cropped and
   * flattened, and "Scan more pages" opens it again. `photo`: pages are made
   * here, one photo at a time, through the corner editor.
   */
  source: ScanSource
  /** Pages already scanned before the dialog opened (the camera road). */
  initialPages?: ScanPage[]
  onClose: () => void
}

interface Entry {
  id: number
  page: ScanPage
  url: string
  /** What the page was cut from, so "Adjust crop" can go back to it: the
   *  picked photo and its corners, or — for a page from the phone's scanner,
   *  which arrives already cropped — the page itself, corner to corner.
   *  The File, not the decoded canvas: a 4000 px canvas is ~64 MB held per
   *  page, and re-decoding on the rare adjust costs a second. */
  source: { file: File; quad: Quad | null; colour: ScanColour }
}

let nextId = 1
function entry(page: ScanPage, source: Entry['source']): Entry {
  return {
    id: nextId++,
    page,
    url: URL.createObjectURL(new Blob([page.jpeg as BlobPart], { type: 'image/jpeg' })),
    source,
  }
}

/** A scanner page as its own source: re-cropped from itself, full frame. */
function scannerEntry(page: ScanPage): Entry {
  const file = new File([page.jpeg as BlobPart], 'scan.jpg', { type: 'image/jpeg' })
  return entry(page, { file, quad: null, colour: 'colour' })
}

/** The photo in the corner editor: a new one, or a page being re-cropped. */
interface Cropping {
  key: number
  canvas: HTMLCanvasElement
  file: File
  quad?: Quad
  replaceId?: number
}

/**
 * Scan to PDF: collect pages, then make one PDF of them and open it in a tab.
 *
 * Nothing leaves the device. The phone scanners run on the phone, the corner
 * editor runs in the page, `scansToPdf` is pdf-lib, and "Make searchable" is
 * the same on-device Tesseract pass as the OCR tool.
 */
export default function ScanDialog({ source, initialPages, onClose }: Props) {
  const t = useT()
  const [pages, setPages] = useState<Entry[]>(() => (initialPages ?? []).map(scannerEntry))
  // Photos picked but not yet cropped, and the one being cropped now.
  const [queue, setQueue] = useState<File[]>([])
  const [photo, setPhoto] = useState<Cropping | null>(null)
  const [decoding, setDecoding] = useState(false)
  const [colour, setColour] = useState<ScanColour>('colour')
  const [paper, setPaper] = useState<Paper>(() => paperForLocale(navigator.language))
  const [ocr, setOcr] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  // Object URLs for the thumbnails die with the dialog.
  useEffect(() => () => pagesRef.current.forEach((e) => URL.revokeObjectURL(e.url)), [])

  // Decode the next queued photo whenever the editor is free.
  useEffect(() => {
    if (photo || decoding || queue.length === 0) return
    const [file, ...rest] = queue
    setDecoding(true)
    decodePhoto(file)
      .then((canvas) => setPhoto({ key: nextId++, canvas, file }))
      .catch((err) => {
        console.error(err)
        alert((err as Error).message)
      })
      .finally(() => {
        setQueue(rest)
        setDecoding(false)
      })
  }, [queue, photo, decoding])

  const cropping = !!photo
  const working = busy !== null

  function addPage(page: ScanPage, quad: Quad) {
    const c = photo
    if (!c) return
    const made = entry(page, { file: c.file, quad, colour })
    if (c.replaceId !== undefined) {
      setPages((p) =>
        p.map((e) => {
          if (e.id !== c.replaceId) return e
          URL.revokeObjectURL(e.url)
          return made
        }),
      )
    } else {
      setPages((p) => [...p, made])
    }
    setPhoto(null)
  }

  // "Adjust crop": back into the corner editor with the page's own source
  // and the corners it was cut with. A scanner page has no earlier corners,
  // so it opens on the whole page — the scanner's crop — ready to tighten.
  async function adjust(id: number) {
    const target = pages.find((e) => e.id === id)
    if (!target || decoding) return
    setDecoding(true)
    try {
      const canvas = await decodePhoto(target.source.file)
      setColour(target.source.colour)
      setPhoto({
        key: nextId++,
        canvas,
        file: target.source.file,
        quad: target.source.quad ?? fullQuad(canvas.width, canvas.height),
        replaceId: id,
      })
    } catch (err) {
      console.error(err)
      alert(t('tools.scan.failed', { message: (err as Error).message }))
    } finally {
      setDecoding(false)
    }
  }

  function removePage(id: number) {
    setPages((p) => {
      const gone = p.find((e) => e.id === id)
      if (gone) URL.revokeObjectURL(gone.url)
      return p.filter((e) => e.id !== id)
    })
  }

  async function rotate(id: number) {
    const target = pages.find((e) => e.id === id)
    if (!target) return
    // Rotating bakes the turn into the page and makes it its own source: the
    // old corners were for the photo the right way round.
    const turnedPage = await rotatePage(target.page)
    const turned = entry(turnedPage, {
      file: new File([turnedPage.jpeg as BlobPart], 'page.jpg', { type: 'image/jpeg' }),
      quad: null,
      colour: 'colour',
    })
    URL.revokeObjectURL(target.url)
    setPages((p) => p.map((e) => (e.id === id ? turned : e)))
  }

  async function scanMore() {
    try {
      const jpegs = await scanWithCamera()
      if (!jpegs) return
      const more = await Promise.all(jpegs.map(pageFromJpeg))
      setPages((p) => [...p, ...more.map(scannerEntry)])
    } catch (err) {
      console.error(err)
      alert(t('tools.scan.failed', { message: (err as Error).message }))
    }
  }

  function close() {
    if (working) return
    if (pages.length > 0 && !confirm(t('tools.scan.discard_confirm'))) return
    onClose()
  }

  async function create() {
    if (pages.length === 0 || working) return
    const name = scanFileName(new Date())
    setBusy(t('tools.scan.building'))
    try {
      let bytes = await scansToPdf(
        pages.map((e) => e.page),
        paper,
        name.replace(/\.pdf$/i, ''),
      )
      if (ocr) {
        // 'all': a fresh scan has no text layer to protect, so there is
        // nothing for 'auto' to skip, and asking costs a pass over each page.
        const result = await makeSearchablePdf(
          bytes.slice().buffer,
          name,
          (p) => setBusy(`${p.message} ${Math.round(p.fraction * 100)}%`),
          { mode: 'all' },
        )
        bytes = result.bytes
      }
      const file = new File([bytes as BlobPart], name, { type: 'application/pdf' })
      // A new tab when a document is already open, so a scan never replaces
      // (and never asks to discard) the one on screen.
      if (await openFiles([file])) onClose()
    } catch (err) {
      console.error(err)
      alert(t('tools.scan.failed', { message: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !cropping) close()
      }}
    >
      {/* ⚠️ Capped at the viewport and split, as every dialog here is: the
          title row is pinned and everything below it scrolls. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-dialog-title"
        className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-lg flex max-h-[min(100%,100dvh)] flex-col"
      >
        <div className="flex shrink-0 items-center justify-between mb-3">
          <h2 id="scan-dialog-title" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">📷</span>
            {cropping ? t('tools.scan.crop_title') : t('tools.scan.title')}
          </h2>
          {!cropping && (
            <button
              onClick={close}
              disabled={working}
              aria-label={t('tools.common.close')}
              className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center disabled:opacity-50"
            >
              ×
            </button>
          )}
        </div>
        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
          {photo ? (
            <>
              <CropEditor
                key={photo.key}
                photo={photo.canvas}
                initialQuad={photo.quad}
                colour={colour}
                onColourChange={setColour}
                onDone={addPage}
                onSkip={() => setPhoto(null)}
                skipLabel={photo.replaceId !== undefined ? t('tools.common.cancel') : undefined}
              />
              {queue.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 text-right">
                  {t.plural('tools.scan.queue_more', queue.length)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {source === 'camera' ? t('tools.scan.intro_camera') : t('tools.scan.intro_photo')}
              </p>

              {pages.length > 0 && (
                <ol className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3" aria-label={t.plural('tools.scan.pages', pages.length)}>
                  {pages.map((e, i) => (
                    <li key={e.id} className="relative rounded border border-slate-200 bg-slate-50 overflow-hidden">
                      <img src={e.url} alt={t('tools.scan.page_n', { n: i + 1 })} className="block w-full aspect-[3/4] object-contain" />
                      <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[11px] tabular-nums text-slate-600">
                        {i + 1}
                      </span>
                      {/* Along the bottom, so the page number in the corner stays visible. */}
                      <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void adjust(e.id)}
                          disabled={working || decoding}
                          aria-label={t('tools.scan.adjust', { n: i + 1 })}
                          title={t('tools.scan.adjust', { n: i + 1 })}
                          className="w-7 h-7 rounded-full bg-white/90 text-slate-700 shadow text-sm leading-none hover:bg-white disabled:opacity-50"
                        >
                          ✂
                        </button>
                        <button
                          type="button"
                          onClick={() => void rotate(e.id)}
                          disabled={working}
                          aria-label={t('tools.scan.rotate', { n: i + 1 })}
                          title={t('tools.scan.rotate', { n: i + 1 })}
                          className="w-7 h-7 rounded-full bg-white/90 text-slate-700 shadow text-sm leading-none hover:bg-white disabled:opacity-50"
                        >
                          ↻
                        </button>
                        <button
                          type="button"
                          onClick={() => removePage(e.id)}
                          disabled={working}
                          aria-label={t('tools.scan.remove', { n: i + 1 })}
                          title={t('tools.scan.remove', { n: i + 1 })}
                          className="w-7 h-7 rounded-full bg-white/90 text-slate-700 shadow text-base leading-none hover:bg-white disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {source === 'camera' ? (
                <button
                  type="button"
                  onClick={() => void scanMore()}
                  disabled={working}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:border-orange-400 hover:bg-orange-50/50 transition-colors disabled:opacity-60"
                >
                  <span aria-hidden="true">📷</span>
                  {t('tools.scan.scan_more')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={working || decoding}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors disabled:opacity-60"
                  >
                    <span className="shrink-0 w-9 h-9 rounded bg-slate-100 text-slate-600 flex items-center justify-center">
                      🖼
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">
                        {decoding ? t('tools.scan.opening_photo') : t('tools.scan.choose_photo')}
                      </span>
                      <span className="block text-xs text-slate-500">{t('tools.scan.photo_hint')}</span>
                    </span>
                  </button>
                  {/* `.heic`/`.heif` spelled out for the reason ConvertDialog
                      gives: a phone photo on Windows often has no MIME type. */}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    hidden
                    data-testid="scan-photo-input"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      if (files.length) setQueue((q) => [...q, ...files])
                    }}
                  />
                </>
              )}

              {pages.length > 0 && (
                <>
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
                      {t('tools.scan.paper')}
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                      {([
                        ['a4', t('tools.scan.paper_a4')],
                        ['letter', t('tools.scan.paper_letter')],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPaper(value)}
                          disabled={working}
                          aria-pressed={paper === value}
                          className={[
                            'rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                            paper === value ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ocr}
                      onChange={(e) => setOcr(e.target.checked)}
                      disabled={working}
                      className="mt-0.5 accent-orange-700"
                    />
                    <span>
                      {t('tools.scan.make_searchable')}
                      <span className="block text-xs text-slate-500">{t('tools.scan.make_searchable_hint')}</span>
                    </span>
                  </label>
                </>
              )}

              <div className="mt-5 flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={close}
                  disabled={working}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {t('tools.common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={pages.length === 0 || working || decoding}
                  className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ?? (pages.length > 0 ? t.plural('tools.scan.create', pages.length) : t('tools.scan.create_empty'))}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
