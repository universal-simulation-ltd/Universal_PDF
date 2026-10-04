// Collects Content-Security-Policy violations from ANY e2e script, unchanged.
//
//   CSP_LOG=/tmp/csp.jsonl node --import ./e2e/csp-collect.mjs e2e/<name>.e2e.mjs
//
// Every e2e here loads Playwright from one of a few sibling checkouts (see
// PLAYWRIGHT_CANDIDATES in any spec). This preload patches each of those
// copies before the spec runs, so every browser context it creates listens for
// `securitypolicyviolation` — which fires for a Report-Only policy too — and
// appends one JSON line per violation to $CSP_LOG.
//
// Workers report in their own scope, where a page listener can't hear them; the
// dev server's `report-uri` (vite.config.ts, `cspDev()`) catches those.

import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOG = process.env.CSP_LOG
const SPEC = process.argv[1] ? process.argv[1].split('/').pop() : '?'

const CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

function record(v) {
  if (!LOG) return
  appendFileSync(LOG, JSON.stringify({ spec: SPEC, ...v }) + '\n')
}

async function instrument(context) {
  await context.exposeBinding('__cspViolation', ({ page }, v) => record({ ...v, page: page?.url() }))
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore — exposed by the preload
      window.__cspViolation?.({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: e.sourceFile,
        line: e.lineNumber,
        sample: e.sample,
        disposition: e.disposition,
      })
    })
  })
}

for (const rel of CANDIDATES) {
  let mod
  try {
    mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
  } catch {
    continue
  }
  for (const type of [mod.chromium]) {
    const proto = Object.getPrototypeOf(type)
    if (proto.__cspPatched) continue
    proto.__cspPatched = true
    const launch = proto.launch
    proto.launch = async function (...args) {
      const browser = await launch.apply(this, args)
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (...a) => {
        const ctx = await newContext(...a)
        await instrument(ctx)
        return ctx
      }
      // `browser.newPage()` makes its own context — route it through ours.
      browser.newPage = async (...a) => (await browser.newContext(...a)).newPage()
      return browser
    }
  }
}
