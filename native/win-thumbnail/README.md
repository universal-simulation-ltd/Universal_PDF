# Explorer thumbnail provider (Windows)

Makes a `.pdf` in File Explorer show **page 1 of the document** with the app
badge in the bottom-right corner, the way VLC shows a video frame with its cone.

This cannot be done from the Electron app. Explorer never asks an application
for a thumbnail — it looks up an `IThumbnailProvider` COM server for the file's
class and calls that. So this folder builds `UniversalPdfThumb.dll`, a small
native shell extension that ships beside the app and is registered by the
installer.

```
src/     the DLL: COM plumbing, the PDFium render, the badge composite
test/    thumbtest.exe — drives it with and without the shell
scripts/ build.ps1 (Windows) and build.sh (Git Bash), output staged in dist/
```

## What it draws

- **Page 1**, fitted to whatever size the shell asked for, on opaque paper with
  a hairline edge — a white page on a white Explorer background otherwise has no
  edge at all and reads as a hole.
- **The badge** from `build/pdf-document.ico`, bottom-right, at 28% of the page's
  shorter side and capped at 128px. Dropped below 48px, where it would cover
  most of the page and the shell is really asking for an icon.
- **A stack**: one sheet peeking out behind a two-page document, two for
  anything longer, none for a single page — so the count is information rather
  than decoration. The sheets come out of the same box the shell asked for, so
  the page is fitted to what is left after their offset, and the notches they
  leave at top-left and bottom-right are transparent.
- **A "120 pages" pill**, bottom-left, from 160px up. It falls back to the bare
  number when the words would take more than half the page's width — better a
  readable count than a truncated one.

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

## Other platforms

macOS needs none of this — QuickLook already renders PDF thumbnails, and a badge
would mean a QuickLook extension inside the app bundle and more signing surface
than it is worth. GNOME and KDE already thumbnail PDFs through poppler, where a
`.thumbnailer` file would be the cheap way in if the badge is ever wanted.
