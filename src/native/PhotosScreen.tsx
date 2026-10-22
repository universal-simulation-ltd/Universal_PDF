import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { imagesToPdf, pdfToImages, type ImageFormat } from '../lib/convert'
import { downloadZip } from '../lib/zip'
import { saveBlob } from '@unisim/media/save'
import { openFiles } from '../stores/tabStore'
import type { ConvertMode } from '../components/Convert/ConvertDialog'
import { formatSize } from '../components/Export/formatSize'
import { Icon, PATHS } from './icons'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, JobPage, Segmented } from './parts'
import { useNav } from './nav'
import { pickFiles, useJobBackLabel, useJobs } from './jobs'
import { handOver } from './output'
import { AddSlip } from './MergeScreen'
import { FileSlip } from './OcrScreen'

// Photos to PDF, and the pages of a PDF as pictures, a page (was the
// website's Convert dialog). The two ways round are the Sign page's segmented
// control. Photos lie on the page as little prints; a PDF is a slip with its
// name. Everything runs on this phone.

export default function PhotosScreen() {
  const dialog = useJobs((s) => s.dialog)
  if (dialog?.kind !== 'convert') return null
  return <PhotosPage mode={dialog.mode} initialPdf={dialog.initialPdf ?? null} />
}

const TILTS = ['-3deg', '2deg', '-1.5deg', '2.5deg', '-2deg', '1deg']

function PhotosPage({ mode: startMode, initialPdf }: { mode: ConvertMode; initialPdf: File | null }) {
  const t = useT()
  const backLabel = useJobBackLabel()
  const [mode, setMode] = useState<ConvertMode>(startMode)
  const [images, setImages] = useState<File[]>([])
  const [pdf, setPdf] = useState<File | null>(initialPdf)
  const [format, setFormat] = useState<ImageFormat>('png')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const back = () => useNav.getState().pop()

  const thumbs = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images])
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs])

  function addImages() {
    // `.heic`/`.heif` spelled out: a phone photo can arrive with no MIME type.
    void pickFiles('image/*,.heic,.heif', true).then((files) => {
      if (files.length) setImages((prev) => [...prev, ...files])
    })
  }

  function choosePdf() {
    void pickFiles('application/pdf,.pdf').then(([f]) => {
      if (f) setPdf(f)
    })
  }

  async function toPdf(open: boolean) {
    if (!images.length || busy) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await imagesToPdf(images)
      if (open) await openFiles([new File([bytes.slice() as BlobPart], 'photos.pdf', { type: 'application/pdf' })])
      else await handOver(bytes, 'photos.pdf')
    } catch (err) {
      setError(t('tools.convert.failed', { message: (err as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  async function toImages() {
    if (!pdf || busy) return
    setBusy(true)
    setError(null)
    setProgress('')
    try {
      const entries = await pdfToImages(await pdf.arrayBuffer(), pdf.name, {
        format,
        onProgress: (done, total) => setProgress(t('tools.convert.rendering', { done, total })),
      })
      if (entries.length === 1) {
        saveBlob(new Blob([entries[0].data as BlobPart], { type: format === 'png' ? 'image/png' : 'image/jpeg' }), entries[0].name)
      } else {
        downloadZip(entries, `${pdf.name.replace(/\.pdf$/i, '')}-images.zip`)
      }
    } catch (err) {
      setError(t('tools.convert.failed', { message: (err as Error).message }))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <JobPage
      backLabel={backLabel}
      onBack={back}
      lead={mode === 'images-to-pdf' ? t('phone.photos_lead') : t('phone.pictures_lead')}
      hl={mode === 'images-to-pdf' ? t('phone.photos_hl') : t('phone.pictures_hl')}
      footer={
        mode === 'images-to-pdf' ? (
          <>
            <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={!images.length || busy} onClick={() => void toPdf(true)}>
              {busy ? t('tools.convert.converting') : t('tools.convert.convert_open')}
            </button>
            <button type="button" className={BTN_SECOND} style={BTN_SECOND_STYLE} disabled={!images.length || busy} onClick={() => void toPdf(false)}>
              {t('phone.share')}
            </button>
          </>
        ) : (
          <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={!pdf || busy} onClick={() => void toImages()}>
            {busy ? progress || t('tools.convert.converting') : t('phone.pictures_save')}
          </button>
        )
      }
    >
      <Segmented
        label={t('tools.convert.title')}
        value={mode}
        disabled={busy}
        onChange={(m) => {
          setMode(m)
          setError(null)
        }}
        options={[
          { id: 'images-to-pdf', label: t('tools.convert.images_to_pdf') },
          { id: 'pdf-to-images', label: t('tools.convert.pdf_to_images') },
        ]}
      />

      {mode === 'images-to-pdf' ? (
        <>
          {images.length > 0 && (
            <ol className="m-0 p-0 list-none grid grid-cols-3 gap-3" aria-label={t.plural('tools.convert.images_selected', images.length)}>
              {images.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="np-tilt relative bg-white p-1.5 pb-5"
                  style={{ transform: `rotate(${TILTS[i % TILTS.length]})`, boxShadow: '0 6px 14px rgba(60,45,20,0.18)' }}
                >
                  <img src={thumbs[i]} alt={f.name} className="block w-full aspect-[3/4] object-cover bg-[#eee]" />
                  <span className="np-hand absolute left-2 bottom-0 text-[18px] text-[color:var(--np-muted)]">{i + 1}</span>
                  <button
                    type="button"
                    aria-label={t('tools.merge.remove', { name: f.name })}
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    disabled={busy}
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center"
                    style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
                  >
                    <Icon d={PATHS.close} size={14} width={2.6} stroke="var(--np-ink-2)" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <AddSlip
            label={images.length ? t('phone.photos_add_more') : t('tools.convert.choose_images')}
            note={t('tools.convert.images_hint')}
            onClick={addImages}
            disabled={busy}
          />
          {images.length > 0 && (
            <p className="m-0 text-[13px] text-[color:var(--np-muted)] tabular-nums">
              {t.plural('tools.convert.images_selected', images.length)} · {formatSize(t, images.reduce((n, f) => n + f.size, 0))}
            </p>
          )}
        </>
      ) : (
        <>
          {pdf ? (
            <button type="button" onClick={choosePdf} disabled={busy} className="text-left">
              <FileSlip name={pdf.name} note={`${formatSize(t, pdf.size)} · ${t('tools.convert.one_image_per_page')}`} />
            </button>
          ) : (
            <AddSlip label={t('tools.convert.choose_pdf')} note={t('tools.convert.one_image_per_page')} onClick={choosePdf} disabled={busy} />
          )}
          <Segmented
            label={t('tools.convert.image_format')}
            value={format}
            disabled={busy}
            onChange={setFormat}
            options={[
              { id: 'png', label: t('tools.convert.png_sharp') },
              { id: 'jpeg', label: t('tools.convert.jpg_smaller') },
            ]}
          />
        </>
      )}

      {error && <p className="m-0 text-[14px] text-[#b42318]">{error}</p>}
    </JobPage>
  )
}
