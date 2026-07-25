import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

// Document metadata — the Info dictionary and the XMP packet — travels with a
// PDF wherever it goes, and routinely carries the author's real name, their
// employer's licence of Word/Acrobat, the machine's file path and the times the
// file was written. Read it here so the user can see it, and strip it on
// request. Everything runs against the bytes already in memory; nothing leaves
// the device.

export interface MetadataField {
  key: string
  label: string
  value: string
  /**
   * True when the field can point back at a person, an organisation or a
   * machine — the ones worth calling out before a file is shared.
   */
  identifying?: boolean
}

export interface PdfMetadata {
  fields: MetadataField[]
  /** Size of the embedded XMP packet in bytes; 0 when the PDF has none. */
  xmpBytes: number
  /** Encrypted PDFs can be read but not rewritten, so scrubbing is refused. */
  encrypted: boolean
  hasAny: boolean
}

/** Info-dictionary keys pdf-lib exposes, in the order they read best. */
const INFO_READERS: {
  key: string
  label: string
  identifying?: boolean
  read: (pdf: PDFDocument) => string | Date | undefined
}[] = [
  { key: 'title', label: 'Title', read: (p) => p.getTitle() },
  { key: 'author', label: 'Author', identifying: true, read: (p) => p.getAuthor() },
  { key: 'subject', label: 'Subject', read: (p) => p.getSubject() },
  { key: 'keywords', label: 'Keywords', read: (p) => p.getKeywords() },
  { key: 'creator', label: 'Created with', identifying: true, read: (p) => p.getCreator() },
  { key: 'producer', label: 'Produced by', identifying: true, read: (p) => p.getProducer() },
  { key: 'creationDate', label: 'Created', identifying: true, read: (p) => p.getCreationDate() },
  { key: 'modificationDate', label: 'Last modified', identifying: true, read: (p) => p.getModificationDate() },
]

function formatValue(v: string | Date | undefined): string | null {
  if (v == null) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toLocaleString()
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

function xmpStream(pdf: PDFDocument): PDFRawStream | null {
  try {
    const meta = pdf.catalog.lookup(PDFName.of('Metadata'))
    return meta instanceof PDFRawStream ? meta : null
  } catch {
    return null
  }
}

/**
 * Read every metadata field the PDF carries. Encrypted files are opened
 * read-only (`ignoreEncryption`) so the user can still *see* what's in them.
 */
export async function readPdfMetadata(sourceBytes: ArrayBuffer): Promise<PdfMetadata> {
  const pdf = await PDFDocument.load(sourceBytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  })

  const fields: MetadataField[] = []
  for (const r of INFO_READERS) {
    // A malformed Info entry (wrong object type, unparseable date) makes the
    // pdf-lib getter throw — skip that one field rather than lose the whole read.
    let raw: string | Date | undefined
    try {
      raw = r.read(pdf)
    } catch {
      continue
    }
    const value = formatValue(raw)
    if (value !== null) {
      fields.push({ key: r.key, label: r.label, value, identifying: r.identifying })
    }
  }

  const xmp = xmpStream(pdf)
  const xmpBytes = xmp ? xmp.contents.length : 0

  return {
    fields,
    xmpBytes,
    encrypted: pdf.isEncrypted,
    hasAny: fields.length > 0 || xmpBytes > 0,
  }
}

/**
 * Rewrite the PDF with an empty Info dictionary and no XMP packet. The page
 * content is untouched — this only drops the descriptive wrapper. `save` runs
 * with `updateMetadata: false` so pdf-lib doesn't stamp its own Producer and a
 * fresh ModDate straight back in.
 */
export async function scrubPdfMetadata(sourceBytes: ArrayBuffer): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.load(sourceBytes, { updateMetadata: false })
  if (pdf.isEncrypted) {
    throw new Error('This PDF is encrypted, so its metadata cannot be rewritten.')
  }

  // Wipe every Info key, not just the ones we surface — producers are free to
  // add their own (Company, SourceModified, custom XMP-ish keys) and those
  // identify just as well as Author does.
  const infoRef = pdf.context.trailerInfo.Info
  const info = infoRef ? pdf.context.lookupMaybe(infoRef, PDFDict) : undefined
  if (info) {
    for (const key of info.keys()) info.delete(key)
  }

  pdf.catalog.delete(PDFName.of('Metadata'))

  const out = await pdf.save({ useObjectStreams: true })
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}
