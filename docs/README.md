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

## Send to sign

**Sign → Request → "Send to sign"** stores the flattened PDF online against a
Universal ID and mints a signing link (`SendToSignDialog`; recipient side is
`SignRequestPage` via `?signdoc=<token>`). It lives on the Request tab because
it is the other half of asking someone for a signature — the tab either drops a
box for someone opening the file locally, or hands the whole document to a
named recipient.

It used to be launched from the **Export** modal, which was the wrong home: the
action is nothing to do with saving a copy. When it moved, the **typed "REDACT"
confirmation moved with it** — into `SendToSignDialog` itself. That gate is not
cosmetic: storing runs the same `buildAnnotatedPdfBytes` flatten as export, so
it is equally a point of no return for redactions. Any future surface that
launches the dialog inherits the gate for free, which is the point of it living
on the action rather than the launcher.

## QR codes (Add QR code)

The **QR button** in the toolbar (desktop: beside the image button; mobile:
beside *Image*) opens a cut-down Universal QR — a link box and six style
presets — and drops the generated code onto the page.

**It is an image annotation, not a new type.** "Add to page" renders a
1024 px PNG, hands it to `setUploadedImageSrc` and arms the existing `image`
tool, so the code is placed, moved, resized, undone and baked into the export
by machinery that already existed. Placed at the default ~200 pt that works out
around 360 dpi, so the code still scans off a printed page.

### Sharing a design model with Universal QR

`src/lib/qr/` is a port of Universal QR's renderer, kept deliberately faithful:

| File | From | Notes |
|---|---|---|
| `design.ts` | its `lib/qr.ts` | `QrDesign` is a field-for-field copy of its `QrConfig`; the six presets are its `PRESETS` verbatim |
| `frames.ts` | its `lib/frames.ts` | shaped plates (circle/star/hexagon/…), canvas path only |
| `decor.ts` | its `lib/decor.ts` | the burst/scatter marks a shaped plate is filled with |
| `render.ts` | its `lib/compose.ts` | one canvas composite for plain and shaped codes alike |

The *editor* is what is simplified, not the format — because a design imported
from Universal QR is restored whole, and a code that rendered differently in the
two apps would be the version of this feature nobody trusts. Verified by
rendering all six presets through both apps' pipelines and diffing the pixels:
**identical**, the sole delta being the centre mark's antialiasing (Universal QR
inlines a 256 px data URI of the icon; here the shipped `unisim-icon.png` is
downscaled by the browser).

⚠️ The one rule the geometry keeps: **the code itself is never clipped** to a
shape. A silhouette is only ever the *plate* the code sits on — the code is
rendered smaller and centred in the largest square that fits. See `frames.ts`.

### Your saved codes, with no backend

Universal QR keeps designs in `localStorage` under `unisim.qr.designs.v1`, and
in production the two apps are the **same origin** — `opensource.unisim.co.uk/pdf`
and `/qr`, both behind the opensource-portal Worker — so that store is simply
readable from here. Open the dialog and the codes designed next door are already
listed; clicking one restores it whole (its link, colours, plate and any uploaded
logo). No account, no API, no round trip.

`src/lib/qr/library.ts` is **read-only** by design: it is another app's store,
capped at 12 entries, and evicting someone's saved design because they added a
QR to a PDF would be a bad trade. The origin is also not guaranteed —
`pdf.unisim.co.uk` and the Electron build are separate origins with their own
empty storage — so the dialog also imports Universal QR's `.uniqr.json` backup,
which works anywhere.

### Colours

`qrContrastIssue` warns on an **inverted** code (light modules on dark — strict
decoders reject those outright) or a **low-contrast** one (right polarity, too
thin a ratio: it passes a desk test and fails in print). The six presets all
pass; the check exists for designs arriving from Universal QR's full studio,
because baking an unscannable code into an exported PDF is the failure nobody
notices until the poster is printed.

## Suite context

This repo is one part of the **Universal Simulation suite** (the open-source
Universal Apps family). For cross-repo context — how the `@unisim/sdk`, edge
routing, and the suite changelog wire together — see the suite docs repo:
[`universal-simulation-ltd/docs`](https://github.com/universal-simulation-ltd/docs)
(private; checked out at the umbrella root as `Docs_UNI_SIM/` for suite
contributors). Start with `ARCHITECTURE.md` (the cross-repo map).
