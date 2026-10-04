import {
  PDFHexString,
  PDFName,
  PDFString,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib'

/**
 * The invisible text layer OCR lays over a scanned page — in ANY script.
 *
 * ⚠️ Why not `page.drawText` with Helvetica, as this used to: a standard font
 * can only encode WinAnsi (Latin-1 plus a few), so every Japanese, Chinese and
 * Korean character — and Turkish ğ ş ı İ, and Polish, Czech… — was silently
 * dropped from the text layer. The OCR read the page and none of it could be
 * found or copied.
 *
 * This is the standard answer (Tesseract's own PDF renderer, OCRmyPDF): a
 * "glyphless" font — a TrueType program with a single empty glyph — as a Type0
 * font with Identity-H encoding. Every character is written as its UTF-16 code
 * unit, a CIDToGIDMap sends every one of the 65,536 codes to that empty glyph,
 * and a ToUnicode CMap maps each code straight back to itself, which is what
 * search, selection and copy read. It is drawn in text-rendering mode 3
 * (invisible): nothing is painted, the scan shows through, and every character
 * of every script is there to be found. The whole font costs about 1 kB per
 * document, whatever the language.
 *
 * Each word is stretched (Tz) to the width of its box on the scan, so a search
 * hit or a selection lands on the word in the picture.
 */

// GlyphLessFont — `tessdata/pdf.ttf` from the Tesseract OCR project
// (https://github.com/tesseract-ocr/tesseract), Apache License 2.0, the same
// project and licence as the tesseract.js engine this app already ships. 572
// bytes: one advance-500 glyph with no outline.
const GLYPHLESS_TTF_BASE64 =
  'AAEAAAAKAIAAAwAgT1MvMlbeyJQAAAEoAAAAYGNtYXAACgA0AAABkAAAAB5nbHlmFSJBJAAAAbgAAAAYaGVhZAt48WUAAACsAAAANmhoZWEMAgQCAAAA5AAAACRobXR4BAAAAAAAAYgAAAAIbG9jYQAMAAAAAAGwAAAABm1heHAABAAFAAABCAAAACBuYW1l8usW2gAAAdAAAABLcG9zdAABAAEAAAIcAAAAIAABAAAAAQAAsJRxEF8PPPUEBwgAAAAAAM+a/G4AAAAA1MOn8gAAAAAEAAgAAAAAEAACAAAAAAAAAAEAAAgA//8AAAQAAAAAAAQAAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAwAAAZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAR09PRwBAAAAAAAAB//8AAAABAAGAAAAAAAAAAAAAAAAAAAABAAAAAAAABAAAAAAAAAIAAQAAAAAAFAADAAAAAAAUAAYACgAAAAAAAAAAAAAAAAAMAAAAAQAAAAAEAAgAAAMAADEhESEEAPwACAAAAAADACoAAAADAAAABQAWAAAAAQAAAAAABQALABYAAwABBAkABQAWAAAAVgBlAHIAcwBpAG8AbgAgADEALgAwVmVyc2lvbiAxLjAAAAEAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA='

/** Every glyph's advance, in 1/1000 em — the font's one glyph is 500 wide. */
const GLYPH_ADVANCE = 500

// Code → Unicode, identity over the whole 2-byte range.
const TO_UNICODE_CMAP = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Add the glyphless Type0 font to `doc` once; returns its font dictionary. */
export function embedGlyphlessFont(doc: PDFDocument): PDFRef {
  const ctx = doc.context
  const ttf = base64Bytes(GLYPHLESS_TTF_BASE64)
  const fontFile = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }))

  // Every CID → GID 1 (the empty glyph): 65,536 big-endian pairs of 0x0001,
  // which flate packs down to a few hundred bytes.
  const map = new Uint8Array(2 * 65536)
  for (let i = 1; i < map.length; i += 2) map[i] = 1
  const cidToGid = ctx.register(ctx.flateStream(map))
  const toUnicode = ctx.register(ctx.flateStream(TO_UNICODE_CMAP))

  const descriptor = ctx.register(
    ctx.obj({
      Type: 'FontDescriptor',
      FontName: 'GlyphLessFont',
      Flags: 5, // FixedPitch + Symbolic
      FontBBox: [0, 0, GLYPH_ADVANCE, 1000],
      ItalicAngle: 0,
      Ascent: 1000,
      Descent: -1,
      CapHeight: 1000,
      StemV: 80,
      FontFile2: fontFile,
    }),
  )
  const cidFont = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'GlyphLessFont',
      CIDSystemInfo: ctx.obj({
        Registry: PDFString.of('Adobe'),
        Ordering: PDFString.of('Identity'),
        Supplement: 0,
      }),
      FontDescriptor: descriptor,
      DW: GLYPH_ADVANCE,
      CIDToGIDMap: cidToGid,
    }),
  )
  return ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'GlyphLessFont',
      Encoding: 'Identity-H',
      DescendantFonts: [cidFont],
      ToUnicode: toUnicode,
    }),
  )
}

/** UTF-16BE hex — each code unit is one 2-byte character code (Identity-H). */
export function utf16Hex(text: string): string {
  let hex = ''
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0')
  return hex.toUpperCase()
}

/** One recognised word, already mapped to PDF user space. */
export interface InvisibleWord {
  text: string
  /** Baseline start (the box's bottom-left corner on the page). */
  x: number
  y: number
  /** Baseline length and box height, in points. */
  width: number
  height: number
  /** Baseline direction, radians anticlockwise — non-zero on a rotated page. */
  angle: number
}

/**
 * Draw `words` on `page` as invisible text in the glyphless font. Returns the
 * number of characters written. One q…Q / BT…ET block per page, so it adds
 * nothing to the graphics state the page's own content sees.
 */
export function drawInvisibleWords(page: PDFPage, fontRef: PDFRef, words: InvisibleWord[]): number {
  const usable = words.filter((w) => w.text.trim() && w.width > 0 && w.height > 0)
  if (usable.length === 0) return 0
  const key: PDFName = page.node.newFontDictionary('GlyphLessFont', fontRef)

  let chars = 0
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)]
  for (const w of usable) {
    const text = w.text.trim()
    // The font size IS the box height: ascent 1000, descent ~0, so a selection
    // rectangle covers the word's box from its baseline up.
    const size = w.height
    // Stretch the run so its advance (n × 0.5 em) spans the box's width.
    const natural = (text.length * GLYPH_ADVANCE * size) / 1000
    const squeeze = (100 * w.width) / natural
    if (!Number.isFinite(squeeze) || squeeze <= 0) continue
    const cos = Math.cos(w.angle)
    const sin = Math.sin(w.angle)
    ops.push(
      setFontAndSize(key, size),
      setCharacterSqueeze(round(squeeze)),
      setTextMatrix(round(cos), round(sin), round(-sin), round(cos), round(w.x), round(w.y)),
      showText(PDFHexString.of(utf16Hex(text))),
    )
    chars += text.length
  }
  ops.push(endText(), popGraphicsState())
  page.pushOperators(...ops)
  return chars
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
