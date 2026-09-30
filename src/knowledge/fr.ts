import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'Qu’est-ce qu’un PDF, au juste ?',
    summary: 'D’où vient ce format, et pourquoi il s’affiche de la même façon partout.',
    group: 'Les bases',
    body: `PDF signifie Portable Document Format (« format de document portable »). Adobe l’a lancé en 1993 pour résoudre un problème simple : un document qui s’affichait correctement sur un ordinateur s’affichait souvent mal sur un autre, parce que cet autre ordinateur avait d’autres polices, une autre imprimante ou une autre version du logiciel.

Un PDF fige la page. Au lieu de dire « voici un paragraphe, mettez-le en page du mieux possible », il dit en substance « dessinez ces lettres, dans cette police, exactement à ces positions, sur une page exactement de cette taille ». C’est pourquoi un PDF a le même aspect sur un téléphone, un ordinateur portable ou la machine d’un imprimeur.

## À qui appartient-il ?

À personne, désormais. Adobe a publié la spécification très tôt, et en 2008 le PDF est devenu une norme internationale ouverte, ISO 32000. La version actuelle, PDF 2.0, a suivi en 2017. Tout le monde peut écrire un logiciel qui lit ou crée des PDF, ce qui explique pourquoi tant d’applications en sont capables.

## Ce qu’un PDF peut contenir

- Du texte, avec les polices nécessaires pour l’afficher
- Des images, y compris des pages entières numérisées
- Des dessins et des formes
- Des champs de formulaire à remplir
- Des liens, des signets et des commentaires
- Des informations sur le document lui-même, comme son titre et son auteur
- Un verrouillage par mot de passe, si quelqu’un en a ajouté un

## Quelques types de PDF dont vous avez peut-être entendu parler

**PDF/A** est une variante plus stricte destinée à l’archivage à long terme, normalisée sous le nom ISO 19005. Elle exige que tout ce qui est nécessaire pour afficher le document, comme les polices, se trouve dans le fichier, et elle interdit le chiffrement, afin que le document puisse encore être ouvert dans plusieurs décennies.

**Les formulaires à remplir** contiennent des champs dans lesquels vous pouvez saisir du texte. La plupart utilisent un système qui fait partie de la norme PDF elle-même. Une minorité utilise une conception plus ancienne appelée XFA, retirée depuis de la norme, que de nombreuses applications, dont celle-ci, ne prennent en charge que partiellement.

## Le revers de la médaille

Ce qui rend un PDF fiable le rend aussi difficile à modifier. Il a été conçu pour être une page finie, pas un brouillon. L’article suivant explique pourquoi.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Pourquoi les PDF sont-ils si difficiles à modifier ?',
    summary: 'Texte ou images numérisées, polices intégrées, et informations cachées dans un fichier.',
    group: 'Les bases',
    body: `Si vous avez déjà essayé de changer un mot dans un PDF et constaté que le reste de la ligne refusait de se décaler pour faire de la place, vous avez découvert la façon dont les PDF sont construits.

## Le texte est placé, pas mis en forme au fil de l’eau

Un traitement de texte enregistre des paragraphes et recalcule les retours à la ligne à chaque modification. Un PDF enregistre généralement le résultat : de petits groupes de lettres, chacun fixé à une position précise. Bien souvent, rien dans le fichier n’indique « ces lignes forment un paragraphe » ou « ceci est un tableau ». Changez un mot, et rien ne sait comment réorganiser ce qui suit.

## Les polices sont souvent incomplètes

Pour s’afficher de la même façon partout, un PDF transporte généralement ses polices avec lui. Pour limiter la taille du fichier, il n’embarque souvent que les lettres réellement utilisées dans le document. Ainsi, même si vous pouviez ajouter du texte dans la police d’origine, la lettre dont vous avez besoin pourrait tout simplement ne pas figurer dans le fichier.

## Certains PDF ne contiennent aucun texte

Un document numérisé est un PDF qui contient une photo de chaque page. Il ressemble à du texte, mais pour un ordinateur, c’est une image : vous ne pouvez ni y faire de recherche, ni sélectionner ou copier son contenu.

Universal PDF peut y remédier avec **Rendre interrogeable (OCR)**. La fonction lit les mots de l’image et pose une couche de texte invisible sur la page, aux mêmes positions. La page garde exactement le même aspect, mais vous pouvez désormais y faire des recherches et sélectionner son contenu. La reconnaissance n’est jamais parfaite : vérifiez tout ce qui compte.

## Les fichiers contiennent des informations sur eux-mêmes

La plupart des PDF comportent des détails comme un titre, un auteur, le logiciel qui a créé le fichier et la date de création ou de modification. Ils ne s’affichent pas sur la page, mais toute personne qui ouvre les propriétés du document peut les voir. Universal PDF vous permet de les consulter et, lors de l’exportation, de choisir de les conserver ou de les supprimer.

## Alors, comment modifie-t-on un PDF ?

Surtout en ajoutant des éléments par-dessus plutôt qu’en réécrivant ce qui se trouve dessous : zones de texte, surlignages, dessins, signatures et champs de formulaire remplis. C’est ainsi que fonctionne Universal PDF. Vos ajouts restent séparés et modifiables pendant que vous travaillez, puis sont intégrés aux pages lorsque vous enregistrez.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'Que signifie « aplatir » ?',
    summary: 'Intégrer vos modifications à la page, et pourquoi un rectangle noir n’est pas toujours un caviardage.',
    group: 'Les bases',
    body: `« Aplatir » signifie intégrer un élément à la page, de sorte qu’il ne puisse plus être séparé ni modifié individuellement. Il en existe plusieurs sortes, et il est utile de savoir les distinguer.

## Aplatir vos ajouts

Pendant que vous travaillez dans Universal PDF, vos textes, surlignages, dessins et signatures sont des éléments séparés que vous pouvez déplacer ou supprimer. Lorsque vous téléchargez le PDF terminé, ils sont dessinés définitivement dans les pages, et les champs de formulaire remplis deviennent du texte ordinaire. Toute personne qui ouvre le fichier téléchargé les voit comme faisant partie du document, dans n’importe quelle application PDF.

Le document que vous avez ouvert n’est pas modifié pour autant. Vous pouvez continuer à le modifier et le télécharger à nouveau.

## Aplatir les pages en images

Dans les options d’« Exportation avancée », vous pouvez aller plus loin et transformer chaque page en image. Plus personne ne peut alors sélectionner, copier, rechercher ou modifier le texte, ce qui peut être utile pour un document que vous avez signé. L’inconvénient, c’est que le texte n’en est plus : on ne peut plus y faire de recherche, et les lecteurs d’écran ne peuvent plus le lire à voix haute. La copie que vous téléchargez est aplatie ; le document ouvert conserve son texte.

## Pourquoi un rectangle noir n’est pas un caviardage

Une erreur courante et grave consiste à masquer un texte sensible en dessinant un rectangle noir par-dessus. Le texte se trouve toujours dans le fichier, en dessous. Bien souvent, n’importe qui peut le sélectionner, le copier ou retirer le rectangle.

L’outil de caviardage d’Universal PDF fonctionne différemment. Lorsque vous enregistrez, exportez ou envoyez un document qui contient des caviardages, chaque page concernée est transformée en image avec les rectangles noirs incrustés, puis la page est reconstruite à partir de cette image. Le texte qui se trouvait sous les rectangles est définitivement supprimé de la copie enregistrée. Comme cette opération est irréversible, l’application vous demande de confirmer avant de l’effectuer.

Quelques conseils pratiques :

- Le caviardage ne supprime que ce que le rectangle recouvre : vérifiez donc les bords de chaque rectangle.
- Les informations sur le document, comme son titre et son auteur, sont distinctes des pages. Vérifiez-les aussi avant de partager un document caviardé.
- Conservez l’original non caviardé en lieu sûr si vous en avez encore besoin.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Où le travail est-il effectué ?',
    summary: 'Ce qu’Universal PDF fait sur votre appareil, et les rares opérations qui passent par Internet.',
    group: 'Comment ça marche',
    body: `Presque tout ce que fait Universal PDF se passe sur votre propre appareil. Votre PDF n’est pas envoyé en ligne pour être ouvert, dessiné ou enregistré.

## Sur votre appareil

- **Ouverture et affichage des pages.** L’application lit le fichier et dessine chaque page sur votre appareil, à l’aide de PDF.js, le logiciel open source de Mozilla.
- **Modification, remplissage de formulaires et signature.** Vos ajouts, ainsi que le fichier final que vous téléchargez, sont produits sur votre appareil.
- **Rendre des documents numérisés interrogeables (OCR).** La reconnaissance elle-même s’effectue sur votre appareil. La première fois que vous l’utilisez, l’application télécharge le moteur de reconnaissance et ses données linguistiques, puis les conserve pour ne pas avoir à les récupérer de nouveau.
- **Conversion de fichiers Word et OpenDocument.** Un fichier .docx ou .odt est converti en PDF sur votre appareil. Le résultat est recomposé : sa mise en page ne correspondra donc pas exactement à celle de l’original.
- **Verrouillage et déverrouillage par mot de passe.** Effectués sur votre appareil. Votre mot de passe n’est jamais envoyé nulle part.

Vous pouvez le vérifier vous-même : une fois l’application chargée, coupez votre connexion Internet et continuez à travailler.

## Ce que l’application garde en mémoire sur cet appareil

Les fichiers récemment ouverts sont conservés dans le stockage propre à votre navigateur, sur cet appareil, afin qu’une actualisation les fasse réapparaître. Les signatures et tampons que vous enregistrez y sont également conservés. Effacer les données de votre navigateur pour ce site les supprime. Ils ne nous sont pas envoyés.

## Conserver une copie

L’option **Sauvegarder** propose trois niveaux :

1. **Enregistrer dans le navigateur.** Automatique, et uniquement sur cet appareil.
2. **Enregistrer sur l’ordinateur.** Télécharge un fichier de sauvegarde unique contenant le PDF d’origine et vos modifications, toujours modifiables. Importez-le plus tard, sur n’importe quel appareil, pour reprendre là où vous vous étiez arrêté. Le fichier n’est pas chiffré : prenez-en soin comme du PDF lui-même.
3. **Hébergé par UNI·SIM.** Stocke le PDF terminé en ligne, associé à votre Universal ID, pour que vous puissiez l’ouvrir sur un autre appareil. C’est gratuit avec un Universal ID ; les comptes gratuits disposent d’une limite généreuse — si vous l’atteignez un jour, supprimez quelque chose dont vous n’avez plus besoin pour faire de la place.

## Signer sur votre téléphone

Si vous choisissez de dessiner votre signature sur votre téléphone, le dessin transite de votre téléphone vers l’application par notre serveur, sous forme de message éphémère. Il n’y est pas enregistré. L’application ne l’accepte que si le code PIN qu’elle vous affiche est saisi sur le téléphone.

## Ce que l’application envoie, même quand votre PDF ne bouge pas

Si vous êtes connecté, l’application enregistre qu’elle a été ouverte, pour la page d’activité de votre compte. Tant qu’elle est affichée à l’écran, elle envoie aussi environ toutes les 45 secondes un petit message « en cours d’utilisation », qui contient le nom de l’application et un identifiant aléatoire propre à cet appareil. Aucun de ces envois ne contient quoi que ce soit sur vos fichiers. Il n’y a ni publicité ni pistage par des tiers.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Signer un PDF vous-même',
    summary: 'Ce qu’est une signature apposée dans l’application, et ce qu’elle n’est pas.',
    group: 'Comment ça marche',
    body: `Vous pouvez signer un PDF en dessinant votre signature avec une souris, un pavé tactile ou le doigt, en la dessinant sur votre téléphone, ou en important une image de votre signature. Vous pouvez enregistrer des signatures et des tampons pour les réutiliser, et ajouter votre nom et la date en dessous.

Lorsque vous placez une signature, il s’agit d’une image positionnée sur la page. Lorsque vous téléchargez le PDF, cette image est intégrée à la page comme n’importe quel autre ajout. Tout cela se passe sur votre appareil.

## Les cadres de signature

Si vous préparez un document pour quelqu’un d’autre, vous pouvez dessiner un cadre « Signez ici » sur la page. Vous pouvez aussi exiger, pour un cadre, une signature dessinée à la main plutôt qu’une image importée. Une signature dessinée sur un téléphone compte bien comme dessinée à la main.

## Ce qu’est ce type de signature

C’est ce qu’on appelle habituellement une **signature électronique** : une marque sur un document qui montre qu’une personne avait l’intention de le signer. De nombreux pays reconnaissent la validité des signatures électroniques pour un large éventail d’accords du quotidien, et de nombreuses organisations les acceptent.

## Ce qu’elle n’est pas

Ce n’est pas une **signature numérique** au sens technique. Une signature numérique utilise un certificat, souvent délivré par une autorité de confiance, pour sceller le fichier par un procédé cryptographique, de sorte que toute modification ultérieure puisse être détectée par l’application PDF. Universal PDF n’ajoute pas ce type de sceau à un fichier que vous signez vous-même.

C’est important, car l’image d’une signature sur un PDF ne prouve pas, à elle seule, qui l’a apposée, ni que le document n’a pas été modifié depuis. Si vous avez besoin d’une trace de qui a signé et quand, utilisez **Envoyer pour signature**, qui tient un journal d’activité côté serveur et conserve une empreinte de chaque version signée. Les articles suivants expliquent comment.

## Un mot sur le droit

Ceci ne constitue pas un conseil juridique. L’acceptabilité d’une signature électronique dépend de l’endroit où vous vous trouvez, de la nature du document et de ce que l’autre partie acceptera. Certains documents, comme certaines transactions immobilières, les testaments ou les documents qui doivent être signés devant témoin, obéissent souvent à des règles plus strictes. Si un document est important, vérifiez ce qui est exigé avant de vous fier à une signature électronique, quelle qu’elle soit.`,
  },
  {
    id: 'send-to-sign',
    title: 'Comment fonctionne Envoyer pour signature',
    summary: 'Demander à quelqu’un d’autre de signer, étape par étape.',
    group: 'Comment ça marche',
    body: `Envoyer pour signature vous permet de demander à une autre personne de signer un PDF en ligne, et vous donne à tous les deux une trace de ce qui s’est passé. Vous devez être connecté avec un Universal ID, et votre adresse e-mail doit être vérifiée, car la demande est envoyée en votre nom.

## Les étapes

1. **Indiquez où signer.** Ajoutez au moins un cadre « Signez ici » au document, pour que l’autre personne sache où apposer sa signature.
2. **Stockez-le en ligne.** Le PDF terminé, avec tous vos ajouts intégrés, est stocké en ligne et associé à votre Universal ID. C’est gratuit avec un Universal ID ; les comptes gratuits disposent d’une limite généreuse — si vous l’atteignez un jour, supprimez quelque chose dont vous n’avez plus besoin pour faire de la place.
3. **Choisissez qui peut l’ouvrir.** Soit « Toute personne disposant du lien », soit « Uniquement la personne à qui vous l’adressez ». Consultez « Envoyer pour signature est-il sûr ? » pour savoir ce que ce choix change.
4. **Envoyez-le.** Copiez le lien et envoyez-le vous-même, ou saisissez l’adresse e-mail de la personne et l’application le lui envoie par e-mail. Avec un lien ouvert, l’e-mail contient le PDF en pièce jointe. Avec un lien protégé, ce n’est pas le cas, car la pièce jointe contournerait la protection.

## Deux signataires, dans n’importe quel ordre

Chaque demande comporte deux signataires : vous et la personne à qui vous l’avez envoyée. Chacun reçoit son propre lien, et vous pouvez signer dans n’importe quel ordre. Celui qui signe en second travaille sur la copie qui porte déjà la première signature.

## Ce qui se passe quand quelqu’un signe

Le signataire ouvre le document dans son navigateur, le signe et le renvoie. La copie signée est stockée comme nouvelle version ; les versions précédentes sont conservées, pas écrasées. Chaque étape est consignée dans un journal d’activité. Lorsque vous avez signé tous les deux, la demande est terminée et chacun de vous reçoit un e-mail contenant un lien vers le certificat.

## Le certificat

Chaque demande dispose d’une page de certificat. Elle affiche le document, l’identité de chaque signataire par son adresse e-mail, si chacun a signé, et le journal d’activité : quand le document a été ouvert, ce qui a été ajouté, de quel pays provenait la demande, et une empreinte du document à chaque étape. Vous pouvez y télécharger le PDF signé final tant que la copie stockée existe.

## Limites

Les liens de signature expirent au bout de 30 jours. Les fichiers stockés peuvent atteindre 50 Mo, et un fichier envoyé en pièce jointe doit faire moins de 30 Mo.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Envoyer pour signature est-il sûr ?',
    summary: 'Ce qui est chiffré, ce que notre serveur peut voir, et comment fonctionne la piste d’audit.',
    group: 'Confidentialité et sécurité',
    body: `Envoyer pour signature est la seule fonctionnalité pour laquelle votre document doit quitter votre appareil, puisque quelqu’un d’autre doit le recevoir. Voici exactement ce que cela implique.

## Le chiffrement, en termes simples

- **Pendant le transfert :** tout ce qui circule entre l’application et notre serveur passe par HTTPS, et est donc chiffré en chemin.
- **Au repos :** le document stocké est conservé dans un espace de stockage privé et chiffré, qui n’est pas lisible publiquement.
- **Pas de bout en bout :** nous détenons les clés de cet espace de stockage, donc nos systèmes peuvent lire le document. C’est nécessaire pour que le serveur puisse le remettre au signataire et calculer l’empreinte de chaque version. Sa protection relève d’un engagement sur la façon dont nous gérons nos services, pas d’une garantie mathématique. Si cela compte pour un document donné, ne l’envoyez pas de cette manière.

L’e-mail est une autre question. Si l’application envoie le PDF en pièce jointe, il est aussi confidentiel que la boîte de réception du destinataire et que tout endroit où l’e-mail est transféré.

## Le lien est la clé

Le lien de chaque signataire contient un long code aléatoire qu’il est pratiquement impossible de deviner. Lorsqu’il est ouvert, notre serveur vérifie le code et, s’il est valide, donne au navigateur une adresse temporaire du document, valable 10 minutes. Les liens cessent de fonctionner au bout de 30 jours, et une fois qu’une personne a signé, son lien ne peut plus servir à signer de nouveau.

## Toute personne disposant du lien, ou uniquement le destinataire

Avec **Toute personne disposant du lien**, quiconque possède le lien peut ouvrir le document et le signer. Si l’e-mail est transféré, le nouveau lecteur peut signer.

Avec **Uniquement la personne à qui vous l’adressez**, le document ne s’ouvre pas tant que le visiteur n’a pas prouvé qu’il a accès à l’adresse que vous avez saisie :

- Il saisit l’adresse. Si elle correspond, un code à 6 chiffres est envoyé par e-mail à l’adresse que vous avez saisie, jamais à ce que le visiteur a tapé.
- Le code est valable 10 minutes et autorise 5 essais, partagés avec le code PIN s’il y en a un. Au plus 5 codes peuvent être envoyés par lien, à au moins une minute d’intervalle.
- Une fois vérifié, il dispose de 4 heures pour lire et signer.
- Vous pouvez aussi exiger un code PIN à 6 chiffres, que l’application génère pour que vous le transmettiez par téléphone ou par SMS. Seule une empreinte SHA-256 salée du code PIN est stockée, c’est pourquoi il ne peut plus vous être affiché.

## La piste d’audit

Chaque fois qu’une copie signée revient, notre serveur calcule son empreinte SHA-256 et l’enregistre à côté de l’empreinte de la version qu’elle remplace. Modifiez un seul octet du fichier et son empreinte change complètement : n’importe qui peut donc comparer une copie du document au certificat. Chaque événement est consigné avec l’heure selon notre serveur, l’adresse e-mail du signataire, son adresse IP et des informations sur son navigateur. Le certificat public n’indique que le pays, jamais l’adresse IP complète.

La page du certificat peut être consultée par toute personne qui en possède le lien : partagez-la donc avec autant de précautions que le document.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Verrouiller un PDF par mot de passe',
    summary: 'Le chiffrement utilisé, pourquoi tout repose sur le mot de passe, et que faire si vous l’oubliez.',
    group: 'Confidentialité et sécurité',
    body: `Dans les options d’« Exportation avancée », vous pouvez verrouiller un PDF avec un mot de passe ou un code PIN. Toute personne qui ouvre ensuite le fichier a besoin du mot de passe pour en voir le contenu, dans n’importe quelle application PDF qui prend en charge le chiffrement PDF moderne.

## Ce que fait réellement le verrouillage

Universal PDF utilise le chiffrement le plus robuste proposé par la norme PDF : **AES-256**, tel que défini dans PDF 2.0. Le texte, les images et le reste du contenu sont scellés avec une clé aléatoire de 256 bits créée pour ce fichier. Cette clé est elle-même verrouillée par votre mot de passe.

Le chiffrement a lieu sur votre appareil. Votre mot de passe n’est jamais envoyé nulle part, et nous ne le voyons jamais.

## Pourquoi tout repose sur le mot de passe

L’AES-256 n’est pas le point faible. La seule façon réaliste d’entrer dans un fichier bien verrouillé est de deviner le mot de passe, encore et encore. PDF 2.0 rend chaque tentative volontairement lente, ce qui aide beaucoup, mais une personne disposant de matériel puissant et de temps peut tout de même essayer un très grand nombre de combinaisons.

L’application vous indique donc approximativement combien de temps votre mot de passe résisterait à un attaquant déterminé, et elle se montre volontairement prudente. Un code PIN à 4 chiffres tombe en quelques instants. Une longue phrase secrète composée de plusieurs mots sans rapport entre eux peut tenir plus longtemps que quiconque n’acceptera d’attendre. Adaptez le mot de passe à l’importance du document.

## Ce qu’il ne fait pas

Certaines applications proposent d’empêcher l’impression ou la copie d’un PDF sans mot de passe. Ces restrictions ne sont que des demandes adressées à l’application de lecture, et elles sont faciles à supprimer : Universal PDF ne les propose donc pas. Quiconque possède le mot de passe peut faire ce qu’il veut du document.

## Si vous oubliez le mot de passe

Personne ne peut le récupérer, pas même nous. Il n’existe ni réinitialisation ni porte dérobée. Conservez votre mot de passe en lieu sûr, ou gardez une copie non verrouillée dans un endroit sécurisé.

## Ouvrir des PDF verrouillés

Universal PDF peut ouvrir des PDF verrouillés en AES-256 par d’autres applications. Il vous demande le mot de passe et déverrouille le fichier sur votre appareil. Certains PDF utilisent des méthodes de chiffrement plus anciennes que l’application ne peut pas ouvrir ; utilisez dans ce cas l’application qui les a verrouillés.

Astuce : les mots de passe composés de lettres d’Europe occidentale, de chiffres et de symboles courants fonctionnent de manière fiable dans toutes les applications PDF. Certaines applications traitent différemment d’autres caractères, comme les lettres grecques, cyrilliques ou chinoises, ou les emoji : l’application vous avertit donc si votre mot de passe en contient.`,
  },
]

export default articles
