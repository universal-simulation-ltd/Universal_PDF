import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'Was ist eigentlich ein PDF?',
    summary: 'Woher das Format kommt und warum es überall gleich aussieht.',
    group: 'Grundlagen',
    body: `PDF steht für Portable Document Format. Adobe hat es 1993 eingeführt, um ein einfaches Problem zu lösen: Ein Dokument, das auf einem Computer richtig aussah, sah auf einem anderen oft falsch aus, weil dort andere Schriften, ein anderer Drucker oder eine andere Version der Software im Spiel waren.

Ein PDF legt die Seite fest. Statt zu sagen „hier ist ein Absatz, ordne ihn so gut an, wie du kannst“, sagt es sinngemäß: „Zeichne diese Buchstaben, in dieser Schrift, an genau diesen Stellen auf einer Seite von genau dieser Größe.“ Deshalb sieht ein PDF auf dem Handy, dem Laptop oder der Maschine einer Druckerei gleich aus.

## Wem es gehört

Heute niemandem mehr. Adobe hat die Spezifikation schon früh veröffentlicht, und 2008 wurde PDF zu einem offenen internationalen Standard, ISO 32000. Die aktuelle Version, PDF 2.0, folgte 2017. Jeder darf Software schreiben, die PDFs liest oder erstellt, und deshalb können das so viele Apps.

## Was ein PDF enthalten kann

- Text, zusammen mit den Schriften, die zu seiner Darstellung nötig sind
- Bilder, einschließlich ganzer gescannter Seiten
- Zeichnungen und Formen
- Ausfüllbare Formularfelder
- Links, Lesezeichen und Kommentare
- Angaben zum Dokument selbst, etwa Titel und Autor
- Einen Passwortschutz, falls jemand einen hinzugefügt hat

## Einige PDF-Arten, von denen Sie vielleicht hören

**PDF/A** ist eine strengere Variante für die Langzeitarchivierung, genormt als ISO 19005. Sie verlangt, dass alles, was zur Anzeige des Dokuments nötig ist, etwa die Schriften, in der Datei selbst steckt, und sie erlaubt keine Verschlüsselung, damit sich das Dokument auch in Jahrzehnten noch öffnen lässt.

**Ausfüllbare Formulare** enthalten Felder, in die Sie tippen können. Die meisten nutzen ein System, das Teil des PDF-Standards selbst ist. Ein kleiner Teil verwendet ein älteres Verfahren namens XFA, das später aus dem Standard entfernt wurde und das viele Apps, auch diese, nur teilweise unterstützen können.

## Der Haken

Was ein PDF so zuverlässig macht, macht es auch schwer zu ändern. Es wurde als fertige Seite entworfen, nicht als Entwurf. Der nächste Artikel erklärt, warum.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Warum lassen sich PDFs so schwer bearbeiten?',
    summary: 'Text oder gescanntes Bild, eingebettete Schriften und die Angaben, die in einer Datei versteckt sind.',
    group: 'Grundlagen',
    body: `Wenn Sie schon einmal versucht haben, ein Wort in einem PDF zu ändern, und der Rest der Zeile einfach nicht nachrücken wollte, dann haben Sie erlebt, wie PDFs aufgebaut sind.

## Text wird platziert, nicht umbrochen

Ein Textverarbeitungsprogramm speichert Absätze und berechnet bei jeder Änderung neu, wo die Zeilen umbrechen. Ein PDF speichert meist nur das Ergebnis: kurze Buchstabenfolgen, jede an eine genaue Position geheftet. Oft steht in der Datei nirgends, dass „diese Zeilen ein Absatz sind“ oder „das eine Tabelle ist“. Ändern Sie ein Wort, weiß nichts, wie der nachfolgende Text neu umbrochen werden soll.

## Schriften sind oft unvollständig

Damit ein PDF überall gleich aussieht, trägt es seine Schriften meist in sich. Damit die Datei klein bleibt, enthält es aber oft nur die Buchstaben, die im Dokument tatsächlich vorkommen. Selbst wenn Sie also neuen Text in der Originalschrift hinzufügen könnten, fehlt der benötigte Buchstabe womöglich schlicht in der Datei.

## Manche PDFs enthalten gar keinen Text

Ein gescanntes Dokument ist ein PDF, das von jeder Seite ein Foto enthält. Es sieht aus wie Text, doch für einen Computer ist es ein Bild: Sie können darin nicht suchen, nichts markieren und nichts kopieren.

Universal PDF kann das mit **Durchsuchbar machen (OCR)** beheben. Die Funktion liest die Wörter im Bild und legt eine unsichtbare Textebene über die Seite, an denselben Stellen. Die Seite sieht genau so aus wie vorher, aber Sie können jetzt darin suchen und Text markieren. Die Erkennung ist nie fehlerfrei, prüfen Sie also alles, worauf es ankommt.

## Dateien tragen Angaben über sich selbst

Die meisten PDFs enthalten Angaben wie einen Titel, einen Autor, die Software, mit der die Datei erstellt wurde, und wann sie erstellt oder geändert wurde. Diese stehen nicht auf der Seite, aber jeder, der die Dokumenteigenschaften öffnet, kann sie sehen. In Universal PDF können Sie sie ansehen, und beim Exportieren können Sie wählen, ob Sie sie behalten oder entfernen.

## Wie bearbeitet man dann überhaupt ein PDF?

Meist, indem man etwas darüberlegt, statt das Darunterliegende neu zu schreiben: Textfelder, Markierungen, Zeichnungen, Unterschriften und ausgefüllte Formularfelder. So funktioniert Universal PDF. Ihre Ergänzungen bleiben während der Arbeit eigenständig und bearbeitbar und werden erst beim Speichern in die Seiten übernommen.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'Was bedeutet „Reduzieren“?',
    summary: 'Wie Ihre Änderungen in die Seite übernommen werden und warum ein schwarzer Kasten nicht immer eine Schwärzung ist.',
    group: 'Grundlagen',
    body: `„Reduzieren“ (auf Englisch „flattening“) bedeutet, etwas so in die Seite zu übernehmen, dass es sich nicht mehr als einzelnes Element abtrennen oder ändern lässt. Es gibt ein paar Varianten, und es hilft, sie auseinanderzuhalten.

## Ihre Ergänzungen reduzieren

Während Sie in Universal PDF arbeiten, sind Ihre Texte, Markierungen, Zeichnungen und Unterschriften eigenständige Elemente, die Sie verschieben oder löschen können. Wenn Sie das fertige PDF herunterladen, werden sie dauerhaft in die Seiten gezeichnet, und ausgefüllte Formularfelder werden zu normalem Text. Wer die heruntergeladene Datei öffnet, sieht sie in jeder PDF-App als Teil des Dokuments.

Ihr geöffnetes Dokument wird dadurch nicht verändert. Sie können weiter daran arbeiten und es erneut herunterladen.

## Seiten zu Bildern reduzieren

Im erweiterten Export können Sie noch weiter gehen und jede Seite in ein Bild umwandeln. Dann kann niemand den Text mehr markieren, kopieren, durchsuchen oder bearbeiten, was bei einem unterschriebenen Dokument nützlich sein kann. Der Nachteil: Der Text ist kein Text mehr. Er lässt sich nicht durchsuchen, und Screenreader können ihn nicht vorlesen. Nur die heruntergeladene Kopie wird reduziert; Ihr geöffnetes Dokument behält seinen Text.

## Warum ein schwarzer Kasten keine Schwärzung ist

Ein häufiger und folgenschwerer Fehler ist es, vertraulichen Text zu verbergen, indem man ein schwarzes Rechteck darüberzeichnet. Der Text steckt darunter weiterhin in der Datei. Oft kann ihn jeder markieren, kopieren oder das Rechteck einfach entfernen.

Das Schwärzungswerkzeug von Universal PDF funktioniert anders. Wenn Sie ein Dokument mit Schwärzungen speichern, exportieren oder versenden, wird jede betroffene Seite in ein Bild mit fest eingebrannten schwarzen Kästen umgewandelt und aus diesem Bild neu aufgebaut. Der Text unter den Kästen wird dabei endgültig aus der gespeicherten Kopie entfernt. Weil sich das nicht rückgängig machen lässt, bittet die App Sie vorher um eine Bestätigung.

Ein paar praktische Hinweise:

- Eine Schwärzung entfernt nur, was der Kasten abdeckt. Prüfen Sie also die Ränder jedes Kastens.
- Angaben zum Dokument, etwa Titel und Autor, sind von den Seiten getrennt. Prüfen Sie auch diese, bevor Sie ein geschwärztes Dokument weitergeben.
- Bewahren Sie Ihr ungeschwärztes Original an einem sicheren Ort auf, falls Sie es noch brauchen.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Wo die Arbeit erledigt wird',
    summary: 'Was Universal PDF auf Ihrem Gerät erledigt und welche wenigen Dinge online gehen.',
    group: 'So funktioniert es',
    body: `Fast alles, was Universal PDF tut, geschieht auf Ihrem eigenen Gerät. Ihr PDF wird nicht hochgeladen, um es zu öffnen, darzustellen oder zu speichern.

## Auf Ihrem Gerät

- **Öffnen und Anzeigen der Seiten.** Die App liest die Datei und zeichnet jede Seite auf Ihrem Gerät, mit PDF.js, der Open-Source-Software von Mozilla.
- **Bearbeiten, Formulare ausfüllen und Unterschreiben.** Ihre Ergänzungen und die fertige Datei, die Sie herunterladen, entstehen auf Ihrem Gerät.
- **Scans durchsuchbar machen (OCR).** Die Erkennung selbst läuft auf Ihrem Gerät. Beim ersten Mal lädt die App die Erkennungssoftware und ihre Sprachdaten herunter und bewahrt sie dann auf, damit sie sie nicht erneut abrufen muss.
- **Word- und OpenDocument-Dateien umwandeln.** Eine .docx- oder .odt-Datei wird auf Ihrem Gerät in ein PDF umgewandelt. Das Ergebnis wird neu gesetzt und entspricht daher nicht genau dem Layout des Originals.
- **Mit Passwort schützen und entsperren.** Geschieht auf Ihrem Gerät. Ihr Passwort wird nie irgendwohin gesendet.

Sie können das selbst ausprobieren: Sobald die App geladen ist, trennen Sie die Internetverbindung und arbeiten einfach weiter.

## Was sich die App auf diesem Gerät merkt

Zuletzt geöffnete Dateien werden im eigenen Speicher Ihres Browsers auf diesem Gerät aufbewahrt, sodass sie nach einem Neuladen wieder da sind. Gespeicherte Unterschriften und Stempel liegen ebenfalls dort. Wenn Sie die Browserdaten für die Website löschen, werden sie entfernt. Sie werden nicht an uns gesendet.

## Eine Kopie aufbewahren

Die Option **Sichern** bietet zwei Stufen, beide bei Ihnen:

1. **Im Browser speichern.** Automatisch und nur auf diesem Gerät.
2. **Auf dem Computer speichern.** Lädt eine Sicherungsdatei herunter, die das Original-PDF und Ihre Änderungen enthält, weiterhin bearbeitbar. Importieren Sie sie später auf einem beliebigen Gerät, um dort weiterzumachen, wo Sie aufgehört haben. Die Datei ist nicht verschlüsselt, gehen Sie also so sorgsam mit ihr um wie mit dem PDF selbst.

## Unterschreiben auf dem Handy

Wenn Sie Ihre Unterschrift auf dem Handy zeichnen, gelangt die Zeichnung als kurzlebige Nachricht über unseren Server von Ihrem Handy zur App. Dort wird sie nicht gespeichert. Die App nimmt sie nur an, wenn die PIN, die sie Ihnen anzeigt, auf dem Handy eingegeben wird.

## Was die App sendet, auch wenn Ihr PDF bleibt, wo es ist

Auf der Website und in der Desktop-App können Sie sich mit einer Universal ID anmelden; solange Sie angemeldet sind, vermerkt die App für die Aktivitätsseite Ihres Kontos, dass sie geöffnet wurde. Die Handy-Apps und die Browsererweiterung haben gar keine Anmeldung. Auf der Website zählt sie außerdem beim ersten Öffnen jedes Tages eins zur anonymen Tageszählung der Öffnungen hinzu, gesendet nach Ihrem ersten Klick oder Tastendruck. Diese Zählung enthält nur den Namen der App und die Art der Plattform („web“ auf der Website): keine Kennung, kein Konto und nichts darüber, was Sie tun. Eine Markierung „heute schon gezählt“ bleibt auf Ihrem Gerät und wird nie gesendet. Die Telefon- und Desktop-Apps und die Browsererweiterung senden sie nicht. Nichts, was die App sendet, enthält irgendetwas über Ihre Dateien. Es gibt keine Werbung und kein Tracking durch Dritte.

Auf der Website können Sie unter den Download-Symbolen außerdem darum bitten, benachrichtigt zu werden, wenn die Desktop-App fertig ist. Nur wenn Sie dort Ihre E-Mail-Adresse eingeben, wird sie an uns gesendet, und sie ist das Einzige, was gespeichert wird: Sie erhalten eine einzige E-Mail, sobald die Desktop-App fertig ist, und die Adresse wird innerhalb von 30 Tagen danach gelöscht – oder nach 24 Monaten, falls die App bis dahin nicht fertig ist.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Ein PDF selbst unterschreiben',
    summary: 'Was eine in der App gesetzte Unterschrift ist und was nicht.',
    group: 'So funktioniert es',
    body: `Sie können ein PDF unterschreiben, indem Sie Ihre Unterschrift mit Maus, Trackpad oder Finger zeichnen, sie auf Ihrem Handy zeichnen oder ein Bild Ihrer Unterschrift importieren. Unterschriften und Stempel lassen sich zur Wiederverwendung speichern, und Sie können Ihren Namen und das Datum darunter setzen. Für nichts davon brauchen Sie ein Konto.

Eine gesetzte Unterschrift ist ein Bild, das auf der Seite platziert wird. Wenn Sie das PDF herunterladen, wird dieses Bild wie jede andere Ergänzung in die Seite übernommen. All das geschieht auf Ihrem Gerät.

## Unterschriftsfelder

Wenn Sie ein Dokument für jemand anderen vorbereiten, können Sie ein „Hier unterschreiben“-Feld auf die Seite setzen und dazu Name und Datum anfordern. Sie können auch verlangen, dass ein Feld von Hand unterschrieben wird statt mit einem hochgeladenen Bild. Zeichnen auf dem Handy zählt als Unterschrift von Hand.

Wenn Sie das PDF speichern oder teilen, wird jedes Feld, das Sie nicht unterschrieben haben, zu einem echten Signaturfeld, wie es andere PDF-Apps verstehen. Die Person, an die Sie es schicken, kann es in Universal PDF, Adobe Acrobat oder Reader oder in Apple Vorschau unterschreiben. Öffnet Universal PDF ein PDF mit einem leeren Signaturfeld, von uns oder aus einer anderen App, zeigt es dieses als Feld an, das man zum Unterschreiben antippt. Siehe „Ein PDF zum Unterschreiben senden“.

## Was diese Art von Unterschrift ist

Sie ist das, was man üblicherweise eine **elektronische Unterschrift** nennt: ein Zeichen auf einem Dokument, das zeigt, dass eine Person es unterschreiben wollte. Viele Länder erkennen elektronische Unterschriften für eine breite Palette alltäglicher Vereinbarungen als gültig an, und viele Organisationen akzeptieren sie.

## Was sie nicht ist

Sie ist keine **digitale Signatur** im technischen Sinn. Eine digitale Signatur versiegelt die Datei kryptografisch mit einem Zertifikat, das oft von einer vertrauenswürdigen Stelle ausgestellt wird, sodass die PDF-App jede spätere Änderung erkennen kann. Universal PDF versieht eine Datei, die Sie selbst unterschreiben, nicht mit einem solchen Siegel.

Das ist wichtig, weil das Bild einer Unterschrift auf einem PDF für sich allein nicht beweist, wer sie gesetzt hat oder dass das Dokument seitdem nicht verändert wurde. Wenn Sie einen Nachweis brauchen, wer wann unterschrieben hat, nutzen Sie eine **zertifizierte Unterschrift** auf der Website von Universal PDF oder in der Desktop-App. Sie führt ein Aktivitätsprotokoll auf dem Server und einen Fingerabdruck jeder unterschriebenen Version. Die nächsten Artikel erklären, wie.

## Ein Hinweis zur Rechtslage

Dies ist keine Rechtsberatung. Ob eine elektronische Unterschrift ausreicht, hängt davon ab, wo Sie sich befinden, um welches Dokument es sich handelt und was die andere Partei akzeptiert. Für manche Dokumente, etwa bestimmte Immobiliengeschäfte, Testamente oder Dokumente, die vor Zeugen unterzeichnet werden müssen, gelten oft strengere Regeln. Wenn ein Dokument wichtig ist, klären Sie, was erforderlich ist, bevor Sie sich auf eine elektronische Unterschrift verlassen.`,
  },
  {
    id: 'send-to-sign',
    title: 'Ein PDF zum Unterschreiben senden',
    summary: 'Teilen Sie einfach die Datei oder holen Sie sich auf der Website oder in der Desktop-App eine zertifizierte Unterschrift.',
    group: 'So funktioniert es',
    body: `Es gibt zwei Wege, jemanden ein PDF unterschreiben zu lassen. Der einfache Weg funktioniert überall, braucht kein Konto und lädt nichts hoch. Der zertifizierte Weg, auf der Website und in der Desktop-App, fügt einen Nachweis hinzu, wer wann unterschrieben hat.

## Zum Unterschreiben senden

1. **Markieren Sie, wo unterschrieben wird.** Öffnen Sie **Unterschreiben**, wählen Sie **Anfrage** und setzen Sie ein „Hier unterschreiben“-Feld an jede Stelle, an die eine Unterschrift gehört. Schalten Sie vorher **Name und Datum anfordern** ein, um Felder für Name und Datum unter dem Feld zu erhalten, oder **Hinweis „Bitte hier unterschreiben“** für einen Hinweis darüber.
2. **Unterschreiben Sie Ihren Teil, wenn Sie auch unterschreiben.** Tippen Sie Ihr Feld an und unterschreiben Sie es vor dem Senden.
3. **Senden Sie es.** Wählen Sie **Zum Unterschreiben senden**. Auf dem Handy öffnet sich das Teilen-Menü, sodass Sie das PDF per Nachricht, per E-Mail oder mit jeder App verschicken können. Auf dem Computer wird das PDF gespeichert oder heruntergeladen, und Ihr Browser bietet unter Umständen auch das Teilen an.

Jedes Feld, das Sie leer gelassen haben, wird zu einem echten Signaturfeld. Wer die Datei bekommt, kann sie in Universal PDF, in Adobe Acrobat oder Reader oder in Apple Vorschau oder Dateien unterschreiben und auf demselben Weg zurückschicken. Ein Konto ist dafür nicht nötig, und nichts läuft über uns.

## Zertifizierte Unterschrift (Website und Desktop-App)

Wenn Sie einen Nachweis brauchen, wer wann unterschrieben hat, bieten die Website von Universal PDF und die Desktop-App eine zertifizierte Unterschrift. Sie brauchen dafür eine kostenlose Universal ID, die unterzeichnende Person nicht. Ihr PDF wird online gespeichert, die unterzeichnende Person erhält einen Link, und Sie beide erhalten ein Zertifikat mit Aktivitätsprotokoll. Die Handy-Apps bieten sie nicht an.

1. **Markieren Sie, wo unterschrieben wird**, wie oben.
2. **Wählen Sie Zum Unterschreiben senden und dann Zertifizierte Unterschrift.**
3. **Wählen Sie, wer es öffnen kann.** Entweder jeder mit dem Link oder nur die Person, an die Sie es adressieren. Was diese Wahl ändert, steht in „Wie sicher ist eine zertifizierte Unterschrift?“.
4. **Senden Sie es.** Kopieren Sie den Link und schicken Sie ihn selbst, oder geben Sie die E-Mail-Adresse ein, und wir schicken ihn für Sie. Bei einem offenen Link enthält die E-Mail das PDF als Anhang. Bei einem geschützten Link nicht, weil der Anhang den Schutz umgehen würde.

## Zwei Unterzeichnende, beliebige Reihenfolge

Eine zertifizierte Anfrage hat zwei Unterzeichnende: Sie und die Person, an die Sie sie geschickt haben. Jede Seite erhält einen eigenen Link, und Sie können in beliebiger Reihenfolge unterschreiben. Wer als Zweites unterschreibt, arbeitet an der Kopie, die schon die erste Unterschrift trägt. Wenn beide unterschrieben haben, ist die Anfrage abgeschlossen, und Sie beide erhalten eine E-Mail mit einem Link zum Zertifikat.

## Das Zertifikat

Jede zertifizierte Anfrage hat eine Zertifikatsseite. Sie zeigt das Dokument, die E-Mail-Adresse jeder unterzeichnenden Person, ob sie unterschrieben hat, und das Aktivitätsprotokoll: wann das Dokument geöffnet wurde, was hinzugefügt wurde, aus welchem Land die Anfrage kam und einen Fingerabdruck des Dokuments bei jedem Schritt. Dort können Sie das endgültige unterschriebene PDF herunterladen, solange die gespeicherte Kopie existiert. Eine abgeschlossene Anfrage wird 7 Jahre aufbewahrt.

## Grenzen

Links zum Unterschreiben laufen nach 30 Tagen ab. Gespeicherte Dateien dürfen bis zu 50 MB groß sein, und eine als Anhang verschickte Datei muss kleiner als 30 MB sein.`,
  },
  {
    id: 'page-scrolling',
    title: 'Seiten untereinander oder nebeneinander',
    summary: 'Die Einstellung Blätterrichtung: Seiten untereinander oder in einer Reihe nebeneinander.',
    group: 'So funktioniert es',
    body: `Universal PDF stellt die Seiten eines Dokuments nebeneinander in eine Reihe, auf dem Computer wie auf dem Smartphone, und Sie gehen seitwärts von Seite zu Seite, so wie Sie in einem Buch blättern: auf dem Smartphone durch Wischen, auf dem Computer mit dem Mausrad oder dem Touchpad. Wenn Sie lieber nach unten scrollen, können Sie sie untereinander anordnen.

## So stellen Sie es um

1. Öffnen Sie das Menü oben rechts neben Ihrem Profilbild (bei geöffnetem Dokument heißt es **Aktionen**) und wählen Sie **Diese App anpassen**.
2. Wählen Sie unter **Blätterrichtung** **Vertikal** für Seiten untereinander oder **Horizontal** für Seiten nebeneinander.

Das geht auf dem Startbildschirm, bevor Sie etwas öffnen, oder bei einem bereits geöffneten Dokument. Ein geöffnetes Dokument stellt sich sofort um und bleibt auf der Seite, die Sie gerade gelesen haben.

## Lesen in einer Reihe

- **Beim Öffnen eines Dokuments** wird die Seite an die Höhe des Fensters angepasst. Sie ist also vollständig zu sehen, und es gibt nichts nach oben oder unten zu scrollen. Die erste Seite steht in der Mitte des Bildschirms.
- **Das Mausrad** bewegt Sie entlang der Reihe: nach unten drehen für die nächste Seite, nach oben für zurück. Haben Sie so weit hineingezoomt, dass eine Seite höher ist als das Fenster, scrollt das Mausrad zuerst diese Seite nach unten und geht dann zur nächsten.
- **Ein Touchpad** bewegt sich mit einer seitlichen Wischbewegung entlang der Reihe, wie überall sonst auch.
- **Der Sprung zu einer Seite**, aus der Liste **Seiten** oder über einen Link im Dokument, holt diese Seite in die Mitte des Bildschirms.

Wechseln Sie bei einem bereits geöffneten Dokument zu Horizontal, behält es seinen aktuellen Zoom. Die Anpassung an die Fensterhöhe passiert beim Öffnen eines Dokuments.

## Wo die Einstellung gespeichert wird

Die Einstellung wird im Speicher Ihres Browsers gespeichert, nur auf diesem Gerät. Jedes Ihrer Geräte kann also seine eigene haben. In Ihrem Konto wird sie nicht gespeichert. **Auf Standard zurücksetzen**, unten in Diese App anpassen, stellt sie wieder auf den Ausgangswert des Geräts: Horizontal auf einem Smartphone, Vertikal auf einem Computer.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Wie sicher ist eine zertifizierte Unterschrift?',
    summary: 'Was verschlüsselt ist, was unser Server sehen kann und wie das Prüfprotokoll funktioniert.',
    group: 'Datenschutz und Sicherheit',
    body: `Die zertifizierte Unterschrift auf der Website von Universal PDF und in der Desktop-App ist die einzige Funktion, bei der Ihr Dokument Ihr Gerät verlassen muss: Es wird gespeichert, damit die unterzeichnende Person es öffnen kann und damit ein Nachweis bleibt. Hier steht genau, was das bedeutet. Ein PDF ohne sie zum Unterschreiben zu senden lädt nichts hoch; die Datei geht nur dorthin, wohin Sie sie schicken.

## Verschlüsselung, einfach erklärt

- **Bei der Übertragung:** Alles zwischen der App und unserem Server läuft über HTTPS und ist unterwegs also verschlüsselt.
- **Bei der Speicherung:** Das gespeicherte Dokument liegt in einem privaten, verschlüsselten Speicher, der nicht öffentlich lesbar ist.
- **Nicht Ende-zu-Ende:** Wir besitzen die Schlüssel zu diesem Speicher, also können unsere Systeme das Dokument lesen. Das ist nötig, damit der Server es an die unterzeichnende Person weitergeben und von jeder Version einen Fingerabdruck erstellen kann. Der Schutz beruht auf unserem Versprechen, wie wir unsere Systeme betreiben, nicht auf einer mathematischen Garantie. Wenn das für ein bestimmtes Dokument eine Rolle spielt, versenden Sie es nicht auf diesem Weg.

E-Mail ist eine eigene Sache. Wenn die App das PDF als Anhang verschickt, ist es nur so vertraulich wie das Postfach der Empfängerin oder des Empfängers und jeder Ort, an den die E-Mail weitergeleitet wird.

## Der Link ist der Schlüssel

Der Link jeder unterzeichnenden Person enthält einen langen Zufallscode, der sich praktisch nicht erraten lässt. Wird der Link geöffnet, prüft unser Server den Code und gibt dem Browser, wenn er gültig ist, eine vorübergehende Adresse für das Dokument, die 10 Minuten lang funktioniert. Links funktionieren nach 30 Tagen nicht mehr, und sobald eine Person unterschrieben hat, kann ihr Link nicht erneut zum Unterschreiben verwendet werden.

## Jede Person mit dem Link oder nur die adressierte Person

Bei **Jede Person mit dem Link** kann jeder, der den Link hat, das Dokument öffnen und unterschreiben. Wird die E-Mail weitergeleitet, kann auch die neue Leserin oder der neue Leser unterschreiben.

Bei **Nur die Person, an die du es adressierst** öffnet sich das Dokument erst, wenn die besuchende Person nachweist, dass sie Nachrichten an die von Ihnen eingegebene Adresse lesen kann:

- Sie tippt die Adresse ein. Stimmt sie überein, wird ein 6-stelliger Code an die von Ihnen eingegebene Adresse gesendet, niemals an etwas, das die besuchende Person eingetippt hat.
- Der Code gilt 10 Minuten und erlaubt 5 Versuche, die mit der PIN geteilt werden, falls es eine gibt. Pro Link können höchstens 5 Codes gesendet werden, im Abstand von mindestens einer Minute.
- Nach der Bestätigung hat die Person 4 Stunden Zeit zum Lesen und Unterschreiben.
- Sie können zusätzlich eine 6-stellige PIN verlangen, die die App für Sie erzeugt und die Sie telefonisch oder per SMS weitergeben. Gespeichert wird nur ein gesalzener SHA-256-Fingerabdruck der PIN, und deshalb kann sie Ihnen nicht noch einmal angezeigt werden.

## Das Prüfprotokoll

Jedes Mal, wenn eine unterschriebene Kopie zurückkommt, berechnet unser Server ihren SHA-256-Fingerabdruck und speichert ihn zusammen mit dem Fingerabdruck der Version, die sie ersetzt hat. Ändert sich auch nur ein einziges Byte der Datei, ändert sich ihr Fingerabdruck vollständig, sodass jeder eine Kopie des Dokuments mit dem Zertifikat abgleichen kann. Jedes Ereignis wird mit der Uhrzeit laut unserem Server, der E-Mail-Adresse der unterzeichnenden Person, ihrer IP-Adresse und Angaben zu ihrem Browser protokolliert. Das öffentliche Zertifikat zeigt nur das Land, niemals die vollständige IP-Adresse.

Die Zertifikatsseite kann jeder ansehen, der ihren Link hat. Geben Sie ihn also genauso sorgfältig weiter wie das Dokument.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Ein PDF mit einem Passwort schützen',
    summary: 'Die verwendete Verschlüsselung, warum alles am Passwort hängt und was Sie tun können, wenn Sie es vergessen.',
    group: 'Datenschutz und Sicherheit',
    body: `Im erweiterten Export können Sie ein PDF mit einem Passwort oder einer PIN schützen. Wer die Datei danach öffnet, braucht das Passwort, um überhaupt etwas darin zu sehen, und zwar in jeder PDF-App, die moderne PDF-Verschlüsselung unterstützt.

## Was der Schutz tatsächlich bewirkt

Universal PDF verwendet die stärkste Verschlüsselung, die der PDF-Standard bietet: **AES-256**, wie in PDF 2.0 festgelegt. Text, Bilder und übrige Inhalte werden mit einem zufälligen 256-Bit-Schlüssel versiegelt, der eigens für diese Datei erzeugt wird. Dieser Schlüssel wird wiederum mit Ihrem Passwort verschlossen.

Die Verschlüsselung geschieht auf Ihrem Gerät. Ihr Passwort wird nie irgendwohin gesendet, und wir bekommen es nie zu sehen.

## Warum alles am Passwort hängt

AES-256 selbst ist nicht die Schwachstelle. Der einzige praktikable Weg in eine gut geschützte Datei besteht darin, das Passwort zu erraten, immer und immer wieder. PDF 2.0 macht jeden Rateversuch absichtlich langsam, was sehr viel hilft, doch wer leistungsstarke Hardware und Zeit hat, kann trotzdem sehr viele Versuche unternehmen.

Deshalb zeigt Ihnen die App ungefähr an, wie lange Ihr Passwort einem entschlossenen Angreifer standhalten würde, und sie schätzt dabei bewusst vorsichtig. Eine 4-stellige PIN ist im Handumdrehen geknackt. Eine lange Passphrase aus mehreren Wörtern, die nichts miteinander zu tun haben, kann länger standhalten, als irgendjemand warten würde. Wählen Sie das Passwort danach, wie wichtig das Dokument ist.

## Was der Schutz nicht bewirkt

Manche Apps bieten an, das Drucken oder Kopieren eines PDFs ohne Passwort zu verhindern. Solche Einschränkungen sind nur Bitten an die lesende App und lassen sich leicht entfernen, deshalb bietet Universal PDF sie nicht an. Wer das Passwort hat, kann mit dem Dokument alles machen.

## Wenn Sie das Passwort vergessen

Niemand kann es wiederherstellen, auch wir nicht. Es gibt kein Zurücksetzen und keine Hintertür. Bewahren Sie Ihr Passwort an einem sicheren Ort auf, oder heben Sie eine ungeschützte Kopie an einem sicheren Ort auf.

## Geschützte PDFs öffnen

Universal PDF kann PDFs öffnen, die andere Apps mit AES-256 geschützt haben. Die App fragt nach dem Passwort und entsperrt die Datei auf Ihrem Gerät. Manche PDFs verwenden ältere Verschlüsselungsverfahren, die die App nicht öffnen kann; verwenden Sie dafür die App, mit der sie geschützt wurden.

Tipp: Passwörter aus westeuropäischen Buchstaben, Ziffern und gängigen Sonderzeichen funktionieren in jeder PDF-App zuverlässig. Manche Apps behandeln andere Zeichen, etwa griechische, kyrillische oder chinesische Schriftzeichen oder Emojis, unterschiedlich, deshalb warnt Sie die App, wenn Ihr Passwort solche Zeichen enthält.`,
  },
]

export default articles
