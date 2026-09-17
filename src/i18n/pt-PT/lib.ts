import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Não há nenhum PDF aberto.',
  // saveDocument, exitGuard
  'save_failed': 'Não foi possível guardar o PDF.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'Falha ao carregar o PDF',
  'open_failed_all': 'Não foi possível abrir estes ficheiros:',
  'open_failed_some': 'Não foi possível abrir alguns destes ficheiros:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Essa palavra-passe não abre este PDF.',
  'unlock_failed': 'Não foi possível desbloquear este PDF.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'junção',
  'undo_convert': 'conversão',
  'undo_page_change': 'alteração de páginas',
  'undo_strip_metadata': 'remoção de metadados',

  // useDefaultPdfApp
  'default_app_failed': 'Não foi possível alterar a predefinição.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Convertido a partir de Word — o texto e a estrutura são preservados, mas o esquema de página original pode ser diferente.',
  'import_notice_odt': 'Convertido a partir de OpenDocument — o texto e a estrutura são preservados, mas o esquema de página original pode ser diferente.',
  'import_dropped_count_one': '{count} carácter que os tipos de letra deste PDF não conseguem escrever foi substituído por «?».',
  'import_dropped_count_other': '{count} carateres que os tipos de letra deste PDF não conseguem escrever foram substituídos por «?».',
  'import_dropped_chars_one': 'Não foi possível escrever o carácter {chars}, que aparece como «?».',
  'import_dropped_chars_other': 'Não foi possível escrever os carateres {chars}, que aparecem como «?».',
  'import_legacy_doc': 'Os ficheiros Word 97–2003 (.doc) não podem ser convertidos aqui. Abra-o no Word ou no LibreOffice, guarde-o como .docx e tente novamente.',
  'import_legacy_rtf': 'Os ficheiros Rich Text (.rtf) não podem ser convertidos aqui. Guarde-o como .docx e tente novamente.',
  'import_legacy_pages': 'Os documentos Pages não podem ser convertidos aqui. Exporte-o como Word (.docx) ou PDF e tente novamente.',
  'import_not_office': 'Esse ficheiro não é um documento Word (.docx) nem OpenDocument (.odt).',
  'import_empty': 'Esse documento parece estar vazio — não havia texto para converter.',
  'import_failed': 'Não foi possível converter {name}. Pode estar protegido por palavra-passe ou danificado.',
  'import_libreoffice_notice': 'Convertido com o LibreOffice neste computador — o esquema de página deve corresponder ao original. Os tipos de letra que este computador não tem são substituídos.',
  'import_wrong_type': 'Escolha um ficheiro PDF, Word (.docx) ou OpenDocument (.odt).',

  // ocr (progress messages)
  'ocr_preparing': 'A preparar o motor de OCR…',
  'ocr_already_searchable': 'Já é pesquisável',
  'ocr_downloading_model': 'A transferir o modelo de OCR (apenas uma vez)…',
  'ocr_reading_page': 'A ler a página {page} de {total}…',
  'ocr_saving': 'A guardar o PDF pesquisável…',
  'ocr_done': 'Concluído',

  // pdfBackup
  'backup_not_json': 'Esse ficheiro não é uma cópia de segurança do Universal PDF (não é JSON válido).',
  'backup_invalid': 'Esse ficheiro não é uma cópia de segurança do Universal PDF.',
  'backup_too_new': 'Esta cópia de segurança foi criada por uma versão mais recente do Universal PDF — atualize a app para a abrir.',

  // pdfPages
  'pages_keep_one': 'Um PDF tem de manter pelo menos uma página',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Título',
  'meta_author': 'Autor',
  'meta_subject': 'Assunto',
  'meta_keywords': 'Palavras-chave',
  'meta_creator': 'Criado com',
  'meta_producer': 'Produzido por',
  'meta_created': 'Criado',
  'meta_modified': 'Última modificação',
  'meta_encrypted': 'Este PDF está encriptado, por isso os metadados não podem ser reescritos.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Escolha um ficheiro de imagem (PNG, JPG, etc.)',
  'sig_image_no_size': 'Não foi possível ler as dimensões da imagem',
  'sig_image_no_canvas': 'Canvas não suportado',
  'sig_image_blank': 'A imagem parece estar em branco. Experimente uma digitalização com mais contraste ou desative «Remover fundo branco».',
  'sig_image_read_failed': 'Não foi possível ler o ficheiro',
  'sig_image_decode_failed': 'Não foi possível descodificar a imagem',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Assinado por:',
  'sig_role': 'Função:',
  'sig_email': 'Email:',
  'sig_phone': 'Telefone:',
  'sig_signed_on': 'Assinado a {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Assinar aqui',
  'sign_here_name': 'Nome',
  'sign_here_date': 'Data',
  'sign_here_live': 'Manuscrita',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Não há PDF para juntar',
  'images_none': 'Não há imagens para converter',
  'image_decode_failed': 'Não foi possível descodificar {name}',
  'image_decode_failed_why': 'Não foi possível descodificar {name} — {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Não foi possível reservar um token.',
  'hosted_refund_failed': 'Não foi possível devolver o token.',
  'hosted_signed_download_failed': 'Não foi possível transferir o PDF assinado.',

  // signRequestClient
  'no_response': 'Sem resposta',
  'sign_mail_subject': 'Pedido de assinatura: {docName}',
  'sign_mail_body': 'Olá,\n\nEnviei-lhe um documento para assinar — {docName}.\n\nClique aqui para o assinar online (não é necessária conta):\n{link}\n\nObrigado.',

  // qr/render
  'qr_no_canvas': 'O canvas não está disponível neste navegador.',
  'qr_no_data': 'Introduza uma ligação ou algum texto para codificar.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'menos de um segundo',
  'lock_duration_seconds_one': 'cerca de {count} segundo',
  'lock_duration_seconds_other': 'cerca de {count} segundos',
  'lock_duration_minutes_one': 'cerca de {count} minuto',
  'lock_duration_minutes_other': 'cerca de {count} minutos',
  'lock_duration_hours_one': 'cerca de {count} hora',
  'lock_duration_hours_other': 'cerca de {count} horas',
  'lock_duration_days_one': 'cerca de {count} dia',
  'lock_duration_days_other': 'cerca de {count} dias',
  'lock_duration_months_one': 'cerca de {count} mês',
  'lock_duration_months_other': 'cerca de {count} meses',
  'lock_duration_years_one': 'cerca de {count} ano',
  'lock_duration_years_other': 'cerca de {count} anos',
  'lock_duration_forever': 'mais tempo do que alguém está disposto a esperar',
  'lock_guessable': 'Adivinhável',
  'lock_weak': 'Fraca',
  'lock_fair': 'Razoável',
  'lock_reasonable': 'Aceitável',
  'lock_good': 'Boa',
  'lock_strong': 'Forte',
  'lock_too_short': 'Demasiado curta',
  'lock_pin_obvious': 'Este é um dos primeiros PIN que qualquer pessoa experimenta. Escolha dígitos que não sejam uma sequência nem uma repetição.',
  'lock_pin_note_weak': 'Um PIN de {digits} dígitos é descoberto por alguém determinado em {time}. Serve para evitar que um documento chegue às mãos erradas por acidente; não para algo valioso.',
  'lock_pin_note': 'Um PIN de {digits} dígitos é descoberto por alguém determinado em {time}. Use uma palavra-passe se perder o documento for realmente grave.',
  'lock_password_common': 'Esta consta de todas as listas de palavras-passe usadas para adivinhar. Quase qualquer outra é melhor.',
  'lock_password_short': 'As palavras-passe curtas são testadas exaustivamente. Opte por uma frase de três ou quatro palavras.',
  'lock_password_strong': 'Ninguém vai descobrir esta por força bruta. Basta garantir que não a esquece — sem ela não há forma de voltar a entrar.',
  'lock_password_note': 'Cerca de {time} para adivinhar por força bruta — partindo do princípio de que não é uma frase que alguém experimentaria primeiro.',
  'lock_pin_digits_only': 'Um PIN só tem dígitos.',
  'lock_pin_min': 'Um PIN precisa de pelo menos {min} dígitos.',
  'lock_password_min': 'Uma palavra-passe precisa de pelo menos {min} carateres.',
  'lock_pins_differ': 'Os dois PIN não coincidem.',
  'lock_passwords_differ': 'As duas palavras-passe não coincidem.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Só contam os primeiros 127 bytes de uma palavra-passe. O que vier a seguir é ignorado.',
  'lock_password_nonlatin': 'Carateres acentuados ou não latinos podem ser introduzidos de forma diferente noutras apps de PDF. Uma palavra-passe com letras, dígitos e pontuação é mais segura.',
  'crypto_insecure': 'Este navegador não faz encriptação numa ligação não segura. Abra o Universal PDF através de https:// (ou localhost) e tente novamente.',
  'lock_password_required': 'É necessária uma palavra-passe para proteger um PDF.',
  'lock_check_failed': 'Não foi possível proteger este PDF — a verificação da palavra-passe falhou. Nada foi guardado.',
  'unlock_not_locked': 'Este PDF não está protegido.',
  'unlock_old_scheme': 'Este PDF usa um esquema de encriptação antigo que o Universal PDF não consegue abrir. Experimente a app com que foi protegido.',
  'unlock_incomplete': 'Este PDF indica que está protegido, mas os dados de encriptação estão incompletos.',
  'unlock_damaged': 'Este PDF foi desbloqueado, mas não foi possível ler parte dele — o ficheiro parece estar danificado.',

  // heicSniff (adding a picture)
  'image_empty': '{name} chegou vazio — tente adicioná-lo novamente',
  'image_unreadable': 'Não foi possível ler {name} a partir deste dispositivo — se estiver na nuvem, abra-o primeiro na app de fotografias para que seja transferido',

  // deleteAccount
  'delete_account_failed': 'Não foi possível eliminar a conta. Verifique a ligação e tente novamente, ou envie um email para inbox@unisim.co.uk.',
}

export default lib
