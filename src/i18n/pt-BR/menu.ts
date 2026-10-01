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
  'knowledge_base_info': 'Como cada ferramenta funciona, com guias para baixar.', // under the SDK's own "Knowledge base" label
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
  // FileNameEditor
  'rename_file': 'Renomear arquivo',
  'click_to_rename': 'Clique para renomear',
}

export default menu
