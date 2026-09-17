// Compress, convert, merge, export, lock, metadata, OCR, present, QR codes.
// English is the source of truth: add a key here first, then to every other language.
export default {
  // Shared
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.show': 'Show', // button that reveals a typed password
  'common.hide': 'Hide', // button that masks a typed password again
  'size.bytes': '{n} B', // file size in bytes
  'size.kb': '{n} KB',
  'size.mb': '{n} MB',

  // BatchCompressModal + CompressResultModal
  'compress.light': 'Light', // compression level
  'compress.light_hint': 'Lossless · keeps text',
  'compress.balanced': 'Balanced', // compression level
  'compress.balanced_hint': 'Smaller · pages become images',
  'compress.maximum': 'Maximum', // compression level
  'compress.maximum_hint': 'Smallest · lower quality',
  'compress.kept_lossless_some': 'Kept the lossless version where turning pages into images would have made the file bigger.',
  'compress.already_optimised_try': 'Already optimised — try Balanced or Maximum for image-heavy PDFs.',
  'compress.already_optimised_many': 'Already optimised — these PDFs are as small as they go.',
  'compress.failed': 'Compression failed: {message}',
  'compress.batch_title_one': 'Compress {count} file',
  'compress.batch_title_other': 'Compress {count} files',
  'compress.applied_to_all': 'Compression — applied to all files',
  'compress.total_original': 'Total original',
  'compress.total_compressed': 'Total compressed',
  'compress.batch_progress': 'Compressing {current}/{total} — {pct}%',
  'compress.batch_saved_one': 'Saved {size} ({pct}%) across {count} file',
  'compress.batch_saved_other': 'Saved {size} ({pct}%) across {count} files',
  'compress.save': '⬇ Save', // download one file
  'compress.discard': 'Discard',
  'compress.download_zip': '⬇ Download all ({count}) as ZIP',
  // CompressResultModal
  'compress.kept_lossless': 'Kept the lossless version — turning these pages into images would have made the file bigger.',
  'compress.already_optimised_one': 'Already optimised — this PDF is as small as it goes.',
  'compress.result_title': 'Compression result',
  'compress.compression': 'Compression', // section heading above the level picker
  'compress.original': 'Original', // the uncompressed file
  'compress.compressed': 'Compressed', // the compressed file
  'compress.progress': 'Compressing… {pct}%',
  'compress.saved': 'Saved {size} ({pct}%)',
  'compress.output': 'Output: {name}', // {name} is the output file name
  'compress.download': '⬇ Download',

  // ConvertDialog
  'convert.rendering': 'Rendering {done}/{total}…',
  'convert.failed': 'Convert failed: {message}',
  'convert.title': 'Convert',
  'convert.pdf_to_images': 'PDF → images',
  'convert.images_to_pdf': 'Images → PDF',
  'convert.choose_pdf': 'Choose a PDF…',
  'convert.one_image_per_page': 'One image per page',
  'convert.image_format': 'Image format',
  'convert.png_sharp': 'PNG · sharp',
  'convert.jpg_smaller': 'JPG · smaller',
  'convert.converting': 'Converting…',
  'convert.convert_download': '⬇ Convert & download',
  'convert.images_selected_one': '{count} image selected',
  'convert.images_selected_other': '{count} images selected',
  'convert.choose_images': 'Choose images…',
  'convert.images_hint': 'PNG, JPG, WebP, HEIC — one page each, in the order picked',
  'convert.convert_open': 'Convert & open',

  // MergeDialog
  'merge.failed': 'Merge failed: {message}',
  'merge.title': 'Merge PDFs',
  'merge.intro': 'Combine files into one PDF. Drag to add, reorder, then merge — nothing leaves your device.',
  'merge.drop': 'Drop PDFs to add',
  'merge.add': 'Add PDFs…',
  'merge.empty': 'No files yet — add two or more PDFs to merge.',
  'merge.move_up': 'Move {name} up',
  'merge.move_down': 'Move {name} down',
  'merge.remove': 'Remove {name}',
  'merge.merge_open': 'Merge & open',
  'merge.merging': 'Merging…',
  'merge.merge_download': '⬇ Merge {count} & download', // {count} is the number of files, or empty

  // ExportModal + AdvancedExportDialog (shared)
  'export.failed': 'Export failed: {message}',
  'export.xfa_title': 'Filled XFA form',
  'export.building': 'Building export…',
  'export.annotations_baked_in': 'annotations baked in',
  'export.redact_title': 'Permanent redaction',
  'export.redact_body_one': "Exporting flattens {count} redaction box and removes the text underneath for good. This can't be undone.",
  'export.redact_body_other': "Exporting flattens {count} redaction boxes and removes the text underneath for good. This can't be undone.",
  'export.redact_confirm': 'Type {word} to confirm', // {word} is the English word REDACT, which must be typed as-is
  'export.saves_as': 'Saves as {name}', // {name} is the file name
  'export.download': 'Download',
  // useExportBuild
  'export.failed_fallback': 'Export failed',
  'export.compression_failed_fallback': 'Compression failed',
  // ExportModal
  'export.try_advanced': 'Already optimised — try Advanced export to turn image-heavy pages into pictures.',
  'export.title': 'Export PDF',
  'export.xfa_body': "Your entries are saved into the form. Compression and baked-in annotations aren't available for XFA documents.",
  'export.building_short': 'Building…',
  'export.download_filled_form': 'Download filled form',
  'export.print': 'Print',
  'export.percent_less': '−{pct}%', // size reduction, e.g. −12%
  'export.no_savings': 'no savings',
  'export.compressing': 'Compressing…',
  'export.no_images': 'Already as small as it goes — there are no images here to compress.',
  'export.object_stream': 'object-stream re-save', // technical description of the lossless compression
  'export.download_original': 'Download Original',
  'export.download_compressed': 'Download Compressed',
  'export.preview': 'Preview', // button: open print preview
  'export.need_advanced': 'Need to flatten the pages or lock it with a password?',

  // AdvancedExportDialog
  'advanced.balanced_hint': 'Good quality · big saving on scans',
  'advanced.maximum_hint': 'Smallest · most visible loss',
  'advanced.scrub_failed': 'Could not strip the metadata.',
  'advanced.lock_failed': 'Could not lock this PDF.',
  'advanced.title': 'Advanced export',
  'advanced.xfa_body': "Flattening and locking aren't available for XFA documents. Use Export to download the filled form.",
  'advanced.flatten': 'Flatten pages to images',
  'advanced.flatten_saving': '≈ {size} smaller',
  'advanced.flatten_hint': 'Every page becomes a picture, so nobody can select, copy, search or edit the text — useful for a document you have signed.',
  'advanced.image_quality': 'Image quality',
  'advanced.flatten_note': 'Your open document keeps its text layer — only the downloaded copy is flattened. Export again from the toolbar if you need the text back.',
  'advanced.keep_metadata': 'Keep metadata',
  'advanced.keep_metadata_on': 'The author, title, dates and producing app travel with the downloaded copy.',
  'advanced.keep_metadata_off': 'The author, title, dates and producing app are removed from the downloaded copy. Your open document keeps its own.',
  'advanced.keep_metadata_warning': 'Tick this for an archival (PDF/A), accessible (PDF/UA) or licensed document — their conformance and licence live in the metadata.',
  'advanced.flattening': 'Flattening pages…',
  'advanced.smaller': '{size} smaller',
  'advanced.bigger': '{size} bigger',
  'advanced.same_size': 'Same size',
  'advanced.rasterised': 'pages rasterised to JPEG',
  'advanced.no_page_changes': 'no changes to the pages',
  'advanced.locked_aes': 'locked with AES-256', // appended after " · " to the line above
  'advanced.finish_pin': 'Finish the PIN fields above to download.',
  'advanced.finish_password': 'Finish the password fields above to download.',
  'advanced.locking': 'Locking…',
  'advanced.download_flattened_locked': 'Download flattened & locked',
  'advanced.download_flattened': 'Download flattened',
  'advanced.download_locked': 'Download locked',

  // LockFields
  'lock.password': 'Password',
  'lock.password_hint': 'Letters, digits and punctuation',
  'lock.pin': 'PIN',
  'lock.pin_hint': 'Digits only — at least {min}',
  'lock.title': 'Lock with a password',
  'lock.send_hint': 'The signer is asked for it before they can open the document. Tell them separately — not in the same message.',
  'lock.export_hint': 'Nobody can open the file without it, in any PDF app. Real encryption, not a "no printing" flag.',
  'lock.confirm_pin': 'Confirm PIN',
  'lock.confirm_password': 'Confirm password',
  'lock.warning': 'Write it down somewhere safe. A locked PDF cannot be opened without its password — not by us, not by anyone. There is no reset.',

  // LockedFilePrompt
  'locked.title': 'This PDF is locked',
  'locked.needs_password': '{name} needs its password before it can be opened.', // {name} is the file name
  'locked.password_or_pin': 'Password or PIN',
  'locked.no_recovery': 'Universal PDF cannot recover or reset this password. Without it the document cannot be opened by any app.',
  'locked.unlocking': 'Unlocking…',
  'locked.unlock': 'Unlock',

  // MetadataDialog
  'metadata.read_failed': 'Could not read this PDF’s metadata',
  'metadata.strip_failed': 'Could not strip the metadata',
  'metadata.title': 'Document metadata',
  'metadata.what_is': 'What is metadata?',
  'metadata.explainer': 'Metadata is the hidden description a PDF carries about itself — who wrote it, which program made it, and when it was created and last edited. It travels with the file, so whoever you send it to can read it. Stripping it changes nothing you can see on the page.',
  'metadata.reading': 'Reading metadata…',
  'metadata.stripped': 'Metadata stripped — this document no longer names an author, a program or a date.',
  'metadata.none': 'This PDF carries no metadata. Nothing to strip.',
  'metadata.identifying_one': '{count} of these field could identify you, your organisation or your computer.',
  'metadata.identifying_other': '{count} of these fields could identify you, your organisation or your computer.',
  'metadata.can_identify': 'Can identify you',
  'metadata.xmp_packet': 'XMP packet',
  'metadata.xmp_bytes_one': '{count} bytes of embedded XML',
  'metadata.xmp_bytes_other': '{count} bytes of embedded XML',
  'metadata.xmp_hint': 'An extra metadata block — often repeats the author and tool, and can carry edit history.',
  'metadata.encrypted': 'This PDF is encrypted, so its metadata can be read but not rewritten.',
  'metadata.stripping': 'Stripping…',
  'metadata.scrub': 'Scrub metadata', // button: remove the metadata

  // OcrModal
  'ocr.preparing': 'Preparing OCR engine…',
  'ocr.failed_fallback': 'OCR failed',
  'ocr.title': 'Make searchable (OCR)',
  'ocr.intro': 'Runs entirely on your device — nothing is uploaded. The first run downloads the OCR model (~15 MB) once, then works offline.',
  'ocr.already_searchable': 'Every page already looks like it has selectable text, so nothing was added.',
  'ocr.added_one': 'Added a searchable text layer to {count} page.',
  'ocr.added_other': 'Added a searchable text layer to {count} pages.',
  'ocr.run_anyway_hint': 'If this is a scan whose text you still can’t select, run OCR on every page anyway.',
  'ocr.skipped_one': '{count} page already had text and was left unchanged.',
  'ocr.skipped_other': '{count} pages already had text and were left unchanged.',
  'ocr.run_anyway': 'Run OCR anyway',
  'ocr.open': 'Open searchable PDF',
  'ocr.failed': 'OCR failed: {message}',

  // PresentMode
  'present.start_failed': 'Could not start presentation',
  'present.exit_label': 'Exit presentation',
  'present.exit': 'Exit', // button, leaves presentation mode
  'present.failed': 'Presentation failed: {message}',
  'present.preparing': 'Preparing slides…',
  'present.loading': 'Loading…',
  'present.previous': 'Previous page',
  'present.next': 'Next page',

  // QrBrandingPanel
  'qr.drop_label': 'Drop a logo here, or click to choose one',
  'qr.not_image': 'Please choose an image file (PNG, JPG or SVG).',
  'qr.read_failed': 'Could not read that image.',
  'qr.custom_branding': 'Custom branding',
  'qr.branding_on': 'Your mark and colour on the code',
  'qr.branding_off': 'UNI·SIM mark in the centre',
  'qr.branding_off_org': "UNI·SIM mark in the centre — switch on for {org}'s", // {org} is the company name; the switch gives the code that company's branding
  'qr.mark_preview': 'Brand mark preview',
  'qr.org_mark': "{org}'s mark", // {org} is the company name; "mark" = logo
  'qr.your_mark': 'Your mark', // "mark" = logo
  'qr.replace': 'Replace',
  'qr.remove': 'Remove',
  'qr.drop_logo': 'Drop your logo here, or click to choose',
  'qr.brand_colour': 'Brand colour',
  'qr.default': 'default', // shown in place of a colour code when none is set
  'qr.clear': 'Clear',
  'qr.colour_too_light': 'That colour is too light to hold up as part of the code, so the code keeps its own eye colour. Your logo still uses it.',
  'qr.reset_org': "Reset to {org}'s branding", // {org} is the company name
  'qr.reset_company': 'Reset to my company branding',
  'qr.sign_in_hint': 'Sign in with your Universal ID and set your logo and colour once in My Company, and they land here automatically.', // "My Company" is the name of a settings page

  // QrEnlargeModal
  'qr.enlarged_label': 'Enlarged QR code for {name}',
  'qr.click_dismiss': 'Click to dismiss',
  'qr.code_for': 'QR code for {name}',
  'qr.point_camera': "Point another phone's camera at this code",
  'qr.struggling': "Struggling? Turn your screen brightness up to max, and make sure the camera isn't in close-up (macro) mode — pull back a little so the whole code is in frame.",

  // QrDialog
  'qr.draw_failed': 'Could not draw that code.',
  'qr.no_longer_on_page': 'That code is no longer on the page — close this and add a new one.',
  'qr.save_failed': 'Could not save that code.',
  'qr.edit_title': 'Edit this QR code',
  'qr.add_title': 'Add a QR code',
  'qr.enlarge_label': 'Enlarge QR code for scanning',
  'qr.preview_alt': 'QR code preview',
  'qr.drawing': 'Drawing…',
  'qr.enter_data': 'Enter a link or some text to see the code',
  'qr.tap_enlarge': 'Tap to enlarge',
  'qr.preparing': 'Preparing…',
  'qr.download_png': 'Download PNG',
  'qr.copied': '✓ Copied to clipboard',
  'qr.copy_unsupported': 'Copy not supported — use Download',
  'qr.copy_png': 'Copy PNG to clipboard',
  'qr.link_or_text': 'Link or text',
  'qr.style': 'Style',
  'qr.design_in_universal_qr': 'Design one in Universal QR ↗',
  'qr.inverted': 'These colours make an inverted code (light on dark). Some scanners refuse those — try a preset.',
  'qr.low_contrast': 'Low contrast on the {where} ({ratio}:1). It may scan on screen and fail in print — try a preset.', // {where} is the part of the code, {ratio} a contrast ratio
  'qr.your_codes': 'Your Universal QR codes',
  'qr.dynamic_code': 'Dynamic code',
  'qr.dynamic_title_one': '{name} — dynamic: currently sends people to {url}, and you can change that later without reprinting. {count} scan so far.',
  'qr.dynamic_title_other': '{name} — dynamic: currently sends people to {url}, and you can change that later without reprinting. {count} scans so far.',
  'qr.dynamic_badge': 'Dynamic code — re-pointable, scans counted',
  'qr.saved_code': 'Saved code',
  'qr.hosted_title': '{name} — {data} (saved to your account)', // {data} is the code's link or text
  'qr.hosted_png_title': '{name} — saved to your account (places as an image)',
  'qr.saved_to_account': 'Saved to your account',
  'qr.replaced_in_place': 'The code on the page is replaced where it sits.',
  'qr.click_to_place': 'Then click the page to place it.',
  'qr.updating': 'Updating…',
  'qr.update': 'Update code',
  'qr.adding': 'Adding…',
  'qr.add_to_page': 'Add to page',

  // QR style presets and their silhouettes (names from @unisim/qr)
  'qr.preset_classic': 'Classic',
  'qr.preset_rounded': 'Rounded', // style name
  'qr.preset_dots': 'Dots',
  'qr.preset_sunset': 'Sunset', // a warm colour gradient
  'qr.preset_radial': 'Radial', // a radial colour gradient
  'qr.preset_star': 'Star', // style name
  'qr.shape_square': 'Square',
  'qr.shape_rounded': 'Rounded', // silhouette: a square with rounded corners
  'qr.shape_circle': 'Circle',
  'qr.shape_squircle': 'Squircle', // between a square and a circle
  'qr.shape_hexagon': 'Hexagon',
  'qr.shape_star': 'Star', // silhouette
}
