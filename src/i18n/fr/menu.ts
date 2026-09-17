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
  'about': 'À propos de cette application',
  'about_info': 'Ce qu’elle fait, ce qu’elle n’envoie jamais et la version que vous utilisez.',
  'reset_defaults': 'Rétablir les valeurs par défaut',
  'defaults_restored': 'Valeurs par défaut rétablies',
  'reset_defaults_info': 'Réaffiche les conseils masqués avec « Ne plus afficher ». Vos documents ne sont pas modifiés.',
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
  // FileMenu — Language
  'language': 'Langue',
  'language_other': 'Autre…',
  'language_request': '{link} pour demander une langue.',
  'language_contact': 'Contactez UNI SIM',
  // CompanyBadge
  'company': 'Entreprise',
  // ToolbarUserProfile
  'delete_account_row': 'Supprimer mon compte…',
  // DeleteAccountDialog
  'delete_done_title': 'Votre compte a été supprimé',
  'delete_done_body': 'Vous êtes déconnecté partout. Universal PDF continue de fonctionner sans compte, et les fichiers sur cet appareil sont tels que vous les avez laissés.',
  'close': 'Fermer',
  'delete_title': 'Supprimer votre compte partout ?',
  'delete_body_email': 'Cette action supprime votre Universal ID ({email}) dans {every} application et produit UNI·SIM auxquels vous vous connectez avec, et pas seulement dans Universal PDF. Elle est irréversible.',
  'delete_body': 'Cette action supprime votre Universal ID dans {every} application et produit UNI·SIM auxquels vous vous connectez avec, et pas seulement dans Universal PDF. Elle est irréversible.',
  'delete_every': 'chaque',
  'delete_point_profile': 'Vos identifiants de connexion, votre profil et vos réglages sont supprimés.',
  'delete_point_sole_org': 'Les organisations dont vous êtes le seul membre sont supprimées, avec tout ce qu’elles contiennent.',
  'delete_point_shared_org': 'Dans une organisation que vous partagez, vous êtes retiré et elle continue sans vous.',
  'delete_point_files': 'Les PDF sur cet appareil et vos fichiers récents ne sont pas touchés.',
  'delete_point_subscription': 'Un abonnement payant n’est pas résilié automatiquement. Écrivez à inbox@unisim.co.uk et nous le résilierons.',
  'delete_confirm_label': 'Saisissez {phrase} pour confirmer',
  'deleting': 'Suppression…',
  'delete_button': 'Supprimer mon compte',
  // FileNameEditor
  'rename_file': 'Renommer le fichier',
  'click_to_rename': 'Cliquez pour renommer',
}

export default menu
