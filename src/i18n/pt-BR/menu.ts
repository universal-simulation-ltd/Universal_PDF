import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Ações',
  // FileMenu — InfoRow (?)
  'info_help': 'O que “{label}” faz?',
  // FileMenu — current file header and rename editor
  'current_file': 'Arquivo atual',
  'current_file_title': '{name} — clique para renomear',
  'current_file_rename': 'Renomear {name}',
  'rename_pdf': 'Renomear PDF',
  'rename_new_name': 'Novo nome do arquivo',
  'cancel': 'Cancelar',
  'save': 'Salvar',
  // FileMenu — top level with no document
  'open_pdf': 'Abrir PDF…',
  // FileMenu — File
  'file': 'Arquivo',
  'close_pdf': 'Fechar PDF',
  'open_another_pdf': 'Abrir outro PDF…',
  'back_up': 'Fazer backup…',
  'backups': 'Backups…',
  // FileMenu — View
  'view': 'Exibir',
  'pages': 'Páginas',
  'present': 'Apresentar',
  'find': 'Localizar',
  // FileMenu — Advanced
  'advanced': 'Avançado',
  'ocr': 'Tornar pesquisável (OCR)',
  'ocr_info': 'Leia um PDF escaneado no próprio aparelho para poder localizar e selecionar o texto.',
  'merge': 'Juntar com outro PDF',
  'merge_info': 'Combine este arquivo com outros — reordene antes de exportar.',
  'convert': 'Converter em imagens',
  'convert_info': 'Gera cada página em PNG ou JPG (um ZIP quando há várias páginas).',
  'advanced_export': 'Exportação avançada',
  'advanced_export_info': 'Transforme as páginas em imagens, proteja com senha, mantenha ou remova os metadados.',
  'metadata': 'Metadados do documento',
  'metadata_info': 'Veja quem e o que este arquivo identifica — e depois apague.',
  'about': 'Sobre este app',
  'about_info': 'O que ele faz, o que nunca envia e qual versão você está usando.',
  'reset_defaults': 'Restaurar padrões',
  'defaults_restored': 'Padrões restaurados',
  'reset_defaults_info': 'Traz de volta as dicas que você dispensou com “Não mostrar novamente”. Seus documentos não são alterados.',
  // FileMenu — Redact
  'redact': 'Tarjar',
  'find_and_redact': 'Localizar e tarjar',
  'find_and_redact_info': 'Pesquise o texto e cubra de preto todas as ocorrências.',
  'free_draw': 'Desenho livre',
  'free_draw_info': 'Arraste uma caixa sobre qualquer coisa para tarjar, ou toque para inserir uma. Escolha o preenchimento nas cores da barra de ferramentas.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Desfazer / Refazer',
  'undo': 'Desfazer',
  'undo_named': 'Desfazer {action}',
  'redo': 'Refazer',
  'clear_annotations': 'Apagar todas as anotações',
  // CompanyBadge
  'company': 'Empresa',
  // ToolbarUserProfile
  'delete_account_row': 'Excluir minha conta…',
  // DeleteAccountDialog
  'delete_done_title': 'Sua conta foi excluída',
  'delete_done_body': 'Você saiu em todos os lugares. O Universal PDF continua funcionando sem conta, e os arquivos neste aparelho estão exatamente como você deixou.',
  'close': 'Fechar',
  'delete_title': 'Excluir sua conta em todos os lugares?',
  'delete_body_email': 'Isso exclui seu Universal ID ({email}) em {every} app e produto UNI·SIM em que você entra com ele, não só no Universal PDF. Não é possível desfazer.',
  'delete_body': 'Isso exclui seu Universal ID em {every} app e produto UNI·SIM em que você entra com ele, não só no Universal PDF. Não é possível desfazer.',
  'delete_every': 'todo',
  'delete_point_profile': 'Seu login, perfil e configurações são excluídos.',
  'delete_point_sole_org': 'Organizações em que você é o único membro são excluídas, com tudo o que estiver armazenado nelas.',
  'delete_point_shared_org': 'Em uma organização compartilhada, você é removido e ela continua sem você.',
  'delete_point_files': 'Os PDFs neste aparelho e seus arquivos recentes não são afetados.',
  'delete_point_subscription': 'Uma assinatura paga não é cancelada automaticamente. Envie um e-mail para inbox@unisim.co.uk e nós a cancelaremos.',
  'delete_confirm_label': 'Digite {phrase} para confirmar',
  'deleting': 'Excluindo…',
  'delete_button': 'Excluir minha conta',
  // FileNameEditor
  'rename_file': 'Renomear arquivo',
  'click_to_rename': 'Clique para renomear',
}

export default menu
