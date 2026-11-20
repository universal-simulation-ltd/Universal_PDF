// "Tell me when the desktop app is ready" — the address check and how the
// RPC's answers map to what the visitor is told.
//
//   npm run test:app-interest
//
// The address rule must match request_launch_notification()'s (universal-
// platform 0323), or a visitor is told "try later" for what is really a typo.

import { normaliseInterestEmail, registerDesktopInterest } from '../src/lib/appInterest.ts'

let pass = 0
let fail = 0
const eq = (actual, expected, label) => {
  if (actual === expected) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

console.log('address check')
eq(normaliseInterestEmail('  Someone@Example.COM '), 'someone@example.com', 'trims and lower-cases')
eq(normaliseInterestEmail('a@b.c'), 'a@b.c', 'shortest real shape is accepted')
eq(normaliseInterestEmail('nobody'), null, 'no @')
eq(normaliseInterestEmail('a@b'), null, 'no dot after @')
eq(normaliseInterestEmail('a b@c.d'), null, 'space inside')
eq(normaliseInterestEmail('a@@b.c'), null, 'two @')
eq(normaliseInterestEmail(''), null, 'empty')
eq(normaliseInterestEmail(`${'x'.repeat(250)}@b.co`), null, 'over 254 characters')

const stub = (result, calls) => ({
  rpc(fn, args) {
    calls?.push({ fn, args })
    return typeof result === 'function' ? result() : Promise.resolve(result)
  },
})

console.log('RPC answers')
const calls = []
eq(await registerDesktopInterest(stub({ data: null, error: null }, calls), 'a@b.c', 'fr'), 'ok', 'no error -> on the list')
eq(calls[0]?.fn, 'request_launch_notification', 'calls request_launch_notification (the one launch list, 0334)')
eq(JSON.stringify(calls[0]?.args), JSON.stringify({ p_product: 'pdf-desktop', p_email: 'a@b.c', p_language: 'fr' }), "sends ('pdf-desktop', email, language) and nothing else")
await registerDesktopInterest(stub({ data: null, error: null }, calls), 'a@b.c', 'pt-BR')
eq(calls[1]?.args.p_language, 'pt-BR', 'a region tag is kept')
await registerDesktopInterest(stub({ data: null, error: null }, calls), 'a@b.c')
eq(calls[2]?.args.p_language, null, 'no language -> null')
await registerDesktopInterest(stub({ data: null, error: null }, calls), 'a@b.c', 'x;drop')
eq(calls[3]?.args.p_language, null, 'a tag the server would refuse -> null')
eq(await registerDesktopInterest(stub({ data: null, error: { message: 'launch_notify_busy', code: '54000' } }), 'a@b.c'), 'later', 'refused (busy) -> try later')
eq(await registerDesktopInterest(stub({ data: null, error: { message: 'permission denied', code: '42501' } }), 'a@b.c'), 'later', 'server error -> try later')
eq(await registerDesktopInterest(stub({ data: null, error: { message: 'TypeError: Failed to fetch' } }), 'a@b.c'), 'offline', 'fetch failure (as an error) -> offline')
eq(await registerDesktopInterest(stub(() => Promise.reject(new TypeError('Load failed'))), 'a@b.c'), 'offline', 'fetch failure (thrown) -> offline')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
