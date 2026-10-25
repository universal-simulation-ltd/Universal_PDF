import type { MessageKey } from '../i18n/runtime.ts'

// The stamps: the website's StampPicker and the phone's Sign page ▸ Stamps
// (2026-10-25) draw them from here, so a stamp looks the same from either.

export type StampShape = 'oval' | 'rect'

// Keys, not words: the stamp's name and the word drawn on it are both in the
// user's language, looked up when the picker renders.
export interface StampDef {
  label: MessageKey
  text: MessageKey
  color: string
  shape: StampShape
}

export const STAMPS: StampDef[] = [
  { label: 'sign.stamp_approved', text: 'sign.stamp_approved_text', color: '#16a34a', shape: 'oval' },
  { label: 'sign.stamp_confidential', text: 'sign.stamp_confidential_text', color: '#dc2626', shape: 'oval' },
  { label: 'sign.stamp_draft', text: 'sign.stamp_draft_text', color: '#ea580c', shape: 'rect' },
  { label: 'sign.stamp_received', text: 'sign.stamp_received_text', color: '#2563eb', shape: 'rect' },
  { label: 'sign.stamp_reviewed', text: 'sign.stamp_reviewed_text', color: '#7c3aed', shape: 'oval' },
  { label: 'sign.stamp_void', text: 'sign.stamp_void_text', color: '#dc2626', shape: 'rect' },
  { label: 'sign.stamp_paid', text: 'sign.stamp_paid_text', color: '#16a34a', shape: 'rect' },
  { label: 'sign.stamp_not_approved', text: 'sign.stamp_not_approved_text', color: '#9f1239', shape: 'oval' },
]

// Palette offered in the custom-stamp creator.
export const STAMP_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#9f1239', '#0f172a']

// The stamp's LOGICAL size — the aspect ratio a placed stamp is fitted to, and
// the numbers the drawing below is written in.
export const STAMP_W = 240
export const STAMP_H = 96

// ⚠️ …but it is rasterised at this multiple of that (James, 2026-09-05: "the
// preset stamps lose a lot of quality on stretch, maybe they need to be SVG?").
// A stamp is placed as an ordinary `image` annotation, and every path it
// travels — the Konva canvas, `pdf-lib`'s embedPng on export, the `.unipdf`
// backup, the hosted upload — takes a raster. Making the stamp itself an SVG
// would have to be undone at each of those, so instead the raster simply
// carries enough pixels to survive being stretched: at 4x, a stamp dragged out
// to a third of an A4 page still exports at roughly 300dpi, where the 1x
// version went visibly soft the moment it grew past the size it was dropped at.
//
// Everything below is drawn in logical units and scaled once by ctx.scale, so
// the geometry, the stroke weights and the font all supersample together — do
// NOT hard-code a device pixel anywhere in here.
const STAMP_SUPERSAMPLE = 4

export function renderStampDataUrl(text: string, color: string, shape: StampShape): string {
  const W = STAMP_W
  const H = STAMP_H
  const canvas = document.createElement('canvas')
  canvas.width = W * STAMP_SUPERSAMPLE
  canvas.height = H * STAMP_SUPERSAMPLE
  const ctx = canvas.getContext('2d')!
  ctx.scale(STAMP_SUPERSAMPLE, STAMP_SUPERSAMPLE)
  ctx.clearRect(0, 0, W, H)

  // Choose font size based on text length
  const fontSize = text.length > 10 ? 20 : text.length > 7 ? 24 : 28
  ctx.font = `bold ${fontSize}px Arial, sans-serif`

  const textW = ctx.measureText(text).width
  const padX = Math.max(20, (W - textW) / 2 - 4)
  const padY = 14

  ctx.strokeStyle = color
  ctx.lineWidth = 4

  if (shape === 'oval') {
    const rx = W / 2 - padX
    const ry = H / 2 - padY
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(W / 2, H / 2, rx - 5, ry - 5, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.strokeRect(padX - 4, padY - 4, W - (padX - 4) * 2, H - (padY - 4) * 2)
    ctx.lineWidth = 1.5
    ctx.strokeRect(padX, padY, W - padX * 2, H - padY * 2)
  }

  ctx.fillStyle = color
  ctx.font = `bold ${fontSize}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, W / 2, H / 2)

  return canvas.toDataURL('image/png')
}

/**
 * A stamp in the signature drawer is a signature whose name ends in this
 * English marker (SignatureMenu, StampPicker); shown in the reader's language.
 */
export const STAMP_SUFFIX = ' Stamp'
export const isStampName = (name: string) => name.endsWith(STAMP_SUFFIX)
