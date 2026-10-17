// Import a module at the URL the APP loaded it at, not a second copy of it.
//
// Once a source file has been edited while the dev server is up (routine in a
// checkout other sessions are working in), Vite serves the app
// `pdfStore.ts?t=<time>`, and a bare `import('/src/stores/pdfStore.ts')` from a
// test is a DIFFERENT module with its own empty store: `loadFile` then loads a
// document nothing renders, and the checks fail with "page 1 never painted at
// all" (open-at-fit, 2026-10-12).
//
// `keepAppModuleUrls(pageOrContext)`, before the first `goto`, keeps every URL
// the page loads (the resource-timing buffer holds 250 by default; a dev build
// loads more modules than that) and gives the page `__appImport(path)`. Call
// it in `page.evaluate` as
//
//   await (globalThis.__appImport ?? ((p) => import(p)))('/src/stores/pdfStore.ts')
//
// so a page without the init script (an Electron window opened before it
// could be added) falls back to the bare import, as before.

export async function keepAppModuleUrls(target) {
  await target.addInitScript(() => {
    performance.setResourceTimingBufferSize(100000)
    globalThis.__appImport = (path) => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => {
          try {
            return new URL(u).pathname === path
          } catch {
            return false
          }
        })
        .pop()
      return import(url ?? path)
    }
  })
}
