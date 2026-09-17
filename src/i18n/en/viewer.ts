// Tool bar, page viewer, find bar, page navigator, placement hints, form fields, links.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // Shared
  'common.cancel': 'Cancel',

  // Toolbar — colour swatches
  'toolbar.color_black': 'Black',
  'toolbar.color_white': 'White',
  'toolbar.color_red': 'Red',
  'toolbar.color_blue': 'Blue',
  'toolbar.color_green': 'Green',
  'toolbar.color_yellow': 'Yellow',
  'toolbar.color_purple': 'Purple',
  // Toolbar — drawing shapes
  'toolbar.shape_tick': 'Tick', // a check mark ✓ drawn on the page
  'toolbar.shape_cross': 'Cross', // an ✗ mark drawn on the page
  'toolbar.shape_line': 'Line',
  'toolbar.shape_box': 'Box', // rectangle shape
  'toolbar.shape_circle': 'Circle',
  // Toolbar — select tools (menu label + one-line help)
  'toolbar.tool_select': 'Select',
  'toolbar.tool_select_help': 'Click to move, resize or edit. On desktop, drag empty space to select many',
  'toolbar.tool_select_area': 'Select area',
  'toolbar.tool_select_area_help': 'Drag a box to select many edits, then move/resize/rotate them together',
  'toolbar.tool_select_area_touch_help': 'Press and hold, then drag a box to select many edits — a plain swipe still scrolls the document',
  'toolbar.tool_select_area_gesture': 'hold, then drag', // very short hint under a phone button
  'toolbar.tool_select_text': 'Select text',
  'toolbar.tool_select_text_help': "Drag over the PDF's own text to select it, then copy (Ctrl/⌘C)",
  'toolbar.tool_hand': 'Hand', // the pan tool
  'toolbar.tool_hand_help': 'Drag to pan around the PDF without selecting',
  // Toolbar — desktop tool buttons (tooltips)
  'toolbar.select_group_hand': 'Hand — drag to pan',
  'toolbar.select_group_area': 'Select area — drag a box',
  'toolbar.select_group_text': 'Select text — drag to copy the PDF text',
  'toolbar.select_group_select': 'Select / move',
  'toolbar.tool_with_options': '{tool} — tap again or long-press for options', // {tool} is a tool name such as "Free draw"
  'toolbar.swatch_more_colours': '{colour} — click again for more colours', // {colour} is a colour name such as "Black"
  'toolbar.custom_colour': 'Custom colour',
  'toolbar.open_select_options': 'Open select options',
  'toolbar.close_select_options': 'Close select options',
  'toolbar.open_text_options': 'Open text options',
  'toolbar.close_text_options': 'Close text options',
  'toolbar.open_drawing_tools': 'Open drawing tools',
  'toolbar.close_drawing_tools': 'Close drawing tools',
  'toolbar.open_colours': 'Open colours',
  'toolbar.close_colours': 'Close colours',
  'toolbar.tool_add_text': 'Add text',
  'toolbar.size': 'Size', // font size label
  'toolbar.font': 'Font',
  'toolbar.fewer_fonts': 'Fewer fonts',
  'toolbar.more_fonts': 'More fonts',
  'toolbar.show_fewer_fonts': 'Show fewer fonts',
  'toolbar.show_more_fonts': 'Show more fonts',
  'toolbar.tool_free_draw': 'Free draw',
  'toolbar.tool_highlighter': 'Highlighter',
  'toolbar.stroke': 'Stroke', // line thickness label
  'toolbar.colour': 'Colour',
  'toolbar.upload_image': 'Upload and place an image',
  'toolbar.add_qr_code': 'Add a QR code',
  'toolbar.export': 'Export', // button, opens the save/export dialog
  // Toolbar — phone bottom bar (very short labels under icons)
  'toolbar.mobile_select_area': 'Area', // short for "Select area"
  'toolbar.mobile_select_text': 'Text', // short for "Select text"
  'toolbar.mobile_draw': 'Draw',
  'toolbar.mobile_text': 'Text', // the add-text tool
  'toolbar.mobile_image': 'Image',
  'toolbar.mobile_qr': 'QR', // QR code
  'toolbar.mobile_undo': 'Undo',
  'toolbar.mobile_save': 'Save',

  // PdfViewer — bottom page / zoom bar
  'bar.show_pages': 'Show pages',
  'bar.pages': 'Pages', // the page list panel
  'bar.page_count_one': '{count} page',
  'bar.page_count_other': '{count} pages',
  'bar.present_title': 'Present full screen (F)',
  'bar.present': 'Present', // verb, starts slideshow mode
  'bar.zoom_out': 'Zoom out',
  'bar.zoom_presets': 'Zoom presets',
  'bar.zoom_reset': 'Reset to 100% (actual size)',
  'bar.zoom_max': 'Maximum zoom for this document ({percent}%)',
  'bar.zoom_in': 'Zoom in',
  'bar.xfa_notice': "This is an Adobe XFA form. You can view and fill it; downloading saves your entries. Annotation and redaction tools don't apply, and complex dynamic forms may render only partially.",

  // FindBar
  'find.placeholder': 'Find in document',
  'find.previous_title': 'Previous match (Shift+Enter)',
  'find.previous': 'Previous match',
  'find.next_title': 'Next match (Enter)',
  'find.next': 'Next match',
  'find.more_actions': 'More actions',
  'find.close_title': 'Close (Esc)',
  'find.close': 'Close find',
  'find.fill': 'Fill', // label before the redaction colour swatches
  'find.fill_black': 'Black redaction',
  'find.fill_white': 'White redaction',
  'find.current_colour': 'Current colour {color}', // {color} is a hex code like #dc2626
  'find.redact_one': 'Redact this 1 match',
  'find.redact_one_detail': 'Just match {n} of {count} — then jump to the next',
  'find.redact_one_detail_none': 'The highlighted match — then jump to the next',
  'find.redact_all_warning': '{title} Automatic search may miss some instances — different spellings, formatting, or scanned text won\'t be caught. Please review the document manually after redacting.', // {title} is the bold sentence below
  'find.redact_all_warning_title': 'Double-check before proceeding.',
  'find.redact_all_none': 'Redact all matches',
  'find.redact_all_one': 'Redact all {count} match',
  'find.redact_all_other': 'Redact all {count} matches',
  'find.redact_all_detail_black': 'Blocks out every match — text is removed on export',
  'find.redact_all_detail_white': 'Whites out every match — text is removed on export',

  // FormFieldLayer
  'form.click_to_fill': 'Click to fill: {name}', // {name} is the form field's own name from the PDF

  // LinkLayer
  'link.open': 'Open link: {label}', // {label} is the link's address
  'link.go_to_page': 'Go to page {page}',

  // PageNavigator
  'nav.close': 'Close pages',
  'nav.delete_confirm': 'Delete page {page}? Any annotations on this page will also be removed.',
  'nav.delete_failed': 'Failed to delete page',
  'nav.reorder_failed': 'Failed to reorder pages',
  'nav.discard_order': 'Discard the new page order',
  'nav.apply_order_title': 'Apply the new page order',
  'nav.applying': 'Applying…',
  'nav.apply_order': 'Apply new order',
  'nav.drag_to_reorder': 'Drag to reorder',
  'nav.page': 'Page {page}',
  'nav.delete_blocked': 'Apply or discard the new page order first',
  'nav.delete_page_title': 'Delete page',
  'nav.delete_page': 'Delete page {page}',
  'nav.move_up_title': 'Move page up',
  'nav.move_up': 'Move page {page} up',
  'nav.move_down_title': 'Move page down',
  'nav.move_down': 'Move page {page} down',

  // PlacementHint — "Tap" on a touchscreen, "Click" with a mouse
  'placement.tap_name': 'Tap where the name should go',
  'placement.click_name': 'Click where the name should go',
  'placement.tap_details': 'Tap where the details should go',
  'placement.click_details': 'Click where the details should go',
  'placement.tap_date': 'Tap where the date should go',
  'placement.click_date': 'Click where the date should go',
  'placement.extra_detail': '“{text}”', // {text} is the name/details/date about to be placed; use your language's quote marks
  'placement.extra_detail_more_one': '“{text}” — {count} more after this',
  'placement.extra_detail_more_other': '“{text}” — {count} more after this',
  'placement.tap_stamp': 'Tap the page to place your stamp',
  'placement.click_stamp': 'Click the page to place your stamp',
  'placement.tap_signature': 'Tap the page to place your signature',
  'placement.click_signature': 'Click the page to place your signature',
  'placement.tap_qr_code': 'Tap the page to place your QR code',
  'placement.click_qr_code': 'Click the page to place your QR code',
  'placement.tap_image': 'Tap the page to place your image',
  'placement.click_image': 'Click the page to place your image',
  'placement.dont_show_again': "Don't show again",
}
