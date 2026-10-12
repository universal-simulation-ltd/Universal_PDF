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
| Sending it for signature: each "Sign here" box becomes a real PDF signature field, and the file goes out through your own share sheet, download or Save dialog | your device | [`src/components/Signature/SendForSignatureDialog.tsx`](src/components/Signature/SendForSignatureDialog.tsx), `addSignatureFields` in [`src/lib/export.ts`](src/lib/export.ts) |

**Recent files stay on your device.** The app remembers what you had open using
IndexedDB, which is storage inside your own browser — see
[`src/lib/recents.ts`](src/lib/recents.ts). Clearing your browser data deletes
it. Nobody else can read it, including us.

---

## The one way a PDF *can* leave — a button you press, on the website

This is the part a privacy page usually leaves out, and it is the reason this
one exists.

### "Send for signature" sends nothing to us

Asking someone else to sign starts with **Send for signature**, on every
platform. It does not upload anything. Each "Sign here" box is written into the
PDF as a real signature field, and the file goes wherever *you* send it — your
phone's share sheet, a download, a Save dialog. The person you send it to can
sign it in Universal PDF, Adobe Acrobat or Reader, or Apple Preview, with no
account. We never see it.

### "Certified signature" (website only)

If you want proof of who signed and when, the **website** offers a certified
signature as an optional extra. That one does leave your device: the app emails
the signer a link (with the PDF attached on an open link) and keeps a copy so
the link works, and both of you get a certificate with an audit trail. It is
free, and it needs a Universal ID — for you, the sender, only; the signer
signs from the link with no account. A completed request and its record are
kept for 7 years.

**The iPhone, iPad and Android apps, the desktop app and the browser extension
don't offer it at all** — see `certifiedSignatureHere` in
[`src/lib/accounts.ts`](src/lib/accounts.ts).

- The code: [`src/lib/signRequestClient.ts`](src/lib/signRequestClient.ts),
  and the stored copy in [`src/lib/hostedStore.ts`](src/lib/hostedStore.ts)
- The dialog that asks you (website only): [`src/components/SendToSignDialog.tsx`](src/components/SendToSignDialog.tsx)
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

- **Signing in — on the website only, and only if you choose to.** A Universal
  ID gets you the suite's shared account and settings, the certified
  signature, and the main signature saved in your account. You can delete it
  from inside the website: **Delete my account** at the foot of Global Tuning,
  in the profile menu. That deletes it in every UNI·SIM app, not only this one.
  **The phone apps, the desktop app and the browser extension have no sign-in
  at all:** they run signed out even if the device is signed in to UNI·SIM
  elsewhere, and make no account requests. See `noAccounts` in
  [`src/main.tsx`](src/main.tsx) and [`src/lib/accounts.ts`](src/lib/accounts.ts).
- **"You opened the app".** When you are signed in on the website, the app
  records one event saying the app was opened, so your account's activity page
  is accurate. It does not include anything about your file — not its name,
  not its size. With no sign-in, the other builds never send it. See
  `UsageTracker` in `@unisim/sdk`.
- **An anonymous daily open count.** Once a day, the first time you open the
  app (after your first click or key press), it adds one to that day's total
  for this app. It sends the app's name and the kind of platform ("web") and
  nothing else: no identifier, no account even if you are signed in, and
  nothing about what you are working on. A "counted today" mark stays in your
  browser and is never sent. The totals identify nobody and are kept
  indefinitely. See `countDailyOpen` in `presence.ts` in `@unisim/sdk`.
  **Only the website sends this.** The iPhone, iPad and Android apps don't (the
  App Store and Google Play already count how many people have the app), and
  neither do the desktop app or the browser extension. See `openCount` in
  [`src/main.tsx`](src/main.tsx). (This replaced the old "this app is in use"
  signal, a random install ID sent every 45 seconds, which `@unisim/sdk`
  0.187.0 retired: no install ID is sent or kept any more.)
- **Signing on your phone.** If you choose to draw your signature on your
  phone (the QR code in the signature pad), the drawing travels from the phone
  to the app as a short-lived message through our server. It is not stored, and
  the app accepts it only with the PIN it shows you. No account is involved.
  See [`src/lib/mobileSign.ts`](src/lib/mobileSign.ts).
- **Google's scanner diagnostics (Android only, only when you scan).** The
  Scan button on Android uses Google's ML Kit document scanner, which comes
  with Google Play services. Your scanned pages stay on your phone, but Google
  says its ML Kit libraries send Google some diagnostics when they are used:
  the phone's make, model and Android version, the app's name and version,
  how long the scan took, error codes, and a random per-installation ID. It
  goes to Google, not to us, encrypted, and Google says it does not pass it
  on. See [Google's ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure).
  The iPhone and iPad scanner is Apple's VisionKit and sends nothing.
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
