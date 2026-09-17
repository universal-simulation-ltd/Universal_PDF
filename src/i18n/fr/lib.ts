import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Aucun PDF n’est ouvert.',
  // saveDocument, exitGuard
  'save_failed': 'Le PDF n’a pas pu être enregistré.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'Échec du chargement du PDF',
  'open_failed_all': 'Ces fichiers n’ont pas pu être ouverts :',
  'open_failed_some': 'Certains de ces fichiers n’ont pas pu être ouverts :',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Ce mot de passe n’ouvre pas ce PDF.',
  'unlock_failed': 'Ce PDF n’a pas pu être déverrouillé.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'la fusion',
  'undo_convert': 'la conversion',
  'undo_page_change': 'la modification des pages',
  'undo_strip_metadata': 'la suppression des métadonnées',

  // useDefaultPdfApp
  'default_app_failed': 'Impossible de modifier l’application par défaut.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Converti depuis Word — le texte et la structure sont conservés, mais la mise en page d’origine peut différer.',
  'import_notice_odt': 'Converti depuis OpenDocument — le texte et la structure sont conservés, mais la mise en page d’origine peut différer.',
  'import_dropped_count_one': '{count} caractère que les polices de ce PDF ne peuvent pas écrire a été remplacé par « ? ».',
  'import_dropped_count_other': '{count} caractères que les polices de ce PDF ne peuvent pas écrire ont été remplacés par « ? ».',
  'import_dropped_chars_one': 'Le caractère {chars} n’a pas pu être écrit et apparaît sous la forme « ? ».',
  'import_dropped_chars_other': 'Les caractères {chars} n’ont pas pu être écrits et apparaissent sous la forme « ? ».',
  'import_legacy_doc': 'Les fichiers Word 97–2003 (.doc) ne peuvent pas être convertis ici. Ouvrez-le dans Word ou LibreOffice, enregistrez-le au format .docx, puis réessayez.',
  'import_legacy_rtf': 'Les fichiers texte enrichi (.rtf) ne peuvent pas être convertis ici. Enregistrez-le au format .docx, puis réessayez.',
  'import_legacy_pages': 'Les documents Pages ne peuvent pas être convertis ici. Exportez-le au format Word (.docx) ou PDF, puis réessayez.',
  'import_not_office': 'Ce fichier n’est pas un document Word (.docx) ou OpenDocument (.odt).',
  'import_empty': 'Ce document semble vide — il n’y avait aucun texte à convertir.',
  'import_failed': 'Impossible de convertir {name}. Il est peut-être protégé par un mot de passe ou endommagé.',
  'import_libreoffice_notice': 'Converti avec LibreOffice sur cet ordinateur — la mise en page devrait correspondre à l’original. Les polices absentes de cet ordinateur sont remplacées.',
  'import_wrong_type': 'Veuillez choisir un fichier PDF, Word (.docx) ou OpenDocument (.odt).',

  // ocr (progress messages)
  'ocr_preparing': 'Préparation du moteur OCR…',
  'ocr_already_searchable': 'Déjà interrogeable',
  'ocr_downloading_model': 'Téléchargement du modèle OCR (une seule fois)…',
  'ocr_reading_page': 'Lecture de la page {page} sur {total}…',
  'ocr_saving': 'Enregistrement du PDF interrogeable…',
  'ocr_done': 'Terminé',

  // pdfBackup
  'backup_not_json': 'Ce fichier n’est pas une sauvegarde Universal PDF (ce n’est pas du JSON valide).',
  'backup_invalid': 'Ce fichier n’est pas une sauvegarde Universal PDF.',
  'backup_too_new': 'Cette sauvegarde a été créée par une version plus récente d’Universal PDF — mettez l’application à jour pour l’ouvrir.',

  // pdfPages
  'pages_keep_one': 'Un PDF doit conserver au moins une page',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Titre',
  'meta_author': 'Auteur',
  'meta_subject': 'Objet',
  'meta_keywords': 'Mots-clés',
  'meta_creator': 'Créé avec',
  'meta_producer': 'Produit par',
  'meta_created': 'Création',
  'meta_modified': 'Dernière modification',
  'meta_encrypted': 'Ce PDF est chiffré : ses métadonnées ne peuvent pas être réécrites.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Veuillez choisir un fichier image (PNG, JPG, etc.)',
  'sig_image_no_size': 'Impossible de lire les dimensions de l’image',
  'sig_image_no_canvas': 'Canvas non pris en charge',
  'sig_image_blank': 'L’image semble vide. Essayez une numérisation plus contrastée, ou décochez « Supprimer le fond blanc ».',
  'sig_image_read_failed': 'Impossible de lire le fichier',
  'sig_image_decode_failed': 'Impossible de décoder l’image',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Signé par :',
  'sig_role': 'Fonction :',
  'sig_email': 'E-mail :',
  'sig_phone': 'Téléphone :',
  'sig_signed_on': 'Signé le {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Signez ici',
  'sign_here_name': 'Nom',
  'sign_here_date': 'Date',
  'sign_here_live': 'À tracer',

  // fonts (font picker chips)
  'font_sans': 'Sans serif',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Aucun PDF à fusionner',
  'images_none': 'Aucune image à convertir',
  'image_decode_failed': 'Impossible de décoder {name}',
  'image_decode_failed_why': 'Impossible de décoder {name} — {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Impossible de réserver un jeton.',
  'hosted_refund_failed': 'Impossible de rendre le jeton.',
  'hosted_signed_download_failed': 'Impossible de télécharger le PDF signé.',

  // signRequestClient
  'no_response': 'Aucune réponse',
  'sign_mail_subject': 'À signer : {docName}',
  'sign_mail_body': 'Bonjour,\n\nJe vous ai envoyé un document à signer : {docName}.\n\nCliquez ici pour le signer en ligne (aucun compte nécessaire) :\n{link}\n\nMerci.',

  // qr/render
  'qr_no_canvas': 'Canvas n’est pas disponible dans ce navigateur.',
  'qr_no_data': 'Saisissez un lien ou du texte à encoder.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'moins d’une seconde',
  'lock_duration_seconds_one': 'environ {count} seconde',
  'lock_duration_seconds_other': 'environ {count} secondes',
  'lock_duration_minutes_one': 'environ {count} minute',
  'lock_duration_minutes_other': 'environ {count} minutes',
  'lock_duration_hours_one': 'environ {count} heure',
  'lock_duration_hours_other': 'environ {count} heures',
  'lock_duration_days_one': 'environ {count} jour',
  'lock_duration_days_other': 'environ {count} jours',
  'lock_duration_months_one': 'environ {count} mois',
  'lock_duration_months_other': 'environ {count} mois',
  'lock_duration_years_one': 'environ {count} an',
  'lock_duration_years_other': 'environ {count} ans',
  'lock_duration_forever': 'plus longtemps que quiconque ne voudra attendre',
  'lock_guessable': 'Devinable',
  'lock_weak': 'Faible',
  'lock_fair': 'Passable',
  'lock_reasonable': 'Correct',
  'lock_good': 'Bon',
  'lock_strong': 'Fort',
  'lock_too_short': 'Trop court',
  'lock_pin_obvious': 'C’est l’un des premiers codes PIN que tout le monde essaie. Choisissez des chiffres qui ne se suivent pas et ne se répètent pas.',
  'lock_pin_note_weak': 'Un code PIN à {digits} chiffres cède face à une personne déterminée en {time}. Suffisant pour éviter qu’un document tombe par mégarde entre de mauvaises mains ; pas pour un document de valeur.',
  'lock_pin_note': 'Un code PIN à {digits} chiffres cède face à une personne déterminée en {time}. Utilisez plutôt un mot de passe si la perte du document vous porterait vraiment préjudice.',
  'lock_password_common': 'Ce mot de passe figure dans toutes les listes de mots de passe à deviner. Presque n’importe quoi d’autre serait mieux.',
  'lock_password_short': 'Les mots de passe courts sont testés de manière exhaustive. Visez une phrase de trois ou quatre mots.',
  'lock_password_strong': 'Personne ne le trouvera par force brute. Assurez-vous simplement de pouvoir vous en souvenir — sans lui, impossible de rouvrir le fichier.',
  'lock_password_note': 'Environ {time} pour le deviner par force brute — à condition que ce ne soit pas une phrase que quelqu’un essaierait en premier.',
  'lock_pin_digits_only': 'Un code PIN ne contient que des chiffres.',
  'lock_pin_min': 'Un code PIN doit comporter au moins {min} chiffres.',
  'lock_password_min': 'Un mot de passe doit comporter au moins {min} caractères.',
  'lock_pins_differ': 'Les deux codes PIN ne correspondent pas.',
  'lock_passwords_differ': 'Les deux mots de passe ne correspondent pas.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Seuls les 127 premiers octets d’un mot de passe comptent. Tout ce qui dépasse est ignoré.',
  'lock_password_nonlatin': 'Les caractères accentués ou non latins peuvent être saisis différemment par d’autres applications PDF. Un mot de passe composé de lettres non accentuées, de chiffres et de ponctuation est le plus sûr.',
  'crypto_insecure': 'Ce navigateur refuse le chiffrement sur une connexion non sécurisée. Ouvrez Universal PDF via https:// (ou localhost) et réessayez.',
  'lock_password_required': 'Un mot de passe est nécessaire pour verrouiller un PDF.',
  'lock_check_failed': 'Impossible de verrouiller ce PDF — la vérification du mot de passe a échoué. Rien n’a été enregistré.',
  'unlock_not_locked': 'Ce PDF n’est pas verrouillé.',
  'unlock_old_scheme': 'Ce PDF utilise un ancien système de chiffrement qu’Universal PDF ne peut pas ouvrir. Essayez l’application qui l’a verrouillé.',
  'unlock_incomplete': 'Ce PDF indique être verrouillé, mais ses informations de chiffrement sont incomplètes.',
  'unlock_damaged': 'Ce PDF a été déverrouillé, mais une partie n’a pas pu être lue — le fichier semble endommagé.',

  // heicSniff (adding a picture)
  'image_empty': '{name} est arrivé vide — essayez de l’ajouter à nouveau',
  'image_unreadable': 'Impossible de lire {name} depuis cet appareil — s’il est stocké dans le cloud, ouvrez-le d’abord dans votre application Photos pour qu’il soit téléchargé',

  // deleteAccount
  'delete_account_failed': 'Impossible de supprimer votre compte. Vérifiez votre connexion et réessayez, ou écrivez à inbox@unisim.co.uk.',
}

export default lib
