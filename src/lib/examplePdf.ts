import { PDFDocument, PageSizes, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

const ORANGE = rgb(0.92, 0.34, 0.06)
const ORANGE_LIGHT = rgb(1, 0.93, 0.85)
const SLATE_900 = rgb(0.06, 0.09, 0.16)
const SLATE_600 = rgb(0.34, 0.39, 0.46)
const SLATE_400 = rgb(0.58, 0.64, 0.72)
const SLATE_200 = rgb(0.89, 0.91, 0.93)
const GREEN_600 = rgb(0.05, 0.59, 0.41)
const GREEN_50 = rgb(0.93, 0.99, 0.96)
const BLUE_50 = rgb(0.94, 0.97, 1)
const BLUE_400 = rgb(0.38, 0.65, 0.98)

interface PageCtx {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  width: number
  height: number
  pageNum: number
  totalPages: number
}

function drawHeader(ctx: PageCtx, subtitle: string) {
  const { page, font, bold, width, height } = ctx
  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: SLATE_900 })
  page.drawCircle({ x: 55, y: height - 35, size: 13, color: ORANGE })
  page.drawText('U', { x: 50, y: height - 41, size: 16, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Universal PDF — Feature tour', { x: 80, y: height - 32, size: 16, font: bold, color: rgb(1, 1, 1) })
  page.drawText(subtitle, { x: 80, y: height - 52, size: 9, font, color: rgb(0.82, 0.86, 0.91) })
}

function drawFooter(ctx: PageCtx, tip: string) {
  const { page, font, bold, width, pageNum, totalPages } = ctx
  page.drawText(tip, { x: 50, y: 60, size: 9, font, color: SLATE_400 })
  const pageLabel = `Page ${pageNum} of ${totalPages}`
  const labelW = bold.widthOfTextAtSize(pageLabel, 9)
  page.drawText(pageLabel, { x: width - 50 - labelW, y: 60, size: 9, font: bold, color: SLATE_400 })
}

export async function createExamplePdfFile(): Promise<File> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const form = pdf.getForm()
  const totalPages = 3

  function makeCtx(page: PDFPage, pageNum: number): PageCtx {
    const { width, height } = page.getSize()
    return { page, font, bold, width, height, pageNum, totalPages }
  }

  // ============================================================
  // Page 1 — Welcome & feature list
  // ============================================================
  {
    const page = pdf.addPage(PageSizes.A4)
    const ctx = makeCtx(page, 1)
    const { width, height } = ctx
    drawHeader(ctx, 'A three-page example of every editor tool in action.')

    let y = height - 110
    page.drawText('Welcome', { x: 50, y, size: 22, font: bold, color: SLATE_900 })
    y -= 28
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: SLATE_200 })
    y -= 25

    page.drawText('This three-page document showcases every editor tool. Use the Pages', {
      x: 50, y, size: 11, font, color: SLATE_600
    })
    y -= 16
    page.drawText('panel on the left to jump between pages, reorder them, or remove any', {
      x: 50, y, size: 11, font, color: SLATE_600
    })
    y -= 16
    page.drawText('you do not need before exporting.', {
      x: 50, y, size: 11, font, color: SLATE_600
    })
    y -= 28

    page.drawText('What you can try on each page:', { x: 50, y, size: 12, font: bold, color: SLATE_900 })
    y -= 22

    const bullets = [
      ['Page 1', 'Read this overview and explore the Pages panel'],
      ['Page 2', 'Fill out form fields — name, email, company, date'],
      ['Page 3', 'Drop in an image, sign, and add annotations']
    ]
    for (const [tag, desc] of bullets) {
      page.drawCircle({ x: 56, y: y + 4, size: 2, color: ORANGE })
      page.drawText(tag, { x: 64, y, size: 10.5, font: bold, color: SLATE_900 })
      page.drawText(`— ${desc}`, { x: 110, y, size: 10.5, font, color: SLATE_600 })
      y -= 17
    }
    y -= 18

    // Pages-feature highlight card
    const cardTop = y
    const cardH = 130
    page.drawRectangle({ x: 50, y: cardTop - cardH, width: width - 100, height: cardH, color: ORANGE_LIGHT, borderColor: ORANGE, borderWidth: 1 })
    page.drawText('Try the Pages panel', { x: 64, y: cardTop - 22, size: 12, font: bold, color: SLATE_900 })
    const tips = [
      'Click the Pages button in the toolbar to open page thumbnails',
      'Drag a thumbnail up or down to reorder pages',
      'Click the ✕ on a thumbnail to delete that page',
      'Use ↑ / ↓ buttons for precise reordering'
    ]
    let ty = cardTop - 42
    for (const t of tips) {
      page.drawCircle({ x: 72, y: ty + 4, size: 1.6, color: ORANGE })
      page.drawText(t, { x: 80, y: ty, size: 10, font, color: SLATE_900 })
      ty -= 16
    }

    drawFooter(ctx, 'Tip: Open the Pages panel to navigate this document.')
  }

  // ============================================================
  // Page 2 — Form fields
  // ============================================================
  {
    const page = pdf.addPage(PageSizes.A4)
    const ctx = makeCtx(page, 2)
    const { width, height } = ctx
    drawHeader(ctx, 'Page 2 — Fillable form fields.')

    let y = height - 110
    page.drawText('Form fields', { x: 50, y, size: 22, font: bold, color: SLATE_900 })
    y -= 28
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: SLATE_200 })
    y -= 25

    page.drawText('Click any blue field below to type into it. Values are saved into the', {
      x: 50, y, size: 11, font, color: SLATE_600
    })
    y -= 16
    page.drawText('PDF when you Export.', { x: 50, y, size: 11, font, color: SLATE_600 })
    y -= 28

    const formTop = y
    const formH = 220
    page.drawRectangle({ x: 50, y: y - formH, width: width - 100, height: formH, borderColor: SLATE_200, borderWidth: 1, color: rgb(1, 1, 1) })
    page.drawRectangle({ x: 50, y: y - 24, width: width - 100, height: 24, color: BLUE_50 })
    page.drawText('Click any blue box to fill', { x: 60, y: y - 17, size: 10, font: bold, color: SLATE_900 })
    y -= 50

    function addField(name: string, label: string, fx: number, fy: number, fw: number) {
      page.drawText(label, { x: fx, y: fy + 22, size: 9, font: bold, color: SLATE_600 })
      const field = form.createTextField(`example_${name}`)
      field.addToPage(page, {
        x: fx,
        y: fy,
        width: fw,
        height: 18,
        borderColor: BLUE_400,
        borderWidth: 1,
        backgroundColor: BLUE_50
      })
    }

    addField('name', 'Your full name', 60, y - 18, 200)
    addField('email', 'Email', 280, y - 18, 215)
    y -= 60
    addField('company', 'Company', 60, y - 18, 200)
    addField('date', 'Date', 280, y - 18, 215)
    y -= 60
    addField('role', 'Role / title', 60, y - 18, 200)
    addField('phone', 'Phone', 280, y - 18, 215)

    y = formTop - formH - 30
    page.drawText('More you can do here:', { x: 50, y, size: 12, font: bold, color: SLATE_900 })
    y -= 20
    const extras = [
      'Use the Text tool to add labels anywhere on the page',
      'Use Tab / Shift+Tab to jump between fields',
      'Field values are baked into the file on Export'
    ]
    for (const e of extras) {
      page.drawCircle({ x: 56, y: y + 4, size: 2, color: ORANGE })
      page.drawText(e, { x: 64, y, size: 10.5, font, color: SLATE_900 })
      y -= 17
    }

    drawFooter(ctx, 'Tip: Press Tab to move from one field to the next.')
  }

  // ============================================================
  // Page 3 — Image, signature, annotations
  // ============================================================
  {
    const page = pdf.addPage(PageSizes.A4)
    const ctx = makeCtx(page, 3)
    const { width, height } = ctx
    drawHeader(ctx, 'Page 3 — Images, signatures, and annotations.')

    let y = height - 110
    page.drawText('Sign and annotate', { x: 50, y, size: 22, font: bold, color: SLATE_900 })
    y -= 28
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: SLATE_200 })
    y -= 25

    page.drawText('Drop in a logo, draw a signature, and mark up the document.', {
      x: 50, y, size: 11, font, color: SLATE_600
    })
    y -= 30

    // Image placeholder (left)
    const imgX = 50, imgY = y - 140, imgW = 220, imgH = 140
    page.drawRectangle({ x: imgX, y: imgY, width: imgW, height: imgH, color: ORANGE_LIGHT, borderColor: ORANGE, borderWidth: 1 })
    page.drawCircle({ x: imgX + 40, y: imgY + 100, size: 14, color: rgb(1, 0.87, 0.27) })
    page.drawRectangle({ x: imgX, y: imgY, width: imgW, height: 55, color: rgb(0.53, 0.94, 0.59) })
    page.drawSvgPath('M0 55 L40 22 L78 38 L120 6 L165 28 L220 12 L220 55 Z', {
      x: imgX, y: imgY + 55,
      color: rgb(0.58, 0.64, 0.72)
    })
    page.drawText('Image — drop a logo, photo or stamp here', {
      x: imgX + 8, y: imgY - 14, size: 8, font, color: SLATE_400
    })

    // Signature (right)
    const sigX = imgX + imgW + 30, sigW = width - 100 - imgW - 30
    page.drawRectangle({ x: sigX, y: imgY, width: sigW, height: imgH, color: rgb(1, 1, 1), borderColor: SLATE_200, borderWidth: 1 })
    page.drawText('Signed by', { x: sigX + 12, y: imgY + imgH - 22, size: 9, font: bold, color: SLATE_600 })

    page.drawSvgPath(
      'M0 0 C 10 -18, 22 16, 36 -4 S 60 14, 78 -8 S 110 4, 130 -10',
      { x: sigX + 16, y: imgY + imgH - 58, borderColor: ORANGE, borderWidth: 2 }
    )
    page.drawText('Alex Morgan', { x: sigX + 16, y: imgY + 42, size: 10, font: bold, color: SLATE_900 })
    page.drawText('Director of Operations', { x: sigX + 16, y: imgY + 29, size: 8, font, color: SLATE_600 })

    const badgeY = imgY + 10
    const badgeText = 'Verified: alex@example.com'
    const badgeW = bold.widthOfTextAtSize(badgeText, 8) + 26
    page.drawRectangle({ x: sigX + 12, y: badgeY, width: badgeW, height: 14, color: GREEN_50, borderColor: GREEN_600, borderWidth: 0.5 })
    page.drawLine({
      start: { x: sigX + 16, y: badgeY + 6 },
      end: { x: sigX + 19, y: badgeY + 3.5 },
      thickness: 1.2,
      color: GREEN_600
    })
    page.drawLine({
      start: { x: sigX + 19, y: badgeY + 3.5 },
      end: { x: sigX + 24, y: badgeY + 10 },
      thickness: 1.2,
      color: GREEN_600
    })
    page.drawText(badgeText, { x: sigX + 28, y: badgeY + 3.5, size: 8, font: bold, color: GREEN_600 })

    // Annotations row
    y = imgY - 40
    page.drawText('Annotations — ticks, crosses, free draw, rectangles', { x: 50, y, size: 11, font: bold, color: SLATE_900 })
    y -= 20

    page.drawSvgPath('M0 10 L8 18 L22 0', { x: 60, y: y - 22, borderColor: GREEN_600, borderWidth: 2.5 })
    page.drawText('Approved', { x: 92, y: y - 18, size: 10, font, color: SLATE_900 })

    page.drawLine({ start: { x: 200, y: y - 4 }, end: { x: 218, y: y - 22 }, thickness: 2.5, color: rgb(0.86, 0.15, 0.15) })
    page.drawLine({ start: { x: 200, y: y - 22 }, end: { x: 218, y: y - 4 }, thickness: 2.5, color: rgb(0.86, 0.15, 0.15) })
    page.drawText('Rejected', { x: 230, y: y - 18, size: 10, font, color: SLATE_900 })

    page.drawRectangle({ x: 340, y: y - 25, width: 80, height: 22, borderColor: rgb(0.15, 0.39, 0.92), borderWidth: 1.5 })
    page.drawText('Highlight', { x: 350, y: y - 19, size: 10, font, color: rgb(0.15, 0.39, 0.92) })

    drawFooter(ctx, 'Tip: Save the annotated copy via Export, or shrink it via Compress.')
  }

  const bytes = await pdf.save()
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  return new File([blob], 'Universal-PDF-example.pdf', { type: 'application/pdf' })
}
