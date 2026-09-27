import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Acciones',
  // FileMenu — InfoRow (?)
  'info_help': '¿Qué hace «{label}»?',
  // FileMenu — current file header and rename editor
  'current_file': 'Archivo actual',
  'current_file_title': '{name}: haz clic para cambiar el nombre',
  'current_file_rename': 'Cambiar el nombre de {name}',
  'rename_pdf': 'Cambiar nombre del PDF',
  'rename_new_name': 'Nuevo nombre de archivo',
  'cancel': 'Cancelar',
  'save': 'Guardar',
  // FileMenu — top level with no document
  'open_pdf': 'Abrir PDF…',
  // FileMenu — File
  'file': 'Archivo',
  'close_pdf': 'Cerrar PDF',
  'open_another_pdf': 'Abrir otro PDF…',
  'back_up': 'Hacer copia de seguridad…',
  'backups': 'Copias de seguridad…',
  // FileMenu — View
  'view': 'Ver',
  'pages': 'Páginas',
  'present': 'Presentar',
  'find': 'Buscar',
  // FileMenu — Advanced
  'advanced': 'Avanzado',
  'ocr': 'Permitir búsquedas (OCR)',
  'ocr_info': 'Lee un PDF escaneado en el dispositivo para que puedas buscar y seleccionar su texto.',
  'merge': 'Unir con otro PDF',
  'merge_info': 'Combina este archivo con otros y cambia el orden antes de exportar.',
  'convert': 'Convertir en imágenes',
  'convert_info': 'Convierte cada página en PNG o JPG (un ZIP si hay varias páginas).',
  'advanced_export': 'Exportación avanzada',
  'advanced_export_info': 'Convierte las páginas en imágenes, bloquéalo con contraseña y conserva o elimina los metadatos.',
  'metadata': 'Metadatos del documento',
  'metadata_info': 'Mira a quién y qué menciona este archivo y luego límpialo.',
  // FileMenu — Redact
  'redact': 'Censurar',
  'find_and_redact': 'Buscar y censurar',
  'find_and_redact_info': 'Busca en el texto y tapa todas las coincidencias.',
  'free_draw': 'Dibujo libre',
  'free_draw_info': 'Arrastra un cuadro sobre lo que quieras censurar o toca para colocar uno. Elige el relleno entre los colores de la barra de herramientas.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Deshacer / Rehacer',
  'undo': 'Deshacer',
  'undo_named': 'Deshacer {action}',
  'redo': 'Rehacer',
  'clear_annotations': 'Borrar todas las anotaciones',
  // FileNameEditor
  'rename_file': 'Cambiar nombre del archivo',
  'click_to_rename': 'Haz clic para cambiar el nombre',
}

export default menu
