// The Scan to sign line on the signing certificate page (platform 0306):
// "Signed by <email> via Universal ID · <time>" plus a QR to the hub's /check
// page. Separate from pdf.ts so `npm run test:attest` can run it in plain Node
// (pdf.ts pulls in the i18n runtime); so it imports with `.ts` extensions.
//
// ⚠️ Universal PDF: a copy of Universal Signatures' file, kept in step with it
// (and tested here by `npm run test:attest`). Nothing in this app calls it
// yet: Universal PDF builds no signing certificate page of its own (the SDK's
// appendSigningAuditPage is Signatures'; PDF's certified route keeps its
// record online, on the ?cert= page). Whatever page PDF prints a signing
// record on first is where this goes, with the image it attests
// (phoneAttestStore's `received`), not the cleaned-up library copy.

import { StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import { attestationMatches, type PhoneAttestation } from './phoneAttest.ts'

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
