import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Nenhum PDF está aberto.',
  // saveDocument, exitGuard
  'save_failed': 'Não foi possível salvar o PDF.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'Falha ao carregar o PDF',
  'open_failed_all': 'Não foi possível abrir estes arquivos:',
  'open_failed_some': 'Não foi possível abrir alguns destes arquivos:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Essa senha não abre este PDF.',
  'unlock_failed': 'Não foi possível desbloquear este PDF.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'junção',
  'undo_convert': 'conversão',
  'undo_page_change': 'alteração de páginas',
  'undo_strip_metadata': 'remoção de metadados',

  // useDefaultPdfApp
  'default_app_failed': 'Não foi possível alterar o app padrão.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Convertido do Word — o texto e a estrutura são preservados, mas o layout original das páginas pode ser diferente.',
  'import_notice_odt': 'Convertido do OpenDocument — o texto e a estrutura são preservados, mas o layout original das páginas pode ser diferente.',
  'import_dropped_count_one': '{count} caractere que as fontes deste PDF não conseguem escrever foi substituído por “?”.',
  'import_dropped_count_other': '{count} caracteres que as fontes deste PDF não conseguem escrever foram substituídos por “?”.',
  'import_dropped_chars_one': 'Não foi possível escrever o caractere {chars}, que aparece como “?”.',
  'import_dropped_chars_other': 'Não foi possível escrever os caracteres {chars}, que aparecem como “?”.',
  'import_legacy_doc': 'Arquivos do Word 97–2003 (.doc) não podem ser convertidos aqui. Abra o arquivo no Word ou no LibreOffice, salve como .docx e tente novamente.',
  'import_legacy_rtf': 'Arquivos Rich Text (.rtf) não podem ser convertidos aqui. Salve como .docx e tente novamente.',
  'import_legacy_pages': 'Documentos do Pages não podem ser convertidos aqui. Exporte como Word (.docx) ou PDF e tente novamente.',
  'import_not_office': 'Esse arquivo não é um documento Word (.docx) nem OpenDocument (.odt).',
  'import_empty': 'Esse documento parece estar vazio — não havia texto para converter.',
  'import_failed': 'Não foi possível converter {name}. Ele pode estar protegido com senha ou danificado.',
  'import_libreoffice_notice': 'Convertido com o LibreOffice neste computador — o layout das páginas deve corresponder ao original. As fontes que este computador não tem são substituídas.',
  'import_wrong_type': 'Escolha um arquivo PDF, Word (.docx) ou OpenDocument (.odt).',

  // ocr (progress messages)
  'ocr_preparing': 'Preparando o mecanismo de OCR…',
  'ocr_already_searchable': 'Já é pesquisável',
  'ocr_downloading_model': 'Baixando o modelo de OCR (só uma vez)…',
  'ocr_reading_page': 'Lendo a página {page} de {total}…',
  'ocr_saving': 'Salvando o PDF pesquisável…',
  'ocr_done': 'Concluído',

  // pdfBackup
  'backup_not_json': 'Esse arquivo não é um backup do Universal PDF (não é um JSON válido).',
  'backup_invalid': 'Esse arquivo não é um backup do Universal PDF.',
  'backup_too_new': 'Este backup foi criado por uma versão mais recente do Universal PDF — atualize o app para abri-lo.',

  // pdfPages
  'pages_keep_one': 'Um PDF precisa ter pelo menos uma página',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Título',
  'meta_author': 'Autor',
  'meta_subject': 'Assunto',
  'meta_keywords': 'Palavras-chave',
  'meta_creator': 'Criado com',
  'meta_producer': 'Produzido por',
  'meta_created': 'Criação',
  'meta_modified': 'Última modificação',
  'meta_encrypted': 'Este PDF é criptografado, então os metadados não podem ser reescritos.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Escolha um arquivo de imagem (PNG, JPG etc.)',
  'sig_image_no_size': 'Não foi possível ler as dimensões da imagem',
  'sig_image_no_canvas': 'Canvas não compatível',
  'sig_image_blank': 'A imagem parece estar em branco. Tente uma digitalização com mais contraste ou desative “Remover fundo branco”.',
  'sig_image_read_failed': 'Não foi possível ler o arquivo',
  'sig_image_decode_failed': 'Não foi possível decodificar a imagem',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'Assinado por:',
  'sig_role': 'Cargo:',
  'sig_email': 'E-mail:',
  'sig_phone': 'Telefone:',
  'sig_signed_on': 'Assinado em {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Assine aqui',
  'sign_here_name': 'Nome',
  'sign_here_date': 'Data',
  'sign_here_live': 'Ao vivo',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Nenhum PDF para juntar',
  'images_none': 'Nenhuma imagem para converter',
  'image_decode_failed': 'Não foi possível decodificar {name}',
  'image_decode_failed_why': 'Não foi possível decodificar {name} — {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Não foi possível reservar um token.',
  'hosted_refund_failed': 'Não foi possível devolver o token.',
  'hosted_signed_download_failed': 'Não foi possível baixar o PDF assinado.',

  // signRequestClient
  'no_response': 'Sem resposta',
  'sign_mail_subject': 'Assinatura pendente: {docName}',
  'sign_mail_body': 'Olá,\n\nEnviei um documento para você assinar — {docName}.\n\nClique aqui para assinar on-line (não precisa de conta):\n{link}\n\nObrigado.',

  // qr/render
  'qr_no_canvas': 'O canvas não está disponível neste navegador.',
  'qr_no_data': 'Digite um link ou um texto para codificar.',

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
  'lock_duration_forever': 'mais tempo do que alguém esperaria',
  'lock_guessable': 'Adivinhável',
  'lock_weak': 'Fraca',
  'lock_fair': 'Razoável',
  'lock_reasonable': 'Aceitável',
  'lock_good': 'Boa',
  'lock_strong': 'Forte',
  'lock_too_short': 'Curta demais',
  'lock_pin_obvious': 'Este é um dos primeiros PINs que qualquer pessoa tenta. Escolha dígitos que não sejam uma sequência nem uma repetição.',
  'lock_pin_note_weak': 'Um PIN de {digits} dígitos é descoberto por alguém determinado em {time}. Serve para evitar que um documento caia em mãos erradas por acidente; não para algo valioso.',
  'lock_pin_note': 'Um PIN de {digits} dígitos é descoberto por alguém determinado em {time}. Use uma senha se perder o documento puder causar um prejuízo real.',
  'lock_password_common': 'Esta senha está em todas as listas de senhas comuns. Quase qualquer outra é melhor.',
  'lock_password_short': 'Senhas curtas são testadas por completo. Prefira uma frase de três ou quatro palavras.',
  'lock_password_strong': 'Ninguém vai quebrar esta senha por força bruta. Só garanta que você vai lembrar dela — sem ela não há como entrar.',
  'lock_password_note': 'Cerca de {time} para adivinhar por força bruta — desde que não seja uma frase que alguém tentaria primeiro.',
  'lock_pin_digits_only': 'Um PIN tem somente dígitos.',
  'lock_pin_min': 'Um PIN precisa ter pelo menos {min} dígitos.',
  'lock_password_min': 'Uma senha precisa ter pelo menos {min} caracteres.',
  'lock_pins_differ': 'Os dois PINs não coincidem.',
  'lock_passwords_differ': 'As duas senhas não coincidem.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Só os primeiros 127 bytes de uma senha contam. O que passar disso é ignorado.',
  'lock_password_nonlatin': 'Caracteres acentuados ou não latinos podem ser digitados de forma diferente em outros apps de PDF. Uma senha com letras, dígitos e pontuação é mais segura.',
  'crypto_insecure': 'Este navegador não faz criptografia em uma conexão não segura. Abra o Universal PDF via https:// (ou localhost) e tente novamente.',
  'lock_password_required': 'É preciso uma senha para proteger um PDF.',
  'lock_check_failed': 'Não foi possível proteger este PDF — a verificação da senha falhou. Nada foi salvo.',
  'unlock_not_locked': 'Este PDF não está protegido.',
  'unlock_old_scheme': 'Este PDF usa um esquema de criptografia antigo que o Universal PDF não consegue abrir. Tente o app que o protegeu.',
  'unlock_incomplete': 'Este PDF diz estar protegido, mas os dados da criptografia estão incompletos.',
  'unlock_damaged': 'Este PDF foi desbloqueado, mas parte dele não pôde ser lida — o arquivo parece danificado.',

  // heicSniff (adding a picture)
  'image_empty': '{name} chegou vazio — tente adicionar de novo',
  'image_unreadable': 'Não foi possível ler {name} neste aparelho — se ele estiver na nuvem, abra-o primeiro no app de fotos para que seja baixado',

  // deleteAccount
  'delete_account_failed': 'Não foi possível excluir sua conta. Verifique sua conexão e tente novamente, ou envie um e-mail para inbox@unisim.co.uk.',
}

export default lib
