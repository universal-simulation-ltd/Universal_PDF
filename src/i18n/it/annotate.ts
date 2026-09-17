import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Chiudi',
  'common.cancel': 'Annulla',
  'common.done': 'Fine',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Verrà oscurato all’esportazione',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Nero',
  'color.white': 'Bianco',
  'color.more': 'Altri colori',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Firma qui',
  'sigfield.name': 'Nome',
  'sigfield.date': 'Data',
  'sigfield.live': 'Dal vivo',
  'sigfield.click_again': 'Fai di nuovo clic per firmare',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Elimina',
  'selection.delete_aria': 'Elimina l’oggetto selezionato',
  'selection.done_to_select': 'Fine: mantieni e torna a Seleziona',
  'selection.done_deselect': 'Fine: mantieni e deseleziona',
  'selection.confirm_aria': 'Conferma e deseleziona',
  'selection.qr_edit_title': 'Modifica questo codice QR: link, stile o branding',
  'selection.qr_edit_aria': 'Modifica questo codice QR',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'G',
  'text.bold': 'Grassetto',
  'text.italic_letter': 'C',
  'text.italic': 'Corsivo',
  'text.underline_letter': 'S',
  'text.underline': 'Sottolineato',
  'text.link_selection': 'Collega il testo selezionato',
  'text.edit_link': 'Modifica link',
  'text.add_link': 'Aggiungi link',
  'text.link_prompt': 'URL del link (lascia vuoto per rimuoverlo):',
  'text.link_prompt_selection': 'URL del link per il testo selezionato (vuoto per rimuoverlo):',
  'text.size_decrease': 'Riduci dimensione del testo',
  'text.size_field': 'Dimensione del carattere in punti',
  'text.size_increase': 'Aumenta dimensione del testo',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Bordo',
  'image.border_none': 'Nessuno',
  'image.border_none_title': 'Nessun bordo',
  'image.border_width': 'Bordo di {width}px',
  'image.border_solid': 'Continuo',
  'image.border_dashed': 'Tratteggiato',

  // AnnotationLayer — line pill
  'line.stroke': 'Tratto',
  'line.snap_title': 'Linea rigida: si aggancia in orizzontale, verticale o diagonale (tieni premuto Maiusc mentre trascini un’estremità per un aggancio singolo)',
  'line.snap_on': 'Aggancio sì',
  'line.snap_off': 'Aggancio no',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Colore',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Elimina {count} oggetto',
  'selection.delete_many_other': 'Elimina {count} oggetti',
  'selection.delete_many_aria_one': 'Elimina {count} oggetto selezionato',
  'selection.delete_many_aria_other': 'Elimina {count} oggetti selezionati',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Invia per la firma: invia questo documento via email come richiesta di firma',
  'sigfield.send_aria': 'Invia per la firma',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Rimuovi riempimento',
  'shape.fill': 'Riempi con il colore attivo',
  'shape.redact_title': 'Oscura: copre l’area di nero e rimuove definitivamente il testo all’esportazione',
  'shape.redact_aria': 'Oscura quest’area',
  'redact.to_fill_title': 'Trasforma in forma piena: il testo sottostante NON viene più rimosso all’esportazione',
  'redact.to_fill_aria': 'Trasforma questo oscuramento in una forma piena',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Il riempimento non nasconde il testo',
  'fill_warning.body': 'Un rettangolo pieno si limita a coprire la pagina. Il testo sottostante resta selezionabile e leggibile da un computer. Per eliminarlo definitivamente, usa l’oscuramento.',
  'fill_warning.dont_show': 'Non mostrare più',
  'fill_warning.fill_anyway': 'Riempi comunque',
  'fill_warning.redact_instead': 'Oscura invece',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Dimensione',
  'sig_pill.smaller': 'Etichette più piccole',
  'sig_pill.bigger': 'Etichette più grandi',
  'sig_pill.align_title': 'Allinea etichette: {align} (fai clic per cambiare)',
  'sig_pill.align_aria': 'Etichette allineate {align}, fai clic per cambiare',
  'sig_pill.align_left': 'a sinistra',
  'sig_pill.align_centre': 'al centro',
  'sig_pill.align_right': 'a destra',

  // SignatureOptionsModal
  'sig_options.title': 'Opzioni della firma',
  'sig_options.intro_restyle': 'Modifica le etichette e lo stile della penna: i tratti che hai disegnato restano esattamente come sono. Usa il pannello sulla firma per ridimensionare o allineare le etichette.',
  'sig_options.intro': 'Modifica solo il nome e la data: la firma resta esattamente come l’hai disegnata. Usa il pannello sulla firma per ridimensionare o allineare le etichette.',
  'sig_options.add_details': 'Aggiungi i tuoi dati',
  'sig_options.details_aria': 'Dati da mostrare sotto la firma',
  'sig_options.add_date': 'Aggiungi data',
  'sig_options.date_aria': 'Riga della data sotto la firma',
  'sig_options.realistic': 'Rendila più realistica',
  'sig_options.realistic_hint': 'Inchiostro blu, pressione irregolare e mano leggermente tremante',
  'sig_options.redraw': 'Ridisegna firma…',

  // TransformPanel
  'transform.sample': `# Benvenuto in Universal PDF

Incolla qui il testo **Markdown** e fai clic su *Crea PDF* per trasformare il testo formattato in un documento pulito e pronto da stampare.

## Formattazione supportata

- Titoli con \`#\`, \`##\` e \`###\`
- **Grassetto**, *corsivo* e \`codice in linea\`
- Elenchi puntati e numerati
- Blocchi di codice delimitati, tabelle e linee orizzontali
- [Link cliccabili](https://www.unisim.co.uk)

> Le citazioni sono evidenziate da una barra colorata.

### Tabella di esempio

| Funzione | Stato | Note |
|---|---|---|
| Titoli | pronto | H1, H2, H3 |
| Tabelle | pronto | larghezza colonne automatica |
| Blocchi di codice | pronto | carattere monospaziato, a capo automatico |

\`\`\`
I blocchi di codice conservano gli spazi.
  Il rientro resta com’è.
\`\`\`

---

Sostituisci questo esempio con il tuo testo per creare un PDF personalizzato.
`,
  'transform.build_failed': 'Impossibile creare il PDF: {error}',
  'transform.drop_wrong_type': 'Rilascia un file Markdown (.md) o di testo semplice (.txt).',
  'transform.read_failed': 'Impossibile leggere il file.',
  'transform.title': 'Trasforma testo in PDF',
  'transform.subtitle': 'Incolla Markdown (o testo semplice). Supporta titoli, elenchi, tabelle, codice e link.',
  'transform.placeholder': '# Il mio documento\n\nInizia a scrivere in Markdown…',
  'transform.drop_to_load': 'Rilascia per caricare',
  'transform.drop_types': '.md o .txt',
  'transform.load_sample': 'Carica esempio',
  'transform.page': 'Pagina',
  'transform.orientation_aria': 'Orientamento della pagina',
  'transform.portrait': 'Verticale',
  'transform.landscape': 'Orizzontale',
  'transform.drag_hint': 'Trascina un file .md / .txt per caricarlo',
  'transform.build_shortcut': '{keys} per creare',
  'transform.building': 'Creazione…',
  'transform.build': 'Crea PDF',
}

export default annotate
