# What Universal PDF does with your file

You landed here from the word **Guaranteed**, so this page owes you something
better than a privacy policy. It is written to be checked: every claim below
names the file in this repository that makes it true, and you are welcome to
go and read it.

The short version: **your PDF is opened, drawn on and saved by your own
browser.** It is not uploaded to us to be rendered, and there is no copy of it
on our servers unless you pressed a button that says so.

---

## What happens when you open a PDF

You pick a file (or drop one on the page). The browser hands the app the bytes
of that file, and everything after that happens on your machine:

| Step | Where it happens | The code |
|---|---|---|
| Reading the file | your browser | [`src/stores/pdfStore.ts`](src/stores/pdfStore.ts) |
| Drawing the pages | your browser, via Mozilla's PDF.js | [`src/lib/pdfjs.ts`](src/lib/pdfjs.ts) |
| Your annotations, form filling and signatures | your browser | [`src/lib/export.ts`](src/lib/export.ts), [`src/lib/composeSignature.ts`](src/lib/composeSignature.ts) |
| Reading text out of a scan (OCR) | your browser, via Tesseract | [`src/lib/ocr.ts`](src/lib/ocr.ts) |
| Scanning a page with the camera (phone apps) | your phone, via its own document scanner — Apple's VisionKit on iOS, Google's ML Kit (part of Play services) on Android | [`ios/App/App/DocumentScanner.swift`](ios/App/App/DocumentScanner.swift), [`android/app/src/main/java/uk/co/unisim/pdf/DocumentScannerPlugin.java`](android/app/src/main/java/uk/co/unisim/pdf/DocumentScannerPlugin.java) |
| Straightening a photo of a page (Photo to PDF) | your browser | [`src/lib/scan.ts`](src/lib/scan.ts) |
| Saving the finished PDF | your browser's download | [`src/lib/saveDocument.ts`](src/lib/saveDocument.ts) |

**Recent files stay on your device.** The app remembers what you had open using
IndexedDB, which is storage inside your own browser — see
[`src/lib/recents.ts`](src/lib/recents.ts). Clearing your browser data deletes
it. Nobody else can read it, including us.

---

## The one way a PDF *can* leave — a button you press

This is the part a privacy page usually leaves out, and it is the reason this
one exists.

### "Send to sign"

Asking someone else to sign a document means sending them the document. The app
emails it, with the PDF attached, and keeps a copy so the signing link works
when they open it. It is free, and it needs a Universal ID.

- The code: [`src/lib/signRequestClient.ts`](src/lib/signRequestClient.ts),
  and the stored copy in [`src/lib/hostedStore.ts`](src/lib/hostedStore.ts)
- The dialog that asks you: [`src/components/SendToSignDialog.tsx`](src/components/SendToSignDialog.tsx)
- Revoking a request deletes the stored copy and any signed copy.

⚠️ **The stored copy is ordinary cloud storage, not end-to-end encryption.**
It is encrypted in transit and at rest, and access is restricted to your own
account and the person you sent it to, but we hold the keys — so this is a
promise about our conduct, not a mathematical guarantee.

**There is no online backup.** The old "Store with UNI·SIM" option was retired
on 2026-10-03. **Back up** now offers only local options: the copy your browser
already keeps (see *Recent files* above) and a backup file you download and
can import again on any device. Neither goes to our servers — see
[`src/components/HostedStoreDialog.tsx`](src/components/HostedStoreDialog.tsx)
and [`src/lib/pdfBackup.ts`](src/lib/pdfBackup.ts).

**Signing a PDF yourself doesn't send anything.** Drawing or typing a signature
and stamping it on a page is done entirely in your browser — that is what the
app does all day, and nothing goes anywhere.

---

## What the app talks to a server for, even when your PDF doesn't

Being honest about this matters, because if you open your browser's Network tab
you will see requests, and a privacy page that pretended otherwise would look
like a lie.

- **Signing in.** Only if you choose to. A Universal ID gets you the suite's
  shared account and settings, and Send to sign. You can delete it from inside
  the app: **Delete my account** at the foot of Global Tuning, in the profile
  menu.
  That deletes it in every UNI·SIM app, not only this one.
- **"You opened the app".** When you are signed in, the app records one event
  saying the app was opened, so your account's activity page is accurate. It
  does not include anything about your file — not its name, not its size.
  See [`src/UsageTracker.tsx`](src/UsageTracker.tsx).
- **"This app is in use".** While the app is open and on screen, it tells our
  server every 45 seconds that this app is in use on this device, so the menu
  can say how many people use it and how many are using it now. That message
  holds the app's name and a random ID made on this device, and your account
  if you are signed in: nothing about what you are working on. See `presence.ts`
  in `@unisim/sdk`. **The iPhone, iPad and Android apps don't send this**: the
  App Store and Google Play already count how many people have the app, so
  only the website and the desktop app do.
- **The changelog and update notice**, which is just fetching a list of
  releases.

**There is no third-party analytics, no tracking pixel, and no advertising
script.** You can check that without reading any code: view the page source of
[the live app](https://opensource.unisim.co.uk/pdf/) and look at what it loads.
Everything comes from our own domain.

---

## How to prove it to yourself in about a minute

1. Open the app, then open your browser's developer tools (F12) on the
   **Network** tab.
2. Drop a PDF on the page and use it — annotate, fill a form, export.
3. Watch the list. Your file is never in it.

Or, more conclusively: **turn off your Wi-Fi and use the app anyway.** It keeps
working, because the work was never happening anywhere else.

---

## If you find this page is wrong

That is worth more to us than it costs. Open an issue on
[the repository](https://github.com/universal-simulation-ltd/Universal_PDF/issues).
A claim nobody can correct isn't a guarantee either.
