import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Aktionen',
  // FileMenu — InfoRow (?)
  'info_help': 'Was bewirkt „{label}“?',
  // FileMenu — current file header and rename editor
  'current_file': 'Aktuelle Datei',
  'current_file_title': '{name} – zum Umbenennen klicken',
  'current_file_rename': '{name} umbenennen',
  'rename_pdf': 'PDF umbenennen',
  'rename_new_name': 'Neuer Dateiname',
  'cancel': 'Abbrechen',
  'save': 'Speichern',
  // FileMenu — top level with no document
  'open_pdf': 'PDF öffnen…',
  // FileMenu — File
  'file': 'Datei',
  'close_pdf': 'PDF schließen',
  'open_another_pdf': 'Anderes PDF öffnen…',
  'back_up': 'Sichern…',
  'backups': 'Sicherungen…',
  // FileMenu — View
  'view': 'Ansicht',
  'pages': 'Seiten',
  'present': 'Präsentieren',
  'find': 'Suchen',
  // FileMenu — Advanced
  'advanced': 'Erweitert',
  'ocr': 'Durchsuchbar machen (OCR)',
  'ocr_info': 'Liest ein gescanntes PDF direkt auf dem Gerät, damit du seinen Text suchen und markieren kannst.',
  'merge': 'Mit anderem PDF zusammenfügen',
  'merge_info': 'Füge diese Datei mit anderen zusammen – und ändere vor dem Exportieren die Reihenfolge.',
  'convert': 'In Bilder umwandeln',
  'convert_info': 'Wandelt jede Seite in PNG oder JPG um (bei mehreren Seiten als ZIP).',
  'advanced_export': 'Erweiterter Export',
  'advanced_export_info': 'Seiten zu Bildern reduzieren, mit einem Passwort schützen, Metadaten behalten oder entfernen.',
  'metadata': 'Dokument-Metadaten',
  'metadata_info': 'Sieh nach, wen und was diese Datei nennt – und entferne es.',
  'knowledge_base_info': 'Wie jedes Werkzeug funktioniert, mit Anleitungen zum Herunterladen.', // under the SDK's own "Knowledge base" label
  // FileMenu — Redact
  'redact': 'Schwärzen',
  'find_and_redact': 'Suchen und schwärzen',
  'find_and_redact_info': 'Durchsucht den Text und schwärzt jeden Treffer.',
  'free_draw': 'Freihand',
  'free_draw_info': 'Ziehe einen Rahmen über etwas, um es zu schwärzen, oder tippe, um einen zu setzen. Die Füllfarbe wählst du in der Symbolleiste.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Rückgängig / Wiederholen',
  'undo': 'Rückgängig',
  'undo_named': 'Rückgängig: {action}',
  'redo': 'Wiederholen',
  'clear_annotations': 'Alle Kommentare entfernen',
  // FileNameEditor
  'rename_file': 'Datei umbenennen',
  'click_to_rename': 'Zum Umbenennen klicken',
}

export default menu
