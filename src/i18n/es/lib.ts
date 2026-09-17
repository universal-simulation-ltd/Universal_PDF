import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'No hay ningún PDF abierto.',
  // saveDocument, exitGuard
  'save_failed': 'No se ha podido guardar el PDF.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'No se ha podido cargar el PDF',
  'open_failed_all': 'No se han podido abrir estos archivos:',
  'open_failed_some': 'No se han podido abrir algunos de estos archivos:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Esa contraseña no abre este PDF.',
  'unlock_failed': 'No se ha podido desbloquear este PDF.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'unión',
  'undo_convert': 'conversión',
  'undo_page_change': 'cambio de páginas',
  'undo_strip_metadata': 'eliminación de metadatos',

  // useDefaultPdfApp
  'default_app_failed': 'No se ha podido cambiar la app predeterminada.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Convertido desde Word: el texto y la estructura se conservan, pero el diseño de página original puede variar.',
  'import_notice_odt': 'Convertido desde OpenDocument: el texto y la estructura se conservan, pero el diseño de página original puede variar.',
  'import_dropped_count_one': '{count} carácter que las fuentes de este PDF no pueden escribir se ha sustituido por «?».',
  'import_dropped_count_other': '{count} caracteres que las fuentes de este PDF no pueden escribir se han sustituido por «?».',
  'import_dropped_chars_one': 'El carácter {chars} no se ha podido escribir y aparece como «?».',
  'import_dropped_chars_other': 'Los caracteres {chars} no se han podido escribir y aparecen como «?».',
  'import_legacy_doc': 'Los archivos de Word 97-2003 (.doc) no se pueden convertir aquí. Ábrelo en Word o LibreOffice, guárdalo como .docx y vuelve a intentarlo.',
  'import_legacy_rtf': 'Los archivos de texto enriquecido (.rtf) no se pueden convertir aquí. Guárdalo como .docx y vuelve a intentarlo.',
  'import_legacy_pages': 'Los documentos de Pages no se pueden convertir aquí. Expórtalo como Word (.docx) o PDF y vuelve a intentarlo.',
  'import_not_office': 'Ese archivo no es un documento de Word (.docx) ni de OpenDocument (.odt).',
  'import_empty': 'Ese documento parece estar vacío: no había texto que convertir.',
  'import_failed': 'No se ha podido convertir {name}. Puede que esté protegido con contraseña o dañado.',
  'import_libreoffice_notice': 'Convertido con LibreOffice en este ordenador: el diseño de página debería coincidir con el original. Las fuentes que no tiene este ordenador se sustituyen.',
  'import_wrong_type': 'Elige un archivo PDF, Word (.docx) u OpenDocument (.odt).',

  // ocr (progress messages)
  'ocr_preparing': 'Preparando el motor de OCR…',
  'ocr_already_searchable': 'Ya permite búsquedas',
  'ocr_downloading_model': 'Descargando el modelo de OCR (solo una vez)…',
  'ocr_reading_page': 'Leyendo la página {page} de {total}…',
  'ocr_saving': 'Guardando el PDF con búsqueda…',
  'ocr_done': 'Listo',

  // pdfBackup
  'backup_not_json': 'Ese archivo no es una copia de seguridad de Universal PDF (no es un JSON válido).',
  'backup_invalid': 'Ese archivo no es una copia de seguridad de Universal PDF.',
  'backup_too_new': 'Esta copia de seguridad se hizo con una versión más reciente de Universal PDF: actualiza la app para abrirla.',

  // pdfPages
  'pages_keep_one': 'Un PDF debe conservar al menos una página',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Título',
  'meta_author': 'Autor',
  'meta_subject': 'Asunto',
  'meta_keywords': 'Palabras clave',
  'meta_creator': 'Creado con',
  'meta_producer': 'Generado por',
  'meta_created': 'Creado',
  'meta_modified': 'Última modificación',
  'meta_encrypted': 'Este PDF está cifrado, así que sus metadatos no se pueden reescribir.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Elige un archivo de imagen (PNG, JPG, etc.)',
  'sig_image_no_size': 'No se han podido leer las dimensiones de la imagen',
  'sig_image_no_canvas': 'Canvas no compatible',
  'sig_image_blank': 'La imagen parece estar en blanco. Prueba con un escaneado de más contraste o desactiva «Quitar fondo blanco».',
  'sig_image_read_failed': 'No se ha podido leer el archivo',
  'sig_image_decode_failed': 'No se ha podido descodificar la imagen',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Firmado por:',
  'sig_role': 'Cargo:',
  'sig_email': 'Correo:',
  'sig_phone': 'Teléfono:',
  'sig_signed_on': 'Firmado el {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Firma aquí',
  'sign_here_name': 'Nombre',
  'sign_here_date': 'Fecha',
  'sign_here_live': 'En directo',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'No hay PDF que unir',
  'images_none': 'No hay imágenes que convertir',
  'image_decode_failed': 'No se ha podido descodificar {name}',
  'image_decode_failed_why': 'No se ha podido descodificar {name}: {reason}',

  // hostedStore
  'hosted_reserve_failed': 'No se ha podido reservar un token.',
  'hosted_refund_failed': 'No se ha podido reembolsar el token.',
  'hosted_signed_download_failed': 'No se ha podido descargar el PDF firmado.',

  // signRequestClient
  'no_response': 'Sin respuesta',
  'sign_mail_subject': 'Firma, por favor: {docName}',
  'sign_mail_body': 'Hola:\n\nTe he enviado un documento para firmar: {docName}.\n\nHaz clic aquí para firmarlo en línea (no necesitas cuenta):\n{link}\n\nGracias.',

  // qr/render
  'qr_no_canvas': 'Canvas no está disponible en este navegador.',
  'qr_no_data': 'Introduce un enlace o un texto para codificar.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'menos de un segundo',
  'lock_duration_seconds_one': 'aproximadamente {count} segundo',
  'lock_duration_seconds_other': 'aproximadamente {count} segundos',
  'lock_duration_minutes_one': 'aproximadamente {count} minuto',
  'lock_duration_minutes_other': 'aproximadamente {count} minutos',
  'lock_duration_hours_one': 'aproximadamente {count} hora',
  'lock_duration_hours_other': 'aproximadamente {count} horas',
  'lock_duration_days_one': 'aproximadamente {count} día',
  'lock_duration_days_other': 'aproximadamente {count} días',
  'lock_duration_months_one': 'aproximadamente {count} mes',
  'lock_duration_months_other': 'aproximadamente {count} meses',
  'lock_duration_years_one': 'aproximadamente {count} año',
  'lock_duration_years_other': 'aproximadamente {count} años',
  'lock_duration_forever': 'más de lo que nadie va a esperar',
  'lock_guessable': 'Adivinable',
  'lock_weak': 'Débil',
  'lock_fair': 'Aceptable',
  'lock_reasonable': 'Razonable',
  'lock_good': 'Buena',
  'lock_strong': 'Fuerte',
  'lock_too_short': 'Demasiado corta',
  'lock_pin_obvious': 'Este es uno de los primeros PIN que prueba cualquiera. Elige números que no sean una secuencia ni una repetición.',
  'lock_pin_note_weak': 'Alguien decidido puede descifrar un PIN de {digits} dígitos en {time}. Sirve para que un documento no acabe en malas manos por accidente, pero no para nada valioso.',
  'lock_pin_note': 'Alguien decidido puede descifrar un PIN de {digits} dígitos en {time}. Usa una contraseña si perder el documento te perjudicaría de verdad.',
  'lock_password_common': 'Esta contraseña está en todas las listas de contraseñas habituales. Casi cualquier otra es mejor.',
  'lock_password_short': 'Las contraseñas cortas se prueban todas por fuerza bruta. Intenta usar una frase de tres o cuatro palabras.',
  'lock_password_strong': 'Nadie va a descifrarla por fuerza bruta. Solo asegúrate de que puedes recordarla: sin ella no hay forma de volver a entrar.',
  'lock_password_note': 'Se tardaría {time} en adivinarla por fuerza bruta, siempre que no sea una frase que alguien probaría primero.',
  'lock_pin_digits_only': 'Un PIN solo puede tener números.',
  'lock_pin_min': 'Un PIN necesita al menos {min} dígitos.',
  'lock_password_min': 'Una contraseña necesita al menos {min} caracteres.',
  'lock_pins_differ': 'Los dos PIN no coinciden.',
  'lock_passwords_differ': 'Las dos contraseñas no coinciden.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Solo cuentan los primeros 127 bytes de una contraseña. Lo que pase de ahí se ignora.',
  'lock_password_nonlatin': 'Otras apps de PDF pueden escribir de otra forma los caracteres acentuados o no latinos. Lo más seguro es una contraseña de letras, números y signos de puntuación.',
  'crypto_insecure': 'Este navegador no cifra en una conexión no segura. Abre Universal PDF mediante https:// (o localhost) y vuelve a intentarlo.',
  'lock_password_required': 'Se necesita una contraseña para bloquear un PDF.',
  'lock_check_failed': 'No se ha podido bloquear este PDF: la comprobación de la contraseña ha fallado. No se ha guardado nada.',
  'unlock_not_locked': 'Este PDF no está bloqueado.',
  'unlock_old_scheme': 'Este PDF usa un sistema de cifrado antiguo que Universal PDF no puede abrir. Prueba con la app con la que se bloqueó.',
  'unlock_incomplete': 'Este PDF indica que está bloqueado, pero los datos de su cifrado están incompletos.',
  'unlock_damaged': 'Este PDF se ha desbloqueado, pero no se ha podido leer una parte: parece que el archivo está dañado.',

  // heicSniff (adding a picture)
  'image_empty': '{name} ha llegado vacío; prueba a añadirlo de nuevo',
  'image_unreadable': 'No se ha podido leer {name} desde este dispositivo; si está en la nube, ábrelo primero en tu app de fotos para que se descargue',

  // deleteAccount
  'delete_account_failed': 'No se ha podido eliminar tu cuenta. Comprueba tu conexión y vuelve a intentarlo, o escribe a inbox@unisim.co.uk.',
}

export default lib
