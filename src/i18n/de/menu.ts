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
  'about': 'Über diese App',
  'about_info': 'Was sie kann, was sie nie sendet und welche Version du verwendest.',
  'reset_defaults': 'Standardwerte wiederherstellen',
  'defaults_restored': 'Standardwerte wiederhergestellt',
  'reset_defaults_info': 'Holt die Tipps zurück, die du mit „Nicht mehr anzeigen“ ausgeblendet hast. Deine Dokumente bleiben unverändert.',
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
  // FileMenu — Language
  'language': 'Sprache',
  'language_other': 'Andere…',
  'language_request': '{link}, um eine Sprache anzufragen.',
  'language_contact': 'Kontaktiere UNI SIM',
  // CompanyBadge
  'company': 'Unternehmen',
  // ToolbarUserProfile
  'delete_account_row': 'Mein Konto löschen…',
  // DeleteAccountDialog
  'delete_done_title': 'Dein Konto wurde gelöscht',
  'delete_done_body': 'Du bist überall abgemeldet. Universal PDF funktioniert auch ohne Konto weiter, und die Dateien auf diesem Gerät sind genau so, wie du sie hinterlassen hast.',
  'close': 'Schließen',
  'delete_title': 'Dein Konto überall löschen?',
  'delete_body_email': 'Damit wird deine Universal ID ({email}) in {every} UNI·SIM-App und jedem UNI·SIM-Produkt gelöscht, bei dem du dich damit anmeldest – nicht nur in Universal PDF. Das kann nicht rückgängig gemacht werden.',
  'delete_body': 'Damit wird deine Universal ID in {every} UNI·SIM-App und jedem UNI·SIM-Produkt gelöscht, bei dem du dich damit anmeldest – nicht nur in Universal PDF. Das kann nicht rückgängig gemacht werden.',
  'delete_every': 'jeder',
  'delete_point_profile': 'Deine Anmeldung, dein Profil und deine Einstellungen werden gelöscht.',
  'delete_point_sole_org': 'Organisationen, in denen du das einzige Mitglied bist, werden mit allem, was darin gespeichert ist, gelöscht.',
  'delete_point_shared_org': 'Aus Organisationen, die du mit anderen teilst, wirst du entfernt; sie bestehen ohne dich weiter.',
  'delete_point_files': 'PDFs auf diesem Gerät und deine zuletzt verwendeten Dateien bleiben unberührt.',
  'delete_point_subscription': 'Ein kostenpflichtiges Abo wird nicht automatisch gekündigt. Schreib an inbox@unisim.co.uk, dann kündigen wir es.',
  'delete_confirm_label': 'Gib {phrase} ein, um zu bestätigen',
  'deleting': 'Wird gelöscht…',
  'delete_button': 'Mein Konto löschen',
  // FileNameEditor
  'rename_file': 'Datei umbenennen',
  'click_to_rename': 'Zum Umbenennen klicken',
}

export default menu
