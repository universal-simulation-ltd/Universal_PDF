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

- **The pad's advanced options and the re-edit dialog are the same two
  switches** — **"Add your details"** and **"Add date"** — each gating the input
  directly beneath it, seeded on first toggle (`DETAIL_BLOCK_SEED`, i.e.
  "Signed by: " over the "Role: / Email: / Phone: " template; "Signed on
  <today>"; all shared constants in `composeSignature.ts`). Until 2026-08-27
  the details were **two** switches, "Add your name" and "More details" — one
  thing to the person filling them in, so James asked for one box. Every line
  typed becomes a line, and the first is set larger because it is almost always
  the name.
  ⚠️ **The stored shape did not change**: an annotation still carries `name`
  and `details` separately, and the box is split/rejoined in exactly one place
  — `splitDetailBlock()` / `joinDetailBlock()` — which is the only reason
  signatures saved before the merge still re-open correctly. Do not let a
  second splitter grow anywhere else.
  Unfilled template labels (a bare "Role:") are dropped at compose time in
  `detailLines()`, and an untouched "Signed by: " seed is filtered via
  `isUnansweredNameLine` — seed text is a UI affordance and must never bake into
  a signed document. The pad's top "Signature name (optional)" field only titles
  the library entry; the name that bakes under the ink is the first line of the
  details box.
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
line height); before anything is drawn it waits at the bottom-left.

Ink drawn down to the bottom edge would push the block under the pane (the box
clips overflow). `b875368` answered that by **clamping the block upward**, over
the ink's tail — and it was wrong, for one afternoon: ⚠️ **the bake never
overlaps, so a preview that does is not a preview.** Since `cd331e2` the
**drawing box grows instead** (`previewHeight` = at least the ink's bottom plus
the gap plus the measured label block, animated via `transition-[height]`), so
the labels always sit below the ink, exactly where the composite puts them.
Keep that direction if this is ever touched: give the caption room rather than
moving it somewhere the export will not.

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

## The Actions dropdown, and who it says you are

The app's Actions menu has no panel of its own. `App.tsx` passes
`<FileMenu variant="rows" />` into the SDK's `<UserProfile actions=…>`, so the
app's rows and the account rows share one pill and one dropdown. Three things
follow from that, and each has bitten:

* **The pill opens on hover as well as on click.** A Playwright `click()` opens
  it on the way in and toggles it straight back shut; the e2e specs `hover()`.
* **Its accessible name is `"Actions · Profile"`**, not `"Profile"` —
  `<UserProfile />` invents the pill label itself once an app passes `actions`.
  Selectors must match on the suffix.
* **`actions` and `extras` are rendered as-is and are NOT themed by the SDK.**
  This app deliberately splits pill from panel (a dark pill in the slate-900
  toolbar over the ordinary light menu), so anything slotted in must be styled
  light.

### One category open at a time

`FileMenu` keeps a single `openSection` value, not one boolean per category.
It used to be six booleans, and every category you had ever opened stayed
open — by the time you had looked in File, View and Advanced the panel was a
thirty-row scroll with the row you wanted off the bottom. Opening View now
closes Advanced (owner, 2026-08-27). Clicking the open category still collapses
it, so a header is still its own toggle.

⚠️ Keep it as ONE piece of state. Six booleans kept in step by hand means a
"close the others" line that gets forgotten the day a seventh category is
added. Pinned by `npm run test:actions`.

### The company badge

`CompanyBadge` renders the org's mark and name at the bottom of the profile
dropdown, via the SDK's `extras` slot. Both reads are existing SDK org hooks
(`useOrg` for the name, `useOrgBranding` for the images — the latter is
literally `useOrg()` narrowed to the branding columns), so whatever an admin
has already set under My Company → Branding is what shows. `icon_url` wins over
`logo_url` because the square mark is the one meant for compact chrome; an
initials tile in the org's brand colour is the last resort, and no org at all
renders nothing.

### ⚠️ `useProfile()` is per-call-site state, so the display name went stale

`useProfile()` is a hook with its own `useState`, not a shared store. The
display-name editor is the SDK's `<ProfileDialog>` — mounted inside
`<UserProfile>` on desktop, where "View profile" cannot be a link to the hub —
and it calls `useProfile()` for **itself**. So saving refreshed the dialog's
copy and never `ToolbarUserProfile`'s, which is the copy feeding the `name` the
dropdown prints. The name (and the pill's initials) stayed wrong until the app
was reloaded.

There is no SDK event for the save, so `ToolbarUserProfile` re-reads the row as
the pointer reaches the pill (`onPointerEnter` **and** `onPointerDownCapture` —
hover-open would miss a pointerdown-only refresh) and on window focus, for the
web build where the edit happens in a hub tab.

⚠️ Two traps in that handler. `useProfile().refresh` is a **new arrow function
every render**, so it is held in a ref rather than listed as an effect
dependency — otherwise the focus listeners are torn down and rebuilt on every
render. And the burst-throttle is **half a second**: at a second and a half it
swallowed the very case it exists for (close the dialog, go straight back to
the menu) and the fix looked like it had never worked. Pinned by
`npm run test:profile`.

### `?mockauth=1` — a signed-in app with no account

A **dev build only** (`import.meta.env.DEV`, statically false in anything
shipped) accepts `?mockauth=1`, which hands the SDK its offline fixture world:
signed in as james@unisim.co.uk in org "UNI·SIM Demo", no network. Useful for
eyeballing the signed-in chrome; `e2e/actions-menu.e2e.mjs` runs on it.

⚠️ It cannot express a row **changing** — its `profiles` select returns one
frozen object — which is why `e2e/profile-identity.e2e.mjs` seeds a session
into `universal-suite-auth` and stubs `/rest/v1/*` itself instead.

## Hosted backups — and the `pending` path that broke every one of them

**Back up → "Hosted by UNI·SIM"** keeps a flattened PDF in the private
`hosted-uploads` bucket against the user's Universal ID for one token, refunded
on delete. `src/lib/hostedStore.ts` does the work; `src/lib/hostedPaths.ts` owns
the object names.

### ⚠️ `hosted_uploads` grants members SELECT and nothing else

Migration 0041 enables RLS on `public.hosted_uploads` and creates exactly two
policies: `hosted_uploads_member_read` (`for select`) and a platform-admin
`for all`. There is **no member UPDATE policy in 0041–0127**, on purpose — the
consume/refund RPCs are meant to be the only writers.

The store flow ignored that and was written in three steps:

1. `consumeHostedUpload({ storagePath: 'pending' })` — reserve the token,
2. upload the bytes to `<org_id>/pdf/<upload_id>-<stem>.pdf`,
3. `UPDATE hosted_uploads SET storage_path = <the real path>`.

**Step 3 matched zero rows on every account that isn't the platform admin**, and
PostgREST reports that as a perfectly ordinary success — no error, just `0`.
The call site never looked at the result. So the ledger kept saying `pending`
for every hosted PDF ever stored, which produced the bug report:

> *"Desktop app shows I have a backed-up PDF with my Universal ID but when I
> click open it says object not found."*

The list is read from the ledger, so the backup appears; opening it asked
storage for an object literally named `pending`, which does not exist and never
did — while the real file sat safely in the bucket the whole time. `pending`
also has no org-id first segment, so it fails the bucket's read policy
(`storage.foldername(name)[1]`) as well as being absent: two independent
reasons for the same "Object not found".

**Blast radius beyond the Open button.** The `pdf-sign-request` Edge Function
mints its recipient signed URL from the same column, so "Send to sign" was
handing out links to `pending` too.

### What the fix does

* **Name the object before reserving the token.** `hostedPdfPath(orgId,
  newObjectId(), fileName)` is computed first and passed to
  `consumeHostedUpload`, so the RPC's own insert records the truth and the
  update that RLS was blocking no longer exists.
* **Recover the rows already filed as `pending`.** The old path was fully
  determined by data still on the row — `<org_id>/pdf/<id>-<safeStem(file_name)>.pdf`
  — so `hostedPdfPathCandidates()` rebuilds it and `openHostedPdf` tries each
  candidate in turn. Existing broken backups open; nothing has to be migrated,
  re-uploaded or apologised for. ⚠️ **This is why `safeStem` must never drift.**
  It is pinned by `npm run test:hosted-paths`.
* **Fail honestly when there really is nothing there.** Only then does
  `openHostedPdf` throw `HostedObjectMissingError`, and `HostedStoreDialog`
  answers it against the row itself: which file, that the upload never
  finished, and one button to clear the entry and take the token back. A
  network or session failure is deliberately NOT reported that way — inviting
  someone to delete a document that is fine would be worse than the original
  bug.
* **Delete every candidate.** `deleteHostedPdf` removes all of them, so
  refunding a legacy row cannot orphan its real object in the bucket.

### The same bug reached this app through ANOTHER app's saves

`src/lib/qr/library.ts` lists the QR codes you saved in **Universal QR**, so it
reads `hosted_uploads` rows this app never wrote — and it read `storage_path`
raw. Every legacy `pending` QR row therefore missed both its `.json` design
sidecar and its PNG.

⚠️ **And it failed SILENTLY.** `loadHostedQrDesigns` drops an upload it cannot
fetch, deliberately, so that one stale row cannot empty the whole shelf. The
result was not an error message: it was a QR code that simply was not in the
list. Nothing to report, nothing to search for.

`src/lib/hostedQrPaths.ts` rebuilds those paths, and both the sidecar lookup and
the PNG fallback now walk every candidate.

⚠️⚠️ **It does NOT reuse `safeStem`, and must not.** Universal QR's stem is the
filename with its extension dropped and nothing else; `safeStem` lowercases and
slugs. `My Code.png` becomes `My Code` there and would become `my-code` here —
a path that never existed. Because the loader swallows a miss, that mistake
would look exactly like "the fix didn't help" rather than like a bug. The two
functions are asserted to be *different* in `npm run test:hosted-paths`, and the
slugging version is one of the three sabotages that suite is proven against.

⚠️ **This file mirrors `Universal_QR/src/lib/hostedPaths.ts` and must not drift
from it.** Universal QR names these objects; this app only reads them.

⚠️ **The same three-step flow is copied verbatim into Universal Images, QR,
Exports and Recorder** (`src/lib/hostedStore.ts` / `hostedRecordings.ts` in
each). They have the identical bug and are untouched by this repo's fix. The
alternative, one-line server fix — a member UPDATE policy on `hosted_uploads`
— would repair all five at once but needs a migration in `universal-platform`.

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

## Selected-object affordances (🗑 and ✓)

Anything selected gets a **bin** just off its top-right corner and, beside it, a
**tick** — *keep this and deselect*. Contextual buttons stack *beneath* the bin
rather than extending that row (the QR ✏️, the Fill 🪣, the ⬛ Redact), so an
object against the right margin of a narrow screen doesn't push them off the page.

⚠️ **The tick shows on every selection** (James, 2026-08-29). It used to be gated
on `PLACEMENT_TOOLS.has(tool)` — visible only while a tool that stays armed after
placing was still armed — which meant the pair of buttons came and went for
reasons invisible from the screen, and a plain selection offered exactly one
visible outcome: delete. It still only calls `setTool('select')` when a tool was
actually armed; with Select active there is nothing to go back to.

## Redaction

A **redaction** is a `RedactAnnotation` — a rectangle whose page is *rasterised*
on export, so the text underneath is destroyed rather than covered. That makes it
the one annotation type that is not reversible once the file is written, which is
why the typed **REDACT** gate exists (see
["Leaving a document with amendments"](#leaving-a-document-with-amendments)).

**Three doors, one tool.** Actions → Redact → *Free draw*; Actions → Redact →
*Find and redact* (search, then box every match); and the landing page's
**"Redact text — make portions unreadable to humans and machines"**, under the
chevron beside *1 Click Compress*. The landing door opens the PDF **and arms the
tool** — `LandingPage.onRedactFile` waits on `openFiles()`, which returns whether
a document actually opened, so a failed load can't leave the tool armed over
nothing.

### The box says what it is

While you are editing, a redaction wide enough to hold it renders
**"This will be redacted on export"** across itself. Without it a black rectangle
is indistinguishable from a `rect` you have filled in, and the difference between
those two is the entire point — one hides pixels, the other deletes text.

⚠️ **It can never reach an exported file, structurally.** The hint is a Konva
`Text` drawn by `AnnotationLayer`; the export path is
`export.ts` → `rasterizePageWithRedacts`, which re-renders the page through pdf.js
and paints the block *and nothing else*. `PresentMode` doesn't use
`AnnotationLayer` either, so presenting is clean too. Don't "helpfully" move the
hint into the annotation model — that is what would leak it.

The hint is a sibling of the `Rect`, not a `Group` wrapping both: `common` carries
the Transformer ref and the resize handler reads `width()` / `height()` off that
node, which a Group does not report.

### The fill colour is the toolbar's colour

`RedactAnnotation.fill` is a **hex string**, taken from the same swatches that
colour everything else. There is no separate redaction palette any more (2026-08-29):

- `annotationStore.setColor` writes `fill` for a redaction and `color` for
  everything else. That branch is the *only* place that knows the difference.
- ⚠️ **Boxes drawn before this stored the WORDS `'black'` / `'white'`**, and an
  old `.unipdf` backup still carries them. Every reader — the canvas, the export
  bake, the bucket — goes through **`redactFillHex()`** in `lib/redactGate.ts`.
  Never test `fill === 'white'` yourself.
- A pale fill gets an editor-only 1px outline and a slate hint, via `isPaleFill()`
  — a white box on white paper is otherwise invisible until it is exported.
- `FindBar`'s two swatches *set* the shared colour rather than storing a second
  copy, and show a third read-only chip when the armed colour is neither.

### Converting between a redaction and a shape

Both directions are one button, in the same slot, each offering the other state
(`AnnotationLayer`, beneath the Delete affordance):

| Selected | Button | Becomes |
|---|---|---|
| `rect` / `ellipse` | ⬛ *Redact this area* | a `redact` over the same box |
| `redact` | 🪣 *Turn into a filled shape* | a filled `rect` keeping the colour |

Neither destroys anything — export is the point of no return — so both stay
frictionless and undoable. The ⬛ direction *adds* protection and is silent; the
🪣 direction *removes* it and says so in its tooltip. The one-way `rect → redact`
prompt ("the text is still readable, redact instead?") is a separate thing: it
fires when you FILL a shape, not when you convert one.

## QR codes (Add QR code)

The **QR button** in the toolbar (desktop: beside the image button; mobile:
beside *Image*) opens a cut-down Universal QR — a link box and six style
presets — and drops the generated code onto the page.

**It is an image annotation, not a new type.** "Add to page" renders a
1024 px PNG, hands it to `setUploadedImageSrc` and arms the existing `image`
tool, so the code is placed, moved, resized, undone and baked into the export
by machinery that already existed. Placed at the default ~200 pt that works out
around 360 dpi, so the code still scans off a printed page.

### The shelf: your Universal QR codes

Under the controls, a signed-in user gets a strip of the codes they already
have. **Three stores, not one filter** (`src/lib/qr/library.ts`):

| Shelf | Where it lives | Marked with |
|---|---|---|
| This device's saves | Universal QR's `localStorage`, readable because both apps are served from the same origin in production | nothing |
| Account saves | `hosted_uploads` (product `'qr'`) + a `.json` design sidecar | a small cloud |
| **Dynamic codes** | rows in `qr_dynamic_codes`, read through that table's member RLS | an orange **↻** |

Dynamic codes were added on 2026-08-29 and are listed **first**: they encode a
redirect the owner can re-aim after the document is printed, and they count
their scans, so they are the ones worth reaching for in something going out.
They are not hosted uploads and never were, which is why they appeared in
neither of the other two shelves and nothing surfaced the gap.

⚠️ **The ↻ is deliberately not the cloud.** Both live on the account; only a
dynamic code keeps changing after it is on the page.

Since migration **0129** each row carries the design it was created wearing, so
a dynamic code lands here looking as it does in Universal QR; a row from before
that falls back to `DEFAULT_DESIGN`, which is what Universal QR does for it too.
⚠️ **`design.data` and `design.name` are empty on the row by contract** — the
payload is the redirect and the label is the row's `name`, both set here on the
way out. A renamed or re-pointed code must not arrive drawing a stale copy of
either. `DYNAMIC_BASE` is duplicated from Universal QR rather than shared, and
safe to duplicate for one reason: it is baked into the pixels of codes already
printed, so it cannot change.

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

`QrDesign`, the six presets, the shaped-plate geometry, the decoration and the
canvas/SVG composites all live in **[@unisim/qr](https://www.npmjs.com/package/@unisim/qr)**
(`universal-platform/packages/qr`), shared with Universal QR. What is left in
`src/lib/qr/` is this app's own layer:

| File | What it is |
|---|---|
| `design.ts` | placing a code on a page (`QrPlacement`), tenant branding as an overlay (`withBranding`), and the preset chips' captions |
| `render.ts` | `renderQrPng` — the package's composite at this app's placement size — and pulling a company mark into a data URI |
| `download.ts` | saving the rendered code as a file |
| `library.ts` | reading the codes you saved in Universal QR (this browser's, and your account's) |

⚠️⚠️ **THIS USED TO BE A COPY, AND THE COPY DRIFTED.** Until 2026-08-29 this
directory held a hand-taken port of Universal QR's whole model, "kept
deliberately faithful" and verified pixel-identical on the day it was taken.
Universal QR added `starPlacement` and `starColor` on 2026-08-24; the port got
them on 2026-08-28. For four days a star designed there rendered here as a
different picture — a small black-and-white code on a white plate instead of
an orange star with the code in front.

It failed **silently**, and that is the part worth remembering: an incoming
design is merged over `DEFAULT_DESIGN`, so a field the reader has never heard
of is dropped without a word. There is no error, no warning, nothing in a
console — the user simply gets a different code from the one they saved. One
package is the fix; do not start a second copy.

⚠️ The one rule the geometry keeps: **the code itself is never clipped** to a
shape. A silhouette is only ever the *plate* the code sits on — the code is
rendered smaller and centred in the largest square that fits. The single
exception is `starPlacement: 'behind'`, which keeps the rule from the other
side: the star is drawn UNDER a code that overlaps its notches, so the code is
whole and the star is what gets covered.

**Policy this app keeps for itself.** It renders EVERY design through the one
composite (`renderQrCanvas`), square codes included, so the plate, the
decoration and the corner stamp cannot drift apart; Universal QR keeps a plain
path for square codes and only shapes reach the composite. Different entry
point, same drawing code.

**Bundle cost.** The package inlines the UNI·SIM mark as a data URI (~64 kB)
rather than fetching it, which is what makes the two apps' output identical
rather than merely similar — this app used to load `unisim-icon.png` from
`BASE_URL`. That pushed the main chunk past workbox's 2 MiB precache ceiling,
so `maximumFileSizeToCacheInBytes` is raised in `vite.config.ts`. The QR editor
is the obvious thing to code-split out of the first load if that needs to come
down; it is reached only from `<QrDialog />` in `App.tsx`.

Pinned by `npm run test:qr-star`, which renders a Universal-QR-authored design
through a real browser and measures the pixels.

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

⚠️ **No sidecar was ever actually stored until 2026-08-28.** The
`hosted-uploads` bucket carries a MIME allow-list (platform migrations 0041,
restated in 0095) that had no `application/json` on it, so storage refused
every sidecar — silently, because `upload()` reports a refusal in `error`
rather than throwing and Universal QR's best-effort `.catch()` never looked.
Every account save was therefore PNG-only, and placing one here gave a flat
picture whose double-tap opened *Signature options* (what any plain image
gets). Migration **0128** widens the allow-list; saves made before it stay
PNG-only, because a design cannot be recovered from a rendered code.

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

### ⚠️ Never read the shell's `IStream` lazily — it deadlocks Explorer

The single most important rule in this folder, learned the hard way in v0.6.8
(`19b6e63`). Both the thumbnail provider and the preview handler are handed an
`IStream` by the shell. **That stream is a COM proxy marshalled back into the
calling process.** PDFium used to read the document through it *lazily*, which
means the reads happen inside `LoadPage` / `RenderPageBitmap` — i.e. inside
`WM_PAINT`. A repaint therefore made an outbound COM call into Explorer while
Explorer was blocked waiting on us, and the desktop froze on every click of a
PDF. Windows logged it as `explorer.exe` **`AppHangXProcB1`** — the *X* is
cross-process, and it says the hung process was waiting on someone else, which
is what points at your own outbound call rather than at your rendering.

So: `Pdfium.cpp` **copies the whole stream into memory once, on the shell's own
call thread**, drops the stream, and serves every later read with `memcpy`.
⚠️ Documents over **256 MB** are refused rather than buffered — a blank preview
pane is something a user recovers from; a hung Explorer is not.

⚠️ **`thumbtest sealed` is the regression test, and it only works on a
MULTI-PAGE document.** It hands the handler a stream that fails every read the
moment `DoPreview` returns, then **turns the page**. The first version of it
passed with *and without* the fix, because PDFium reads a small file greedily
while parsing, so re-rendering page one touches the stream not at all — a
vacuous test that looked green. The release workflow generates an **8-page** PDF
with pdf-lib and runs it there: 8 reads after sealing without the fix, 0 with
it. If this test is ever changed, prove it still fails on a reverted `Pdfium.cpp`.

The same DLL also hosts the **`IPreviewHandler`**
(`native/win-thumbnail/src/PreviewHandler.cpp`), so with Universal PDF as the
default the Explorer preview pane (Alt+P) shows the document itself — toggled
from home → System options, one UAC prompt.

Since **v0.6.15** the pane **stacks its pages**, fitted to the pane's WIDTH and
scrolled continuously, instead of drawing one page fitted to the whole pane —
which left two thirds of a tall pane empty on a landscape deck. Only the visible
pages are rendered and their bitmaps are dropped as they scroll off, and the
layout is measured with `PdfDocument::PageSize()` (the page dictionary, not a
parsed page), so a 500-page document opens as fast as a 6-page one. `thumbtest
stack` is its regression test; the detail is in `native/win-thumbnail/README.md`.

⚠️ The elevated half of that switch goes Node `execFile` → `powershell
Start-Process -Verb RunAs reg.exe`, and **`-ArgumentList` must be ONE
pre-quoted string**: Windows PowerShell joins an argument *array* with spaces
and no quoting, so the spaced handler name reached reg.exe as three bare words
— `reg add` refused while Start-Process exited 0, and the switch blamed the
user's UAC choice. `electron/previewPane.cjs` carries the correct form (fixed
in `416039e`, shipped v0.6.5). The switch verifies by re-reading the registry
value afterwards — keep that; it is why this bug was visible at all.

⚠️ **The DLL must name the 64-BIT preview surrogate**
`{6d2b5079-2f0b-48dd-ab7f-97cec514d30b}` (`system32\prevhost.exe`) as its
AppID — not `{534A1E02-D58F-44f0-B58B-36CBED287C7C}`, which is the 32-bit host
in `SysWOW64`. 64-bit Explorer starts whichever surrogate the AppID names, a
32-bit process cannot load our x64 DLL, and **nothing is reported anywhere**:
the pane just stays as it was. Every build through v0.6.5 shipped the 32-bit
GUID — in `Common.h` *and* `build/installer.nsh`, under a comment claiming it
was the 64-bit one. When a shell extension does nothing at all, check the
AppID's bitness first. Fixed in `0df333a`, shipped v0.6.6.

⚠️ **`thumbtest preview` cannot catch that, by design** — it activates
`CLSCTX_INPROC_SERVER`, loading the DLL into the test process to exercise the
drawing code, so it never consults the AppID and passed on every broken build.
**`thumbtest hosted`** activates `CLSCTX_LOCAL_SERVER` exactly as Explorer
does; the release workflow registers the freshly built DLL and runs it. Keep
both: one tests the rendering, the other tests the plumbing.

⚠️⚠️ **`CoCreateInstance` resolves through the REGISTRY, so `hosted` and
`preview` test whatever DLL is registered on the machine — not the one you just
built.** Several runs during the v0.6.8 work were meaningless for this reason:
they were exercising the *installed* build while the fix sat unregistered in
`native/win-thumbnail/build/`. Register the dev build explicitly (or run the
release workflow's own register step) before believing a result. Every COM test
harness has this hole by default, and nothing about a passing run reveals it.

⚠️ **The default PDF app does not gate the preview handler.** That was blamed
once and was wrong;
`AssocQueryString(ASSOCSTR_SHELLEXTENSION, ".pdf", IID_IPreviewHandler)`
returns our CLSID regardless of which reader owns the association.

⚠️ **Windows will not preview a file carrying MOTW** (`Zone.Identifier` — i.e.
anything downloaded) whatever the handler does: Explorer shows "The file you
are attempting to preview could harm your computer". Unblock it in the file's
Properties before concluding the handler is broken.

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

## Desktop icons — three silhouettes, all generated

Since v0.6.9 the desktop artwork comes from the canonical mark pipeline, not
from hand-drawn files. The generator lives in the platform repo —
`backoffice/universal-platform/scripts/app-marks/desktop-icons.mjs` — and is run
per app:

```sh
cd backoffice/universal-platform
node scripts/app-marks/desktop-icons.mjs Universal_PDF
```

It writes three things into `build/`, and `package.json`'s `build` block points
at them:

| File | Used as | Why it looks like that |
|---|---|---|
| `app-icon.png` (1024px) | `win.icon` / `mac.icon` / `linux.icon` | the mark on its tile — the app itself |
| `document-icon.ico` **and** `.icns` | `fileAssociations[].icon` | a **page**: portrait, notched corner, the mark small in the corner. A different *outline* from the app, which is the point — a file and a program must not read as the same kind of thing |
| `installer-icon.ico` | `nsis.installerIcon` / `uninstallerIcon` | the mark with the real UNI·SIM globe as a corner seal: which app first, whose suite second |

⚠️ **`document-icon.icns` is not optional even though we build the Windows
association.** electron-builder resolves a `fileAssociations` icon by **swapping
the extension per platform**, so naming a `.ico` obliges a matching `.icns` and
there is no way to name one file for both. v0.6.9 shipped with the mac jobs dead
(`cannot find specified resource "build/document-icon.icns"`) while Windows and
Linux went green; v0.6.10 (`8221206`) exists solely to restore the DMGs. On a
release, **read all four platform jobs** — the asset count is the cheapest tell
(5 where 9 is expected).

⚠️ **`build/pdf-document.ico` is a different file and must stay.** It is the
badge the native thumbnail provider composites into the rendered page
(`BADGE_ICO_PATH` in `native/win-thumbnail/CMakeLists.txt`), not a
file-association icon. Deleting it as a duplicate breaks the thumbnails.

## Being the default PDF app, and saying what currently is

`electron/defaultApp.cjs` asks the shell what will actually open a `.pdf` and
compares it with our ProgId.

⚠️⚠️ **`HKCU\...\FileExts\.pdf\UserChoice\ProgId` is NOT the answer to that
question, and reading it is the bug this had until v0.6.15.** On 2026-08-28 the
app said *"PDFs currently open in Adobe Acrobat Document"* while Windows
Settings showed Universal PDF holding `.pdf` — and **Settings was right**. That
UserChoice value still named `Acrobat.Document.DC`, written 2025-11-04, and the
shell had stopped honouring it: the installer writes `HKCU\Software\Classes\.pdf`
(which wins the `HKCR` merge), and both
`IApplicationAssociationRegistration::QueryCurrentDefault` at **`AL_EFFECTIVE`**
and `AssocQueryString(ASSOCSTR_EXECUTABLE)` resolved `.pdf` to
`Universal PDF.exe`. A stale UserChoice is invisible: nothing prunes it, and it
reads as a perfectly good answer.

So the probe is now `QueryCurrentDefault(".pdf", AT_FILEEXTENSION, AL_EFFECTIVE)`,
with the registry read kept only as a fallback. It is a COM interface with no
`IDispatch`, which Node cannot reach, so it goes out through `powershell
-EncodedCommand` (encoded because the C# it carries is full of double quotes and
a mangled command line would come back as a *blank* answer, indistinguishable
from "no association"). Measured at **419 ms**.

⚠️ The earlier verdict in this file — *"the detection was never broken"*, from
the 2026-08-27 investigation of a backlog item claiming it "never confirms on
Windows" — was right about its own evidence and wrong as a conclusion. The
comparison was sound and the registration complete (`RegisteredApplications`,
`Capabilities`, `.pdf\OpenWithProgids` all present); the check was simply
**asking the wrong registry key**, and only a machine where UserChoice and the
effective default disagreed could show it. It stays true that **Windows 11
requires `.pdf` to be picked inside the app's own Settings page with `Set
default` pressed**, and that Acrobat reclaims the type on its own schedule.

The real defect was **silence**: a correct "no" looked like a broken check. So
since `8477349` the offer pill names the incumbent — "PDFs currently open in
Adobe Acrobat Document", read from `HKCR\<ProgId>`'s default value — and says
which button Windows is waiting for. Worth remembering generally: a bug report
about detection is often a report about silence.

## Which build am I running

⚠️ **The changelog panel cannot answer this.** Its version chip is the *feed's*
latest release, fetched live from `changelog.unisim.co.uk` with
`cache: 'no-cache'`, so a desktop app three versions behind shows today's
entries under today's chip. `__APP_VERSION__` was compiled into the bundle and
displayed nowhere at all, and an afternoon on 2026-08-27 went on establishing
which build was installed on a user's machine.

The landing footer now shows `v0.6.x`, with `APP_BUILD_LABEL` (top of
`src/App.tsx`) as its `title`: **"Universal PDF 0.6.10 · Windows desktop"**. The
platform is half the answer — the same bundle is the website, the installed
desktop app and the phone PWA, and they update on entirely different schedules,
so the version alone does not identify the copy in front of you.

⏳ **Still to wire:** `@unisim/sdk`'s `ChangelogMenu` takes an optional
`appVersion` prop (added in `universal-platform@5bff64c`, shipped in SDK
0.112.0) that renders the same label in the changelog panel's footer — where
James asked for it. `App.tsx` carries a ⏳ comment at the exact spot; it needs
the `@unisim/sdk` dependency bumped to `^0.112.0` first, or CI fails to build on
an unknown prop.

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
