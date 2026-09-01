// The sender's half of "Send to sign" verified access.
//
//   npm run test:sign-access
//
// ⚠️ THE POINT OF THIS FILE IS ONE ASSERTION. `hashSecret` here runs in the
// sender's browser; the function that COMPARES its output lives in a different
// repo entirely (universal-platform, supabase/functions/_shared/sign-access.ts)
// and the two cannot import each other. Nothing at build time notices if they
// drift. What holds them together is that both repos' test suites assert the
// same hard-coded vector — so if either recipe changes, one of the two goes red
// immediately instead of every access PIN silently ceasing to work.
//
// Negative control (2026-09-01, run): changing the separator from ':' to '-'
// turns the vector test red here and leaves the platform's suite green, which
// is exactly the drift this is meant to catch.

import { createHash } from 'node:crypto'
import { hashSecret, randomHex, generateAccessPin } from '../src/lib/signAccessSecret.ts'

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

console.log('\nThe recipe the server has to agree with\n')

// The same literal the platform repo asserts. Do not "fix" one side alone.
ok(
  (await hashSecret('123456', 'a1b2c3d4')) === '6c194d1cb115c79a5283339e367b37be92c366959f4bbae72af5146d1ed00d54',
  'hashSecret("123456", "a1b2c3d4") matches the shared vector',
)

// And that the vector itself is not just "what this code happens to do":
// node:crypto is a completely separate SHA-256 from WebCrypto's.
let agrees = true
for (const [value, salt] of [['123456', 'deadbeef'], ['', 'x'], ['pin', 'salt'], ['é😀', 'ünïcode']]) {
  const theirs = createHash('sha256').update(`${salt}:${value}`, 'utf8').digest('hex')
  if ((await hashSecret(value, salt)) !== theirs) agrees = false
}
ok(agrees, 'it is SHA-256 of `salt:value`, agreed by node:crypto')

// Without a separator, salt 'ab' + value 'c' would collide with salt 'a' +
// value 'bc', and one stored PIN would open two different documents.
ok((await hashSecret('c', 'ab')) !== (await hashSecret('bc', 'a')), 'the separator keeps salt and value apart')

console.log('\nThe PIN\n')

let allSix = true
const seen = new Set()
for (let i = 0; i < 500; i++) {
  const p = generateAccessPin()
  if (!/^\d{6}$/.test(p)) allSix = false
  seen.add(p)
}
ok(allSix, 'always six digits, zero-padded')
ok(seen.size > 480, `distinct across a run (${seen.size} of 500)`)

// ⚠️ A `% 1000000` implementation clusters low. This catches the gross form of
// that bug — a PIN generator that never reaches the top of its range.
const buckets = new Array(10).fill(0)
for (let i = 0; i < 4000; i++) buckets[Math.floor(Number(generateAccessPin()) / 100_000)]++
ok(buckets.every((n) => n > 150), `spread across the range (min bucket ${Math.min(...buckets)} of 4000)`)

console.log('\nSalts\n')
ok(/^[0-9a-f]{32}$/.test(randomHex(16)), 'randomHex(16) is 32 hex characters')
// A fixed salt would mean one cracked PIN cracks every document that used it.
ok(randomHex(16) !== randomHex(16), 'a fresh salt every time')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
