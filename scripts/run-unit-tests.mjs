// Run every Node unit script in `scripts/` — the CI entry point for them.
//
//   npm run test:unit
//
// The scripts are the `test:*` entries in package.json whose command runs a
// `scripts/*.test.mjs` (each carries its own Node flags, e.g. `--import
// ./scripts/ts-resolve.mjs`, so they are run through npm rather than
// re-invented here). No server, no browser.
//
// It also fails when a `scripts/*.test.mjs` has no package.json script, so a
// new test file cannot sit there unrun because nobody wired it up.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const entries = Object.entries(scripts)
  .map(([name, cmd]) => [name, cmd.match(/scripts\/[\w.-]+\.test\.mjs/)?.[0]])
  .filter(([, file]) => file)

const files = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.test.mjs'))
const unwired = files.filter((f) => !entries.some(([, file]) => file === `scripts/${f}`))

const failed = []
for (const [name, file] of entries) {
  const started = Date.now()
  const r = spawnSync('npm', ['run', '-s', name], { cwd: ROOT, encoding: 'utf8' })
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  const ok = r.status === 0
  console.log(`${ok ? 'pass' : 'FAIL'} ${secs.padStart(5)}s  ${name}  (${file})`)
  if (!ok) failed.push([name, `${r.stdout}${r.stderr}`])
}

console.log(`\n${entries.length - failed.length} of ${entries.length} unit scripts passed`)
for (const [name, out] of failed) console.log(`\n── ${name} ──\n${out.trim()}`)
for (const f of unwired) console.log(`\nscripts/${f} has no "test:*" script in package.json — add one so it runs`)
process.exit(failed.length || unwired.length ? 1 : 0)
