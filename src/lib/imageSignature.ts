import { getT } from '../i18n'

const MAX_DIM = 1024
const BG_THRESHOLD = 245
const CONTENT_THRESHOLD = 215

export interface ImportedSignature {
  dataUrl: string
  width: number
  height: number
}

export interface ImportOptions {
  removeBg?: boolean
}

export async function importImageAsSignature(
  file: File,
  { removeBg = true }: ImportOptions = {}
): Promise<ImportedSignature> {
  if (!/^image\//.test(file.type)) {
    throw new Error(getT()('lib.sig_image_wrong_type'))
  }

  const src = await fileToDataUrl(file)
  const img = await loadImage(src)

  let w = img.naturalWidth
  let h = img.naturalHeight
  if (!w || !h) throw new Error(getT()('lib.sig_image_no_size'))

  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(getT()('lib.sig_image_no_canvas'))
  ctx.drawImage(img, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  let minX = w, minY = h, maxX = -1, maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a === 0) continue
      const minCh = Math.min(r, g, b)
      const isContent = minCh < CONTENT_THRESHOLD
      if (isContent) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      if (removeBg) {
        if (minCh >= BG_THRESHOLD) {
          data[i + 3] = 0
        } else if (minCh > CONTENT_THRESHOLD) {
          const t = (minCh - CONTENT_THRESHOLD) / (BG_THRESHOLD - CONTENT_THRESHOLD)
          data[i + 3] = Math.round(a * (1 - t))
        }
      }
    }
  }

  if (maxX < 0) {
    if (!removeBg) {
      return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
    }
    throw new Error(getT()('lib.sig_image_blank'))
  }

  if (removeBg) ctx.putImageData(imageData, 0, 0)

  const pad = 6
  const cx = Math.max(0, minX - pad)
  const cy = Math.max(0, minY - pad)
  const cw = Math.min(w, maxX + pad + 1) - cx
  const ch = Math.min(h, maxY + pad + 1) - cy

  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  const outCtx = out.getContext('2d')!
  outCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)

  return { dataUrl: out.toDataURL('image/png'), width: cw, height: ch }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error(getT()('lib.sig_image_read_failed')))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(getT()('lib.sig_image_decode_failed')))
    img.src = src
  })
}
