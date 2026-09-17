// Messages built outside components: src/lib, src/stores, src/hooks.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'No PDF is open.',
  // saveDocument, exitGuard
  'save_failed': 'The PDF could not be saved.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'Failed to load PDF',
  'open_failed_all': 'These files could not be opened:',
  'open_failed_some': 'Some of these files could not be opened:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'That password does not open this PDF.',
  'unlock_failed': 'This PDF could not be unlocked.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'merge', // noun: the whole-document step being undone
  'undo_convert': 'convert', // noun: the whole-document step being undone
  'undo_page_change': 'page change',
  'undo_strip_metadata': 'strip metadata',

  // useDefaultPdfApp
  'default_app_failed': 'Could not change the default.', // making this app the default PDF app failed

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Converted from Word — text and structure are preserved, but the original page layout may differ.',
  'import_notice_odt': 'Converted from OpenDocument — text and structure are preserved, but the original page layout may differ.',
  'import_dropped_count_one': '{count} character this PDF\'s fonts can\'t write was replaced with “?”.',
  'import_dropped_count_other': '{count} characters this PDF\'s fonts can\'t write were replaced with “?”.',
  'import_dropped_chars_one': 'The character {chars} couldn\'t be written and appears as “?”.',
  'import_dropped_chars_other': 'The characters {chars} couldn\'t be written and appear as “?”.',
  'import_legacy_doc': 'Word 97–2003 files (.doc) can’t be converted here. Open it in Word or LibreOffice, save it as .docx, and try again.',
  'import_legacy_rtf': 'Rich Text files (.rtf) can’t be converted here. Save it as .docx and try again.',
  'import_legacy_pages': 'Pages documents can’t be converted here. Export it as Word (.docx) or PDF and try again.', // "Pages" is Apple's word processor
  'import_not_office': 'That file isn’t a Word (.docx) or OpenDocument (.odt) document.',
  'import_empty': 'That document appears to be empty — there was no text to convert.',
  'import_failed': 'Could not convert {name}. It may be password-protected or damaged.',
  'import_libreoffice_notice': 'Converted with LibreOffice on this computer — the page layout should match the original. Fonts this computer doesn’t have are substituted.',
  'import_wrong_type': 'Please choose a PDF, Word (.docx) or OpenDocument (.odt) file.',

  // ocr (progress messages)
  'ocr_preparing': 'Preparing OCR engine…',
  'ocr_already_searchable': 'Already searchable',
  'ocr_downloading_model': 'Downloading OCR model (one-time)…',
  'ocr_reading_page': 'Reading page {page} of {total}…',
  'ocr_saving': 'Saving searchable PDF…',
  'ocr_done': 'Done',

  // pdfBackup
  'backup_not_json': 'That file isn\'t a Universal PDF backup (it isn\'t valid JSON).',
  'backup_invalid': 'That file isn\'t a Universal PDF backup.',
  'backup_too_new': 'This backup was made by a newer version of Universal PDF — update the app to open it.',

  // pdfPages
  'pages_keep_one': 'A PDF must keep at least one page',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Title',
  'meta_author': 'Author',
  'meta_subject': 'Subject',
  'meta_keywords': 'Keywords',
  'meta_creator': 'Created with', // the application that created the PDF
  'meta_producer': 'Produced by', // the software that wrote the PDF file
  'meta_created': 'Created', // creation date
  'meta_modified': 'Last modified', // modification date
  'meta_encrypted': 'This PDF is encrypted, so its metadata cannot be rewritten.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Please choose an image file (PNG, JPG, etc.)',
  'sig_image_no_size': 'Could not read image dimensions',
  'sig_image_no_canvas': 'Canvas not supported',
  'sig_image_blank': 'Image looks blank. Try a higher-contrast scan, or turn off "Remove background".', // "Remove background" is the checkbox label in the import dialog
  'sig_image_read_failed': 'Could not read file',
  'sig_image_decode_failed': 'Could not decode image',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Signed by:', // prefix of the name line under a signature: "Signed by: Jane Smith"
  'sig_role': 'Role:', // detail line label under a signature
  'sig_email': 'Email:', // detail line label under a signature
  'sig_phone': 'Phone:', // detail line label under a signature
  'sig_signed_on': 'Signed on {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Sign here',
  'sign_here_name': 'Name', // the signer is asked for their name
  'sign_here_date': 'Date', // the signer is asked for the date
  'sign_here_live': 'Live', // the signer must sign live (drawn by hand), not upload an image

  // fonts (font picker chips)
  'font_sans': 'Sans', // sans-serif typeface
  'font_serif': 'Serif', // serif typeface
  'font_mono': 'Mono', // monospaced typeface

  // convert (merge / images → PDF)
  'merge_none': 'No PDFs to merge',
  'images_none': 'No images to convert',
  'image_decode_failed': 'Could not decode {name}',
  'image_decode_failed_why': 'Could not decode {name} — {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Could not reserve a token.',
  'hosted_refund_failed': 'Could not refund the token.',
  'hosted_signed_download_failed': 'Could not download the signed PDF.',

  // signRequestClient
  'no_response': 'No response', // a server call returned nothing
  'sign_mail_subject': 'Please sign: {docName}',
  'sign_mail_body': 'Hi,\n\nI\'ve sent you a document to sign — {docName}.\n\nClick here to sign it online (no account needed):\n{link}\n\nThanks!',

  // qr/render
  'qr_no_canvas': 'Canvas is not available in this browser.',
  'qr_no_data': 'Enter a link or some text to encode.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'less than a second',
  'lock_duration_seconds_one': 'about {count} second',
  'lock_duration_seconds_other': 'about {count} seconds',
  'lock_duration_minutes_one': 'about {count} minute',
  'lock_duration_minutes_other': 'about {count} minutes',
  'lock_duration_hours_one': 'about {count} hour',
  'lock_duration_hours_other': 'about {count} hours',
  'lock_duration_days_one': 'about {count} day',
  'lock_duration_days_other': 'about {count} days',
  'lock_duration_months_one': 'about {count} month',
  'lock_duration_months_other': 'about {count} months',
  'lock_duration_years_one': 'about {count} year',
  'lock_duration_years_other': 'about {count} years',
  'lock_duration_forever': 'longer than anyone will wait',
  'lock_guessable': 'Guessable', // strength label
  'lock_weak': 'Weak', // strength label
  'lock_fair': 'Fair', // strength label
  'lock_reasonable': 'Reasonable', // strength label
  'lock_good': 'Good', // strength label
  'lock_strong': 'Strong', // strength label
  'lock_too_short': 'Too short', // strength label
  'lock_pin_obvious': 'This is one of the first PINs anyone tries. Pick digits that are not a run or a repeat.',
  'lock_pin_note_weak': 'A {digits}-digit PIN falls to someone determined in {time}. Fine for keeping a document out of the wrong hands by accident; not for anything valuable.', // {time} is a lock_duration_* phrase
  'lock_pin_note': 'A {digits}-digit PIN falls to someone determined in {time}. Use a password instead if the document would genuinely hurt to lose.',
  'lock_password_common': 'This is on every password-guessing list there is. Almost anything else is better.',
  'lock_password_short': 'Short passwords are searched exhaustively. Aim for a phrase of three or four words.',
  'lock_password_strong': 'Nobody is brute-forcing this. Just make sure you can remember it — there is no way back in without it.',
  'lock_password_note': 'Roughly {time} to guess by brute force — assuming it is not a phrase somebody would try first.',
  'lock_pin_digits_only': 'A PIN is digits only.',
  'lock_pin_min': 'A PIN needs at least {min} digits.',
  'lock_password_min': 'A password needs at least {min} characters.',
  'lock_pins_differ': 'The two PINs do not match.',
  'lock_passwords_differ': 'The two passwords do not match.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Only the first 127 bytes of a password count. Anything past that is ignored.',
  'lock_password_nonlatin': 'Accented or non-Latin characters can be typed differently by other PDF apps. A password of letters, digits and punctuation is safest.',
  'crypto_insecure': 'This browser will not do encryption on an insecure connection. Open Universal PDF over https:// (or localhost) and try again.',
  'lock_password_required': 'A password is required to lock a PDF.',
  'lock_check_failed': 'Could not lock this PDF — the password check failed. Nothing has been saved.',
  'unlock_not_locked': 'This PDF is not locked.',
  'unlock_old_scheme': 'This PDF uses an older encryption scheme Universal PDF cannot open. Try the app that locked it.',
  'unlock_incomplete': 'This PDF says it is locked but its encryption details are incomplete.',
  'unlock_damaged': 'This PDF was unlocked but part of it could not be read — the file looks damaged.',

  // heicSniff (adding a picture)
  'image_empty': '{name} came through empty — try adding it again',
  'image_unreadable': '{name} could not be read from this device — if it lives in the cloud, open it in your photos app first so it downloads',

  // deleteAccount
  'delete_account_failed': "Couldn't delete your account. Check your connection and try again, or email inbox@unisim.co.uk.",
}
