// Served by the dev server, never bundled: the way a test reaches the APP's
// own copy of a module from a page that is already loaded.
//
// `import('/src/stores/tabStore.ts')` typed into `page.evaluate` is not
// rewritten by Vite, so once that file has been edited while the server is up
// (the app then loads `tabStore.ts?t=<time>`) it is a second copy with its own
// empty store. An import written in a module Vite serves IS rewritten, to the
// same `?t=` every other importer gets — so the test imports this file and asks
// it for the module:
//
//   const { appImport } = await import('/e2e/app-reach.ts')
//   const { useTabStore } = await appImport('/src/stores/tabStore.ts')
//
// Unlike `keepAppModuleUrls` (app-modules.mjs) it needs nothing in place before
// the page loads, which is what an Electron window — open before an init script
// can land — needs. It works in a browser page just the same.

const modules = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.*', '!/src/**/*.d.ts'])

export function appImport(path: string): Promise<Record<string, any>> {
  const load = modules[path]
  if (!load) throw new Error(`app-reach: no such app module ${path}`)
  return load() as Promise<Record<string, any>>
}

// Every file under src/ is a dependency of this one, so without this an edit to
// any of them would walk up to here, find nothing accepting it, and turn a hot
// update into a full page reload for the rest of the dev server's life.
if (import.meta.hot) import.meta.hot.accept()
