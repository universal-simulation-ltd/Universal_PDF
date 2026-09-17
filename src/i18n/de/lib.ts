import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Es ist kein PDF geöffnet.',
  // saveDocument, exitGuard
  'save_failed': 'Das PDF konnte nicht gespeichert werden.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'PDF konnte nicht geladen werden',
  'open_failed_all': 'Diese Dateien konnten nicht geöffnet werden:',
  'open_failed_some': 'Einige dieser Dateien konnten nicht geöffnet werden:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Mit diesem Passwort lässt sich das PDF nicht öffnen.',
  'unlock_failed': 'Dieses PDF konnte nicht entsperrt werden.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'Zusammenfügen',
  'undo_convert': 'Umwandeln',
  'undo_page_change': 'Seitenänderung',
  'undo_strip_metadata': 'Metadaten entfernen',

  // useDefaultPdfApp
  'default_app_failed': 'Die Standard-App konnte nicht geändert werden.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Aus Word umgewandelt – Text und Struktur bleiben erhalten, das ursprüngliche Seitenlayout kann aber abweichen.',
  'import_notice_odt': 'Aus OpenDocument umgewandelt – Text und Struktur bleiben erhalten, das ursprüngliche Seitenlayout kann aber abweichen.',
  'import_dropped_count_one': '{count} Zeichen, das die Schriften dieses PDFs nicht darstellen können, wurde durch „?“ ersetzt.',
  'import_dropped_count_other': '{count} Zeichen, die die Schriften dieses PDFs nicht darstellen können, wurden durch „?“ ersetzt.',
  'import_dropped_chars_one': 'Das Zeichen {chars} konnte nicht dargestellt werden und erscheint als „?“.',
  'import_dropped_chars_other': 'Die Zeichen {chars} konnten nicht dargestellt werden und erscheinen als „?“.',
  'import_legacy_doc': 'Word-97–2003-Dateien (.doc) können hier nicht umgewandelt werden. Öffne die Datei in Word oder LibreOffice, speichere sie als .docx und versuche es erneut.',
  'import_legacy_rtf': 'Rich-Text-Dateien (.rtf) können hier nicht umgewandelt werden. Speichere die Datei als .docx und versuche es erneut.',
  'import_legacy_pages': 'Pages-Dokumente können hier nicht umgewandelt werden. Exportiere das Dokument als Word (.docx) oder PDF und versuche es erneut.',
  'import_not_office': 'Diese Datei ist kein Word- (.docx) oder OpenDocument-Dokument (.odt).',
  'import_empty': 'Dieses Dokument scheint leer zu sein – es gab keinen Text zum Umwandeln.',
  'import_failed': '{name} konnte nicht umgewandelt werden. Die Datei ist möglicherweise passwortgeschützt oder beschädigt.',
  'import_libreoffice_notice': 'Mit LibreOffice auf diesem Computer umgewandelt – das Seitenlayout sollte dem Original entsprechen. Schriften, die auf diesem Computer fehlen, werden ersetzt.',
  'import_wrong_type': 'Bitte wähle eine PDF-, Word- (.docx) oder OpenDocument-Datei (.odt) aus.',

  // ocr (progress messages)
  'ocr_preparing': 'OCR-Engine wird vorbereitet…',
  'ocr_already_searchable': 'Bereits durchsuchbar',
  'ocr_downloading_model': 'OCR-Modell wird heruntergeladen (einmalig)…',
  'ocr_reading_page': 'Seite {page} von {total} wird gelesen…',
  'ocr_saving': 'Durchsuchbares PDF wird gespeichert…',
  'ocr_done': 'Fertig',

  // pdfBackup
  'backup_not_json': 'Diese Datei ist keine Universal-PDF-Sicherung (kein gültiges JSON).',
  'backup_invalid': 'Diese Datei ist keine Universal-PDF-Sicherung.',
  'backup_too_new': 'Diese Sicherung wurde mit einer neueren Version von Universal PDF erstellt – aktualisiere die App, um sie zu öffnen.',

  // pdfPages
  'pages_keep_one': 'Ein PDF muss mindestens eine Seite behalten',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Titel',
  'meta_author': 'Autor',
  'meta_subject': 'Thema',
  'meta_keywords': 'Stichwörter',
  'meta_creator': 'Erstellt mit',
  'meta_producer': 'Erzeugt von',
  'meta_created': 'Erstellt',
  'meta_modified': 'Zuletzt geändert',
  'meta_encrypted': 'Dieses PDF ist verschlüsselt, daher können seine Metadaten nicht neu geschrieben werden.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Bitte wähle eine Bilddatei aus (PNG, JPG usw.)',
  'sig_image_no_size': 'Bildabmessungen konnten nicht gelesen werden',
  'sig_image_no_canvas': 'Canvas wird nicht unterstützt',
  'sig_image_blank': 'Das Bild scheint leer zu sein. Versuche einen kontrastreicheren Scan oder deaktiviere „Hintergrund entfernen“.',
  'sig_image_read_failed': 'Datei konnte nicht gelesen werden',
  'sig_image_decode_failed': 'Bild konnte nicht dekodiert werden',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Unterschrieben von:',
  'sig_role': 'Funktion:',
  'sig_email': 'E-Mail:',
  'sig_phone': 'Telefon:',
  'sig_signed_on': 'Unterschrieben am {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Hier unterschreiben',
  'sign_here_name': 'Name',
  'sign_here_date': 'Datum',
  'sign_here_live': 'Live',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Keine PDFs zum Zusammenfügen',
  'images_none': 'Keine Bilder zum Umwandeln',
  'image_decode_failed': '{name} konnte nicht dekodiert werden',
  'image_decode_failed_why': '{name} konnte nicht dekodiert werden – {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Token konnte nicht reserviert werden.',
  'hosted_refund_failed': 'Token konnte nicht erstattet werden.',
  'hosted_signed_download_failed': 'Das unterschriebene PDF konnte nicht heruntergeladen werden.',

  // signRequestClient
  'no_response': 'Keine Antwort',
  'sign_mail_subject': 'Bitte unterschreiben: {docName}',
  'sign_mail_body': 'Hallo,\n\nich habe dir ein Dokument zum Unterschreiben geschickt – {docName}.\n\nKlicke hier, um es online zu unterschreiben (kein Konto nötig):\n{link}\n\nDanke!',

  // qr/render
  'qr_no_canvas': 'Canvas ist in diesem Browser nicht verfügbar.',
  'qr_no_data': 'Gib einen Link oder Text zum Kodieren ein.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'weniger als einer Sekunde',
  'lock_duration_seconds_one': 'etwa {count} Sekunde',
  'lock_duration_seconds_other': 'etwa {count} Sekunden',
  'lock_duration_minutes_one': 'etwa {count} Minute',
  'lock_duration_minutes_other': 'etwa {count} Minuten',
  'lock_duration_hours_one': 'etwa {count} Stunde',
  'lock_duration_hours_other': 'etwa {count} Stunden',
  'lock_duration_days_one': 'etwa {count} Tag',
  'lock_duration_days_other': 'etwa {count} Tagen',
  'lock_duration_months_one': 'etwa {count} Monat',
  'lock_duration_months_other': 'etwa {count} Monaten',
  'lock_duration_years_one': 'etwa {count} Jahr',
  'lock_duration_years_other': 'etwa {count} Jahren',
  'lock_duration_forever': 'einer Zeit, die niemand abwarten würde',
  'lock_guessable': 'Erratbar',
  'lock_weak': 'Schwach',
  'lock_fair': 'Mäßig',
  'lock_reasonable': 'Ordentlich',
  'lock_good': 'Gut',
  'lock_strong': 'Stark',
  'lock_too_short': 'Zu kurz',
  'lock_pin_obvious': 'Das ist eine der ersten PINs, die jeder ausprobiert. Wähle Ziffern, die keine Folge und keine Wiederholung sind.',
  'lock_pin_note_weak': 'Eine {digits}-stellige PIN knackt jemand Entschlossenes in {time}. Gut genug, damit ein Dokument nicht versehentlich in falsche Hände gerät – aber nicht für etwas Wertvolles.',
  'lock_pin_note': 'Eine {digits}-stellige PIN knackt jemand Entschlossenes in {time}. Nimm lieber ein Passwort, wenn der Verlust des Dokuments dir wirklich schaden würde.',
  'lock_password_common': 'Dieses Passwort steht auf jeder Liste zum Passwortraten. Fast alles andere ist besser.',
  'lock_password_short': 'Kurze Passwörter werden vollständig durchprobiert. Nimm besser eine Wortfolge aus drei oder vier Wörtern.',
  'lock_password_strong': 'Das knackt niemand per Brute Force. Achte nur darauf, dass du es dir merken kannst – ohne es gibt es keinen Weg zurück.',
  'lock_password_note': 'Per Brute Force in {time} zu erraten – vorausgesetzt, es ist keine Wortfolge, die jemand als Erstes ausprobieren würde.',
  'lock_pin_digits_only': 'Eine PIN besteht nur aus Ziffern.',
  'lock_pin_min': 'Eine PIN braucht mindestens {min} Ziffern.',
  'lock_password_min': 'Ein Passwort braucht mindestens {min} Zeichen.',
  'lock_pins_differ': 'Die beiden PINs stimmen nicht überein.',
  'lock_passwords_differ': 'Die beiden Passwörter stimmen nicht überein.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Nur die ersten 127 Bytes eines Passworts zählen. Alles darüber hinaus wird ignoriert.',
  'lock_password_nonlatin': 'Zeichen mit Akzent oder nicht-lateinische Zeichen werden von anderen PDF-Apps womöglich anders eingegeben. Am sichersten ist ein Passwort aus Buchstaben, Ziffern und Satzzeichen.',
  'crypto_insecure': 'Dieser Browser verschlüsselt nicht über eine unsichere Verbindung. Öffne Universal PDF über https:// (oder localhost) und versuche es erneut.',
  'lock_password_required': 'Um ein PDF mit Passwort zu schützen, ist ein Passwort erforderlich.',
  'lock_check_failed': 'Dieses PDF konnte nicht mit Passwort geschützt werden – die Passwortprüfung ist fehlgeschlagen. Es wurde nichts gespeichert.',
  'unlock_not_locked': 'Dieses PDF ist nicht passwortgeschützt.',
  'unlock_old_scheme': 'Dieses PDF verwendet ein älteres Verschlüsselungsverfahren, das Universal PDF nicht öffnen kann. Versuche es mit der App, mit der es geschützt wurde.',
  'unlock_incomplete': 'Dieses PDF gibt an, passwortgeschützt zu sein, aber seine Verschlüsselungsangaben sind unvollständig.',
  'unlock_damaged': 'Dieses PDF wurde entsperrt, aber ein Teil davon konnte nicht gelesen werden – die Datei scheint beschädigt zu sein.',

  // heicSniff (adding a picture)
  'image_empty': '{name} ist leer angekommen – versuche, es erneut hinzuzufügen',
  'image_unreadable': '{name} konnte auf diesem Gerät nicht gelesen werden – falls es in der Cloud liegt, öffne es zuerst in deiner Fotos-App, damit es heruntergeladen wird',

  // deleteAccount
  'delete_account_failed': 'Dein Konto konnte nicht gelöscht werden. Prüfe deine Verbindung und versuche es erneut, oder schreib an inbox@unisim.co.uk.',
}

export default lib
