import { create } from 'zustand'
import { openFiles } from '../stores/tabStore'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useToolPrefs } from '../stores/toolPrefsStore'
import { PDF_OR_OFFICE_ACCEPT } from '../lib/officeFiles'
import { getT, useT } from '../i18n'
import type { ScanPage } from '../lib/scan'
import type { ConvertMode } from '../components/Convert/ConvertDialog'
import { topScreen, useNav, type Screen } from './nav'
import { PATHS } from './icons'

// The Desk's carousel: three ways in, then twelve jobs. Tapping a job picks a
// file (where the job needs one), opens it, and puts the right tool in hand —
// the same doors the website's landing page has, on cards rather than in a
// menu. The jobs that make a new PDF (Scan, Merge, Photos, OCR, Compare) have a
// page of their own (`openJob`); what the page starts with rides on `dialog`.

export type JobId =
  | 'open' | 'scan' | 'example'
  | 'compress' | 'sign' | 'send-sign' | 'fill' | 'merge' | 'blackout'
  | 'pages' | 'photos' | 'lock' | 'ocr' | 'compare' | 'markup'

/** What a job page starts with: the pages scanned, the file picked… */
export type JobDialog =
  | { kind: 'scan'; source: 'camera' | 'photo'; pages?: ScanPage[] }
  | { kind: 'merge'; initialFile?: File | null }
  | { kind: 'convert'; mode: ConvertMode; initialPdf?: File | null }
  | { kind: 'ocr'; bytes: ArrayBuffer; name: string }
  | { kind: 'compare'; bytes: ArrayBuffer; name: string }

interface JobState {
  dialog: JobDialog | null
  busy: JobId | null
  setDialog: (d: JobDialog | null) => void
  setBusy: (b: JobId | null) => void
}

export const useJobs = create<JobState>((set) => ({
  dialog: null,
  busy: null,
  setDialog: (dialog) => set({ dialog }),
  setBusy: (busy) => set({ busy }),
}))

const PAGE_FOR: Record<JobDialog['kind'], Screen> = {
  scan: 'scan',
  merge: 'merge',
  convert: 'photos',
  ocr: 'ocr',
  compare: 'compare',
}

/**
 * Open a job's page with what it starts with. The page takes `dialog` off
 * again as it closes. A second Scan (the Shortcut, say) over an open Scan page
 * replaces it rather than stacking another.
 */
export function openJob(d: JobDialog): void {
  useJobs.getState().setDialog(d)
  const nav = useNav.getState()
  const screen = PAGE_FOR[d.kind]
  if (topScreen(nav.screens) === screen) nav.replaceTop(screen)
  else nav.push(screen)
}

/** Where a job page's back chevron goes: the open document, or the Desk. */
export function useJobBackLabel(): string {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const fileName = usePdfStore((s) => s.fileName)
  return doc && fileName ? fileName.replace(/\.pdf$/i, '') : t('phone.tab_desk')
}

/** The open document as a File, for a job started from What else. */
export function currentFile(): File | null {
  const { sourceBytes, fileName } = usePdfStore.getState()
  return sourceBytes && fileName ? new File([sourceBytes.slice(0)], fileName, { type: 'application/pdf' }) : null
}

export interface JobCard {
  id: JobId
  label: string
  note: string
  icon: string
}

/** The three ways in, then the twelve jobs, in the board's order. */
export function jobCards(): JobCard[] {
  const t = getT()
  const c = (id: JobId, key: string, icon: string): JobCard => ({
    id,
    label: t(`phone.${key}` as never),
    note: t(`phone.${key}_note` as never),
    icon,
  })
  return [
    c('open', 'open_files', PATHS.folder),
    c('scan', 'scan', PATHS.scan),
    c('example', 'example', PATHS.example),
    c('compress', 'job_compress', PATHS.compress),
    c('sign', 'job_sign', PATHS.sign),
    c('send-sign', 'job_send_sign', PATHS.send),
    c('fill', 'job_fill', PATHS.fill),
    c('merge', 'job_merge', PATHS.merge),
    c('blackout', 'job_blackout', PATHS.blackout),
    c('pages', 'job_pages', PATHS.pages),
    c('photos', 'job_photos', PATHS.photos),
    c('lock', 'job_lock', PATHS.lock),
    c('ocr', 'job_ocr', PATHS.search),
    c('compare', 'job_compare', PATHS.compare),
    c('markup', 'job_markup', PATHS.markup),
  ]
}

/**
 * The system file picker, as a promise. Resolves with nothing when it is
 * dismissed (`cancel` is where the browser and both WebViews support it; a
 * picker that says nothing simply leaves the promise waiting, which costs
 * nothing).
 *
 * ⚠️ Called straight from the tap, with no `await` before it: iOS only opens a
 * picker inside the gesture that asked for it.
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    const done = (files: File[]) => {
      resolve(files)
      input.remove()
    }
    input.addEventListener('change', () => done(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => done([]))
    document.body.appendChild(input)
    input.click()
  })
}

const PDF_ONLY = 'application/pdf,.pdf'

/** Open one picked document; true once it is on screen. */
async function pickAndOpen(): Promise<boolean> {
  const files = await pickFiles(PDF_OR_OFFICE_ACCEPT)
  if (!files.length) return false
  return openFiles(files.slice(0, 1))
}

function arm(tool: Parameters<ReturnType<typeof useAnnotationStore.getState>['setTool']>[0], colour?: string) {
  const s = useAnnotationStore.getState()
  s.setSelected(null)
  if (colour) s.setColor(colour)
  s.setTool(tool)
}

export async function runJob(id: JobId): Promise<void> {
  const jobs = useJobs.getState()
  const nav = useNav.getState()
  const t = getT()
  if (jobs.busy) return
  try {
    switch (id) {
      case 'open': {
        const files = await pickFiles(PDF_OR_OFFICE_ACCEPT, true)
        if (files.length) await openFiles(files)
        return
      }
      case 'scan': {
        jobs.setBusy('scan')
        const { isDocumentScanAvailable, scanWithCamera } = await import('../lib/documentScanner')
        if (!(await isDocumentScanAvailable())) {
          // No scanner on this phone (or in a browser): the photo road, one
          // photo at a time through the corner editor.
          openJob({ kind: 'scan', source: 'photo' })
          return
        }
        const jpegs = await scanWithCamera()
        if (!jpegs) return
        const { pageFromJpeg } = await import('../lib/scan')
        openJob({ kind: 'scan', source: 'camera', pages: await Promise.all(jpegs.map(pageFromJpeg)) })
        return
      }
      case 'example': {
        jobs.setBusy('example')
        const { createExamplePdfFile } = await import('../lib/examplePdf')
        await openFiles([await createExamplePdfFile()])
        return
      }
      case 'compress':
        if (await pickAndOpen()) nav.push('smaller')
        return
      case 'sign':
        if (await pickAndOpen()) nav.push('sign')
        return
      case 'send-sign':
        if (await pickAndOpen()) {
          arm('sigfield')
          nav.openSheet('send-sign')
        }
        return
      case 'fill':
        if (await pickAndOpen()) arm('select')
        return
      case 'merge':
        openJob({ kind: 'merge' })
        return
      case 'blackout':
        if (await pickAndOpen()) {
          arm('redact', '#000000')
          nav.openSheet('markup')
        }
        return
      case 'pages':
        if (await pickAndOpen()) nav.push('pages')
        return
      case 'photos':
        openJob({ kind: 'convert', mode: 'images-to-pdf' })
        return
      case 'lock':
        if (await pickAndOpen()) {
          nav.setSharePassword(true)
          nav.push('share')
        }
        return
      case 'ocr':
      case 'compare': {
        const [file] = await pickFiles(PDF_ONLY)
        if (!file) return
        openJob({ kind: id, bytes: await file.arrayBuffer(), name: file.name })
        return
      }
      case 'markup':
        if (await pickAndOpen()) {
          arm('highlight', useToolPrefs.getState().highlightColours[0])
          nav.openSheet('markup')
        }
        return
    }
  } catch (err) {
    console.error(err)
    const message = String((err as Error)?.message || err)
    nav.say(id === 'scan' ? t('phone.scan_failed', { message }) : t('phone.failed', { message }))
  } finally {
    useJobs.getState().setBusy(null)
  }
}
