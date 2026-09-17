import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Nessun PDF aperto.',
  // saveDocument, exitGuard
  'save_failed': 'Impossibile salvare il PDF.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'Impossibile caricare il PDF',
  'open_failed_all': 'Impossibile aprire questi file:',
  'open_failed_some': 'Impossibile aprire alcuni di questi file:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Questa password non apre il PDF.',
  'unlock_failed': 'Impossibile sbloccare questo PDF.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'unione',
  'undo_convert': 'conversione',
  'undo_page_change': 'modifica pagine',
  'undo_strip_metadata': 'rimozione metadati',

  // useDefaultPdfApp
  'default_app_failed': 'Impossibile modificare l’app predefinita.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Convertito da Word: testo e struttura sono conservati, ma l’impaginazione originale potrebbe essere diversa.',
  'import_notice_odt': 'Convertito da OpenDocument: testo e struttura sono conservati, ma l’impaginazione originale potrebbe essere diversa.',
  'import_dropped_count_one': '{count} carattere che i font di questo PDF non possono scrivere è stato sostituito con «?».',
  'import_dropped_count_other': '{count} caratteri che i font di questo PDF non possono scrivere sono stati sostituiti con «?».',
  'import_dropped_chars_one': 'Il carattere {chars} non può essere scritto e appare come «?».',
  'import_dropped_chars_other': 'I caratteri {chars} non possono essere scritti e appaiono come «?».',
  'import_legacy_doc': 'I file di Word 97–2003 (.doc) non possono essere convertiti qui. Aprilo in Word o LibreOffice, salvalo come .docx e riprova.',
  'import_legacy_rtf': 'I file Rich Text (.rtf) non possono essere convertiti qui. Salvalo come .docx e riprova.',
  'import_legacy_pages': 'I documenti Pages non possono essere convertiti qui. Esportalo come Word (.docx) o PDF e riprova.',
  'import_not_office': 'Questo file non è un documento Word (.docx) o OpenDocument (.odt).',
  'import_empty': 'Il documento sembra vuoto: non c’era testo da convertire.',
  'import_failed': 'Impossibile convertire {name}. Potrebbe essere protetto da password o danneggiato.',
  'import_libreoffice_notice': 'Convertito con LibreOffice su questo computer: l’impaginazione dovrebbe corrispondere all’originale. I font non presenti su questo computer vengono sostituiti.',
  'import_wrong_type': 'Scegli un file PDF, Word (.docx) o OpenDocument (.odt).',

  // ocr (progress messages)
  'ocr_preparing': 'Preparazione del motore OCR…',
  'ocr_already_searchable': 'Già ricercabile',
  'ocr_downloading_model': 'Download del modello OCR (una sola volta)…',
  'ocr_reading_page': 'Lettura della pagina {page} di {total}…',
  'ocr_saving': 'Salvataggio del PDF ricercabile…',
  'ocr_done': 'Fatto',

  // pdfBackup
  'backup_not_json': 'Questo file non è un backup di Universal PDF (non è un JSON valido).',
  'backup_invalid': 'Questo file non è un backup di Universal PDF.',
  'backup_too_new': 'Questo backup è stato creato da una versione più recente di Universal PDF: aggiorna l’app per aprirlo.',

  // pdfPages
  'pages_keep_one': 'Un PDF deve avere almeno una pagina',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Titolo',
  'meta_author': 'Autore',
  'meta_subject': 'Oggetto',
  'meta_keywords': 'Parole chiave',
  'meta_creator': 'Creato con',
  'meta_producer': 'Prodotto da',
  'meta_created': 'Creato',
  'meta_modified': 'Ultima modifica',
  'meta_encrypted': 'Questo PDF è crittografato, quindi i suoi metadati non possono essere riscritti.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Scegli un file immagine (PNG, JPG, ecc.)',
  'sig_image_no_size': 'Impossibile leggere le dimensioni dell’immagine',
  'sig_image_no_canvas': 'Canvas non supportato',
  'sig_image_blank': 'L’immagine sembra vuota. Prova una scansione più contrastata oppure disattiva «Rimuovi sfondo bianco».',
  'sig_image_read_failed': 'Impossibile leggere il file',
  'sig_image_decode_failed': 'Impossibile decodificare l’immagine',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Firmato da:',
  'sig_role': 'Ruolo:',
  'sig_email': 'Email:',
  'sig_phone': 'Telefono:',
  'sig_signed_on': 'Firmato il {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Firma qui',
  'sign_here_name': 'Nome',
  'sign_here_date': 'Data',
  'sign_here_live': 'Dal vivo',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Nessun PDF da unire',
  'images_none': 'Nessuna immagine da convertire',
  'image_decode_failed': 'Impossibile decodificare {name}',
  'image_decode_failed_why': 'Impossibile decodificare {name}: {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Impossibile riservare un token.',
  'hosted_refund_failed': 'Impossibile rimborsare il token.',
  'hosted_signed_download_failed': 'Impossibile scaricare il PDF firmato.',

  // signRequestClient
  'no_response': 'Nessuna risposta',
  'sign_mail_subject': 'Da firmare: {docName}',
  'sign_mail_body': 'Ciao,\n\nti ho inviato un documento da firmare: {docName}.\n\nFai clic qui per firmarlo online (non serve un account):\n{link}\n\nGrazie.',

  // qr/render
  'qr_no_canvas': 'Canvas non disponibile in questo browser.',
  'qr_no_data': 'Inserisci un link o del testo da codificare.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'meno di un secondo',
  'lock_duration_seconds_one': 'circa {count} secondo',
  'lock_duration_seconds_other': 'circa {count} secondi',
  'lock_duration_minutes_one': 'circa {count} minuto',
  'lock_duration_minutes_other': 'circa {count} minuti',
  'lock_duration_hours_one': 'circa {count} ora',
  'lock_duration_hours_other': 'circa {count} ore',
  'lock_duration_days_one': 'circa {count} giorno',
  'lock_duration_days_other': 'circa {count} giorni',
  'lock_duration_months_one': 'circa {count} mese',
  'lock_duration_months_other': 'circa {count} mesi',
  'lock_duration_years_one': 'circa {count} anno',
  'lock_duration_years_other': 'circa {count} anni',
  'lock_duration_forever': 'più di quanto chiunque sia disposto ad aspettare',
  'lock_guessable': 'Indovinabile',
  'lock_weak': 'Debole',
  'lock_fair': 'Discreta',
  'lock_reasonable': 'Accettabile',
  'lock_good': 'Buona',
  'lock_strong': 'Forte',
  'lock_too_short': 'Troppo corta',
  'lock_pin_obvious': 'È uno dei primi PIN che chiunque prova. Scegli cifre che non siano in sequenza o ripetute.',
  'lock_pin_note_weak': 'Un PIN di {digits} cifre cede a una persona determinata in {time}. Va bene per evitare che un documento finisca per sbaglio nelle mani sbagliate, non per qualcosa di prezioso.',
  'lock_pin_note': 'Un PIN di {digits} cifre cede a una persona determinata in {time}. Usa una password se perdere il documento sarebbe davvero un danno.',
  'lock_password_common': 'Questa password compare in ogni elenco usato per indovinare le password. Quasi qualsiasi altra è migliore.',
  'lock_password_short': 'Le password corte vengono provate in modo esaustivo. Punta a una frase di tre o quattro parole.',
  'lock_password_strong': 'Nessuno la forzerà per tentativi. Assicurati solo di ricordarla: senza, non c’è modo di rientrare.',
  'lock_password_note': 'Circa {time} per indovinarla per tentativi, a meno che non sia una frase che qualcuno proverebbe per prima.',
  'lock_pin_digits_only': 'Un PIN contiene solo cifre.',
  'lock_pin_min': 'Un PIN deve avere almeno {min} cifre.',
  'lock_password_min': 'Una password deve avere almeno {min} caratteri.',
  'lock_pins_differ': 'I due PIN non corrispondono.',
  'lock_passwords_differ': 'Le due password non corrispondono.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Contano solo i primi 127 byte di una password. Tutto ciò che segue viene ignorato.',
  'lock_password_nonlatin': 'I caratteri accentati o non latini possono essere digitati in modo diverso da altre app PDF. Una password di lettere, cifre e punteggiatura è la scelta più sicura.',
  'crypto_insecure': 'Questo browser non esegue la crittografia su una connessione non sicura. Apri Universal PDF tramite https:// (o localhost) e riprova.',
  'lock_password_required': 'Per proteggere un PDF serve una password.',
  'lock_check_failed': 'Impossibile proteggere questo PDF: la verifica della password non è riuscita. Non è stato salvato nulla.',
  'unlock_not_locked': 'Questo PDF non è protetto.',
  'unlock_old_scheme': 'Questo PDF usa un vecchio schema di crittografia che Universal PDF non può aprire. Prova con l’app che lo ha protetto.',
  'unlock_incomplete': 'Questo PDF risulta protetto, ma i dettagli della crittografia sono incompleti.',
  'unlock_damaged': 'Questo PDF è stato sbloccato, ma una parte non è leggibile: il file sembra danneggiato.',

  // heicSniff (adding a picture)
  'image_empty': '{name} è arrivato vuoto: prova ad aggiungerlo di nuovo',
  'image_unreadable': 'Impossibile leggere {name} da questo dispositivo: se si trova nel cloud, aprilo prima nell’app Foto perché venga scaricato',

  // deleteAccount
  'delete_account_failed': 'Impossibile eliminare il tuo account. Controlla la connessione e riprova, oppure scrivi a inbox@unisim.co.uk.',
}

export default lib
