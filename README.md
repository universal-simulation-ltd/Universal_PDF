# Universal PDF

> Universal PDFs that just work — free and open source PDF viewer + editor.

> Open source — self-host free or PRO hosted by UNI SIM.

A clean Progressive Web App for viewing, annotating, and signing PDFs — works on Windows, macOS, iOS, and Android in any modern browser, with no upload to a server. Files stay on your device.

**[Try the live app →](https://pdf.unisim.co.uk/)**

## Features

- **View** multi-page PDFs with zoom (50%–300%), pinch-to-zoom on touch, and a thumbnail navigator
- **Open Word and OpenDocument files** — drop a `.docx` or `.odt` on the circle and it is converted to a PDF *on your device* (nothing is uploaded), then opens ready to annotate and sign. Headings, bold/italic, bulleted and numbered lists, tables and links all come across as real, selectable text. The page layout is re-typeset rather than copied, so fonts, columns, headers/footers and floating shapes will differ — the app says so when it opens one. Word 97–2003 `.doc` is not supported; save it as `.docx` first
- **Select text** — the *Select text* tool (in the Select ▾ menu) lets you drag over the PDF's own text and copy it (Ctrl/⌘C)
- **Make searchable (OCR)** — turn a scanned / image-only PDF into a searchable, selectable one *entirely on your device* (no upload). Find, copy and redact-by-search then work. The OCR engine downloads once on first use, then works offline
- **Annotate** with free draw, text, rectangles, ticks, and crosses, in any of six colours
- **Sign** by drawing on a pad; signatures are auto-cropped, saved to your device, and re-usable across PDFs
- **Sign on your phone** — the pad can show a UNI·SIM QR + PIN; scan it, draw on your phone, enter the PIN, and the signature lands on the desktop ready to place (works from the desktop app too)
- **Edit** placed annotations — drag to move, resize handles on shapes and signatures, double-click text to retype, change colour and size of selected text on the fly
- **Add a QR code** — the QR button in the toolbar generates one from any link or text, in six styles (square, rounded, dots, circle, star…), and drops it on the page like any image. Placed codes keep an ✏️ button: click it (or double-tap the code) to bring the generator back up on that code and change the link, the style or the branding in place. Codes you've saved in [Universal QR](https://opensource.unisim.co.uk/qr) show up in the dialog ready to place, with nothing to sign into
- **Export** the annotated PDF; all annotations and signatures are baked into the saved file
- **Recents** are remembered locally so you can reopen a PDF with one tap, even offline
- **Installable** PWA — add to home screen on phone or install on desktop, works offline after first load

## Install on your device

Open the [app URL](https://pdf.unisim.co.uk/), then:

- **iOS Safari**: Share → *Add to Home Screen*
- **Android Chrome**: menu → *Install app*
- **Desktop Chrome / Edge**: install icon in the address bar

## How to use

1. **Open a document** — drop a PDF, Word (`.docx`) or OpenDocument (`.odt`) file on the circle, click it to browse, or drag-and-drop anywhere on the page. Word and ODT files are converted to PDF on your device first
2. **Pick a tool** from the toolbar (Text, Draw, Tick, Cross, Rectangle, or Sign)
3. **Click / tap on the page** to place the annotation
4. **Switch to *Select*** to drag, resize, recolour, or delete existing annotations — or *Select text* (same menu) to drag over and copy the PDF's own text
5. **Save** to download the annotated PDF

Signatures: tap *Sign → Draw new signature*, sign with mouse or finger, save. Pick it from the menu, then tap on the PDF to place. Drag the corners to resize, drag the body to reposition.

## Development

Requires Node 22+ and npm.

```sh
git clone https://github.com/universal-simulation-ltd/Universal_PDF.git
cd Universal_PDF
npm install
npm run dev
```

The dev server runs at <http://localhost:5173>. Build for production with `npm run build`.

Pushes to `main` auto-deploy via Cloudflare Pages, which serves the app at <https://opensource.unisim.co.uk/pdf>. The production build sets Vite `base: '/pdf/'` and ships a `public/_redirects` file that rewrites `/pdf/*` onto the flat `dist/` output.

Each build bakes the commit SHA into a `<meta name="build-sha">` tag and logs `build: <sha>` to the console at startup, so you can tell which build is live in-browser. On Cloudflare Pages the SHA comes from `CF_PAGES_COMMIT_SHA`; locally it falls back to the git short SHA (or `dev`).

## Desktop app (Windows)

The same client-side app can be packaged as a native desktop app with
[Electron](https://www.electronjs.org/). The Electron main process lives in
[`electron/main.cjs`](electron/main.cjs) and loads the built bundle; the
`desktop` Vite mode builds with a relative `base` (`./`) and without the PWA
service worker so assets resolve over `file://`.

```sh
npm run build:desktop   # build the web bundle for Electron (dist/)
npm run electron        # run the packaged-style app against that build
npm run dist:win        # build + produce a Windows installer in release/
```

The installer registers Universal PDF as a `.pdf` file handler, so it appears
in Windows' right-click *Open with* menu (and can be made the default PDF
app). Files opened that way — or double-clicked while it's the default — load
straight into the editor, skipping the landing page; opening another PDF while
the app is running reuses the existing window.

`npm run dist:win` emits an NSIS `.exe` installer under `release/`. **It must
run on Windows** (or Linux/macOS with Wine) because electron-builder packages a
platform-native binary; cross-building from a plain Linux host won't produce a
working Windows `.exe`. The first run downloads the Electron binary (~100 MB).

To cut a release, push a `v*` tag — the
[`build-windows`](.github/workflows/build-windows.yml) workflow builds the
installer on `windows-latest` and attaches it to the matching GitHub Release.
Manual `workflow_dispatch` also works for ad-hoc builds; the installer is
uploaded as a workflow artifact in that case.

## Stack

- **Vite 6 + React 18 + TypeScript** — app shell
- **pdfjs-dist** — PDF rendering (Mozilla)
- **pdf-lib** — PDF export with annotations baked in
- **tesseract.js** — on-device OCR (WASM), lazily loaded for the "Make searchable" tool
- **react-konva** — canvas overlay for shapes, text, freehand, and signatures
- **Zustand** — state management
- **IndexedDB** — recent files (binary bytes)
- **localStorage** — saved signatures
- **Tailwind CSS v4** — styling
- **vite-plugin-pwa** — service worker + manifest

## Contributing

Issues and pull requests welcome. The project is intentionally small and dependency-light; please open an issue before adding a large feature.

## License

[MIT](./LICENSE).
