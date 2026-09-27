import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Azioni',
  // FileMenu — InfoRow (?)
  'info_help': 'A cosa serve «{label}»?',
  // FileMenu — current file header and rename editor
  'current_file': 'File corrente',
  'current_file_title': '{name}: fai clic per rinominare',
  'current_file_rename': 'Rinomina {name}',
  'rename_pdf': 'Rinomina PDF',
  'rename_new_name': 'Nuovo nome del file',
  'cancel': 'Annulla',
  'save': 'Salva',
  // FileMenu — top level with no document
  'open_pdf': 'Apri PDF…',
  // FileMenu — File
  'file': 'File',
  'close_pdf': 'Chiudi PDF',
  'open_another_pdf': 'Apri un altro PDF…',
  'back_up': 'Fai il backup…',
  'backups': 'Backup…',
  // FileMenu — View
  'view': 'Vista',
  'pages': 'Pagine',
  'present': 'Presenta',
  'find': 'Trova',
  // FileMenu — Advanced
  'advanced': 'Avanzate',
  'ocr': 'Rendi ricercabile (OCR)',
  'ocr_info': 'Leggi un PDF scansionato sul dispositivo per poterne trovare e selezionare il testo.',
  'merge': 'Unisci a un altro PDF',
  'merge_info': 'Combina questo file con altri e riordinali prima di esportare.',
  'convert': 'Converti in immagini',
  'convert_info': 'Trasforma ogni pagina in PNG o JPG (un file ZIP se le pagine sono più di una).',
  'advanced_export': 'Esportazione avanzata',
  'advanced_export_info': 'Appiattisci le pagine in immagini, proteggi con password, conserva o rimuovi i metadati.',
  'metadata': 'Metadati del documento',
  'metadata_info': 'Scopri chi e cosa nomina questo file, poi ripuliscilo.',
  // FileMenu — Redact
  'redact': 'Oscura',
  'find_and_redact': 'Trova e oscura',
  'find_and_redact_info': 'Cerca nel testo e oscura ogni corrispondenza.',
  'free_draw': 'A mano libera',
  'free_draw_info': 'Trascina un riquadro su qualsiasi elemento per oscurarlo, oppure tocca per inserirne uno. Scegli il riempimento tra i colori della barra degli strumenti.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Annulla / Ripeti',
  'undo': 'Annulla',
  'undo_named': 'Annulla {action}',
  'redo': 'Ripeti',
  'clear_annotations': 'Cancella tutte le annotazioni',
  // FileNameEditor
  'rename_file': 'Rinomina file',
  'click_to_rename': 'Fai clic per rinominare',
}

export default menu
