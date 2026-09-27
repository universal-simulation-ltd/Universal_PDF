import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Ações',
  // FileMenu — InfoRow (?)
  'info_help': 'O que faz «{label}»?',
  // FileMenu — current file header and rename editor
  'current_file': 'Ficheiro atual',
  'current_file_title': '{name} — clique para mudar o nome',
  'current_file_rename': 'Mudar o nome de {name}',
  'rename_pdf': 'Mudar o nome do PDF',
  'rename_new_name': 'Novo nome do ficheiro',
  'cancel': 'Cancelar',
  'save': 'Guardar',
  // FileMenu — top level with no document
  'open_pdf': 'Abrir PDF…',
  // FileMenu — File
  'file': 'Ficheiro',
  'close_pdf': 'Fechar PDF',
  'open_another_pdf': 'Abrir outro PDF…',
  'back_up': 'Fazer uma cópia de segurança…',
  'backups': 'Cópias de segurança…',
  // FileMenu — View
  'view': 'Ver',
  'pages': 'Páginas',
  'present': 'Apresentar',
  'find': 'Procurar',
  // FileMenu — Advanced
  'advanced': 'Avançado',
  'ocr': 'Tornar pesquisável (OCR)',
  'ocr_info': 'Ler um PDF digitalizado no próprio dispositivo para poder procurar e selecionar o texto.',
  'merge': 'Juntar com outro PDF',
  'merge_info': 'Combinar este ficheiro com outros — reordenar antes de exportar.',
  'convert': 'Converter em imagens',
  'convert_info': 'Converter cada página em PNG ou JPG (um ZIP para várias páginas).',
  'advanced_export': 'Exportação avançada',
  'advanced_export_info': 'Converter as páginas em imagens, proteger com palavra-passe, manter ou remover os metadados.',
  'metadata': 'Metadados do documento',
  'metadata_info': 'Ver quem e o que este ficheiro identifica — e depois limpar.',
  // FileMenu — Redact
  'redact': 'Rasurar',
  'find_and_redact': 'Procurar e rasurar',
  'find_and_redact_info': 'Pesquisar o texto e tapar a negro todas as ocorrências.',
  'free_draw': 'Desenho livre',
  'free_draw_info': 'Arrastar uma caixa sobre qualquer elemento para o rasurar, ou tocar para colocar uma. Escolher o preenchimento nas cores da barra de ferramentas.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Anular / Refazer',
  'undo': 'Anular',
  'undo_named': 'Anular {action}',
  'redo': 'Refazer',
  'clear_annotations': 'Limpar todas as anotações',
  // FileNameEditor
  'rename_file': 'Mudar o nome do ficheiro',
  'click_to_rename': 'Clique para mudar o nome',
}

export default menu
