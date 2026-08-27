# Universal PDF — docs

## What this repo is

Universal PDF is a clean Progressive Web App for **viewing, annotating, and
signing PDFs in the browser** — free draw, text, shapes, ticks/crosses,
reusable drawn signatures (including a send-to-sign phone flow via QR + PIN),
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

## Word / OpenDocument import

Dropping a `.docx` or `.odt` anywhere a PDF is accepted converts it **on the
device** — nothing is uploaded — and opens the result in the viewer.

    officeToPdf.ts     front door: sniff the format, dispatch, own every message
    ├── unzip.ts       minimal ZIP *reader* (mirror of zip.ts's writer)
    ├── officeXml.ts   namespace-agnostic XML helpers, shared by both parsers
    ├── docxToBlocks.ts  OOXML  → Block[]
    ├── odtToBlocks.ts   ODF    → Block[]
    └── blockPdf.ts    Block[] → PDF (the engine Markdown already used)

The shape that makes this small: **`blockPdf.ts` is the whole renderer**, split
out of `markdownToPdf.ts`, which is now only a parser. Word, ODF and Markdown
all produce the same `Block[]`, so there is one layout engine, one set of house
styles, and one place to improve any of it. Both office parsers are
`import()`ed on demand — about 2 kB gzipped each — so a user who only ever
opens PDFs downloads neither.

What this is and is not: the output is a **re-typeset document**, not a
facsimile. Text, headings, bold/italic, bulleted and numbered lists (including
nesting), tables and hyperlinks survive as real selectable text — so Find,
copy-paste and redact-by-search work on it. The author's fonts, columns,
headers/footers, floating shapes and exact page breaks do not. `App.tsx` shows a
notice saying exactly that, because the alternative is someone assuming they are
looking at a copy.

Things learnt the hard way, all of them still true:

- **A heading is not always tagged as one.** OOXML has `w:pStyle` but a custom
  style can declare its level via `w:outlineLvl` instead; ODF has `text:h` but
  LibreOffice writes plenty of headings as a `text:p` whose style merely
  *descends from* "Heading 1". Both parsers resolve the style's parent chain
  before deciding what a paragraph is.
- **ODF escapes style names**: `Heading_20_1` is `Heading 1`. Comparing the raw
  name matches nothing, silently.
- **Match on `localName`, never the prefix.** Both formats are heavily
  namespaced and the prefixes are a producer's choice.
- **Bold is often inherited**, applied by the paragraph or character style
  rather than on the run — and `<w:b w:val="0"/>` switches it back off. Direct
  formatting wins over the character style, which wins over the paragraph's.
- **`.doc` is a different format entirely** (OLE2 compound file, not a ZIP), and
  so is `.rtf`. Both are routinely called "Word files", so both get a refusal
  that says what to do — "save it as .docx and try again" — rather than the
  generic "please choose a PDF" that made the question look unreasonable.
- **`·` is WinAnsi-encodable and Markdown was flattening it.** The sanitiser's
  `·` → `*` rule exists so pasted bullets become list markers; applied to an
  imported document it turned every "UNI·SIM" into "UNI\*SIM". That one rule is
  now Markdown-only (`sanitize(text, { markdownGlyphs: true })`).

Verified against real third-party Word documents plus a fixture exercising every
supported construct, by comparing the converted PDF's extracted text against
LibreOffice's own extraction of the same source (100% of words carried across on
all of them), and with the table parser deliberately broken first to prove the
check could fail.

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

## What a signature block is made of

A placed signature is never a flat picture: the annotation keeps the untouched
ink plus a set of label options, and the rendered image is always the two
composited by `lib/composeSignature.ts`. That is what makes every part of the
block re-editable after placement — double-tap for the options, the on-canvas
pill for size and alignment — without the strokes ever being redrawn.

`labelsForOptions()` is the single source of the lines and their order:

1. the **name** — one editable line holding the whole text (e.g. "Signed by:
   Jane Smith"), seeded from `NAME_LINE_SEED`. `namePrefix` is legacy-only:
   both dialogs fold it into `name` on open, and nothing writes it any more
2. the **details** — free text, one line per line typed, at 70% of the name
3. the **date** — since `fec9518` one editable line too (`dateText`, seeded
   "Signed on <today>"): what you write is exactly what bakes, so a library
   signature placed weeks later keeps its written date — requested behaviour,
   not a bug. Signatures without `dateText` still resolve the date at compose
   time; `datePrefix` is legacy, folded into the line on edit

so the date stays last however much detail is added above it. Both the pad and
the re-edit dialog build their labels through that one function, which is why a
signature looks identical whether it was just drawn or restyled an hour later.

Three deliberate choices:

- **The pad's advanced options and the re-edit dialog are the same three
  switches** (since 2026-08-26) — "Add your name" / "More details (e.g. role,
  email, phone)" / "Add date" — each gating the input directly beneath it,
  seeded on first toggle ("Signed by: ", the "Role: / Email: / Phone: "
  template, "Signed on <today>"; the seeds are shared constants in
  `composeSignature.ts`). Unfilled template labels (a bare "Role:") are
  dropped at compose time in `detailLines()`, and an untouched "Signed by: "
  seed is filtered via `isUnansweredNameLine` — seed text is a UI affordance
  and must never bake into a signed document. The pad's top "Signature name
  (optional)" field only titles the library entry; the name that bakes under
  the ink lives in the switch's own line.
- ⚠️ **Six detail lines maximum** (`MAX_DETAIL_LINES`). A pasted postal address
  would otherwise produce a composite taller than the page, and since the box is
  fitted to the page the ink would shrink to nothing to accommodate it.
- **The wording fields are plain strings, not a `{name}`/`{date}` template.** A
  mistyped token would bake literal braces into a signed document. If a template
  is ever wanted, `withPrefix()` is the only place that changes.

Labels start at `DEFAULT_LABEL_SCALE` — **85% since `c300333`**; the original
70% ran too small (James, 2026-08-26), and before that full size competed with
the signature it was captioning. The pill still spans 50–250%, and a signature
saved with an explicit scale keeps it — the default moves only signatures that
never chose one.

The pad also **previews the label lines live in the dashed drawing box**, in
the ink colour, built through the same `labelsForOptions()` as the bake —
untouched seeds are as invisible in the preview as in the baked output, and
the overlay is `pointer-events: none` so drawing passes through it. Since
`eec26cd` it is **geometry-faithful too**, mirroring `layout()`: the block
hangs directly beneath the strokes' cropped box (the same 6px crop
`renderInkSignature` applies), left-aligned with the ink's edge, at the bake's
own font size (`baseFont = min(28, max(14, sigH*0.4))` × the label scale, 1.3
line height); before anything is drawn it waits at the bottom-left. Ink drawn
down to the bottom edge would push the block under the pane (the box clips
overflow), so since `b875368` the block **clamps upward to stay fully
visible**, overlapping the ink's tail when it must — the bake composes the
labels exactly there, below the cropped ink, so the overlap is honest and a
half-clipped line is not.

New signatures **left-align** their labels under the ink by default
(`DEFAULT_SIG_ALIGN = 'left'` in `lib/composeSignature.ts`, used by the pad,
the compose defaults, `ensureImageSigData` and the pill's fallback — change it
in one place only). A signature with a stored alignment keeps it, and the
on-canvas pill still cycles left/center/right.

The re-edit dialog opens **beside the placed signature** (right of it, else
left, else a centred fallback) with no dimmed backdrop, so edits re-compose the
signature visibly in real time. ⚠️ The anchor is captured **once at open**,
from the Konva node's client rect — a live-tracking anchor would make the
dialog chase the signature as label edits change its size.

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
signature pad, which offers **Draw** and **Send to sign** and no image upload.
So the "no uploads" rule is currently satisfied by the pad's own shape; there is
no import path into a box to disable. If an upload route is ever added to the
pad, it must check `requireLive`.

## Send to sign

⚠️ Since `fec9518` this name is worn by TWO flows: the signature pad's QR + PIN
mode (formerly "Sign on phone" — the phone draws a signature and sends it back
to the desktop) and this one, which sends the whole *document* out to a named
recipient. The rename was directed; keep any future copy distinguishing them.

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

### Editing a code that's already on the page

A placed code carries the state it was generated from — `QrPlacement` on
`ImageAnnotation.qr`: the base design, the branding overlay, and which preset
chip was lit. Selecting the code shows an **✏️ button** beneath the delete
affordance (double-tapping the code does the same); it reopens the *same*
dialog, seeded with that state, and **Add to page** becomes **Update code**,
which re-renders at `PLACEMENT_SIZE` and writes `src` back to the annotation.
The box doesn't move or resize — a QR renders square, so a changed style can't
shift the aspect either — and the update is one undo step like any other edit.

Three things worth keeping if this is ever touched:

- **The placement stores the editor's state, not the composed design.**
  Branding is an *overlay* here (`withBranding`), so flattening it on the way
  out would come back in as an anonymously recoloured design with a picture in
  the middle: the branding switch would read as off, and flipping it "on" would
  do nothing. Keeping the base, the branding and the preset name apart
  round-trips the editor rather than just the picture.
- **The ✏️ is only on codes generated in-app.** A photo of a QR is an image
  annotation too, and there's no design behind it to bring back up. Codes placed
  before this existed have no `qr` either, and stay plain images.
- **Double-tap routes past the signature options editor.** Every image
  annotation is double-tap-editable as a signature (name/date labels); a QR
  reaching that modal would be nonsense, so `openSigEditor` hands a code with a
  `qr` payload to the generator instead.

### Enlarging it, and taking it away

Clicking the 224 px preview opens `QrEnlargeModal` — Universal QR's
`EnlargeModal` in the same clothes (dark backdrop, "click to dismiss" down each
side, the two hints that fix most failed scans), because the point of both is
the same: a preview shows what the code *looks* like, and a second phone needs
something it can actually read. It opens showing the preview render upscaled and
swaps in a 900 px one as it arrives — a blank card for a few hundred ms reads as
a broken modal, and a soft QR still scans. Clicks on the code itself don't
dismiss, so a phone held against the screen doesn't close what it came for.
Escape closes the enlargement only; the dialog's own Escape handler stands down
while it is open, since both listeners see the keypress.

**Download PNG** and **Copy PNG to clipboard** sit under the preview
(`src/lib/qr/download.ts`). Neither has a renderer of its own — both call the
same `renderQrPng` at the same `PLACEMENT_SIZE`, so the file you save is
pixel-for-pixel the image "Add to page" would have stamped in. Two notes:

- The `data:` URL is decoded to a Blob by hand rather than with `fetch()`. The
  Electron build serves the app off its own protocol with a strict CSP, and a
  fetch of a `data:` URL is the sort of request that gets refused there.
- The clipboard write is handed the render **promise**, not an awaited blob:
  Safari only honours a write inside the gesture that asked for it, and drawing a
  QR is asynchronous. Browsers that won't take a promise there fall through to
  the awaited form, and a genuine refusal says "Copy not supported — use
  Download" rather than showing a tick over nothing.

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

### Your saved codes — this browser's, and your account's

The "Your Universal QR codes" shelf (shown only when it has something to show)
lists two sources side by side:

**This browser.** Universal QR keeps designs in `localStorage` under
`unisim.qr.designs.v1`, and in production the two apps are the **same origin** —
`opensource.unisim.co.uk/pdf` and `/qr`, both behind the opensource-portal
Worker — so that store is simply readable from here. Clicking one restores it
whole (its link, colours, plate and any uploaded logo). No account, no API, no
round trip.

**The signed-in Universal ID** (since `e379292`). Codes backed up in Universal
QR's "Back up this QR code" dialog are hosted uploads (product `'qr'`), so
`loadHostedQrDesigns()` in `src/lib/qr/library.ts` lists them here too and a
saved code follows the user cross-device. Since 2026-08-26 Universal QR uploads
the full design as a `<png-path>.json` **sidecar** beside the PNG; a
sidecar-carrying save adopts as a fully editable design (thumbnail rendered
locally), while an older PNG-only save places as a plain image — it is hidden
in edit mode, since there is no design to re-open. Account chips carry a small
cloud mark, and an account save duplicating a local design (same data + name)
shows once.

`src/lib/qr/library.ts` stays **read-only** by design: the localStorage half is
another app's store, capped at 12 entries, and evicting someone's saved design
because they added a QR to a PDF would be a bad trade; the hosted half belongs
to Universal QR's dialog to manage. The `.uniqr.json` backup-file import that
used to cover the separate-origin case (`pdf.unisim.co.uk`, Electron) was
removed with Universal QR's backup-file tier (`c9f313d`) — on a separate origin
the account shelf is now the cross-origin answer, and a code from elsewhere can
simply be added to the page as an image.

### Colours

`qrContrastIssue` warns on an **inverted** code (light modules on dark — strict
decoders reject those outright) or a **low-contrast** one (right polarity, too
thin a ratio: it passes a desk test and fails in print). The six presets all
pass; the check exists for designs arriving from Universal QR's full studio,
because baking an unscannable code into an exported PDF is the failure nobody
notices until the poster is printed.

## Explorer thumbnails (Windows desktop)

On Windows, a `.pdf` shows **page 1 of the document** with the app badge in the
bottom-right corner instead of a flat icon — the way VLC shows a video frame
with its cone.

Explorer never asks an application for a thumbnail: it looks up an
`IThumbnailProvider` COM server registered for the file's class and calls that.
So this is a native shell extension, `native/win-thumbnail/`, built as
`UniversalPdfThumb.dll` and shipped in `resources\` beside the app. It
rasterises page 1 with PDFium and composites `build/pdf-document.ico` into the
corner. `native/win-thumbnail/README.md` has the full design.

A multi-page document also gets a **fan** — one sheet behind page 1 for two
pages, two for anything longer, each turned a few degrees further, **showing
pages 2 and 3 for real** from 256px up — and a
**“120 pages” pill** in the bottom-left from 160px up, so a long document says
so without being opened. A single-page PDF gets neither.

⚠️ The installer also writes an empty **`TypeOverlay`** on the ProgID. Without
it Explorer stamps the application's own icon over the badge in the same
corner, half covering it.

Three things worth knowing here:

- **It appears only when Universal PDF is the default PDF app.** The handler is
  registered against our own ProgID, never against `.pdf`, because there is one
  thumbnail handler per file class and claiming the extension would take
  thumbnails from whichever reader the user actually chose. That is the same
  line `build/installer.nsh` already takes with `OpenWithProgids`.
- **It runs in `dllhost.exe`, not `explorer.exe`.** `DisableProcessIsolation` is
  deliberately unset, so the shell hosts it in a COM surrogate and a crash is a
  notification rather than a dead desktop.
- **Windows x64 only.** 64-bit Explorer will not load a 32-bit shell extension,
  and ARM64 Windows needs its own build, which CI does not produce yet. macOS
  needs nothing — QuickLook already thumbnails PDFs — and GNOME/KDE thumbnail
  through poppler.

The same DLL also hosts the **`IPreviewHandler`**
(`native/win-thumbnail/src/PreviewHandler.cpp`), so with Universal PDF as the
default the Explorer preview pane (Alt+P) shows the document itself — toggled
from home → System options, one UAC prompt.

Build it with `npm run thumbnail:build`; the release workflow does the same on
the Windows runner. If that build fails the installer still ships, without
thumbnails — ⚠️ and that fallback is exactly how **v0.6.3 shipped without the
DLL**: the CI step failed with MSVC C2375, the workflow carried on by design,
and its warning annotation went unread until a user asked where the feature
had gone. Check the Windows job's warnings on every release.

⚠️ **The four COM exports must be declared STDAPI and exported via
`src/exports.def`.** combaseapi.h/olectl.h declare `DllGetClassObject` and
friends plain STDAPI; defining them `extern "C" __declspec(dllexport)` is a
linkage mismatch MSVC refuses (C2375) and MinGW accepts — so a clean local
(MinGW) build proves nothing about the (MSVC) release build. Fixed in
`4b4f42c`; v0.6.4 was the first installer since v0.6.2 to carry the DLL.

## Leaving a document with amendments

Closing a PDF you have drawn on asks first — one popup with three answers:
**Save and exit**, **Exit without saving**, **Cancel**. Every route out goes
through it: Actions → File → Close PDF, opening or dropping another PDF over the
top, and (desktop) the window's close button.

    lib/unsavedChanges.ts   is there anything a saved file does not have?
    stores/exitGuard.ts     requestExit(intent, run) — the only entry point
    components/Exit/UnsavedChangesDialog.tsx   the popup itself
    lib/saveDocument.ts     "Save and exit" — one call, no export dialog

**"Saved" means EXPORTED, not persisted.** Annotations and form values are
already written to this device's recent files 600 ms after every change, so
exiting loses no work either way — what it costs is the *file*. The popup says
so rather than implying the work is about to vanish, which is why the answer to
"why not just autosave?" is that it already does.

⚠️ **Amendment is detected by array IDENTITY** (both stores replace their arrays
immutably), plus a counter for the edits that rewrite the PDF's own bytes —
page reorder/delete and the metadata scrub — which touch neither store and would
otherwise be invisible. A deep compare was rejected: an imported picture is a
multi-megabyte data URL and the comparison would run on every window close.

⚠️ **Marks restored from recents are the baseline, not an amendment.** Reopening
a document with your work on it and closing it again asks nothing.

⚠️ **The desktop close is held in the MAIN process** (`win.on('close')` →
`unsaved:close-request` → `unsaved:allow-close`), never by `beforeunload`.
Electron shows no dialog for `beforeunload`; it silently refuses the close, so
the × would simply stop working. The web build arms `beforeunload` and the
desktop build does not — that split is deliberate and is asserted by the specs.

⚠️ **Redactions are baked in by saving**, so "Save and exit" carries the same
typed **REDACT** confirmation the Export dialog does. The rule itself lives once,
in `lib/redactGate.ts`, so the two cannot drift.

On the desktop the save is a real **Save dialog** and a real file (`save-pdf`
over IPC); on the web it is a download, which is the only "save as" a browser
has. Backing out of the Save dialog is not an exit — the popup stays up.

Tested by `npm run test:exit-guard` (the popup and its answers, in a browser)
and `npm run test:exit-guard:desktop` (the held window close and the native
save, driving the real Electron app). Both need the dev server on :5174.

## Zoom and page rendering

Two rules from a 2026-08-26 bug (a page rendered blank white with only its
AcroForm field boxes visible, after a touchpad zoom):

- ⚠️ **On Windows a touchpad pinch IS ctrl+wheel** — a stream of dozens of
  events per second, not a mouse notch. Committing a full zoom (re-rasterizing
  every page) per event is a 60 Hz re-rasterize storm: a reproduced 72-tick
  burst under 6x CPU throttle at devicePixelRatio 1.5 wedged the main thread
  for over four minutes. The ctrl+wheel stream therefore rides the
  touch-pinch machinery in `PdfViewer.tsx`: CSS transform while ticks arrive,
  ONE `commitZoom` when they go quiet (120 ms settle), anchored under the
  cursor.
- ⚠️ **Never clear a visible canvas before its replacement has finished.**
  `PdfPage.tsx` used to clear up front, re-use the same canvas for the next
  pdf.js render before the cancelled task had released it (pdf.js's
  same-canvas guard throws), and swallow the throw in a catch{} meant for
  cancellations — so a page caught mid-burst stayed permanently white. Every
  render now rasterizes into a fresh offscreen canvas and blits only on
  completion (the old bitmap stays up until the new one lands whole;
  `PresentMode` already worked this way), and a real, non-cancelled failure
  retries once after 500 ms. A catch{} that assumes "cancelled" also eats
  real failures — discriminate before swallowing.

Still open here: no windowed rendering for very long documents —
`renderBudget`'s `MIN_MAX_ZOOM` comment notes it.

## Suite context

This repo is one part of the **Universal Simulation suite** (the open-source
Universal Apps family). For cross-repo context — how the `@unisim/sdk`, edge
routing, and the suite changelog wire together — see the suite docs repo:
[`universal-simulation-ltd/docs`](https://github.com/universal-simulation-ltd/docs)
(private; checked out at the umbrella root as `Docs_UNI_SIM/` for suite
contributors). Start with `ARCHITECTURE.md` (the cross-repo map).
