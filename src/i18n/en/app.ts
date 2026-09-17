// App shell, landing page, tabs, onboarding, recent files, unsaved-changes dialog, error screen, live preview.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // Shared
  'cancel': 'Cancel',
  'close': 'Close', // verb, button that closes a panel
  'dismiss': 'Dismiss', // verb, button that hides a notice
  'discard': 'Discard', // verb, button that throws away a compressed result
  'loading': 'Loading…',

  // App
  'could_not_open': 'Could not open {name}', // {name} is a file name
  'failed_to_load_pdf': 'Failed to load PDF',
  'failed_to_load_searchable': 'Failed to load searchable PDF',
  'dismiss_notice_aria': 'Dismiss conversion notice',
  'loading_pdf': 'Loading PDF…',
  'footer_with_love': 'With {heart} from {link}', // {heart} is a heart symbol meaning "love"; {link} is "UNISIM.co.uk"
  'footer_love_sr': 'love', // screen-reader text for the heart symbol in "With ♥ from UNISIM.co.uk"
  'github_aria': 'Universal PDF on GitHub',
  'github_title': 'View source on GitHub',
  'drop_title': 'Drop to open', // shown while a file is dragged over the window
  'drop_hint': 'Each one opens in a tab of its own, beside the one you have open',

  // ErrorBoundary
  'error_title': 'Something went wrong',
  'error_body': 'Universal PDF failed to start. This is usually a configuration issue on our end — please try reloading the page.',
  'error_details': 'Error details',
  'error_reload': 'Reload page',

  // DocumentTabs
  'tabs_aria': 'Open PDFs', // label of the tab strip: the PDFs that are open (not a command)
  'tab_unsaved_sr': '(changes not saved to a file)',
  'tab_close_aria': 'Close {name}', // {name} is a document name
  'tab_close': 'Close tab',
  'tab_open_another_aria': 'Open another PDF in a new tab',
  'tab_open_another': 'Open another PDF',

  // UnsavedChangesDialog
  'unsaved_close': 'Closing it returns you to the start screen.',
  'unsaved_close_tab': 'Closing its tab leaves your other PDFs open.',
  'unsaved_open_another': 'Opening another PDF replaces what is on screen.',
  'unsaved_merge': 'The merged PDF is built from the files themselves, so your annotations stay with this document rather than moving onto the result.',
  'unsaved_convert': 'The converted PDF is built fresh, so your annotations stay with this document rather than moving onto the result.',
  'unsaved_quit': 'Closing the window closes everything open in it.',
  'unsaved_title': 'Save your changes?',
  'unsaved_body': '{name} has amendments that aren’t in a saved file yet. {consequence}', // {name} is the file name; {consequence} is one of the unsaved_close… sentences
  'unsaved_this_pdf': 'This PDF', // stands in for the file name when there is none
  'unsaved_marks_stay': 'Your marks stay in {recent} on this device either way — saving writes them into a PDF you can send, keep or print.',
  'recent_files': 'Recent files', // name of the recently opened files list
  'unsaved_redact_title': 'Permanent redaction',
  'unsaved_redact_body_one': 'Saving flattens {count} redaction box and removes the text underneath for good. This can’t be undone.',
  'unsaved_redact_body_other': 'Saving flattens {count} redaction boxes and removes the text underneath for good. This can’t be undone.',
  'unsaved_redact_placeholder': 'Type REDACT to confirm', // keep REDACT in English capitals: it is the exact word the user must type
  'unsaved_saves_as': 'Saves as {name}', // {name} is the file name that will be written
  'unsaved_exit_without_saving': 'Exit without saving',
  'unsaved_saving': 'Saving…',
  'unsaved_save_and_exit': 'Save and exit',

  // RecentFilesList
  'recent_size_b': '{n} B', // bytes
  'recent_size_kb': '{n} KB',
  'recent_size_mb': '{n} MB',
  'recent_just_now': 'just now',
  'recent_minutes_ago': '{n}m ago', // compact: minutes ago
  'recent_hours_ago': '{n}h ago', // compact: hours ago
  'recent_days_ago': '{n}d ago', // compact: days ago
  'recent_heading': 'Recent', // heading over recently opened files; shown in capitals
  'recent_more': '+{count} more in File menu once you open one', // "once you open one" = once you open a document
  'recent_remove': 'Remove from recents',
  'recent_remove_aria': 'Remove {name} from recents',

  // DefaultAppOffer
  'default_make': 'Make default',
  'default_open_settings': 'Open Windows Settings',
  'default_explain_set': 'Double-clicking a PDF will open it here.',
  'default_explain_settings': 'Windows only lets you change this in Settings — we\'ll open it at the right page.',
  'default_done': 'Done — PDFs now open in Universal PDF.',
  'default_settings_open': 'Settings is open. Choose {app} for {ext}, then come back — this will update on its own.', // {app} is "Universal PDF", {ext} is ".pdf"
  'default_offer_title': 'Open PDFs with Universal PDF?',
  'default_working': 'Working…',
  'default_not_now': 'Not now',
  'default_pill_set': 'Set as default PDF app — open .pdf files here',
  'default_pill_settings': 'Set as default PDF app — opens Windows Settings',
  'default_current_holder': 'PDFs currently open in {name}. Windows needs you to pick {ext} there and press Set\u00a0default.', // {name} is another app; {ext} is ".pdf"; "Set default" is the Windows Settings button label (\u00a0 is a non-breaking space)

  // PreviewPaneOffer
  'preview_pane_waiting': 'Waiting for Windows…',
  'preview_pane_stop': 'Stop showing PDFs in the Explorer preview pane',
  'preview_pane_show': 'Show PDFs in the Explorer preview pane — needs admin once',
  'preview_pane_enabled': 'Done. Turn the pane on in Explorer with {shortcut} and select a PDF.', // {shortcut} is Alt+P
  'preview_pane_disabled': 'Turned off.',
  'preview_pane_declined': 'Left as it was — the change needs the administrator prompt.',
  'preview_pane_incomplete': 'Half registered — reinstall Universal PDF to finish setting this up.',
  'preview_pane_unblock': 'A PDF saved from the internet shows a Windows safety message instead of a preview — that is Windows, not this app. Right-click the file → Properties → tick {unblock}.', // "Properties" is the Windows menu item name
  'preview_pane_unblock_label': 'Unblock', // the Windows checkbox label in file Properties

  // MobileWelcomeToast
  'welcome_title': 'Welcome to Universal PDF',
  'welcome_close_aria': 'Close welcome message and don’t show it again',
  'welcome_body': 'Your editing tools live in the toolbar below.',
  'welcome_dont_show': 'Don\'t show again',

  // LandingPage
  'landing_no_uploads': 'No forced uploads',
  'landing_no_scraping': 'No data scraping',
  'landing_no_ads': 'No advertising',
  'landing_drop_label': 'Drop a PDF, Word or OpenDocument file here, or click to browse',
  'landing_choose_pdfs': 'Please choose one or more PDF files.',
  'landing_compressing_pct': 'Compressing… {pct}%',
  'landing_compressing_batch': 'Compressing {n}/{total}…', // file n of total
  'landing_compressing_batch_pct': 'Compressing {n}/{total} — {pct}%',
  'landing_compression_failed': 'Compression failed: {message}',
  'landing_example_failed': 'Failed to open example: {message}',
  'landing_choose_pdf': 'Please choose a PDF file.',
  'landing_opening_example': 'Opening example…',
  'landing_try_example': 'Try with example PDF',
  'landing_headline': 'PDFs that {em}.', // {em} is landing_headline_em, highlighted
  'landing_headline_em': 'just work', // highlighted end of "PDFs that just work."; one line on a phone, keep short
  'landing_lead': 'View, annotate, sign and export.',
  'landing_converting': 'Converting…',
  'landing_drop_here': 'Drop a PDF here', // inside a small circle; keep short
  'landing_click_to_browse': 'or click to browse — {types}', // {types} is ".pdf, .docx, .odt"
  'landing_or': 'or', // separator between two options
  'landing_compressing': 'Compressing…',
  'landing_drop_to_compress': 'Drop to compress',
  'landing_compress': 'Compress PDF(s)',
  'landing_hide_advanced': 'Hide advanced options',
  'landing_show_advanced': 'Show advanced options',
  'landing_advanced_title': 'Advanced options — merge, convert, OCR, redact, Markdown',
  'landing_merge': 'Merge PDFs — combine several into one',
  'landing_convert': 'Convert — PDF ↔ images (PNG/JPG)',
  'landing_ocr': 'Make searchable (OCR) — read a scan',
  'landing_redact': 'Redact text — make portions unreadable to humans and machines',
  'landing_transform': 'Transform text into a PDF — paste Markdown',
  'landing_system_options': 'System options',
  'landing_system_options_os': '[{os}] System options', // {os} is Windows / macOS / Linux
  'landing_free_sign': 'Sign PDF for free',
  'landing_free_convert': 'Convert PDF for free',
  'landing_free_redact': 'Redact PDF for free',
  'landing_free_compress': 'Compress PDF for free',
  'landing_free_qr': 'Add QR codes for free',
  'landing_free_export': 'Export PDF for free',
  'landing_signed_in': 'Signed in with a Universal ID. {delete}', // {delete} is the "Delete my account" button
  'landing_delete_account': 'Delete my account',
  'landing_drop_hint': 'PDF files only — anywhere on this page will do',

  // PdfIllustration
  'illustration_approved': 'APPROVED', // big stamp word across a decorative drawing; capitals, max ~9 letters to fit the stamp box
  'illustration_signature': 'Signature', // tiny caption under a signature line in a decorative drawing

  // DownloadRow
  'download_heading': 'Download it for offline use — it works the same',
  'download_windows_title': 'Windows installer (.exe), 64-bit',
  'download_macos_title': 'Disk image (.dmg) — Apple silicon and Intel',
  'download_android_title': 'Android package (.apk)',
  'download_ios_hint': 'Not on the App Store yet. In Safari, tap {share} → {add} — it installs and runs offline.',
  'download_ios_share': 'Share', // Safari's Share button, use the name iOS shows in this language
  'download_ios_add_to_home': 'Add to Home Screen', // iOS share-sheet item, use the name iOS shows in this language
  'download_footnote': 'Free and open source, like the web version. Desktop builds are unsigned.',

  // LivePreview
  'preview_failed': 'Preview failed',
  'preview_title': 'Preview', // noun, heading of the preview overlay
  'preview_updating': 'Updating…',
  'preview_subtitle': 'How the exported PDF will look',
  'preview_download': 'Download', // verb, button
  'preview_close_aria': 'Close preview',
  'preview_failed_with': 'Preview failed: {error}',
  'preview_building': 'Building preview…',
}
