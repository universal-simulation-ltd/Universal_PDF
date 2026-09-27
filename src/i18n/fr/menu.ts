import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'Actions',
  // FileMenu — InfoRow (?)
  'info_help': 'À quoi sert « {label} » ?',
  // FileMenu — current file header and rename editor
  'current_file': 'Fichier actuel',
  'current_file_title': '{name} — cliquez pour renommer',
  'current_file_rename': 'Renommer {name}',
  'rename_pdf': 'Renommer le PDF',
  'rename_new_name': 'Nouveau nom de fichier',
  'cancel': 'Annuler',
  'save': 'Enregistrer',
  // FileMenu — top level with no document
  'open_pdf': 'Ouvrir un PDF…',
  // FileMenu — File
  'file': 'Fichier',
  'close_pdf': 'Fermer le PDF',
  'open_another_pdf': 'Ouvrir un autre PDF…',
  'back_up': 'Sauvegarder…',
  'backups': 'Sauvegardes…',
  // FileMenu — View
  'view': 'Affichage',
  'pages': 'Pages',
  'present': 'Présenter',
  'find': 'Rechercher',
  // FileMenu — Advanced
  'advanced': 'Avancé',
  'ocr': 'Rendre interrogeable (OCR)',
  'ocr_info': 'Lit un PDF numérisé sur l’appareil pour que vous puissiez rechercher et sélectionner son texte.',
  'merge': 'Fusionner avec un autre PDF',
  'merge_info': 'Combinez ce fichier avec d’autres — réorganisez-les avant d’exporter.',
  'convert': 'Convertir en images',
  'convert_info': 'Convertit chaque page en PNG ou JPG (un ZIP s’il y a plusieurs pages).',
  'advanced_export': 'Exportation avancée',
  'advanced_export_info': 'Aplatissez les pages en images, verrouillez le fichier par mot de passe, conservez ou supprimez les métadonnées.',
  'metadata': 'Métadonnées du document',
  'metadata_info': 'Découvrez les personnes et les logiciels que ce fichier mentionne — puis effacez ces informations.',
  // FileMenu — Redact
  'redact': 'Caviarder',
  'find_and_redact': 'Rechercher et caviarder',
  'find_and_redact_info': 'Recherchez dans le texte et masquez chaque occurrence.',
  'free_draw': 'Dessin libre',
  'free_draw_info': 'Tracez un rectangle sur n’importe quel élément pour le caviarder, ou touchez pour en déposer un. Choisissez le remplissage parmi les couleurs de la barre d’outils.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Annuler / Rétablir',
  'undo': 'Annuler',
  'undo_named': 'Annuler {action}',
  'redo': 'Rétablir',
  'clear_annotations': 'Effacer toutes les annotations',
  // FileNameEditor
  'rename_file': 'Renommer le fichier',
  'click_to_rename': 'Cliquez pour renommer',
}

export default menu
