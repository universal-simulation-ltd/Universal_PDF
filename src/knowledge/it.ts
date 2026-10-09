import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'Che cos’è davvero un PDF?',
    summary: 'Da dove viene il formato, e perché appare uguale ovunque.',
    group: 'Le basi',
    body: `PDF sta per Portable Document Format, cioè «formato di documento portatile». Adobe lo ha introdotto nel 1993 per risolvere un problema semplice: un documento che si vedeva bene su un computer spesso si vedeva male su un altro, perché l’altro computer aveva caratteri diversi, una stampante diversa o una versione diversa del programma.

Un PDF fissa la pagina. Invece di dire «ecco un paragrafo, impaginalo come meglio puoi», in pratica dice «disegna queste lettere, con questo carattere, esattamente in queste posizioni, su una pagina esattamente di queste dimensioni». Ecco perché un PDF appare uguale su un telefono, su un portatile o sulla macchina di una copisteria.

## Di chi è

Di nessuno, ormai. Adobe ha pubblicato le specifiche fin dall’inizio, e nel 2008 il PDF è diventato uno standard internazionale aperto, ISO 32000. La versione attuale, PDF 2.0, è arrivata nel 2017. Chiunque può scrivere un programma che legge o crea PDF, ed è per questo che ci riescono così tante app.

## Che cosa può contenere un PDF

- Testo, con i caratteri necessari per disegnarlo
- Immagini, comprese intere pagine scansionate
- Disegni e forme
- Campi modulo compilabili
- Link, segnalibri e commenti
- Informazioni sul documento stesso, come il titolo e l’autore
- Una protezione con password, se qualcuno l’ha aggiunta

## Alcuni tipi di PDF di cui potresti sentir parlare

**PDF/A** è una versione più rigorosa pensata per l’archiviazione a lungo termine, standardizzata come ISO 19005. Richiede che tutto ciò che serve per mostrare il documento, come i caratteri, sia contenuto nel file, e non consente la crittografia, così il documento si potrà ancora aprire tra decenni.

**I moduli compilabili** contengono campi in cui puoi scrivere. La maggior parte usa un sistema che fa parte dello standard PDF stesso. Una minoranza usa un sistema più vecchio chiamato XFA, che in seguito è stato rimosso dallo standard e che molte app, compresa questa, supportano solo in parte.

## Il rovescio della medaglia

La stessa cosa che rende affidabile un PDF lo rende scomodo da modificare. È stato progettato per essere una pagina finita, non una bozza. Il prossimo articolo spiega perché.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Perché i PDF sono così difficili da modificare?',
    summary: 'Testo contro immagini scansionate, caratteri incorporati e le informazioni nascoste in un file.',
    group: 'Le basi',
    body: `Se hai mai provato a cambiare una parola in un PDF e hai visto che il resto della riga non si spostava per farle spazio, hai scoperto come sono fatti i PDF.

## Il testo è posizionato, non scorre

Un programma di videoscrittura memorizza i paragrafi e ricalcola dove vanno a capo le righe ogni volta che modifichi qualcosa. Un PDF di solito memorizza il risultato: piccoli gruppi di lettere, ciascuno fissato in una posizione esatta. Spesso nel file non c’è nulla che dica «queste righe sono un unico paragrafo» o «questa è una tabella». Se cambi una parola, niente sa come ridistribuire quello che viene dopo.

## I caratteri spesso sono incompleti

Per apparire uguale ovunque, un PDF di solito porta con sé i propri caratteri. Per mantenere i file leggeri, spesso include solo le lettere che il documento usa davvero. Quindi, anche se potessi aggiungere nuovo testo con il carattere originale, la lettera che ti serve potrebbe semplicemente non essere nel file.

## Alcuni PDF non contengono affatto testo

Un documento scansionato è un PDF che contiene una fotografia di ogni pagina. Sembra testo, ma per un computer è un’immagine: non puoi cercarci dentro, selezionarlo né copiarlo.

Universal PDF può rimediare con **Rendi ricercabile (OCR)**. Legge le parole nell’immagine e stende sopra la pagina uno strato di testo invisibile, nelle stesse posizioni. La pagina appare esattamente come prima, ma ora puoi cercarci dentro e selezionare il testo. Il riconoscimento non è mai perfetto, quindi controlla tutto ciò che conta.

## I file contengono informazioni su sé stessi

La maggior parte dei PDF include dettagli come un titolo, un autore, il programma che ha creato il file e quando è stato creato o modificato. Non compaiono sulla pagina, ma chiunque apra le proprietà del documento può vederli. Universal PDF ti permette di visualizzarli e, quando esporti, puoi scegliere se tenerli o rimuoverli.

## E allora come si modifica un PDF?

Soprattutto aggiungendo cose sopra, invece di riscrivere quello che c’è sotto: caselle di testo, evidenziazioni, disegni, firme e campi modulo compilati. È così che funziona Universal PDF. Le tue aggiunte restano separate e modificabili mentre lavori, e vengono unite alle pagine quando salvi.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'Che cosa significa «appiattire»?',
    summary: 'Unire le modifiche alla pagina, e perché un riquadro nero non è sempre un oscuramento.',
    group: 'Le basi',
    body: `«Appiattire» significa unire qualcosa alla pagina in modo che non si possa più separare o modificare come elemento a sé. Ne esistono alcuni tipi, ed è utile sapere quale è quale.

## Appiattire le tue aggiunte

Mentre lavori in Universal PDF, testo, evidenziazioni, disegni e firme sono elementi separati che puoi spostare o eliminare. Quando scarichi il PDF finito, vengono disegnati in modo permanente nelle pagine, e i campi modulo compilati diventano testo normale. Chiunque apra il file scaricato li vede come parte del documento, in qualsiasi app per PDF.

Il documento che hai aperto non cambia. Puoi continuare a modificarlo e scaricarlo di nuovo.

## Appiattire le pagine in immagini

Nelle opzioni di Esportazione avanzata puoi spingerti oltre e trasformare ogni pagina in un’immagine. A quel punto nessuno può selezionare, copiare, cercare o modificare il testo, cosa che può essere utile per un documento che hai firmato. Lo svantaggio è che il testo non è più testo: non si può cercare, e i lettori di schermo non possono leggerlo ad alta voce. La copia che scarichi è appiattita; il documento che hai aperto conserva il suo testo.

## Perché un riquadro nero non è un oscuramento

Un errore comune e grave è nascondere un testo riservato disegnandoci sopra un rettangolo nero. Il testo è ancora nel file, sotto. Spesso chiunque può selezionarlo, copiarlo o togliere il rettangolo.

Lo strumento di oscuramento di Universal PDF funziona in modo diverso. Quando salvi, esporti o invii un documento che contiene oscuramenti, ogni pagina interessata viene trasformata in un’immagine con i riquadri neri impressi, e la pagina viene ricostruita a partire da quell’immagine. Il testo che si trovava sotto i riquadri viene eliminato definitivamente dalla copia salvata. Poiché l’operazione non può essere annullata, l’app ti chiede una conferma prima di procedere.

Alcuni consigli pratici:

- L’oscuramento elimina solo ciò che il riquadro copre, quindi controlla i bordi di ogni riquadro.
- Le informazioni sul documento, come il titolo e l’autore, sono separate dalle pagine. Controlla anche quelle prima di condividere un documento oscurato.
- Conserva l’originale non oscurato in un posto sicuro, se ti serve ancora.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Dove avviene il lavoro',
    summary: 'Che cosa fa Universal PDF sul tuo dispositivo, e le poche cose che passano online.',
    group: 'Come funziona',
    body: `Quasi tutto ciò che fa Universal PDF avviene sul tuo dispositivo. Il tuo PDF non viene caricato online per essere aperto, disegnato o salvato.

## Sul tuo dispositivo

- **Aprire e mostrare le pagine.** L’app legge il file e disegna ogni pagina sul tuo dispositivo, usando PDF.js, il progetto open source di Mozilla.
- **Modificare, compilare moduli e firmare.** Le tue aggiunte, e il file finito che scarichi, vengono creati sul tuo dispositivo.
- **Rendere ricercabili le scansioni (OCR).** Il riconoscimento vero e proprio avviene sul tuo dispositivo. La prima volta che lo usi, l’app scarica il motore di riconoscimento e i dati della lingua, che poi conserva per non doverli scaricare di nuovo.
- **Convertire file Word e OpenDocument.** Un file .docx o .odt viene trasformato in PDF sul tuo dispositivo. Il risultato viene reimpaginato, quindi non corrisponderà esattamente all’impaginazione originale.
- **Proteggere e sbloccare con password.** Avviene sul tuo dispositivo. La tua password non viene mai inviata da nessuna parte.

Puoi verificarlo tu stesso: una volta caricata l’app, disattiva la connessione a internet e continua a lavorare.

## Che cosa ricorda l’app su questo dispositivo

I file aperti di recente sono conservati nello spazio di archiviazione del browser su questo dispositivo, così un aggiornamento della pagina li riapre. Anche le firme e i timbri che salvi sono conservati lì. Se cancelli i dati del browser per il sito, vengono rimossi. Non vengono inviati a noi.

## Conservare una copia

L’opzione **Fai il backup** offre due livelli, entrambi dalla tua parte:

1. **Salva nel browser.** Automatico, e solo su questo dispositivo.
2. **Salva sul computer.** Scarica un unico file di backup che contiene il PDF originale e le tue modifiche, ancora modificabili. Importalo in seguito, su qualsiasi dispositivo, per riprendere da dove avevi lasciato. Il file non è crittografato, quindi custodiscilo come faresti con il PDF stesso.

## Firmare sul telefono

Se scegli di disegnare la firma sul telefono, il disegno passa dal telefono all’app attraverso il nostro server, come un messaggio di breve durata. Non viene salvato lì. L’app lo accetta solo se sul telefono viene inserito il PIN che ti mostra.

## Che cosa invia l’app anche quando il tuo PDF resta dov’è

Se accedi, l’app registra che è stata aperta, per la pagina delle attività del tuo account. Mentre è sullo schermo invia anche un piccolo messaggio «in uso» circa ogni 45 secondi, con il nome dell’app e un identificativo casuale di questo dispositivo. Nessuno dei due contiene informazioni sui tuoi file. Non ci sono pubblicità né tracciamento di terze parti.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Firmare un PDF da solo',
    summary: 'Che cos’è una firma inserita nell’app, e che cosa non è.',
    group: 'Come funziona',
    body: `Puoi firmare un PDF disegnando la tua firma con il mouse, il trackpad o un dito, disegnandola sul telefono oppure importando un’immagine della tua firma. Puoi salvare firme e timbri per riutilizzarli, e aggiungere sotto il tuo nome e la data.

Quando inserisci una firma, si tratta di un’immagine posizionata sulla pagina. Quando scarichi il PDF, quell’immagine viene unita alla pagina come qualsiasi altra aggiunta. Tutto questo avviene sul tuo dispositivo.

## Riquadri per la firma

Se stai preparando un documento per qualcun altro, puoi disegnare sulla pagina un riquadro «Firma qui». Puoi anche impostare un riquadro in modo che richieda una firma disegnata a mano invece di un’immagine caricata. Disegnare sul telefono conta comunque come firma a mano.

## Che cos’è questo tipo di firma

È quella che di solito si chiama **firma elettronica**: un segno su un documento che mostra che una persona intendeva firmarlo. Molti paesi considerano valide le firme elettroniche per un’ampia gamma di accordi quotidiani, e molte organizzazioni le accettano.

## Che cosa non è

Non è una **firma digitale** in senso tecnico. Una firma digitale usa un certificato, spesso rilasciato da un’autorità fidata, per sigillare il file con la crittografia, in modo che l’app per PDF possa rilevare qualsiasi modifica successiva. Universal PDF non aggiunge questo tipo di sigillo a un file che firmi da solo.

Questo conta perché l’immagine di una firma su un PDF, da sola, non dimostra chi l’ha messa lì, né che il documento non sia stato modificato da allora. Se ti serve una prova di chi ha firmato e quando, usa **Invia per la firma**, che conserva sul server un registro delle attività e un’impronta di ogni versione firmata. I prossimi articoli spiegano come.

## Una nota sulla legge

Questa non è una consulenza legale. Se una firma elettronica sia accettabile dipende da dove ti trovi, da che documento è e da che cosa accetterà l’altra parte. Alcuni documenti, come certe compravendite immobiliari, i testamenti o i documenti che richiedono testimoni, hanno spesso regole più rigide. Se un documento è importante, verifica che cosa è richiesto prima di affidarti a qualsiasi firma elettronica.`,
  },
  {
    id: 'send-to-sign',
    title: 'Come funziona Invia per la firma',
    summary: 'Chiedere a qualcun altro di firmare, passo dopo passo.',
    group: 'Come funziona',
    body: `Invia per la firma ti permette di chiedere a un’altra persona di firmare un PDF online, e dà a entrambi una traccia di quello che è successo. Devi aver effettuato l’accesso con un Universal ID, e il tuo indirizzo email deve essere verificato, perché la richiesta viene inviata a tuo nome.

## I passaggi

1. **Indica dove firmare.** Aggiungi al documento almeno un riquadro «Firma qui», così l’altra persona sa dove va la sua firma.
2. **Conservalo online.** Il PDF finito, con tutto ciò che hai aggiunto già unito, viene conservato online collegato al tuo Universal ID. È gratuito con un Universal ID.
3. **Scegli chi può aprirlo.** «Chiunque abbia il link» oppure «Solo la persona a cui lo invii». Leggi «Quanto è sicuro Invia per la firma?» per sapere che cosa cambia con questa scelta.
4. **Invialo.** Copia il link e invialo tu, oppure inserisci l’indirizzo email del destinatario e l’app lo invia per te. Con un link aperto l’email include il PDF come allegato. Con un link protetto no, perché l’allegato aggirerebbe la protezione.

## Due firmatari, in qualsiasi ordine

Ogni richiesta ha due firmatari: tu e la persona a cui l’hai inviata. Ciascuno di voi riceve il proprio link, e potete firmare in qualsiasi ordine. Chi firma per secondo lavora sulla copia che contiene già la prima firma.

## Che cosa succede quando qualcuno firma

Il firmatario apre il documento nel browser, firma e lo invia. La copia firmata viene conservata come nuova versione; le versioni precedenti restano, non vengono sovrascritte. Ogni passaggio viene annotato in un registro delle attività. Quando avete firmato entrambi, la richiesta è completa e ricevete entrambi un’email con un link al certificato.

## Il certificato

Ogni richiesta ha una pagina del certificato. Mostra il documento, chi è ciascun firmatario in base all’indirizzo email, se ciascuno ha firmato, e il registro delle attività: quando il documento è stato aperto, che cosa è stato aggiunto, da quale paese è arrivata la richiesta e un’impronta del documento a ogni passaggio. Da lì puoi scaricare il PDF firmato definitivo finché la copia conservata esiste.

## Limiti

I link per la firma scadono dopo 30 giorni. I file conservati possono arrivare a 50 MB, e un file inviato via email come allegato deve essere inferiore a 30 MB.`,
  },
  {
    id: 'page-scrolling',
    title: 'Pagine una sotto l’altra o affiancate',
    summary: 'L’impostazione Scorrimento delle pagine: una pagina sotto l’altra, o le pagine in fila.',
    group: 'Come funziona',
    body: `Universal PDF di solito mostra le pagine di un documento una sotto l’altra, e scorri verso il basso per continuare a leggere. Se preferisci sfogliare un documento in orizzontale, come si girano le pagine di un libro o si scorrono le slide di una presentazione, puoi affiancare le pagine in una fila.

## Come cambiarla

1. Apri il menu in alto a destra, accanto alla tua immagine del profilo (con un documento aperto si chiama **Azioni**), e scegli **Regola questa app**.
2. In **Scorrimento delle pagine**, scegli **Verticale** per avere una pagina sotto l’altra, oppure **Orizzontale** per averle affiancate.

Puoi cambiarla dalla schermata iniziale, prima di aprire qualsiasi cosa, oppure con un documento già aperto. Un documento aperto cambia subito e resta sulla pagina che stavi leggendo.

## Leggere in fila

- **All’apertura di un documento**, la pagina viene adattata all’altezza della finestra: è tutta sullo schermo e non c’è niente da scorrere in su o in giù. La prima pagina compare al centro dello schermo.
- **La rotellina del mouse** fa avanzare la fila: girala verso il basso per la pagina successiva e verso l’alto per tornare indietro. Se hai ingrandito una pagina fino a renderla più alta della finestra, la rotellina prima la scorre fino in fondo, poi passa alla successiva.
- **Il trackpad** scorre la fila con uno scorrimento laterale, come ovunque.
- **Andare a una pagina**, dall’elenco **Pagine** o da un link nel documento, porta quella pagina al centro dello schermo.

Se passi a Orizzontale con un documento già aperto, il documento mantiene lo zoom attuale. L’adattamento all’altezza della finestra avviene all’apertura di un documento.

## Dove viene conservata la scelta

L’impostazione viene memorizzata nello spazio di archiviazione del browser, solo su questo dispositivo, quindi ciascuno dei tuoi dispositivi può averne una diversa. Non viene salvata nel tuo account. **Ripristina impostazioni predefinite**, in fondo a Regola questa app, la riporta a Verticale.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Quanto è sicuro Invia per la firma?',
    summary: 'Che cosa è crittografato, che cosa può vedere il nostro server e come funziona la traccia di controllo.',
    group: 'Privacy e sicurezza',
    body: `Invia per la firma è l’unica funzione in cui il documento deve lasciare il tuo dispositivo, perché qualcun altro deve riceverlo. Ecco esattamente che cosa comporta.

## La crittografia, in parole semplici

- **Durante il trasferimento:** tutto ciò che passa tra l’app e il nostro server viaggia su HTTPS, quindi è crittografato lungo il percorso.
- **Quando è archiviato:** il documento conservato si trova in uno spazio di archiviazione privato e crittografato, non leggibile pubblicamente.
- **Non end-to-end:** le chiavi di quello spazio le abbiamo noi, quindi i nostri sistemi possono leggere il documento. È necessario perché il server possa consegnarlo al firmatario e calcolare l’impronta di ogni versione. Proteggerlo è un impegno su come gestiamo le cose, non una garanzia matematica. Se per un certo documento questo conta, non inviarlo in questo modo.

L’email è un discorso a parte. Se l’app invia il PDF via email come allegato, è riservato quanto lo è la casella di posta del destinatario e ovunque l’email venga inoltrata.

## Il link è la chiave

Il link di ogni firmatario contiene un lungo codice casuale che in pratica non si può indovinare. Quando viene aperto, il nostro server controlla il codice e, se è valido, dà al browser un indirizzo temporaneo per il documento che funziona per 10 minuti. I link smettono di funzionare dopo 30 giorni, e una volta che una persona ha firmato, il suo link non può essere usato per firmare di nuovo.

## Chiunque abbia il link, o solo il destinatario

Con **Chiunque abbia il link**, chi ha il link può aprire e firmare. Se l’email viene inoltrata, anche il nuovo lettore può firmare.

Con **Solo la persona a cui lo invii**, il documento non si apre finché chi lo visita non dimostra di poter leggere l’indirizzo che hai inserito:

- Digita l’indirizzo. Se corrisponde, un codice di 6 cifre viene inviato all’indirizzo che hai inserito tu, mai a qualcosa che ha digitato il visitatore.
- Il codice dura 10 minuti e consente 5 tentativi, condivisi con il PIN se c’è. Si possono inviare al massimo 5 codici per link, a distanza di almeno un minuto l’uno dall’altro.
- Una volta verificato, ha 4 ore per leggere e firmare.
- Puoi anche richiedere un PIN di 6 cifre, che l’app genera per te e che puoi comunicare per telefono o per SMS. Viene conservata solo un’impronta SHA-256 del PIN con salt, ed è per questo che non ti può essere mostrato di nuovo.

## La traccia di controllo

Ogni volta che torna una copia firmata, il nostro server ne calcola l’impronta SHA-256 e la registra insieme all’impronta della versione che ha sostituito. Se cambi un solo byte del file, la sua impronta cambia completamente, quindi chiunque può confrontare una copia del documento con il certificato. Ogni evento viene registrato con l’ora secondo il nostro server, l’indirizzo email del firmatario, il suo indirizzo IP e i dati del browser. Il certificato pubblico mostra solo il paese, mai l’indirizzo IP completo.

La pagina del certificato può essere vista da chiunque ne abbia il link, quindi condividila con la stessa attenzione del documento.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Proteggere un PDF con una password',
    summary: 'La crittografia usata, perché la password è tutto, e che cosa fare se la dimentichi.',
    group: 'Privacy e sicurezza',
    body: `Nelle opzioni di Esportazione avanzata puoi proteggere un PDF con una password o un PIN. Chiunque apra il file avrà poi bisogno della password per vederne il contenuto, in qualsiasi app per PDF che supporti la crittografia PDF moderna.

## Che cosa fa davvero la protezione

Universal PDF usa la crittografia più forte offerta dallo standard PDF: **AES-256**, come definita in PDF 2.0. Il testo, le immagini e gli altri contenuti vengono sigillati con una chiave casuale a 256 bit creata per quel file. Quella chiave, a sua volta, viene bloccata con la tua password.

La crittografia avviene sul tuo dispositivo. La tua password non viene mai inviata da nessuna parte, e noi non la vediamo mai.

## Perché la password è tutto

Il punto debole non è AES-256. L’unico modo pratico per entrare in un file ben protetto è indovinare la password, un tentativo dopo l’altro. PDF 2.0 rende ogni tentativo volutamente lento, il che aiuta molto, ma qualcuno con hardware potente e tempo a disposizione può comunque provare un numero enorme di tentativi.

Per questo l’app ti mostra più o meno quanto resisterebbe la tua password contro un attaccante determinato, e la stima è volutamente prudente. Un PIN di 4 cifre cade in un attimo. Una lunga frase segreta fatta di diverse parole senza legame tra loro può resistere più a lungo di quanto chiunque sia disposto ad aspettare. Scegli la password in base a quanto conta il documento.

## Che cosa non fa

Alcune app offrono di impedire la stampa o la copia di un PDF a chi non ha una password. Queste restrizioni sono solo richieste rivolte all’app di lettura, e sono facili da rimuovere, quindi Universal PDF non le offre. Chi ha la password può fare qualsiasi cosa con il documento.

## Se dimentichi la password

Nessuno può recuperarla, nemmeno noi. Non esiste un ripristino né una porta sul retro. Conserva la password in un posto sicuro, oppure tieni una copia non protetta in un luogo sicuro.

## Aprire PDF protetti

Universal PDF può aprire PDF protetti con AES-256 da altre app. Ti chiede la password e sblocca il file sul tuo dispositivo. Alcuni PDF usano sistemi di crittografia più vecchi che l’app non può aprire; in quel caso usa l’app che li ha protetti.

Suggerimento: le password composte da lettere dell’Europa occidentale, numeri e simboli comuni funzionano in modo affidabile in ogni app per PDF. Alcune app gestiscono in modo diverso altri caratteri, come le lettere greche, cirilliche o cinesi o le emoji, quindi l’app ti avvisa se la tua password ne contiene.`,
  },
]

export default articles
