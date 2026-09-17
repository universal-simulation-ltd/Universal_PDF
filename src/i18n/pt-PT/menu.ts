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
  'about': 'Acerca desta app',
  'about_info': 'O que faz, o que nunca envia e qual a versão em uso.',
  'reset_defaults': 'Repor predefinições',
  'defaults_restored': 'Predefinições repostas',
  'reset_defaults_info': 'Voltar a mostrar as dicas ocultadas com «Não mostrar novamente». Os documentos não são alterados.',
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
  // CompanyBadge
  'company': 'Empresa',
  // ToolbarUserProfile
  'delete_account_row': 'Eliminar a minha conta…',
  // DeleteAccountDialog
  'delete_done_title': 'A conta foi eliminada',
  'delete_done_body': 'A sessão foi terminada em todo o lado. O Universal PDF continua a funcionar sem conta, e os ficheiros neste dispositivo ficam tal como estavam.',
  'close': 'Fechar',
  'delete_title': 'Eliminar a conta em todo o lado?',
  'delete_body_email': 'Esta ação elimina o Universal ID ({email}) em {every} app ou produto UNI·SIM em que é usado para iniciar sessão, e não apenas no Universal PDF. Não é possível anular.',
  'delete_body': 'Esta ação elimina o Universal ID em {every} app ou produto UNI·SIM em que é usado para iniciar sessão, e não apenas no Universal PDF. Não é possível anular.',
  'delete_every': 'cada',
  'delete_point_profile': 'O início de sessão, o perfil e as definições são eliminados.',
  'delete_point_sole_org': 'As organizações em que é o único membro são eliminadas, com tudo o que nelas está guardado.',
  'delete_point_shared_org': 'Numa organização partilhada, a conta é removida e a organização continua sem ela.',
  'delete_point_files': 'Os PDF neste dispositivo e os ficheiros recentes não são alterados.',
  'delete_point_subscription': 'Uma subscrição paga não é cancelada automaticamente. Envie um email para inbox@unisim.co.uk e nós cancelamo-la.',
  'delete_confirm_label': 'Escreva {phrase} para confirmar',
  'deleting': 'A eliminar…',
  'delete_button': 'Eliminar a minha conta',
  // FileNameEditor
  'rename_file': 'Mudar o nome do ficheiro',
  'click_to_rename': 'Clique para mudar o nome',
}

export default menu
