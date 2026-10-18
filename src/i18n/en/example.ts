// The example PDF (lib/examplePdf.ts): a three-page feature tour, drawn into the
// file in the app's language. Everything it says must be true in the phone app
// AND on the website, so it says "tap or click" and leaves the button names to
// the `where_*` lines, which the code fills with the app's own labels.
// Lines wrap to fit the page; keep each section to two or three short sentences.
// Only Latin-1 characters plus “ ” ‘ ’ — … · › are safe without the fallback font.
// English is the source of truth: add a key here first, then to every other language.
export default {
  'header': 'Universal PDF — feature tour', // in the dark band at the top of every page
  'page_of': 'Page {n} of {total}', // bottom right of every page
  'where_both': 'Phone app: {phone}   ·   Website: {web}', // small grey line under a section: where to find the tool; {phone}/{web} are button names
  'where_web': 'Website and computer app: {web}', // as above, for a tool the phone app does not have yet
  'try_here': 'Try it here', // small label on a practice area of the page

  // Page 1
  'p1_sub': 'Page 1 of the tour — mark it up', // under the header
  'p1_title': 'Welcome',
  'p1_intro': 'This is a practice PDF, so try anything on it. Undo puts things back, and nothing leaves your device unless you send it. Everything here works in the phone app and on the website: tap or click, whichever you use.',
  'p1_contents': 'In this tour',
  'p1_toc1': 'Highlight, pen, shapes, sticky notes and black out',
  'p1_toc2': 'Fill in a form, text anywhere, page numbers, Export to Word',
  'p1_toc3': 'Sign, pictures, QR codes, pages and the whole-file tools',
  'page_tag': 'Page {n}', // tag in front of each line of the contents
  'hl_title': 'Highlight, pen and shapes',
  'hl_body': 'Pick the highlighter and drag across the line below. The pen draws freehand; the shapes add a box, circle, line, tick or cross.',
  'hl_line': 'Highlight me: drag from one end of this line to the other.',
  'note_title': 'Sticky notes',
  'note_body': 'Put a note in the yellow box and type on it. Minimise folds it to a small icon; tap or click the icon to open it again. A note can hang over the edge of the page, and the saved file keeps it as a folded PDF sticky note that any PDF reader opens.',
  'note_area': 'Put a note here, or drag one half off the page',
  'bo_title': 'Black out',
  'bo_body': 'Drag a box over the made-up details below. When you save or send the file, whatever is under the box is removed for good, not just covered.',
  'bo_name': 'Name',
  'bo_account': 'Account number',
  'p1_tip': 'Tip: made a mistake? Undo puts it back.', // footer, bottom left

  // Page 2
  'p2_sub': 'Page 2 of the tour — fill it in',
  'p2_title': 'Form fields',
  'p2_intro': 'Tap or click any blue box and type. Your answers are saved in the file when you save or send it.',
  'form_head': 'Tap or click a blue box to fill it in',
  'f_name': 'Your full name',
  'f_email': 'Email',
  'f_company': 'Company',
  'f_date': 'Date',
  'f_role': 'Role / title',
  'f_phone': 'Phone',
  'text_title': 'Text anywhere',
  'text_body': 'A form with no boxes? Pick Text, tap or click where the words go, and type. Drag the box to move it; drag a corner to make the words bigger.',
  'text_line1': 'Name', // label in front of a blank line to write on with the Text tool
  'text_line2': 'Signed at', // as above: the place where something was signed
  'pn_title': 'Page numbers',
  'pn_body': 'Number every page at the foot, on the left, in the centre or on the right, as “1” or as “Page 1 of 3”. They follow the pages when you reorder them.',
  'word_title': 'Export to Word',
  'word_body': 'Make an editable Word document (.docx) of the text, on your device. Headings, paragraphs and lists come across; columns, tables and pictures do not.',
  'p2_tip': 'Tip: your answers go into the file when you save or send it.',

  // Page 3
  'p3_sub': 'Page 3 of the tour — sign it and send it',
  'p3_title': 'Sign, add pictures, sort the pages',
  'sign_title': 'Signatures',
  'sign_body': 'Draw your signature, type your name, or take a photo of one signed on paper: the paper goes and only the ink is kept. Keep it, and it waits in your drawer for next time. Then tap or click the box below to put it there.',
  'sign_here': 'Sign here',
  'pic_area': 'Room for a picture or a QR code',
  'every_title': 'Put on every page',
  'every_body': 'Select a signature, stamp or picture you have placed, then press Put on every page under the bin. A copy goes in the same spot on every other page.',
  'pic_title': 'Pictures and QR codes',
  'pic_body': 'Add a logo, a photo or a stamp, or make a QR code that opens a web page. Drag it into place and pull a corner to size it.',
  'pages_title': 'Pages',
  'pages_body': 'See every page at once. Drag a page to reorder it, or remove the pages you do not need, so you keep just the part you want.',
  'file_title': 'The whole file',
  'file_body': 'Tools that work on the whole document:',
  'tool_compress': 'Compress', // a list of tools, each followed by a short note
  'tool_compress_note': 'small enough to email',
  'tool_merge': 'Merge',
  'tool_merge_note': 'add another PDF to this one',
  'tool_lock': 'Lock with a password',
  'tool_lock_note': 'for the right eyes only',
  'tool_ocr': 'Make text searchable (OCR)',
  'tool_ocr_note': 'for scans and photos, on your device',
  'tool_compare': 'Compare',
  'tool_compare_note': 'see what changed between two versions',
  'tool_send': 'Send to sign',
  'tool_send_note': 'share it for someone else to sign',
  'p3_tip': 'Tip: save or send the file, and everything you added goes with it.',
}
