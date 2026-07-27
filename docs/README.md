# Universal PDF — docs

## What this repo is

Universal PDF is a clean Progressive Web App for **viewing, annotating, and
signing PDFs in the browser** — free draw, text, shapes, ticks/crosses,
reusable drawn signatures (including a sign-on-your-phone flow via QR + PIN),
and export with everything baked into the saved file. No upload to a server;
documents stay on the device.

Scanned / image-only PDFs can be made **searchable on-device via OCR**
(Tesseract.js WASM) — see "On-device OCR" below.

- **Live:** [opensource.unisim.co.uk/pdf](https://opensource.unisim.co.uk/pdf)
  — served by path via the `opensource-portal` Worker, which proxies `/pdf` to
  its Cloudflare Pages project.
- **Stack:** Vite + React + TypeScript PWA; pdf.js for rendering, Konva for
  the annotation layer, pdf-lib for export. Installable, works offline after
  first load; recents are remembered locally.
- **Wrappers:** an `electron/` folder provides a desktop build
  (`npm run dist`), and a `capacitor.config.ts` exists for native mobile
  packaging. Desktop apps are shipped unsigned per suite policy.
- **Optional cloud storage:** the Actions → Store dialog offers local (free)
  vs "Hosted by UNI·SIM" storage — the latter is Universal-ID-gated and
  consumes an upload token via the shared suite Supabase project.

MIT licensed — free and open source, like all Universal Apps.

## On-device OCR (make searchable)

The **Actions → "Make searchable (OCR)"** item (and a card on the landing
page's "More options") turns a scanned / image-only PDF into a searchable,
selectable one — **entirely client-side, nothing uploaded**. This mirrors the
Universal Images background-removal pattern: a lazy dynamic import keeps the
engine out of the main bundle, and the WASM core + language model are fetched
from the Tesseract CDN once on first use, then cached (browser + PWA runtime
cache) so it works offline afterwards.

- **Engine:** [`tesseract.js`](https://github.com/naptha/tesseract.js) v5 (a
  WASM port of Tesseract), imported dynamically in `src/lib/ocr.ts`.
- **How it works:** each page is rendered to a canvas via pdf.js, recognised to
  word boxes, and an **invisible text layer** (transparent Helvetica, opacity 0)
  is baked over the original page with pdf-lib — so the scanned image still
  shows but Find / copy-paste / redact-by-search all light up. Word positioning
  is rotation- and CropBox-aware via `viewport.convertToPdfPoint`.
- **`auto` mode** (default) skips pages that already have selectable text, so a
  mixed PDF only OCRs its image pages; **`all`** forces every page.
- **UI:** `src/components/Ocr/OcrModal.tsx` shows a determinate progress bar
  (model download + per page) and, on completion, offers *Open searchable PDF*
  (reloads it into the viewer so Find works immediately) and *Download*.
- **PWA caching:** `vite.config.ts` adds CacheFirst runtime-caching rules for
  the Tesseract CDN (`cdn.jsdelivr.net/npm/tesseract.js*`) and language data
  (`tessdata.projectnaptha.com`); the assets are cross-origin so they're never
  in the install-time precache.
- **Limitations / follow-ups:** English (`eng`) model only for now (the OCR text
  is WinAnsi-sanitised, matching the Standard-14 font export path); the desktop
  (Electron `file://`) build can't reach the CDN, so OCR there needs a network
  connection or a future self-hosted-assets path (as Images does with
  `VITE_BG_REMOVAL_PATH`).

## Signature-request boxes ("Sign here")

The **Sign → Request** tab drops a dashed *"Sign here"* box on the page
(`sigfield` annotation). Anyone who opens the PDF in Universal PDF can click it
to sign — it is not tied to the send-to-sign link flow. Three options are chosen
*before* the box is drawn and are carried **on the annotation**, not in the
database:

| Option | Annotation field | Effect |
|---|---|---|
| Ask for name | `requireName` | Seeds the pad's "include name" |
| Ask for date | `requireDate` | Seeds the pad's "include date" |
| Require live signature | `requireLive` | Asks for drawn ink, not an uploaded image |

Carrying them on the annotation (rather than a `pdf_sign_requests` column) means
they travel with the document — through the `.unipdf` backup, the hosted upload,
and an exported PDF (unsigned boxes are embedded in the document catalog under
`UPDFSigFields` and re-detected by `readEmbeddedSigFields` on reopen). It also
binds the rule to the **box**, so it applies to anyone who opens the file.

⚠️ **`requireLive` is a stated requirement, not proof.** It is a constraint the
signer's own browser enforces — the same class of claim as the signing
certificate page. Never let UI copy imply the ink has been *verified* as live.
Signing on a phone deliberately still counts: that is drawn ink too, just on a
better input device.

Note that the only way to fill a `sigfield` is `startSigningField()` → the
signature pad, which offers **Draw** and **Sign on phone** and no image upload.
So the "no uploads" rule is currently satisfied by the pad's own shape; there is
no import path into a box to disable. If an upload route is ever added to the
pad, it must check `requireLive`.

## Suite context

This repo is one part of the **Universal Simulation suite** (the open-source
Universal Apps family). For cross-repo context — how the `@unisim/sdk`, edge
routing, and the suite changelog wire together — see the suite docs repo:
[`universal-simulation-ltd/docs`](https://github.com/universal-simulation-ltd/docs)
(private; checked out at the umbrella root as `Docs_UNI_SIM/` for suite
contributors). Start with `ARCHITECTURE.md` (the cross-repo map).
