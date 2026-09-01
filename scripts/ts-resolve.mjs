// Lets Node's type-stripping follow this codebase's extensionless imports.
//
// Vite resolves `./pdfCrypto` to `pdfCrypto.ts` for us; Node's ESM loader does
// not, and refuses outright rather than guessing. Existing tests here dodged
// that by only ever importing modules that import nothing — which stops being
// possible the moment a module under test has a dependency.
//
// Loaded with `--import` so the hook is in place before the test's own static
// imports are resolved.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only relative, obviously-extensionless specifiers. A bare package name
    // ('pdf-lib') must go to node_modules untouched, and anything already
    // carrying an extension is left alone.
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context)
      } catch {
        // Not a .ts file after all — fall through to the normal answer so the
        // error the caller sees is Node's, not ours.
      }
    }
    return nextResolve(specifier, context)
  },
})
