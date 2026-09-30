import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'What actually is a PDF?',
    summary: 'Where the format came from, and why it looks the same everywhere.',
    group: 'The basics',
    body: `PDF stands for Portable Document Format. Adobe introduced it in 1993 to solve a simple problem: a document that looked right on one computer often looked wrong on another, because the other computer had different fonts, a different printer or a different version of the software.

A PDF fixes the page. Rather than saying "here is a paragraph, lay it out as best you can", it says, in effect, "draw these letters, in this font, at exactly these positions on a page of exactly this size". That is why a PDF looks the same on a phone, a laptop or a print shop's machine.

## Who owns it

Nobody, any more. Adobe published the specification early on, and in 2008 PDF became an open international standard, ISO 32000. The current version, PDF 2.0, followed in 2017. Anyone may write software that reads or creates PDFs, which is why so many apps can.

## What a PDF can hold

- Text, with the fonts needed to draw it
- Pictures, including whole scanned pages
- Drawings and shapes
- Fillable form fields
- Links, bookmarks and comments
- Information about the document itself, such as its title and author
- A password lock, if someone added one

## Some kinds of PDF you might hear about

**PDF/A** is a stricter version meant for long-term archiving, standardised as ISO 19005. It requires everything needed to display the document, such as fonts, to be inside the file, and it does not allow encryption, so the document can still be opened decades from now.

**Fillable forms** contain fields you can type into. Most use a system that is part of the PDF standard itself. A minority use an older design called XFA, which was later removed from the standard and which many apps, this one included, can only partly support.

## The trade-off

The same thing that makes a PDF reliable makes it awkward to change. It was designed to be a finished page, not a draft. The next article explains why.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Why are PDFs so hard to edit?',
    summary: 'Text versus scanned pictures, embedded fonts, and the information hidden in a file.',
    group: 'The basics',
    body: `If you have ever tried to change a word in a PDF and found the rest of the line would not move to make room, you have met the way PDFs are built.

## Text is placed, not flowed

A word processor stores paragraphs and works out where the lines break each time you edit. A PDF usually stores the result: small runs of letters, each pinned to an exact position. There is often nothing in the file that says "these lines are one paragraph" or "this is a table". Change one word and nothing knows how to reflow what comes after it.

## Fonts are often incomplete

To look the same everywhere, a PDF usually carries its fonts inside it. To keep files small, it often carries only the letters the document actually uses. So even if you could add new text in the original font, the letter you need may simply not be in the file.

## Some PDFs have no text at all

A scanned document is a PDF containing a photograph of each page. It looks like text, but to a computer it is a picture: you cannot search it, select it or copy from it.

Universal PDF can fix that with **Make searchable (OCR)**. It reads the words in the picture and lays an invisible layer of text over the page, in the same positions. The page still looks exactly as it did, but you can now search it and select from it. Recognition is never perfect, so check anything that matters.

## Files carry information about themselves

Most PDFs include details such as a title, an author, the software that created the file and when it was made or changed. These are not shown on the page, but anyone who opens the document properties can see them. Universal PDF lets you view them, and when you export you can choose to keep or remove them.

## So how does anyone edit a PDF?

Mostly by adding things on top rather than rewriting what is underneath: text boxes, highlights, drawings, signatures and filled-in form fields. That is how Universal PDF works. Your additions stay separate and editable while you work, and are merged into the pages when you save.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'What does "flattening" mean?',
    summary: 'Merging your changes into the page, and why a black box is not always a redaction.',
    group: 'The basics',
    body: `"Flattening" means merging something into the page so it can no longer be separated or changed as an individual item. There are a few kinds, and it helps to know which is which.

## Flattening your additions

While you work in Universal PDF, your text, highlights, drawings and signatures are separate items you can move or delete. When you download the finished PDF, they are drawn permanently into the pages, and filled-in form fields become ordinary text. Anyone opening the downloaded file sees them as part of the document, in any PDF app.

Your open document is not changed by this. You can keep editing and download again.

## Flattening pages into pictures

In the advanced export options you can go further and turn every page into a picture. Nobody can then select, copy, search or edit the text, which can be useful for a document you have signed. The downside is that the text is no longer text: it cannot be searched, and screen readers cannot read it aloud. The copy you download is flattened; your open document keeps its text.

## Why a black box is not a redaction

A common and serious mistake is to hide sensitive text by drawing a black rectangle over it. The text is still in the file underneath. Anyone can often select it, copy it, or remove the rectangle.

Universal PDF's redaction tool works differently. When you save, export or send a document containing redactions, each affected page is turned into a picture with the black boxes burned in, and the page is rebuilt from that picture. The text that was under the boxes is removed from the saved copy for good. Because this cannot be undone, the app asks you to confirm before it happens.

A few practical points:

- Redaction only removes what the box covers, so check the edges of each box.
- Information about the document, such as its title and author, is separate from the pages. Check it too before sharing a redacted document.
- Keep your unredacted original somewhere safe if you still need it.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Where the work happens',
    summary: 'What Universal PDF does on your device, and the few things that go online.',
    group: 'How it works',
    body: `Almost everything Universal PDF does happens on your own device. Your PDF is not uploaded to be opened, drawn or saved.

## On your device

- **Opening and showing pages.** The app reads the file and draws each page on your device, using Mozilla's open-source PDF.js.
- **Editing, filling forms and signing.** Your additions, and the finished file you download, are built on your device.
- **Making scans searchable (OCR).** The recognition itself runs on your device. The first time you use it, the app downloads the recognition engine and its language data, which the app then keeps so it does not need to fetch them again.
- **Converting Word and OpenDocument files.** A .docx or .odt file is turned into a PDF on your device. The result is re-typeset, so it will not match the original's layout exactly.
- **Password locking and unlocking.** Done on your device. Your password is never sent anywhere.

You can test this yourself: once the app has loaded, turn off your internet connection and carry on working.

## What the app remembers on this device

Recently opened files are kept in your browser's own storage on this device, so a refresh brings them back. Signatures and stamps you save are kept there too. Clearing your browser's data for the site removes them. They are not sent to us.

## Keeping a copy

The **Back up** option offers three levels:

1. **Save to browser.** Automatic, and only on this device.
2. **Save to desktop.** Downloads one backup file containing the original PDF and your edits, still editable. Import it later, on any device, to carry on where you left off. The file is not encrypted, so look after it as you would the PDF itself.
3. **Hosted by UNI·SIM.** Stores the finished PDF online against your Universal ID, so you can open it on another device. It is free with a Universal ID; free accounts have a generous limit — if you ever reach it, delete something you no longer need or get more.

## Signing on your phone

If you choose to draw your signature on your phone, the drawing travels from your phone to the app through our server as a short-lived message. It is not saved there. The app only accepts it if the PIN it shows you is entered on the phone.

## What the app sends even when your PDF stays put

If you sign in, the app records that it was opened, for your account's activity page. While it is on screen it also sends a small "in use" message about every 45 seconds, holding the app's name and a random identifier for this device. Neither includes anything about your files. There is no advertising or third-party tracking.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Signing a PDF yourself',
    summary: 'What a signature placed in the app is, and what it is not.',
    group: 'How it works',
    body: `You can sign a PDF by drawing your signature with a mouse, trackpad or finger, by drawing it on your phone, or by importing a picture of your signature. You can save signatures and stamps to reuse, and add your name and the date beneath them.

When you place a signature, it is an image positioned on the page. When you download the PDF, that image is merged into the page like any other addition. All of this happens on your device.

## Signature boxes

If you are preparing a document for someone else, you can draw a "sign here" box on the page. You can also set a box to require a signature drawn by hand rather than an uploaded image. Drawing on a phone still counts as drawn by hand.

## What this kind of signature is

It is what is usually called an **electronic signature**: a mark on a document showing that a person intended to sign it. Many countries treat electronic signatures as valid for a wide range of everyday agreements, and many organisations accept them.

## What it is not

It is not a **digital signature** in the technical sense. A digital signature uses a certificate, often issued by a trusted authority, to seal the file cryptographically, so that any later change can be detected by the PDF app. Universal PDF does not add that kind of seal to a file you sign yourself.

That matters because a picture of a signature on a PDF does not, by itself, prove who put it there, or that the document has not been changed since. If you need a record of who signed and when, use **Send to sign**, which keeps a server-side activity log and a fingerprint of each signed version. The next articles explain how.

## A note on the law

This is not legal advice. Whether an electronic signature is acceptable depends on where you are, what the document is and what the other party will accept. Some documents, such as certain property transactions, wills or documents that must be witnessed, often have stricter rules. If a document is important, check what is required before relying on any electronic signature.`,
  },
  {
    id: 'send-to-sign',
    title: 'How Send to sign works',
    summary: 'Asking someone else to sign, step by step.',
    group: 'How it works',
    body: `Send to sign lets you ask another person to sign a PDF online, and gives both of you a record of what happened. You need to be signed in with a Universal ID, and your email address must be verified, because the request is sent in your name.

## The steps

1. **Mark where to sign.** Add at least one "sign here" box to the document, so the other person knows where their signature goes.
2. **Store it online.** The finished PDF, with anything you have added merged in, is stored online against your Universal ID. It is free with a Universal ID; free accounts have a generous limit — if you ever reach it, delete something you no longer need or get more.
3. **Choose who can open it.** Either anyone with the link, or only the person you address it to. See "How secure is Send to sign?" for what that choice changes.
4. **Send it.** Copy the link and send it yourself, or enter their email address and the app emails it for you. On an open link the email includes the PDF as an attachment. On a protected link it does not, because the attachment would bypass the protection.

## Two signers, either order

Each request has two signers: you and the person you sent it to. Each of you gets your own link, and you can sign in either order. Whoever signs second works on the copy that already carries the first signature.

## What happens when someone signs

The signer opens the document in their browser, signs, and submits it. The signed copy is stored as a new version; earlier versions are kept, not overwritten. Each step is recorded in an activity log. When both of you have signed, the request is complete and both of you receive an email with a link to the certificate.

## The certificate

Every request has a certificate page. It shows the document, who each signer was by email address, whether each has signed, and the activity log: when the document was opened, what was added, which country the request came from, and a fingerprint of the document at each step. You can download the final signed PDF from it while the stored copy exists.

## Limits

Signing links expire after 30 days. Stored files can be up to 50 MB, and a file emailed as an attachment must be under 30 MB.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'How secure is Send to sign?',
    summary: 'What is encrypted, what our server can see, and how the audit trail works.',
    group: 'Privacy and security',
    body: `Send to sign is the one feature where your document has to leave your device, because someone else needs to receive it. Here is exactly what that involves.

## Encryption, in plain terms

- **In transit:** everything between the app and our server travels over HTTPS, so it is encrypted on the way.
- **At rest:** the stored document is kept in private, encrypted storage that is not publicly readable.
- **Not end-to-end:** we hold the keys to that storage, so our systems can read the document. That is necessary for the server to hand it to the signer and to fingerprint each version. Protecting it is a promise about how we run things, not a mathematical guarantee. If that matters for a particular document, do not send it this way.

Email is a separate matter. If the app emails the PDF as an attachment, it is as private as the recipient's mailbox and anywhere the email is forwarded.

## The link is the key

Each signer's link contains a long random code that cannot practically be guessed. When it is opened, our server checks the code and, if it is valid, gives the browser a temporary address for the document that works for 10 minutes. Links stop working after 30 days, and once a person has signed, their link cannot be used to sign again.

## Anyone with the link, or only the addressee

With **anyone with the link**, whoever holds the link can open and sign. If the email is forwarded, the new reader can sign.

With **only the person you address it to**, the document does not open until the visitor proves they can read the address you entered:

- They type the address. If it matches, a 6-digit code is emailed to the address you entered, never to anything the visitor typed.
- The code lasts 10 minutes and allows 5 tries, shared with the PIN if there is one. At most 5 codes can be sent per link, at least a minute apart.
- Once verified, they have 4 hours to read and sign.
- You can also require a 6-digit PIN, which the app generates for you to pass on by phone or text. Only a salted SHA-256 fingerprint of the PIN is stored, which is why it cannot be shown to you again.

## The audit trail

Each time a signed copy comes back, our server calculates its SHA-256 fingerprint and records it alongside the fingerprint of the version it replaced. Change a single byte of the file and its fingerprint changes completely, so anyone can check a copy of the document against the certificate. Each event is logged with the time according to our server, the signer's email address, their IP address and browser details. The public certificate shows the country only, never the full IP address.

The certificate page can be viewed by anyone who has its link, so share it as carefully as the document.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Locking a PDF with a password',
    summary: 'The encryption used, why the password is everything, and what to do if you forget it.',
    group: 'Privacy and security',
    body: `In the advanced export options you can lock a PDF with a password or a PIN. Anyone who opens the file then needs the password to see anything in it, in any PDF app that supports modern PDF encryption.

## What the lock actually does

Universal PDF uses the strongest encryption the PDF standard offers: **AES-256**, as defined in PDF 2.0. The text, pictures and other contents are sealed with a random 256-bit key created for that file. That key is itself locked with your password.

The encryption happens on your device. Your password is never sent anywhere, and we never see it.

## Why the password is everything

AES-256 itself is not the weak point. The only practical way into a well-locked file is to guess the password, over and over. PDF 2.0 makes each guess deliberately slow, which helps a great deal, but someone with powerful hardware and time can still try a very large number of guesses.

So the app shows you roughly how long your password would hold out against a determined attacker, and it is deliberately cautious. A 4-digit PIN falls in moments. A long passphrase of several unrelated words can hold out for longer than anyone will wait. Match the password to how much the document matters.

## What it does not do

Some apps offer to stop people printing or copying a PDF without a password. Those restrictions are only requests to the reading app, and they are easy to remove, so Universal PDF does not offer them. Whoever has the password can do anything with the document.

## If you forget the password

Nobody can recover it, including us. There is no reset and no back door. Keep your password somewhere safe, or keep an unlocked copy somewhere secure.

## Opening locked PDFs

Universal PDF can open PDFs locked with AES-256 by other apps. It asks for the password and unlocks the file on your device. Some PDFs use older encryption schemes that the app cannot open; use the app that locked them instead.

Tip: passwords made of Western European letters, numbers and common symbols work reliably in every PDF app. Some apps handle other characters, such as Greek, Cyrillic or Chinese letters or emoji, differently, so the app warns you if your password includes any.`,
  },
]

export default articles
