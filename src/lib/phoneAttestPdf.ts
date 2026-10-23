// The Scan to sign line on the signing certificate page (platform 0306):
// "Signed by <email> via Universal ID · <time>" plus a QR to the hub's /check
// page. Separate from pdf.ts so `npm run test:attest` can run it in plain Node
// (pdf.ts pulls in the i18n runtime); so it imports with `.ts` extensions.
//
// ⚠️ Universal PDF: `printPhoneAttest` is a copy of Universal Signatures'
// file, kept in step with it (and tested here by `npm run test:attest`). PDF
// has no signing certificate of its own (the SDK's appendSigningAuditPage
// vouches for a document fingerprint a server recorded, which PDF has no
// record of), so it prints the line on a page of its own: the "Signing
// record" page `appendSigningRecordPages` adds at the end of an export, when
// a signature that arrived from the UNI·SIM Hub app is on the document
// (James, 2026-10-23). Always checked against the image the phone SENT
// (phoneAttestStore's `received`), not the cleaned-up library copy.

import { PageSizes, StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import { attestationMatches, type AttestedSignature, type PhoneAttestation } from './phoneAttest.ts'

export interface AttestTexts {
  heading: string
  /** With {email} and {time} filled in. */
  line: string
}

export interface PrintPhoneAttestArgs {
  attestation: PhoneAttestation | null | undefined
  /** The signature image in use right now; must be the one attested. */
  signature: string | null | undefined
  /** PNG data URL of the QR to attestation.checkUrl. */
  qrPng?: string
  /** The app's language. */
  texts: (vars: { email: string; time: string }) => AttestTexts
  /** English templates (with {email} / {time}), for a language the font can't draw. */
  english: AttestTexts
}

/** "2026-10-22 14:07 UTC": reads the same in every language on the page. */
export function isoMinuteUtc(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

// The standard fonts only cover WinAnsi (Western European); Turkish ğ or ı throw.
function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

/** Greedy word wrap into at most `max` lines (the last one trimmed with …). */
function wrap(text: string, font: PDFFont, size: number, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (!line || font.widthOfTextAtSize(next, size) <= width) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  let last = lines.slice(max - 1).join(' ')
  while (last.length > 1 && font.widthOfTextAtSize(last + '…', size) > width) last = last.slice(0, -1)
  return [...lines.slice(0, max - 1), last + '…']
}

/**
 * Draw the line and QR on `page`, in the empty band above the certificate
 * page's footer. Returns whether anything was drawn: nothing is, unless the
 * attestation is about exactly `signature` — and nothing rather than a page
 * that throws when even English can't be encoded (an email the standard font
 * can't draw).
 *
 * ⚠️ Placed by coordinates: the SDK's page (signingAudit.ts) ends its verify
 * block around y≈307 and draws its footer rule at y≈140 on A4.
 */
export async function printPhoneAttest(doc: PDFDocument, page: PDFPage, args: PrintPhoneAttestArgs): Promise<boolean> {
  const a = args.attestation
  if (!a || !(await attestationMatches(a, args.signature))) return false

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const vars = { email: a.signerEmail, time: isoMinuteUtc(a.signedAt) }
  const fill = (s: string) => s.replace('{email}', vars.email).replace('{time}', vars.time)
  const local = args.texts(vars)
  const line = canEncode(font, local.line) ? local.line : fill(args.english.line)
  const heading = (canEncode(bold, local.heading.toUpperCase()) ? local.heading : args.english.heading).toUpperCase()
  if (!canEncode(font, line) || !canEncode(bold, heading)) return false

  const ink = rgb(0.11, 0.13, 0.16)
  const muted = rgb(0.42, 0.45, 0.5)
  const margin = 56
  const qrSize = 72
  const top = 280
  const right = page.getWidth() - margin
  const textWidth = right - margin - (args.qrPng ? qrSize + 14 : 0)
  let y = top
  page.drawText(heading, { x: margin, y, size: 8, font: bold, color: muted })
  y -= 16
  for (const l of wrap(line, font, 10, textWidth, 2)) {
    page.drawText(l, { x: margin, y, size: 10, font, color: ink })
    y -= 14
  }
  page.drawText(a.checkUrl, { x: margin, y: y - 2, size: 8, font, color: muted })
  if (args.qrPng) {
    try {
      const png = await doc.embedPng(args.qrPng)
      page.drawImage(png, { x: right - qrSize, y: top + 8 - qrSize, width: qrSize, height: qrSize })
    } catch {
      // A QR that won't embed shouldn't cost the line above it.
    }
  }
  return true
}

// ── The Signing record page ────────────────────────────────────────────────

export interface RecordPageTexts {
  title: string
  intro: string
  /** Over the picture of the signature the phone sent. */
  image: string
  limits: string
}

export interface AppendSigningRecordArgs {
  /** In the app's language; English is used for any text the font can't draw. */
  page: RecordPageTexts
  englishPage: RecordPageTexts
  texts: PrintPhoneAttestArgs['texts']
  english: AttestTexts
  /** A PNG data URL of a QR code for `url`, or undefined for none. */
  qrPngFor?: (url: string) => Promise<string | undefined>
}

/**
 * Add one "Signing record" page per attested signature at the end of `doc`,
 * each with the line and QR `printPhoneAttest` draws. A record whose
 * attestation no longer matches the image the phone sent adds nothing.
 * Returns how many pages were added (0 leaves `doc` untouched).
 */
export async function appendSigningRecordPages(
  doc: PDFDocument,
  records: readonly AttestedSignature[],
  args: AppendSigningRecordArgs,
): Promise<number> {
  let added = 0
  for (const r of records) {
    if (!(await attestationMatches(r.attestation, r.received))) continue
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const pick = (local: string, english: string, f: PDFFont) => (canEncode(f, local) ? local : english)
    const title = pick(args.page.title, args.englishPage.title, bold)
    const intro = pick(args.page.intro, args.englishPage.intro, font)
    const limits = pick(args.page.limits, args.englishPage.limits, font)
    const imageLabel = pick(args.page.image, args.englishPage.image, bold).toUpperCase()
    if (![[bold, title], [font, intro], [font, limits], [bold, imageLabel]].every(([f, t]) => canEncode(f as PDFFont, t as string))) continue

    const page = doc.addPage(PageSizes.A4)
    const ink = rgb(0.11, 0.13, 0.16)
    const muted = rgb(0.42, 0.45, 0.5)
    const rule = rgb(0.85, 0.87, 0.89)
    const margin = 56
    const width = page.getWidth() - margin * 2
    let y = page.getHeight() - margin
    page.drawText(title, { x: margin, y, size: 20, font: bold, color: ink })
    y -= 26
    for (const l of wrap(intro, font, 10, width, 4)) {
      page.drawText(l, { x: margin, y, size: 10, font, color: muted })
      y -= 14
    }
    y -= 8
    page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: rule })

    // The image itself, as the phone sent it: the one the line below is about.
    try {
      const png = await doc.embedPng(r.received.startsWith('data:') ? r.received : `data:image/png;base64,${r.received}`)
      const k = Math.min(240 / png.width, 110 / png.height, 1)
      y -= 30
      page.drawText(imageLabel, { x: margin, y, size: 8, font: bold, color: muted })
      y -= 10
      page.drawImage(png, { x: margin, y: y - png.height * k, width: png.width * k, height: png.height * k })
    } catch {
      // A picture that won't embed shouldn't cost the record.
    }

    const qrPng = args.qrPngFor ? await args.qrPngFor(r.attestation.checkUrl).catch(() => undefined) : undefined
    const did = await printPhoneAttest(doc, page, {
      attestation: r.attestation,
      signature: r.received,
      qrPng,
      texts: args.texts,
      english: args.english,
    })
    if (!did) {
      doc.removePage(doc.getPageCount() - 1)
      continue
    }

    // What the page does and doesn't show, above the foot (printPhoneAttest
    // keeps to the band above y≈180).
    const footY = margin + 54
    page.drawLine({ start: { x: margin, y: footY + 30 }, end: { x: margin + width, y: footY + 30 }, thickness: 1, color: rule })
    let fy = footY + 12
    for (const l of wrap(limits, font, 8, width, 4)) {
      page.drawText(l, { x: margin, y: fy, size: 8, font, color: muted })
      fy -= 11
    }
    added++
  }
  return added
}
