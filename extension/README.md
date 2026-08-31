# Universal PDF — browser extension (Chrome / Edge, MV3)

Click a PDF link in a browser and you get the browser's viewer. This extension
adds a second option: move the document you are already looking at into
Universal PDF, where you can annotate, sign, redact and export it — still
entirely on your own machine.

It is **additive on purpose**. A fresh install redirects nothing, intercepts
nothing, and can read no site at all. The browser's viewer keeps working exactly
as before; one click moves a document across. If you then want a particular site
to open in Universal PDF every time, you can grant that site — one site at a
time, never all of them.

There is no web-standard alternative to an extension here. `registerContentHandler()`
was the API for exactly this and was removed from browsers years ago. The
desktop app already claims the OS `.pdf` handler and the installed web app
appears in the OS "Open with" list, but neither can ever fire on a link clicked
*inside* a browser — the browser renders it in-process and the OS is never asked.

## Build it

```sh
cd /Users/jamesmarkey/Github/UNISIM/Universal_Apps/Universal_PDF
npm run build:extension
```

That writes `extension/dist/`. It is a completely separate artifact: `npm run
build`, `npm run build:desktop` and `npm run build:mobile` neither read nor write
anything under `extension/`, and nothing extension-shaped reaches the web,
desktop or mobile bundles.

Load it with **chrome://extensions → Developer mode → Load unpacked →
`extension/dist`**. Edge is the same at `edge://extensions`.

## Test it

```sh
cd /Users/jamesmarkey/Github/UNISIM/Universal_Apps/Universal_PDF
npm run build:extension && npm run test:extension
```

`e2e/extension.e2e.mjs` drives the real unpacked build in a real Chromium
against a local server that serves the four shapes a PDF actually arrives in.

## How a document reaches the viewer

Two routes, and they are not the same. The difference is the whole design.

**One click** (toolbar button, or right-click → Open in Universal PDF). The tab
is already showing the document, so the extension reads it back from *inside*
that tab. Measured on 2026-08-31 against a local server that counts requests:

| | extra requests to the site |
|---|---|
| ordinary cacheable PDF | **0** |
| PDF at an extensionless address | **0** |
| PDF behind a session cookie | **0** |
| PDF served `Cache-Control: no-store` | 1 (and it may fail — see below) |

The in-tab read is served from that tab's own HTTP cache, so for anything
cacheable the site is not asked twice at all, and the request carries the page's
own cookies either way. This route needs **no permission for the site**:
`activeTab`, which Chrome grants for the click itself, is enough.

**"Always use Universal PDF on this site"** works differently. The redirect
happens before any tab has rendered the PDF, so there is nothing to read back
and the viewer has to fetch the document itself — a genuine second request. That
is why it is opt-in per site, and why it asks for permission for that site.

### ⚠️ The one thing that cannot be made to work

A **single-use or expiring link served `no-store`** — a one-time download, a
file behind a form you just submitted, a URL with a token good for one fetch.
The browser has painted it and the bytes are in no cache, so asking again is a
second request the token will not answer. You get a 403 or 404.

This is not fixable in Manifest V3: nothing gives an extension the bytes the
built-in PDF viewer is holding. Containing it is most of why this extension
works by the click rather than by intercepting everything — the failure only
happens on a document you explicitly asked for, so it is attributable rather
than mysterious. The popup says so, with the status code, and leaves your tab
where it was.

### ⚠️ PDFs on your own computer (`file://`)

They need **"Allow access to file URLs"** switched on for Universal PDF in
`chrome://extensions`. That toggle cannot be requested programmatically —
Chrome only lets a person set it by hand. Until it is on, the popup says so
rather than failing silently. (`file://` also has no origin to grant, so
"always use on this site" does not apply to local files.)

## What it asks for, and when

| | when |
|---|---|
| `activeTab`, `scripting` | at install. Reads a page only for the click that invoked the extension. |
| `contextMenus`, `storage`, `declarativeNetRequest` | at install. None of them can reach a website on their own. |
| a site (`https://example.com/*`) | **only** when you switch that site on. Listed, and removable, on the extension's options page. |

There are **no `host_permissions` at install** and no static redirect rules. The
only `declarativeNetRequest` rules that ever exist are the per-site ones you
added, and each is scoped to one origin.

⚠️ A Chrome match pattern's host cannot carry a port, so the *permission* for
`https://example.com:8443` is necessarily `https://example.com/*` — host-wide.
The redirect rule does keep the port, so only that origin is redirected.

## What the automated spec does not cover

Three things live in browser chrome, where nothing can reach them. **All three
were checked by hand against Chrome on 2026-08-31 and all three passed** — so
what follows is the procedure to repeat per release, not an open question.

**0. The toolbar button itself.** The click is what makes Chrome grant
`activeTab`, and `activeTab` is what lets the extension read the page — so the
primary path is the one the spec can least reach. Confirmed: clicking the button
on a PDF tab opens it in our viewer with no permission prompt at all.


1. **The permission bubble.** Confirmed: it names that one host, and nothing
   else. `chrome.permissions.request` raises a prompt in
   the browser's own UI. Playwright cannot answer it, headless never settles it,
   headed does not either, and there is no Chromium switch to auto-accept —
   all four measured. The spec therefore proves the negatives against the real
   build (a fresh install holds nothing, cannot read a page, and cannot redirect
   even with a rule installed), and proves everything downstream against a copy
   of the same build with `host_permissions` added, asserting mechanically that
   the copy differs by that one key. **Worth doing by hand once per release:**
   tick "Always use Universal PDF on this site" on a real site and confirm
   Chrome's prompt appears, naming that site and no other.
2. **The right-click entry.** Confirmed: "Open in Universal PDF" does appear in
   the menu when you right-click inside Chrome's own PDF viewer — which was not
   obvious, since that is a plugin document rather than an ordinary page.
   Context menus cannot be driven from Playwright at all, so this one is
   hand-only, permanently.

## Not published

This is not on the Chrome Web Store. Publishing needs a developer account, a
listing, and a review — ask before doing it. Firefox is the same shape but
redirects through blocking `webRequest.onHeadersReceived` instead of
`declarativeNetRequest`; it has not been built. Safari is out of scope: it needs
a Safari Web Extension inside a signed Mac app shipped through the App Store,
and its interception is far more constrained.

## Files

| | |
|---|---|
| `manifest.json` | the manifest, version filled in from `package.json` at build |
| `src/background.js` | the service worker: reading a tab, the handoff, the per-site rules |
| `src/popup.html/.js` | the toolbar popup — open this one, or switch this site on |
| `src/options.html/.js` | the sites you have switched on, and how to take them back |
| `src/viewer-shim.js` | hands the document to the app through `window.launchQueue` |
| `build.mjs` | builds the viewer and packages `dist/` |
