// Brand-styled QR — orange fluid-rounded modules on a near-black tile with the
// UNI·SIM globe mark in the middle, matching the Universal QR app / Ergo's
// mobile sign-on handoff. Rendered to a PNG data URL so a plain <img> can show
// it. qr-code-styling is browser-only and heavy, so it's imported lazily at
// call time to keep it out of the main bundle.

const QR_COLOR = '#F97316' // orange-500 — the suite accent
const QR_BG = '#0b0b0c'    // near-black tile
const QUIET_ZONE = 2

export async function brandedQrPngDataUrl(value: string, size = 240): Promise<string> {
  const QRCodeStyling = (await import('qr-code-styling')).default
  const scale = 2
  const iconUrl = `${import.meta.env.BASE_URL}unisim-icon.png`

  const qr = new QRCodeStyling({
    width: size * scale,
    height: size * scale,
    type: 'canvas',
    data: value,
    image: iconUrl,
    margin: QUIET_ZONE * scale,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { type: 'extra-rounded', color: QR_COLOR },
    cornersSquareOptions: { type: 'extra-rounded', color: QR_COLOR },
    cornersDotOptions: { type: 'dot', color: QR_COLOR },
    backgroundOptions: { color: QR_BG, round: 0.12 },
    imageOptions: { crossOrigin: 'anonymous', margin: 6 * scale, imageSize: 0.24, hideBackgroundDots: true },
  })

  const raw = await qr.getRawData('png')
  if (!(raw instanceof Blob)) throw new Error('QR render produced no image')
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(raw)
  })
}
