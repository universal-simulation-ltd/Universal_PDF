// "Tell me when the desktop app is ready" — the address check and how the
// RPC's answers map to what the visitor is told.
//
//   npm run test:app-interest
//
// The address rule must match migration 0293's check constraint, or a visitor
// is told "you're on the list" for an address the server refused (it answers
// false, which we show as "try later" — misleading for a typo).

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
eq(await registerDesktopInterest(stub({ data: true, error: null }, calls), 'a@b.c'), 'ok', 'true -> on the list')
eq(calls[0]?.fn, 'register_app_interest', 'calls register_app_interest')
eq(JSON.stringify(calls[0]?.args), JSON.stringify({ p_product: 'pdf', p_email: 'a@b.c', p_what: 'desktop' }), "sends ('pdf', email, 'desktop') and nothing else")
eq(await registerDesktopInterest(stub({ data: false, error: null }), 'a@b.c'), 'later', 'false (refused / hourly cap) -> try later')
eq(await registerDesktopInterest(stub({ data: null, error: { message: 'permission denied', code: '42501' } }), 'a@b.c'), 'later', 'server error -> try later')
eq(await registerDesktopInterest(stub({ data: null, error: { message: 'TypeError: Failed to fetch' } }), 'a@b.c'), 'offline', 'fetch failure (as an error) -> offline')
eq(await registerDesktopInterest(stub(() => Promise.reject(new TypeError('Load failed'))), 'a@b.c'), 'offline', 'fetch failure (thrown) -> offline')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
