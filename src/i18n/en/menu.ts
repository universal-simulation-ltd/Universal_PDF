// Actions menu (FileMenu) and the header: profile, company badge, delete account, file name editor.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // FileMenu — trigger
  'actions': 'Actions', // the button that opens this menu
  // FileMenu — InfoRow (?)
  'info_help': 'What does "{label}" do?', // aria-label of the (?) button beside a menu row
  // FileMenu — current file header and rename editor
  'current_file': 'Current file',
  'current_file_title': '{name} — click to rename', // tooltip on the file name
  'current_file_rename': 'Rename {name}', // screen-reader label on the file name
  'rename_pdf': 'Rename PDF',
  'rename_new_name': 'New file name',
  'cancel': 'Cancel',
  'save': 'Save',
  // FileMenu — top level with no document
  'open_pdf': 'Open PDF…',
  // FileMenu — File
  'file': 'File', // menu section header
  'close_pdf': 'Close PDF',
  'open_another_pdf': 'Open another PDF…',
  'back_up': 'Back up…', // verb: back up the open document
  'backups': 'Backups…', // noun: shown when no document is open
  // FileMenu — View
  'view': 'View', // menu section header
  'pages': 'Pages', // opens the page navigator
  'present': 'Present', // verb: full-screen presentation mode
  'find': 'Find', // verb: search the text
  // FileMenu — Advanced
  'advanced': 'Advanced', // menu section header
  'ocr': 'Make searchable (OCR)',
  'ocr_info': 'Read a scanned PDF on-device so you can find & select its text.',
  'merge': 'Merge with another PDF',
  'merge_info': 'Combine this file with others — reorder before you export.',
  'convert': 'Convert into images',
  'convert_info': 'Render each page to PNG or JPG (a ZIP for multiple pages).',
  'advanced_export': 'Advanced export',
  'advanced_export_info': 'Flatten the pages into pictures, lock it with a password, keep or strip the metadata.',
  'metadata': 'Document metadata',
  'metadata_info': 'See who and what this file names — then scrub it.',
  'about': 'About this app',
  'about_info': 'What it does, what it never sends, and which build you are on.',
  'reset_defaults': 'Reset defaults', // verb phrase: restore dismissed tips
  'defaults_restored': 'Defaults restored', // replaces "Reset defaults" for 2.5s after it is tapped
  'reset_defaults_info': 'Bring back the tips you dismissed with “Don’t show again”. Your documents are untouched.',
  // FileMenu — Redact
  'redact': 'Redact', // menu section header
  'find_and_redact': 'Find and redact',
  'find_and_redact_info': 'Search the text and black out every match.',
  'free_draw': 'Free draw', // draw redaction boxes by hand
  'free_draw_info': 'Drag a box over anything to redact it, or tap to drop one. Pick the fill from the toolbar colours.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Undo / Redo', // menu section header
  'undo': 'Undo',
  'undo_named': 'Undo {action}', // {action} is a whole-document step, e.g. "merge"
  'redo': 'Redo',
  'clear_annotations': 'Clear all annotations',
  // FileMenu — Language
  'language': 'Language',
  'language_other': 'Other…',
  'language_request': '{link} to request a language.',
  'language_contact': 'Contact UNI SIM',
  // CompanyBadge
  'company': 'Company', // caption above the organisation's name
  // ToolbarUserProfile
  'delete_account_row': 'Delete my account…',
  // DeleteAccountDialog
  'delete_done_title': 'Your account has been deleted',
  'delete_done_body': 'You’re signed out everywhere. Universal PDF keeps working without an account, and the files on this device are just as you left them.',
  'close': 'Close',
  'delete_title': 'Delete your account everywhere?',
  'delete_body_email': 'This deletes your Universal ID ({email}) in {every} UNI·SIM app and product you sign in to with it, not just in Universal PDF. It can’t be undone.',
  'delete_body': 'This deletes your Universal ID in {every} UNI·SIM app and product you sign in to with it, not just in Universal PDF. It can’t be undone.',
  'delete_every': 'every', // emphasised word filling {every} in the two sentences above
  'delete_point_profile': 'Your sign-in, profile and settings are deleted.',
  'delete_point_sole_org': 'Organisations where you are the only member are deleted, with everything stored in them.',
  'delete_point_shared_org': 'In an organisation you share, you are removed and it carries on without you.',
  'delete_point_files': 'PDFs on this device and your Recent files are not touched.',
  'delete_point_subscription': 'A paid subscription is not cancelled automatically. Email inbox@unisim.co.uk and we will cancel it.',
  'delete_confirm_label': 'Type {phrase} to confirm', // {phrase} is the literal "delete-all", never translated
  'deleting': 'Deleting…',
  'delete_button': 'Delete my account',
  // FileNameEditor
  'rename_file': 'Rename file',
  'click_to_rename': 'Click to rename',
}
