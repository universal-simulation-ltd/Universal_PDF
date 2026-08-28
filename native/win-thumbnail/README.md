# Explorer thumbnail provider and preview handler (Windows)

Makes a `.pdf` in File Explorer show **page 1 of the document** with the app
badge in the bottom-right corner, the way VLC shows a video frame with its cone.

This cannot be done from the Electron app. Explorer never asks an application
for a thumbnail — it looks up an `IThumbnailProvider` COM server for the file's
class and calls that. So this folder builds `UniversalPdfThumb.dll`, a small
native shell extension that ships beside the app and is registered by the
installer.

```
src/     the DLL: COM plumbing, the PDFium render, the badge composite,
         and the preview-pane handler
test/    thumbtest.exe — drives both, with and without the shell
scripts/ build.ps1 (Windows) and build.sh (Git Bash), output staged in dist/
```

The one DLL carries **two** COM objects: the thumbnail provider
(`{9D3AE6B2-…}`) and the preview handler (`{7A337FC1-…}`), which the class
factory tells apart by CLSID.

## What it draws

- **Page 1**, fitted to whatever size the shell asked for, on opaque paper with
  a hairline edge — a white page on a white Explorer background otherwise has no
  edge at all and reads as a hole.
- **The badge** from `build/pdf-document.ico`, bottom-right, at 24% of the page's
  shorter side and capped at 128px. Dropped below 48px, where it would cover
  most of the page and the shell is really asking for an icon.
- **A fan**: one sheet behind a two-page document, two for anything longer,
  none for a single page — so the stack is information rather than decoration.
  Each sheet turns 3.5 degrees further about a pivot below the page, drawn with
  GDI+ so the angled edges are antialiased. The fan comes out of the same box
  the shell asked for, so the whole composition is measured first and the page
  fitted to what is left; everything the fan does not cover is transparent.
- **Pages 2 and 3 on those sheets, for real**, from 256px up — two extra renders
  inside the shell's budget, which is only worth spending where enough of them
  shows to tell (about 70 ms for all three at 384px, against 45 ms for one).
  They are rendered at **half** the front page's resolution, since barely a
  tenth of each sheet is visible and it is drawn at an angle, and are **fitted**
  inside the sheet rather than stretched to it — a deck whose page 2 is a
  different shape then letterboxes onto paper instead of distorting. A page
  that will not render leaves its sheet blank, as do all of them below 256px.
  ⚠️ `DrawImage` needs `WrapModeTileFlipXY`, or bicubic sampling reads past the
  source edge and leaves a pale halo down the one sliver that is visible.
- **A "120 Pgs" pill**, bottom-left, in the badge's navy with a white ring — it
  lands wherever the page happens to be, and navy on a dark page is invisible
  without one. It is drawn **exactly as tall as the badge and on the same
  margin**, so the two read as a matched pair across the bottom of the page,
  and the text is sized off the pill rather than the page. "Pgs" is dropped for
  the bare number, rather than shrunk, when a thumbnail has no room for it.
- The badge and the pill **share the page's width through one pair of helpers**
  (`BadgeEdge` / `BadgeMargin`). They cannot both have the width they would
  like at 256px, and the badge is the one that must not move.

⚠️ The pill is the only thing drawn with GDI, and **GDI writes nothing to the
alpha channel of a 32-bit DIB**, so every pixel it touches ends up transparent.
Alpha is restored across the pill's rectangle afterwards; it sits inside the
page, which is opaque everywhere, so that is both safe and sufficient.

## Building

```powershell
# from the repo root
npm run thumbnail:build
```

MSVC is used where it exists (that is CI); the MinGW toolchain under `D:\Qt` is
the fallback on the Windows dev box, which has no Visual Studio. Either way
PDFium's prebuilt Windows binaries are downloaded on first configure (pinned by
SHA-256) and `pdfium.dll` is staged next to ours.

Output goes to `dist/`, which `package.json` picks up as a Windows
`extraResources` entry, so `npm run dist:win` places both DLLs in
`resources\` inside the install directory. **If `dist/` is empty the installer
is still valid** — it simply ships without thumbnails — so a machine with no C++
toolchain can still package the app. The release workflow builds it with
`continue-on-error: true` for the same reason.

## Trying it locally

```powershell
cd native\win-thumbnail\build-x64        # or build-mingw
.\thumbtest.exe render ..\..\..\public\sample.pdf 256 out.png   # no shell involved
.\thumbtest.exe register                                        # HKCU, no admin
.\thumbtest.exe shell some.pdf 256 out.png                      # the real lookup
.\thumbtest.exe unregister
```

`render` proves the bitmap. `shell` proves the registration: it goes through
`IShellItemImageFactory`, which is the same path Explorer takes, and fails
exactly the way Explorer would.

⚠️ `shell` only produces our thumbnail for files whose **ProgID is
`UniversalPDF.Document`** — see below. If Acrobat or Edge is the default PDF
app, point it at a file with an extension mapped to our ProgID instead, or make
Universal PDF the default first.

## Design notes, and the things that will bite

**It is registered against our ProgID, never against `.pdf`.** There is one
thumbnail handler per file class. Claiming `.pdf` directly would take
thumbnails away from whichever reader the user actually chose — so the handler
hangs off `UniversalPDF.Document\ShellEx\{e357fccd-…}` and appears exactly when
Universal PDF is the default app. Acrobat does the same thing with its own
ProgID, which is why there is no handler on the bare `.pdf` key at all.

**⚠️ Explorer stamps its OWN app icon on thumbnails, and an empty `TypeOverlay`
is what stops it.** Left unset, the shell draws the application's icon — the
UNI·SIM globe — over the badge this provider already composited, half covering
it: two marks in one corner, neither legible. Writing an empty `TypeOverlay`
value on the ProgID suppresses the shell's overlay and leaves ours alone. Both
`installer.nsh` and the DLL's own `DllRegisterServer` write it.

It is not the ProgID's `DefaultIcon`, the CLSID's, `Applications\<exe>`, the
`Capabilities` `ApplicationIcon`, or a stale icon cache — all four were tried
and captured before `TypeOverlay` turned out to be the knob.

**It runs in `dllhost.exe`, not `explorer.exe`.** `DisableProcessIsolation` is
deliberately not written, so the shell hosts the provider in a COM surrogate: a
crash is a "COM Surrogate has stopped working" notification, not a dead desktop.
Verified by listing loaded modules during an extraction. A *hang* is the worse
failure — it stalls the shell's thumbnail queue for every file type — so the
provider renders page 1 only, caps the render at 1024px, and never shows UI or
prompts. An encrypted PDF returns `E_FAIL` and keeps the flat icon; there is no
way to ask for a password from here.

**`IInitializeWithStream`, not `IInitializeWithFile`.** The shell opens the file
and hands over an `IStream`, which is what allows the sandboxed surrogate to
host us. The stream is read through `FPDF_FILEACCESS` block by block, so a large
PDF is never pulled into memory to thumbnail its first page.

**Nothing links against `pdfium.dll.lib`.** Every entry point is resolved with
`GetProcAddress` from a `pdfium.dll` loaded by full path out of our own
directory. Two reasons: the host process is `dllhost.exe`, whose directory is
`system32`, so an implicit import would never be found; and the prebuilt import
library is MSVC's, while the dev box builds with MinGW.

**Explorer caches thumbnails** in `thumbcache_*.db`. A wrong or blank render
sticks around after the DLL is fixed — clear it with Disk Cleanup →
Thumbnails, or test against a file name the shell has never seen. `thumbtest
shell` deliberately does **not** pass `SIIGBF_MEMORYONLY`: that flag forbids
extraction and just returns `E_PENDING`.

**The DLL is locked while a surrogate holds it**, so an upgrade cannot overwrite
it and an uninstall cannot delete it. `build/installer.nsh` stops `dllhost.exe`
and falls back to `Delete /REBOOTOK`.

**x64 only, for now.** 64-bit Explorer will not load a 32-bit shell extension at
all, and ARM64 Windows needs its own build — `CMakeLists.txt` takes `-A ARM64`
and PDFium publishes an ARM64 archive, but the SHA is not pinned and CI does not
build it, so on ARM64 Windows no thumbnail appears.

**No signature is needed** for the shell to load a shell extension, so this does
not disturb the ship-unsigned policy.

## The preview pane (`IPreviewHandler`)

`src/PreviewHandler.cpp` is the Windows answer to macOS Quick Look: Alt+P in
Explorer, the pane on the right. It is **not** the thumbnail provider with a
bigger bitmap — the shell hands a preview handler a parent window and expects a
live child window back, so it owns an HWND, a window class, a wndproc and the
keyboard. `IPreviewHandlerVisuals` supplies the pane's own background, text
colour and font, and `PdfDocument` in `Pdfium.cpp` holds the file open across
all of it.

**The pages are STACKED, fitted to the pane's WIDTH, with a continuous scroll**
(v0.6.15). It used to draw exactly one page fitted to the *whole* pane, which
is fine for a portrait document and wastes two thirds of a tall pane on a
landscape slide — the complaint that changed it. So the handler keeps a scroll
offset rather than a page index:

- Every page is **measured** up front by `PdfDocument::PageSize()`, which reads
  the page dictionary through `FPDF_GetPageSizeByIndexF` **without parsing the
  page**. That is what makes it affordable: a 500-page document lays out in the
  same time a 6-page one does (measured, 1.50 s either way).
- Only the pages **actually on screen** are rendered, and each bitmap is thrown
  away as it scrolls off — 500 pages must never mean 500 bitmaps.
- Painting is **double-buffered**, because scrolling repaints the whole pane.
- PageUp/PageDown still **jump** page to page; the arrows nudge; Home/End go to
  the ends; the wheel scrolls, accumulating sub-notch deltas so a precision
  touchpad is not ignored. There is a real scrollbar, kept visible even when
  the document fits (`SIF_DISABLENOSCROLL`) so the client width never changes
  underneath a layout that was measured for it.

```powershell
.\thumbtest.exe preview some.pdf out.png      # what the pane draws
.\thumbtest.exe preview some.pdf out.png 2    # after two page-downs
.\thumbtest.exe stack landscape-deck.pdf      # asserts the stack
```

`stack` is the regression test for the above: more than one page on screen
wherever the page shape allows one, somewhere to scroll, and PageDown/End/Home
moving it. It is **self-calibrating** — if page one is taller than the pane it
says so rather than failing, so a portrait document does not read as a bug. It
fails against the pre-v0.6.15 handler with *"page one ends 474 px above the
bottom of the pane and nothing follows it"*.

⚠️ **It is registered but not yet reachable, and the reason is not a bug.**
Windows only offers a preview handler whose CLSID is listed in
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\PreviewHandlers`. Every one of
the 17 handlers on a stock machine — Word, Excel, the Microsoft PDF previewer,
Adobe's — is there, **none is registered per-user**, and writing to HKLM needs
administrator rights, which a `perMachine: false` installer deliberately does
not have. Registered in HKCU only, the shell starts `prevhost.exe`, never loads
the DLL into it, and the pane says "This file can't be previewed." Confirmed by
watching prevhost's module list during a real preview.

So the handler ships, the per-user half of its registration is written, and the
machine-wide half is a decision about elevation that has not been taken.

⚠️ Two other things that look like failures but are not:

- **A file carrying a mark-of-the-web is refused by the shell before any handler
  runs** — "The file you are attempting to preview could harm your computer."
  Anything out of a browser or a synced cloud folder has one, which makes it an
  easy false negative when testing.
- **`PrintWindow` on a window parked entirely off every monitor returns TRUE and
  draws nothing**, because there is no composed surface to copy. The test host
  therefore sits at 0,0 without being activated.

## Other platforms

macOS needs none of this — QuickLook already renders PDF thumbnails, and a badge
would mean a QuickLook extension inside the app bundle and more signing surface
than it is worth. GNOME and KDE already thumbnail PDFs through poppler, where a
`.thumbnailer` file would be the cheap way in if the badge is ever wanted.
