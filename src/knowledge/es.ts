import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: '¿Qué es exactamente un PDF?',
    summary: 'De dónde viene el formato y por qué se ve igual en todas partes.',
    group: 'Lo básico',
    body: `PDF son las siglas en inglés de «formato de documento portátil» (Portable Document Format). Adobe lo presentó en 1993 para resolver un problema sencillo: un documento que se veía bien en un ordenador a menudo se veía mal en otro, porque ese otro ordenador tenía otras fuentes, otra impresora u otra versión del programa.

Un PDF fija la página. En lugar de decir «aquí hay un párrafo, colóquelo lo mejor que pueda», viene a decir «dibuje estas letras, con esta fuente, exactamente en estas posiciones de una página exactamente de este tamaño». Por eso un PDF se ve igual en un móvil, en un portátil o en la máquina de una imprenta.

## De quién es

Ya no es de nadie. Adobe publicó la especificación pronto y, en 2008, el PDF pasó a ser una norma internacional abierta, la ISO 32000. La versión actual, PDF 2.0, llegó en 2017. Cualquiera puede crear programas que lean o generen archivos PDF, y por eso tantas aplicaciones pueden hacerlo.

## Qué puede contener un PDF

- Texto, con las fuentes necesarias para dibujarlo
- Imágenes, incluidas páginas escaneadas enteras
- Dibujos y formas
- Campos de formulario que se pueden rellenar
- Enlaces, marcadores y comentarios
- Información sobre el propio documento, como su título y su autor
- Un bloqueo con contraseña, si alguien lo ha añadido

## Algunos tipos de PDF de los que quizá haya oído hablar

**PDF/A** es una variante más estricta pensada para el archivo a largo plazo, normalizada como ISO 19005. Exige que todo lo necesario para mostrar el documento, como las fuentes, esté dentro del archivo, y no admite cifrado, para que el documento se pueda seguir abriendo dentro de varias décadas.

**Los formularios rellenables** contienen campos en los que se puede escribir. La mayoría usa un sistema que forma parte de la propia norma PDF. Una minoría usa un diseño más antiguo llamado XFA, que más tarde se eliminó de la norma y que muchas aplicaciones, incluida esta, solo admiten en parte.

## La contrapartida

Lo mismo que hace fiable a un PDF hace que sea incómodo modificarlo. Se diseñó para ser una página terminada, no un borrador. El siguiente artículo explica por qué.`,
  },
  {
    id: 'inside-a-pdf',
    title: '¿Por qué cuesta tanto editar un PDF?',
    summary: 'Texto frente a imágenes escaneadas, fuentes incrustadas y la información oculta en un archivo.',
    group: 'Lo básico',
    body: `Si alguna vez ha intentado cambiar una palabra en un PDF y ha visto que el resto de la línea no se desplazaba para hacerle sitio, ya conoce la forma en que están construidos los PDF.

## El texto se coloca, no fluye

Un procesador de textos guarda párrafos y calcula dónde se cortan las líneas cada vez que usted edita. Un PDF suele guardar el resultado: pequeños fragmentos de letras, cada uno fijado en una posición exacta. A menudo no hay nada en el archivo que diga «estas líneas son un solo párrafo» o «esto es una tabla». Si cambia una palabra, nada sabe cómo recolocar lo que viene después.

## Las fuentes suelen estar incompletas

Para verse igual en todas partes, un PDF suele llevar sus fuentes dentro. Para que el archivo ocupe poco, a menudo solo lleva las letras que el documento usa de verdad. Así que, aunque pudiera añadir texto nuevo con la fuente original, es posible que la letra que necesita simplemente no esté en el archivo.

## Algunos PDF no tienen nada de texto

Un documento escaneado es un PDF que contiene una fotografía de cada página. Parece texto, pero para un ordenador es una imagen: no se puede buscar en él, ni seleccionarlo, ni copiar nada.

Universal PDF puede solucionarlo con **Permitir búsquedas (OCR)**. Lee las palabras de la imagen y coloca sobre la página una capa invisible de texto, en las mismas posiciones. La página se ve exactamente igual que antes, pero ahora puede buscar en ella y seleccionar texto. El reconocimiento nunca es perfecto, así que revise todo lo que sea importante.

## Los archivos llevan información sobre sí mismos

La mayoría de los PDF incluyen datos como un título, un autor, el programa que creó el archivo y cuándo se creó o se modificó. No se muestran en la página, pero cualquiera que abra las propiedades del documento puede verlos. Universal PDF le permite consultarlos y, al exportar, puede elegir si conservarlos o eliminarlos.

## Entonces, ¿cómo se edita un PDF?

Sobre todo añadiendo cosas encima en lugar de reescribir lo que hay debajo: cuadros de texto, resaltados, dibujos, firmas y campos de formulario rellenados. Así funciona Universal PDF. Lo que usted añade se mantiene aparte y editable mientras trabaja, y se integra en las páginas al guardar.`,
  },
  {
    id: 'flattening-and-redaction',
    title: '¿Qué significa «acoplar»?',
    summary: 'Integrar sus cambios en la página, y por qué un recuadro negro no siempre es una censura.',
    group: 'Lo básico',
    body: `«Acoplar» significa integrar algo en la página de modo que ya no se pueda separar ni modificar como un elemento independiente. Hay varios tipos, y conviene saber distinguirlos.

## Acoplar lo que usted añade

Mientras trabaja en Universal PDF, sus textos, resaltados, dibujos y firmas son elementos independientes que puede mover o eliminar. Cuando descarga el PDF terminado, se dibujan de forma permanente en las páginas, y los campos de formulario rellenados se convierten en texto normal. Quien abra el archivo descargado los verá como parte del documento, en cualquier aplicación de PDF.

Esto no cambia el documento que tiene abierto. Puede seguir editándolo y volver a descargarlo.

## Acoplar las páginas como imágenes

En las opciones de exportación avanzada puede ir más allá y convertir cada página en una imagen. Así nadie podrá seleccionar, copiar, buscar ni editar el texto, lo que puede ser útil en un documento que usted ha firmado. El inconveniente es que el texto deja de ser texto: no se puede buscar en él y los lectores de pantalla no pueden leerlo en voz alta. La copia que descarga queda acoplada; el documento que tiene abierto conserva su texto.

## Por qué un recuadro negro no es una censura

Un error habitual y grave es ocultar texto delicado dibujando un rectángulo negro encima. El texto sigue en el archivo, debajo. A menudo cualquiera puede seleccionarlo, copiarlo o quitar el rectángulo.

La herramienta de censura de Universal PDF funciona de otra manera. Cuando guarda, exporta o envía un documento con censuras, cada página afectada se convierte en una imagen con los recuadros negros fijados en ella, y la página se reconstruye a partir de esa imagen. El texto que había bajo los recuadros se elimina definitivamente de la copia guardada. Como no se puede deshacer, la aplicación le pide confirmación antes de hacerlo.

Algunos consejos prácticos:

- La censura solo elimina lo que cubre el recuadro, así que revise los bordes de cada uno.
- La información sobre el documento, como su título y su autor, está separada de las páginas. Revísela también antes de compartir un documento censurado.
- Guarde el original sin censurar en un lugar seguro si todavía lo necesita.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Dónde se hace el trabajo',
    summary: 'Lo que Universal PDF hace en su dispositivo y las pocas cosas que pasan por internet.',
    group: 'Cómo funciona',
    body: `Casi todo lo que hace Universal PDF ocurre en su propio dispositivo. Su PDF no se sube a ningún sitio para abrirlo, dibujarlo ni guardarlo.

## En su dispositivo

- **Abrir y mostrar las páginas.** La aplicación lee el archivo y dibuja cada página en su dispositivo, con PDF.js, de código abierto, de Mozilla.
- **Editar, rellenar formularios y firmar.** Lo que usted añade, y el archivo terminado que descarga, se crean en su dispositivo.
- **Permitir búsquedas en escaneados (OCR).** El reconocimiento en sí se ejecuta en su dispositivo. La primera vez que lo usa, la aplicación descarga el motor de reconocimiento y los datos del idioma, y luego los conserva para no tener que volver a descargarlos.
- **Convertir archivos de Word y OpenDocument.** Un archivo .docx u .odt se convierte en PDF en su dispositivo. El resultado se vuelve a maquetar, así que no coincidirá exactamente con el diseño del original.
- **Bloquear y desbloquear con contraseña.** Se hace en su dispositivo. Su contraseña nunca se envía a ningún sitio.

Puede comprobarlo usted mismo: cuando la aplicación haya cargado, desconecte internet y siga trabajando.

## Lo que la aplicación recuerda en este dispositivo

Los archivos abiertos recientemente se guardan en el almacenamiento del propio navegador en este dispositivo, para que vuelvan al recargar la página. Las firmas y los sellos que guarde también se conservan ahí. Si borra los datos del navegador para este sitio, desaparecen. No se nos envían.

## Conservar una copia

La opción **Hacer copia de seguridad** ofrece tres niveles:

1. **Guardar en el navegador.** Automático, y solo en este dispositivo.
2. **Guardar en el ordenador.** Descarga un único archivo de copia de seguridad que contiene el PDF original y sus cambios, que siguen siendo editables. Impórtelo más adelante, en cualquier dispositivo, para seguir donde lo dejó. El archivo no está cifrado, así que cuídelo igual que el propio PDF.
3. **Alojado por UNI·SIM.** Guarda el PDF terminado en internet, asociado a su Universal ID, para que pueda abrirlo en otro dispositivo. Es gratis con un Universal ID; las cuentas gratuitas tienen un límite generoso: si alguna vez lo alcanza, elimine algo que ya no necesite u obtenga más.

## Firmar con el móvil

Si decide dibujar su firma en el móvil, el dibujo viaja del móvil a la aplicación a través de nuestro servidor como un mensaje de corta duración. No se guarda allí. La aplicación solo lo acepta si en el móvil se introduce el PIN que le muestra.

## Lo que la aplicación envía aunque su PDF no salga de su dispositivo

Si inicia sesión, la aplicación registra que se ha abierto, para la página de actividad de su cuenta. Mientras está en pantalla, también envía un pequeño mensaje de «en uso» cada 45 segundos, aproximadamente, con el nombre de la aplicación y un identificador aleatorio de este dispositivo. Ninguno de los dos incluye nada sobre sus archivos. No hay publicidad ni rastreo de terceros.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Firmar un PDF usted mismo',
    summary: 'Qué es una firma colocada en la aplicación, y qué no es.',
    group: 'Cómo funciona',
    body: `Puede firmar un PDF dibujando su firma con el ratón, el panel táctil o el dedo, dibujándola en el móvil o importando una imagen de su firma. Puede guardar firmas y sellos para reutilizarlos, y añadir debajo su nombre y la fecha.

Cuando coloca una firma, es una imagen situada en la página. Cuando descarga el PDF, esa imagen se integra en la página como cualquier otro elemento añadido. Todo esto ocurre en su dispositivo.

## Recuadros de firma

Si prepara un documento para otra persona, puede dibujar un recuadro «Firma aquí» en la página. También puede indicar que un recuadro exija una firma dibujada a mano en lugar de una imagen subida. Dibujar en el móvil cuenta también como firma a mano.

## Qué es este tipo de firma

Es lo que suele llamarse una **firma electrónica**: una marca en un documento que muestra que una persona tenía intención de firmarlo. Muchos países consideran válidas las firmas electrónicas para una amplia variedad de acuerdos cotidianos, y muchas organizaciones las aceptan.

## Qué no es

No es una **firma digital** en sentido técnico. Una firma digital usa un certificado, a menudo emitido por una autoridad de confianza, para sellar el archivo criptográficamente, de modo que la aplicación de PDF pueda detectar cualquier cambio posterior. Universal PDF no añade ese tipo de sello a un archivo que firma usted mismo.

Esto importa porque la imagen de una firma en un PDF no demuestra, por sí sola, quién la puso ni que el documento no se haya modificado desde entonces. Si necesita dejar constancia de quién firmó y cuándo, use **Enviar para firmar**, que mantiene en el servidor un registro de actividad y una huella de cada versión firmada. Los siguientes artículos explican cómo.

## Una nota sobre la ley

Esto no es asesoramiento jurídico. Que una firma electrónica sea aceptable depende de dónde se encuentre, de qué documento se trate y de lo que acepte la otra parte. Algunos documentos, como ciertas operaciones inmobiliarias, los testamentos o los documentos que deben firmarse ante testigos, suelen tener normas más estrictas. Si un documento es importante, compruebe qué se exige antes de confiar en cualquier firma electrónica.`,
  },
  {
    id: 'send-to-sign',
    title: 'Cómo funciona Enviar para firmar',
    summary: 'Cómo pedir a otra persona que firme, paso a paso.',
    group: 'Cómo funciona',
    body: `Enviar para firmar le permite pedir a otra persona que firme un PDF por internet, y les da a ambos un registro de lo ocurrido. Necesita haber iniciado sesión con un Universal ID y tener verificada su dirección de correo electrónico, porque la solicitud se envía en su nombre.

## Los pasos

1. **Marque dónde firmar.** Añada al documento al menos un recuadro «Firma aquí», para que la otra persona sepa dónde va su firma.
2. **Guárdelo en internet.** El PDF terminado, con todo lo que haya añadido ya integrado, se guarda en internet asociado a su Universal ID. Es gratis con un Universal ID; las cuentas gratuitas tienen un límite generoso: si alguna vez lo alcanza, elimine algo que ya no necesite u obtenga más.
3. **Elija quién puede abrirlo.** O bien cualquiera con el enlace, o bien solo la persona a la que va dirigido. Consulte «¿Qué seguridad ofrece Enviar para firmar?» para saber qué cambia con esa elección.
4. **Envíelo.** Copie el enlace y envíelo usted mismo, o escriba la dirección de correo de la otra persona y la aplicación se lo enviará por usted. Con un enlace abierto, el correo incluye el PDF como archivo adjunto. Con un enlace protegido no lo incluye, porque el adjunto se saltaría la protección.

## Dos firmantes, en cualquier orden

Cada solicitud tiene dos firmantes: usted y la persona a la que se la envió. Cada uno recibe su propio enlace, y pueden firmar en cualquier orden. Quien firma en segundo lugar trabaja sobre la copia que ya lleva la primera firma.

## Qué ocurre cuando alguien firma

El firmante abre el documento en su navegador, lo firma y lo envía. La copia firmada se guarda como una versión nueva; las versiones anteriores se conservan, no se sobrescriben. Cada paso queda anotado en un registro de actividad. Cuando los dos han firmado, la solicitud se completa y ambos reciben un correo con un enlace al certificado.

## El certificado

Cada solicitud tiene una página de certificado. Muestra el documento, quién era cada firmante según su dirección de correo, si cada uno ha firmado y el registro de actividad: cuándo se abrió el documento, qué se añadió, desde qué país llegó la solicitud y una huella del documento en cada paso. Desde ella puede descargar el PDF firmado final mientras exista la copia guardada.

## Límites

Los enlaces de firma caducan a los 30 días. Los archivos guardados pueden ocupar hasta 50 MB, y un archivo enviado por correo como adjunto debe ocupar menos de 30 MB.`,
  },
  {
    id: 'send-to-sign-security',
    title: '¿Qué seguridad ofrece Enviar para firmar?',
    summary: 'Qué se cifra, qué puede ver nuestro servidor y cómo funciona el registro de auditoría.',
    group: 'Privacidad y seguridad',
    body: `Enviar para firmar es la única función en la que su documento tiene que salir de su dispositivo, porque otra persona necesita recibirlo. Esto es exactamente lo que implica.

## El cifrado, en pocas palabras

- **En tránsito:** todo lo que viaja entre la aplicación y nuestro servidor pasa por HTTPS, así que va cifrado por el camino.
- **En reposo:** el documento guardado se conserva en un almacenamiento privado y cifrado que no es de lectura pública.
- **No es de extremo a extremo:** nosotros tenemos las claves de ese almacenamiento, así que nuestros sistemas pueden leer el documento. Es necesario para que el servidor se lo entregue al firmante y calcule la huella de cada versión. Protegerlo es un compromiso sobre cómo gestionamos las cosas, no una garantía matemática. Si eso es importante para un documento concreto, no lo envíe por esta vía.

El correo electrónico es otra cuestión. Si la aplicación envía el PDF como adjunto, será tan privado como el buzón del destinatario y cualquier lugar al que se reenvíe el correo.

## El enlace es la llave

El enlace de cada firmante contiene un código aleatorio largo que en la práctica no se puede adivinar. Cuando se abre, nuestro servidor comprueba el código y, si es válido, le da al navegador una dirección temporal del documento que funciona durante 10 minutos. Los enlaces dejan de funcionar a los 30 días y, una vez que una persona ha firmado, su enlace ya no sirve para volver a firmar.

## Cualquiera con el enlace, o solo el destinatario

Con **Cualquiera con el enlace**, quien tenga el enlace puede abrir el documento y firmarlo. Si se reenvía el correo, quien lo reciba puede firmar.

Con **Solo la persona a la que va dirigido**, el documento no se abre hasta que el visitante demuestra que puede leer la dirección que usted indicó:

- Escribe la dirección. Si coincide, se envía un código de 6 dígitos a la dirección que usted indicó, nunca a lo que haya escrito el visitante.
- El código dura 10 minutos y permite 5 intentos, compartidos con el PIN si lo hay. Se pueden enviar como máximo 5 códigos por enlace, con al menos un minuto entre uno y otro.
- Una vez verificado, tiene 4 horas para leer y firmar.
- También puede exigir un PIN de 6 dígitos, que la aplicación genera para que usted lo comunique por teléfono o por mensaje. Solo se guarda una huella SHA-256 con sal del PIN, y por eso no se le puede volver a mostrar.

## El registro de auditoría

Cada vez que vuelve una copia firmada, nuestro servidor calcula su huella SHA-256 y la anota junto a la huella de la versión a la que sustituye. Si cambia un solo byte del archivo, su huella cambia por completo, así que cualquiera puede comprobar una copia del documento con el certificado. Cada evento se registra con la hora según nuestro servidor, la dirección de correo del firmante, su dirección IP y los datos de su navegador. El certificado público muestra solo el país, nunca la dirección IP completa.

Cualquiera que tenga el enlace de la página del certificado puede verla, así que compártalo con el mismo cuidado que el documento.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Bloquear un PDF con contraseña',
    summary: 'El cifrado que se usa, por qué la contraseña lo es todo y qué hacer si la olvida.',
    group: 'Privacidad y seguridad',
    body: `En las opciones de exportación avanzada puede bloquear un PDF con una contraseña o un PIN. A partir de entonces, cualquiera que abra el archivo necesitará la contraseña para ver su contenido, en cualquier aplicación de PDF compatible con el cifrado PDF moderno.

## Qué hace realmente el bloqueo

Universal PDF usa el cifrado más fuerte que ofrece la norma PDF: **AES-256**, tal como se define en PDF 2.0. El texto, las imágenes y el resto del contenido se sellan con una clave aleatoria de 256 bits creada para ese archivo. Esa clave, a su vez, queda bloqueada con su contraseña.

El cifrado se hace en su dispositivo. Su contraseña nunca se envía a ningún sitio y nosotros nunca la vemos.

## Por qué la contraseña lo es todo

El punto débil no es AES-256. La única forma práctica de entrar en un archivo bien bloqueado es adivinar la contraseña, una y otra vez. PDF 2.0 hace que cada intento sea lento a propósito, lo que ayuda mucho, pero alguien con un equipo potente y tiempo aún puede probar una cantidad enorme de intentos.

Por eso la aplicación le indica aproximadamente cuánto resistiría su contraseña frente a un atacante decidido, y lo calcula con prudencia a propósito. Un PIN de 4 dígitos cae en un momento. Una frase de contraseña larga, formada por varias palabras sin relación entre sí, puede resistir más de lo que nadie estaría dispuesto a esperar. Ajuste la contraseña a la importancia del documento.

## Lo que no hace

Algunas aplicaciones ofrecen impedir que se imprima o se copie un PDF sin contraseña. Esas restricciones son solo peticiones a la aplicación de lectura y se eliminan con facilidad, así que Universal PDF no las ofrece. Quien tenga la contraseña puede hacer cualquier cosa con el documento.

## Si olvida la contraseña

Nadie puede recuperarla, tampoco nosotros. No hay forma de restablecerla ni puerta trasera. Guarde su contraseña en un lugar seguro, o conserve una copia sin bloquear en un sitio protegido.

## Abrir PDF bloqueados

Universal PDF puede abrir PDF bloqueados con AES-256 por otras aplicaciones. Le pide la contraseña y desbloquea el archivo en su dispositivo. Algunos PDF usan sistemas de cifrado más antiguos que la aplicación no puede abrir; en ese caso, use la aplicación con la que se bloquearon.

Consejo: las contraseñas formadas por letras de Europa occidental, números y símbolos habituales funcionan de forma fiable en cualquier aplicación de PDF. Algunas aplicaciones tratan de otra manera otros caracteres, como las letras griegas, cirílicas o chinas o los emojis, así que la aplicación le avisa si su contraseña incluye alguno.`,
  },
]

export default articles
