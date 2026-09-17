import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Fermer',
  'common.cancel': 'Annuler',
  'common.done': 'Terminé',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Ceci sera caviardé à l’exportation',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Noir',
  'color.white': 'Blanc',
  'color.more': 'Plus de couleurs',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Signez ici',
  'sigfield.name': 'Nom',
  'sigfield.date': 'Date',
  'sigfield.live': 'À tracer',
  'sigfield.click_again': 'Cliquez à nouveau pour signer',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Supprimer',
  'selection.delete_aria': 'Supprimer l’objet sélectionné',
  'selection.done_to_select': 'Terminé — conserver et revenir à Sélectionner',
  'selection.done_deselect': 'Terminé — conserver et désélectionner',
  'selection.confirm_aria': 'Confirmer et désélectionner',
  'selection.qr_edit_title': 'Modifier ce code QR — lien, style ou identité visuelle',
  'selection.qr_edit_aria': 'Modifier ce code QR',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'G',
  'text.bold': 'Gras',
  'text.italic_letter': 'I',
  'text.italic': 'Italique',
  'text.underline_letter': 'S',
  'text.underline': 'Souligné',
  'text.link_selection': 'Lier le texte sélectionné',
  'text.edit_link': 'Modifier le lien',
  'text.add_link': 'Ajouter un lien',
  'text.link_prompt': 'URL du lien (laisser vide pour supprimer) :',
  'text.link_prompt_selection': 'URL du lien pour le texte sélectionné (vide pour supprimer) :',
  'text.size_decrease': 'Réduire la taille du texte',
  'text.size_field': 'Taille de police en points',
  'text.size_increase': 'Augmenter la taille du texte',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Bordure',
  'image.border_none': 'Aucune',
  'image.border_none_title': 'Sans bordure',
  'image.border_width': 'Bordure de {width} px',
  'image.border_solid': 'Pleine',
  'image.border_dashed': 'Tirets',

  // AnnotationLayer — line pill
  'line.stroke': 'Épaisseur',
  'line.snap_title': 'Ligne rigide — aligner à l’horizontale, à la verticale ou en diagonale (maintenez Shift en faisant glisser une extrémité pour un alignement ponctuel)',
  'line.snap_on': 'Aligner : oui',
  'line.snap_off': 'Aligner : non',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Couleur',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Supprimer {count} objet',
  'selection.delete_many_other': 'Supprimer {count} objets',
  'selection.delete_many_aria_one': 'Supprimer {count} objet sélectionné',
  'selection.delete_many_aria_other': 'Supprimer {count} objets sélectionnés',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Envoyer pour signature — envoyer ce document par e-mail comme demande de signature',
  'sigfield.send_aria': 'Envoyer pour signature',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Supprimer le remplissage',
  'shape.fill': 'Remplir avec la couleur active',
  'shape.redact_title': 'Caviarder — masque la zone en noir et supprime définitivement le texte à l’exportation',
  'shape.redact_aria': 'Caviarder cette zone',
  'redact.to_fill_title': 'Transformer en forme remplie — le texte en dessous ne sera PLUS supprimé à l’exportation',
  'redact.to_fill_aria': 'Transformer ce caviardage en forme remplie',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Le remplissage ne masque pas le texte',
  'fill_warning.body': 'Un rectangle rempli ne fait que peindre par-dessus la page. Le texte en dessous reste sélectionnable et lisible par un ordinateur. Pour le supprimer définitivement, caviardez-le plutôt.',
  'fill_warning.dont_show': 'Ne plus afficher',
  'fill_warning.fill_anyway': 'Remplir quand même',
  'fill_warning.redact_instead': 'Caviarder plutôt',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Taille',
  'sig_pill.smaller': 'Libellés plus petits',
  'sig_pill.bigger': 'Libellés plus grands',
  'sig_pill.align_title': 'Alignement des libellés : {align} (cliquer pour changer)',
  'sig_pill.align_aria': 'Libellés alignés {align}, cliquer pour changer',
  'sig_pill.align_left': 'à gauche',
  'sig_pill.align_centre': 'au centre',
  'sig_pill.align_right': 'à droite',

  // SignatureOptionsModal
  'sig_options.title': 'Options de signature',
  'sig_options.intro_restyle': 'Modifie les libellés et le style du stylo — les traits que vous avez dessinés restent exactement tels quels. Utilisez la pastille sur la signature pour redimensionner ou aligner les libellés.',
  'sig_options.intro': 'Modifie uniquement le nom et la date — votre signature elle-même reste exactement telle que dessinée. Utilisez la pastille sur la signature pour redimensionner ou aligner les libellés.',
  'sig_options.add_details': 'Ajouter vos coordonnées',
  'sig_options.details_aria': 'Coordonnées à afficher sous la signature',
  'sig_options.add_date': 'Ajouter la date',
  'sig_options.date_aria': 'Ligne de date sous la signature',
  'sig_options.realistic': 'Rendre plus réaliste',
  'sig_options.realistic_hint': 'Encre bleue, pression irrégulière et léger tremblement de la main',
  'sig_options.redraw': 'Redessiner la signature…',

  // TransformPanel
  'transform.sample': `# Bienvenue dans Universal PDF

Collez du **Markdown** ici et cliquez sur *Créer le PDF* pour transformer du texte mis en forme en un document propre et imprimable.

## Mise en forme prise en charge

- Titres avec \`#\`, \`##\` et \`###\`
- **Gras**, *italique* et \`code en ligne\`
- Listes à puces et numérotées
- Blocs de code délimités, tableaux et lignes horizontales
- [Liens cliquables](https://www.unisim.co.uk)

> Les citations sont signalées par une barre de couleur.

### Exemple de tableau

| Fonctionnalité | État | Remarques |
|---|---|---|
| Titres | prêt | H1, H2, H3 |
| Tableaux | prêt | largeur de colonnes automatique |
| Blocs de code | prêt | police à chasse fixe, retour à la ligne |

\`\`\`
Les blocs de code conservent les espaces.
  L’indentation reste en place.
\`\`\`

---

Remplacez cet exemple par votre propre texte pour créer un PDF personnalisé.
`,
  'transform.build_failed': 'Échec de la création du PDF : {error}',
  'transform.drop_wrong_type': 'Déposez un fichier Markdown (.md) ou texte brut (.txt).',
  'transform.read_failed': 'Impossible de lire le fichier.',
  'transform.title': 'Transformer du texte en PDF',
  'transform.subtitle': 'Collez du Markdown (ou du texte brut). Titres, listes, tableaux, code et liens pris en charge.',
  'transform.placeholder': '# Mon document\n\nCommencez à écrire en Markdown…',
  'transform.drop_to_load': 'Déposez pour charger',
  'transform.drop_types': '.md ou .txt',
  'transform.load_sample': 'Charger l’exemple',
  'transform.page': 'Page',
  'transform.orientation_aria': 'Orientation de la page',
  'transform.portrait': 'Portrait',
  'transform.landscape': 'Paysage',
  'transform.drag_hint': 'Faites glisser un fichier .md / .txt pour le charger',
  'transform.build_shortcut': '{keys} pour créer',
  'transform.building': 'Création…',
  'transform.build': 'Créer le PDF',
}

export default annotate
