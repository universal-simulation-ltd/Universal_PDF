import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Schließen',
  'common.cancel': 'Abbrechen',
  'common.done': 'Fertig',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Wird beim Export geschwärzt',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Schwarz',
  'color.white': 'Weiß',
  'color.more': 'Weitere Farben',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Hier unterschreiben',
  'sigfield.name': 'Name',
  'sigfield.date': 'Datum',
  'sigfield.live': 'Live',
  'sigfield.click_again': 'Zum Unterschreiben erneut klicken',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Löschen',
  'selection.delete_aria': 'Ausgewähltes Objekt löschen',
  'selection.done_to_select': 'Fertig – behalten und zurück zu „Auswählen“',
  'selection.done_deselect': 'Fertig – behalten und Auswahl aufheben',
  'selection.confirm_aria': 'Bestätigen und Auswahl aufheben',
  'selection.qr_edit_title': 'Diesen QR-Code bearbeiten – Link, Stil oder Branding',
  'selection.qr_edit_aria': 'Diesen QR-Code bearbeiten',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'F',
  'text.bold': 'Fett',
  'text.italic_letter': 'K',
  'text.italic': 'Kursiv',
  'text.underline_letter': 'U',
  'text.underline': 'Unterstrichen',
  'text.link_selection': 'Ausgewählten Text verlinken',
  'text.edit_link': 'Link bearbeiten',
  'text.add_link': 'Link hinzufügen',
  'text.link_prompt': 'Link-URL (leer lassen zum Entfernen):',
  'text.link_prompt_selection': 'Link-URL für den ausgewählten Text (leer lassen zum Entfernen):',
  'text.size_decrease': 'Schrift verkleinern',
  'text.size_field': 'Schriftgröße in Punkt',
  'text.size_increase': 'Schrift vergrößern',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Rahmen',
  'image.border_none': 'Keiner',
  'image.border_none_title': 'Kein Rahmen',
  'image.border_width': '{width}px-Rahmen',
  'image.border_solid': 'Durchgehend',
  'image.border_dashed': 'Gestrichelt',

  // AnnotationLayer — line pill
  'line.stroke': 'Strichstärke',
  'line.snap_title': 'Gerade Linie – rastet horizontal, vertikal oder diagonal ein (halte beim Ziehen eines Endpunkts die Umschalttaste gedrückt, um einmalig einzurasten)',
  'line.snap_on': 'Raster an',
  'line.snap_off': 'Raster aus',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Farbe',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': '{count} Objekt löschen',
  'selection.delete_many_other': '{count} Objekte löschen',
  'selection.delete_many_aria_one': '{count} ausgewähltes Objekt löschen',
  'selection.delete_many_aria_other': '{count} ausgewählte Objekte löschen',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Zum Unterschreiben senden – dieses Dokument als Unterschriftsanfrage per E-Mail verschicken',
  'sigfield.send_aria': 'Zum Unterschreiben senden',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Füllung entfernen',
  'shape.fill': 'Mit aktiver Farbe füllen',
  'shape.redact_title': 'Schwärzen – deckt den Bereich schwarz ab und entfernt den Text beim Export endgültig',
  'shape.redact_aria': 'Diesen Bereich schwärzen',
  'redact.to_fill_title': 'In gefüllte Form umwandeln – der Text darunter wird beim Export NICHT MEHR entfernt',
  'redact.to_fill_aria': 'Diese Schwärzung in eine gefüllte Form umwandeln',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Füllen verbirgt den Text nicht',
  'fill_warning.body': 'Ein gefülltes Rechteck übermalt die Seite nur. Der Text darunter bleibt auswählbar und für Computer lesbar. Um ihn endgültig zu entfernen, schwärze ihn stattdessen.',
  'fill_warning.dont_show': 'Nicht mehr anzeigen',
  'fill_warning.fill_anyway': 'Trotzdem füllen',
  'fill_warning.redact_instead': 'Stattdessen schwärzen',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Größe',
  'sig_pill.smaller': 'Kleinere Beschriftung',
  'sig_pill.bigger': 'Größere Beschriftung',
  'sig_pill.align_title': 'Beschriftung ausrichten: {align} (klicken zum Wechseln)',
  'sig_pill.align_aria': 'Beschriftung ausrichten: {align}, klicken zum Ändern',
  'sig_pill.align_left': 'links',
  'sig_pill.align_centre': 'zentriert',
  'sig_pill.align_right': 'rechts',

  // SignatureOptionsModal
  'sig_options.title': 'Unterschriftsoptionen',
  'sig_options.intro_restyle': 'Ändert die Beschriftung und den Stiftstil – deine gezeichneten Striche bleiben genau so, wie du sie gezeichnet hast. Mit der Leiste an der Unterschrift kannst du die Beschriftung skalieren oder ausrichten.',
  'sig_options.intro': 'Ändert nur Name und Datum – deine Unterschrift selbst bleibt genau so, wie du sie gezeichnet hast. Mit der Leiste an der Unterschrift kannst du die Beschriftung skalieren oder ausrichten.',
  'sig_options.add_details': 'Deine Angaben hinzufügen',
  'sig_options.details_aria': 'Angaben, die unter der Unterschrift stehen',
  'sig_options.add_date': 'Datum hinzufügen',
  'sig_options.date_aria': 'Datumszeile unter der Unterschrift',
  'sig_options.realistic': 'Realistischer aussehen lassen',
  'sig_options.realistic_hint': 'Blaue Tinte, ungleichmäßiger Druck und ein leichtes Zittern der Hand',
  'sig_options.redraw': 'Unterschrift neu zeichnen…',

  // TransformPanel
  'transform.sample': `# Willkommen bei Universal PDF

Füge hier **Markdown** ein und klicke auf *PDF erstellen*, um formatierten Text in ein sauberes, druckfertiges Dokument zu verwandeln.

## Unterstützte Formatierung

- Überschriften mit \`#\`, \`##\` und \`###\`
- **Fett**, *kursiv* und \`Inline-Code\`
- Aufzählungen und nummerierte Listen
- Codeblöcke, Tabellen und horizontale Linien
- [Anklickbare Links](https://www.unisim.co.uk)

> Zitate werden mit einem farbigen Balken hervorgehoben.

### Beispieltabelle

| Funktion | Status | Hinweise |
|---|---|---|
| Überschriften | fertig | H1, H2, H3 |
| Tabellen | fertig | automatische Spaltenbreiten |
| Codeblöcke | fertig | Monospace-Schrift, mit Umbruch |

\`\`\`
Codeblöcke behalten Leerzeichen bei.
  Einrückungen bleiben erhalten.
\`\`\`

---

Ersetze dieses Beispiel durch deinen eigenen Text, um ein individuelles PDF zu erstellen.
`,
  'transform.build_failed': 'PDF konnte nicht erstellt werden: {error}',
  'transform.drop_wrong_type': 'Lege eine Markdown- (.md) oder Textdatei (.txt) ab.',
  'transform.read_failed': 'Datei konnte nicht gelesen werden.',
  'transform.title': 'Text in ein PDF umwandeln',
  'transform.subtitle': 'Füge Markdown (oder reinen Text) ein. Überschriften, Listen, Tabellen, Code und Links werden unterstützt.',
  'transform.placeholder': '# Mein Dokument\n\nSchreib los mit Markdown…',
  'transform.drop_to_load': 'Zum Laden loslassen',
  'transform.drop_types': '.md oder .txt',
  'transform.load_sample': 'Beispiel laden',
  'transform.page': 'Seite',
  'transform.orientation_aria': 'Seitenausrichtung',
  'transform.portrait': 'Hochformat',
  'transform.landscape': 'Querformat',
  'transform.drag_hint': 'Ziehe eine .md- oder .txt-Datei hierher, um sie zu laden',
  'transform.build_shortcut': '{keys} zum Erstellen',
  'transform.building': 'Wird erstellt…',
  'transform.build': 'PDF erstellen',
}

export default annotate
