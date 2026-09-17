// Annotation layer (text, drawing, shapes, redaction on the page) and the transform panel.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // Shared
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.done': 'Done',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'This will be redacted on export',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Black',
  'color.white': 'White',
  'color.more': 'More colours',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Sign here',
  'sigfield.name': 'Name', // requested line on a signature box: the signer's name
  'sigfield.date': 'Date', // requested line on a signature box: the signing date
  'sigfield.live': 'Live', // the box asks for a signature drawn live, not an uploaded image
  'sigfield.click_again': 'Click again to sign',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Delete',
  'selection.delete_aria': 'Delete selected object',
  'selection.done_to_select': 'Done — keep this and go back to Select', // "Select" is the name of the pointer tool
  'selection.done_deselect': 'Done — keep this and deselect',
  'selection.confirm_aria': 'Confirm and deselect',
  'selection.qr_edit_title': 'Edit this QR code — link, style or branding',
  'selection.qr_edit_aria': 'Edit this QR code',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'B', // one-letter button face for Bold; use your language's usual letter
  'text.bold': 'Bold',
  'text.italic_letter': 'I', // one-letter button face for Italic
  'text.italic': 'Italic',
  'text.underline_letter': 'U', // one-letter button face for Underline
  'text.underline': 'Underline',
  'text.link_selection': 'Link selected text',
  'text.edit_link': 'Edit link',
  'text.add_link': 'Add link',
  'text.link_prompt': 'Link URL (leave blank to remove):',
  'text.link_prompt_selection': 'Link URL for the selected text (blank to remove):',
  'text.size_decrease': 'Decrease text size',
  'text.size_field': 'Font size in points',
  'text.size_increase': 'Increase text size',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Border',
  'image.border_none': 'None', // no border; short button label
  'image.border_none_title': 'No border',
  'image.border_width': '{width}px border',
  'image.border_solid': 'Solid',
  'image.border_dashed': 'Dashed',

  // AnnotationLayer — line pill
  'line.stroke': 'Stroke', // label for the line thickness slider
  'line.snap_title': 'Rigid line — snap to horizontal, vertical or diagonal (hold Shift while dragging an end for a one-off snap)',
  'line.snap_on': 'Snap On', // toggle button showing snapping is on; keep short
  'line.snap_off': 'Snap Off', // toggle button showing snapping is off; keep short

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Colour',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Delete {count} object',
  'selection.delete_many_other': 'Delete {count} objects',
  'selection.delete_many_aria_one': 'Delete {count} selected object',
  'selection.delete_many_aria_other': 'Delete {count} selected objects',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Send to sign — email this document as a signature request',
  'sigfield.send_aria': 'Send to sign',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Clear fill',
  'shape.fill': 'Fill with active colour',
  'shape.redact_title': 'Redact — blacks out the area and permanently removes the text on export',
  'shape.redact_aria': 'Redact this area',
  'redact.to_fill_title': 'Turn into a filled shape — the text underneath is NO LONGER removed on export',
  'redact.to_fill_aria': 'Turn this redaction into a filled shape',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': "Filling won't hide the text",
  'fill_warning.body': 'A filled box only paints over the page. The text underneath stays selectable and readable by a computer. To remove it for good, redact instead.',
  'fill_warning.dont_show': "Don't show this again",
  'fill_warning.fill_anyway': 'Fill anyway',
  'fill_warning.redact_instead': 'Redact instead',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Size', // label before the − 100% + stepper
  'sig_pill.smaller': 'Smaller labels',
  'sig_pill.bigger': 'Bigger labels',
  'sig_pill.align_title': 'Align labels: {align} (click to cycle)',
  'sig_pill.align_aria': 'Align labels {align}, click to change',
  'sig_pill.align_left': 'left', // fills {align}
  'sig_pill.align_centre': 'centre', // fills {align}
  'sig_pill.align_right': 'right', // fills {align}

  // SignatureOptionsModal
  'sig_options.title': 'Signature options',
  'sig_options.intro_restyle': 'Changes the labels and the pen style — the strokes you drew stay exactly as drawn. Use the pill on the signature to resize or align the labels.',
  'sig_options.intro': 'Changes the name and date only — your signature itself stays exactly as drawn. Use the pill on the signature to resize or align the labels.',
  'sig_options.add_details': 'Add your details',
  'sig_options.details_aria': 'Details to show under the signature',
  'sig_options.add_date': 'Add date',
  'sig_options.date_aria': 'Date line under the signature',
  'sig_options.realistic': 'Make it look more realistic',
  'sig_options.realistic_hint': 'Blue ink, uneven pressure and a hand wobble',
  'sig_options.redraw': 'Redraw signature…',

  // TransformPanel
  'transform.sample': `# Welcome to Universal PDF

Paste **Markdown** here and click *Build PDF* to turn formatted text into a clean, printable document.

## Supported formatting

- Headings with \`#\`, \`##\` and \`###\`
- **Bold**, *italic* and \`inline code\`
- Bulleted and numbered lists
- Fenced code blocks, tables and horizontal rules
- [Clickable links](https://www.unisim.co.uk)

> Quotes are highlighted with a coloured bar.

### Example table

| Feature | Status | Notes |
|---|---|---|
| Headings | ready | H1, H2, H3 |
| Tables | ready | auto column widths |
| Code blocks | ready | mono font, wraps |

\`\`\`
Code blocks preserve whitespace.
  Indentation stays put.
\`\`\`

---

Replace this sample with your own text to build a custom PDF.
`, // sample Markdown loaded into the editor: translate the prose, keep every Markdown symbol (# ** * - > | \` ---) and the URL as-is
  'transform.build_failed': 'Failed to build PDF: {error}',
  'transform.drop_wrong_type': 'Drop a Markdown (.md) or plain text (.txt) file.',
  'transform.read_failed': 'Could not read file.',
  'transform.title': 'Transform text into a PDF',
  'transform.subtitle': 'Paste Markdown (or plain text). Headings, lists, tables, code & links supported.',
  'transform.placeholder': '# My document\n\nStart writing Markdown…', // keep the leading "# " (Markdown heading) and the blank line
  'transform.drop_to_load': 'Drop to load',
  'transform.drop_types': '.md or .txt',
  'transform.load_sample': 'Load sample',
  'transform.page': 'Page', // label before the Portrait / Landscape picker
  'transform.orientation_aria': 'Page orientation',
  'transform.portrait': 'Portrait',
  'transform.landscape': 'Landscape',
  'transform.drag_hint': 'Drag a .md / .txt file to load',
  'transform.build_shortcut': '{keys} to build', // {keys} is "⌘/Ctrl + Enter"
  'transform.building': 'Building…',
  'transform.build': 'Build PDF',
}
