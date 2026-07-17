# Universal PDF — docs

## What this repo is

Universal PDF is a clean Progressive Web App for **viewing, annotating, and
signing PDFs in the browser** — free draw, text, shapes, ticks/crosses,
reusable drawn signatures (including a sign-on-your-phone flow via QR + PIN),
and export with everything baked into the saved file. No upload to a server;
documents stay on the device.

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

## Suite context

This repo is one part of the **Universal Simulation suite** (the open-source
Universal Apps family). For cross-repo context — how the `@unisim/sdk`, edge
routing, and the suite changelog wire together — see the suite docs repo:
[`universal-simulation-ltd/docs`](https://github.com/universal-simulation-ltd/docs)
(private; checked out at the umbrella root as `Docs_UNI_SIM/` for suite
contributors). Start with `ARCHITECTURE.md` (the cross-repo map).
