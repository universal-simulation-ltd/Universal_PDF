import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Cerrar',
  'common.cancel': 'Cancelar',
  'common.done': 'Listo',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Esto se censurará al exportar',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Negro',
  'color.white': 'Blanco',
  'color.more': 'Más colores',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Firma aquí',
  'sigfield.name': 'Nombre',
  'sigfield.date': 'Fecha',
  'sigfield.live': 'En directo',
  'sigfield.click_again': 'Haz clic de nuevo para firmar',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Eliminar',
  'selection.delete_aria': 'Eliminar el objeto seleccionado',
  'selection.done_to_select': 'Listo: conservar y volver a Seleccionar',
  'selection.done_deselect': 'Listo: conservar y deseleccionar',
  'selection.confirm_aria': 'Confirmar y deseleccionar',
  'selection.qr_edit_title': 'Editar este código QR: enlace, estilo o marca',
  'selection.qr_edit_aria': 'Editar este código QR',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'N',
  'text.bold': 'Negrita',
  'text.italic_letter': 'K',
  'text.italic': 'Cursiva',
  'text.underline_letter': 'S',
  'text.underline': 'Subrayado',
  'text.link_selection': 'Enlazar el texto seleccionado',
  'text.edit_link': 'Editar enlace',
  'text.add_link': 'Añadir enlace',
  'text.link_prompt': 'URL del enlace (déjalo en blanco para quitarlo):',
  'text.link_prompt_selection': 'URL del enlace para el texto seleccionado (en blanco para quitarlo):',
  'text.size_decrease': 'Reducir tamaño del texto',
  'text.size_field': 'Tamaño de fuente en puntos',
  'text.size_increase': 'Aumentar tamaño del texto',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Borde',
  'image.border_none': 'Ninguno',
  'image.border_none_title': 'Sin borde',
  'image.border_width': 'Borde de {width}px',
  'image.border_solid': 'Continuo',
  'image.border_dashed': 'Discontinuo',

  // AnnotationLayer — line pill
  'line.stroke': 'Trazo',
  'line.snap_title': 'Línea rígida: se ajusta en horizontal, vertical o diagonal (mantén Shift mientras arrastras un extremo para ajustarla solo esa vez)',
  'line.snap_on': 'Ajuste sí',
  'line.snap_off': 'Ajuste no',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Color',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Eliminar {count} objeto',
  'selection.delete_many_other': 'Eliminar {count} objetos',
  'selection.delete_many_aria_one': 'Eliminar {count} objeto seleccionado',
  'selection.delete_many_aria_other': 'Eliminar {count} objetos seleccionados',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Enviar para firmar: envía este documento por correo como solicitud de firma',
  'sigfield.send_aria': 'Enviar para firmar',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Quitar relleno',
  'shape.fill': 'Rellenar con el color activo',
  'shape.redact_title': 'Censurar: tapa el área en negro y elimina el texto de forma permanente al exportar',
  'shape.redact_aria': 'Censurar esta área',
  'redact.to_fill_title': 'Convertir en forma rellena: el texto de debajo YA NO se elimina al exportar',
  'redact.to_fill_aria': 'Convertir esta censura en una forma rellena',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'El relleno no oculta el texto',
  'fill_warning.body': 'Un rectángulo relleno solo pinta encima de la página. El texto de debajo sigue siendo seleccionable y legible por un ordenador. Para eliminarlo definitivamente, censúralo.',
  'fill_warning.dont_show': 'No volver a mostrar',
  'fill_warning.fill_anyway': 'Rellenar igualmente',
  'fill_warning.redact_instead': 'Censurar',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Tamaño',
  'sig_pill.smaller': 'Etiquetas más pequeñas',
  'sig_pill.bigger': 'Etiquetas más grandes',
  'sig_pill.align_title': 'Alinear etiquetas: {align} (haz clic para cambiar)',
  'sig_pill.align_aria': 'Alinear etiquetas: {align}; haz clic para cambiar',
  'sig_pill.align_left': 'izquierda',
  'sig_pill.align_centre': 'centro',
  'sig_pill.align_right': 'derecha',

  // SignatureOptionsModal
  'sig_options.title': 'Opciones de firma',
  'sig_options.intro_restyle': 'Cambia las etiquetas y el estilo del trazo; los trazos que dibujaste quedan exactamente como estaban. Usa la barra flotante de la firma para cambiar el tamaño o la alineación de las etiquetas.',
  'sig_options.intro': 'Cambia solo el nombre y la fecha; tu firma queda exactamente como la dibujaste. Usa la barra flotante de la firma para cambiar el tamaño o la alineación de las etiquetas.',
  'sig_options.add_details': 'Añadir tus datos',
  'sig_options.details_aria': 'Datos que se muestran debajo de la firma',
  'sig_options.add_date': 'Añadir fecha',
  'sig_options.date_aria': 'Línea de fecha debajo de la firma',
  'sig_options.realistic': 'Darle un aspecto más realista',
  'sig_options.realistic_hint': 'Tinta azul, presión irregular y un ligero temblor de la mano',
  'sig_options.redraw': 'Volver a dibujar la firma…',

  // TransformPanel
  'transform.sample': `# Te damos la bienvenida a Universal PDF

Pega **Markdown** aquí y haz clic en *Generar PDF* para convertir texto con formato en un documento limpio y listo para imprimir.

## Formato compatible

- Encabezados con \`#\`, \`##\` y \`###\`
- **Negrita**, *cursiva* y \`código en línea\`
- Listas con viñetas y numeradas
- Bloques de código delimitados, tablas y líneas horizontales
- [Enlaces en los que se puede hacer clic](https://www.unisim.co.uk)

> Las citas se resaltan con una barra de color.

### Tabla de ejemplo

| Función | Estado | Notas |
|---|---|---|
| Encabezados | listo | H1, H2, H3 |
| Tablas | listo | ancho de columna automático |
| Bloques de código | listo | fuente monoespaciada, con ajuste de línea |

\`\`\`
Los bloques de código conservan los espacios.
  La sangría se mantiene.
\`\`\`

---

Sustituye este ejemplo por tu propio texto para generar un PDF personalizado.
`,
  'transform.build_failed': 'No se ha podido generar el PDF: {error}',
  'transform.drop_wrong_type': 'Suelta un archivo Markdown (.md) o de texto sin formato (.txt).',
  'transform.read_failed': 'No se ha podido leer el archivo.',
  'transform.title': 'Transformar texto en PDF',
  'transform.subtitle': 'Pega Markdown (o texto sin formato). Admite encabezados, listas, tablas, código y enlaces.',
  'transform.placeholder': '# Mi documento\n\nEmpieza a escribir en Markdown…',
  'transform.drop_to_load': 'Suelta para cargar',
  'transform.drop_types': '.md o .txt',
  'transform.load_sample': 'Cargar ejemplo',
  'transform.page': 'Página',
  'transform.orientation_aria': 'Orientación de la página',
  'transform.portrait': 'Vertical',
  'transform.landscape': 'Horizontal',
  'transform.drag_hint': 'Arrastra un archivo .md / .txt para cargarlo',
  'transform.build_shortcut': '{keys} para generar',
  'transform.building': 'Generando…',
  'transform.build': 'Generar PDF',
}

export default annotate
