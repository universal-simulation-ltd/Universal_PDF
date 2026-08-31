// The build-time configuration guard — the "it built fine and cannot start" bug.
//
//   npm run test:build-env
//
// Two layers, because only the second one proves anything about a real build:
//
//   1. `checkBuildEnv` itself — what counts as missing (empty and whitespace
//      DO, which is the CI case: an unset GitHub secret arrives as an empty
//      variable, not an absent one).
//   2. `vite.config.ts`'s exported config function, called the way Vite calls
//      it. This is the layer that would catch someone deleting the `if
//      (command === 'build')` block: the helper would still pass its own tests
//      while no build checked anything.
//
// Negative control (2026-08-31, run): commenting the guard out of
// `vite.config.ts` turns exactly the two refusal cases red — 9 passed, 2
// failed. The helper's own cases stay green, as do the two that assert the
// guard does NOT fire (dev, and a configured checkout), which is what makes
// those two worth having: they cannot go red by deletion, only by overreach.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkBuildEnv, REQUIRED_BUILD_ENV } from './buildEnv.ts'

let pass = 0
let fail = 0
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ok   ${label}  -> ${a}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`)
  }
}

const URL_OK = 'https://rygfxgalojojppxmhddo.supabase.co'
const KEY_OK = 'eyJhbGciOiJIUzI1NiI.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl'
const healthy = {
  VITE_PLATFORM_SUPABASE_URL: URL_OK,
  VITE_PLATFORM_SUPABASE_ANON_KEY: KEY_OK,
}
const keysOf = (problems) => problems.map((p) => `${p.key}:${p.reason}`)

console.log('checkBuildEnv (what counts as a broken build):')
eq(checkBuildEnv(healthy), [], 'a healthy environment has nothing to say')
eq(
  keysOf(checkBuildEnv({})),
  REQUIRED_BUILD_ENV.map((k) => `${k}:missing`),
  'nothing set at all — both named, not just the first',
)
eq(
  keysOf(checkBuildEnv({ ...healthy, VITE_PLATFORM_SUPABASE_URL: '' })),
  ['VITE_PLATFORM_SUPABASE_URL:missing'],
  'EMPTY is missing — an unset GitHub secret arrives this way',
)
eq(
  keysOf(checkBuildEnv({ ...healthy, VITE_PLATFORM_SUPABASE_ANON_KEY: '   ' })),
  ['VITE_PLATFORM_SUPABASE_ANON_KEY:missing'],
  'whitespace is missing too',
)
eq(
  keysOf(checkBuildEnv({ ...healthy, VITE_PLATFORM_SUPABASE_URL: 'rygfxgalojojppxmhddo.supabase.co' })),
  ['VITE_PLATFORM_SUPABASE_URL:malformed'],
  'a URL with no scheme is caught (the client cannot use it)',
)
eq(
  keysOf(checkBuildEnv({ ...healthy, VITE_PLATFORM_SUPABASE_ANON_KEY: 'not-a-jwt' })),
  ['VITE_PLATFORM_SUPABASE_ANON_KEY:malformed'],
  'a key that is not a JWT is caught',
)
eq(
  checkBuildEnv({ ...healthy, VITE_SOMETHING_ELSE: '' })
    .length,
  0,
  'an unrelated empty variable is not this check\'s business',
)

// ── The wiring ───────────────────────────────────────────────────────────────
// `loadEnv` reads `process.env` as well as the `.env*` files in the directory
// it is given, so a temp directory alone is not enough — the pair has to come
// out of this process too, or a developer with them exported would see the
// negative cases pass for the wrong reason.
console.log('\nvite.config.ts (the guard is actually wired into a build):')
const REPO = process.cwd()
for (const key of REQUIRED_BUILD_ENV) delete process.env[key]
const config = (await import('../vite.config.ts')).default

const empty = mkdtempSync(join(tmpdir(), 'unipdf-buildenv-'))
process.chdir(empty)
for (const mode of ['production', 'desktop']) {
  let threw = null
  try {
    await config({ command: 'build', mode })
  } catch (e) {
    threw = e
  }
  eq(
    [threw !== null, threw?.message.includes('VITE_PLATFORM_SUPABASE_URL') === true],
    [true, true],
    `mode "${mode}": a build with no configuration is refused, by name`,
  )
}

let served = null
try {
  await config({ command: 'serve', mode: 'development' })
  served = 'ok'
} catch (e) {
  served = `threw: ${e.message.split('\n')[0]}`
}
eq(served, 'ok', '`vite dev` is NOT blocked — mockauth still runs without credentials')

// And the healthy path: back in the repo, whose .env.local carries the pair.
process.chdir(REPO)
writeFileSync(join(empty, '.gitkeep'), '')
let built = null
try {
  built = typeof (await config({ command: 'build', mode: 'desktop' }))
} catch (e) {
  built = `threw: ${e.message.split('\n')[0]}`
}
eq(built, 'object', 'a configured checkout builds as before')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
