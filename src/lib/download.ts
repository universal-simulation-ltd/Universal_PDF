import { saveBlob } from '@unisim/media/save'

// Hand finished PDF bytes to the platform's save path (download, share sheet,
// Save dialog). Its own module so the many dialogs that only SAVE a result can
// import it without pulling `export.ts` — and with it pdf-lib — into the
// start-up bundle. `export.ts` re-exports it, so either import works.
export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  saveBlob(blob, fileName)
}
