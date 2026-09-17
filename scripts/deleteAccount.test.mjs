// The request behind "Delete my account", against a fake client.
//
//   npm run test:delete-account-call
//
// ⚠️ The browser test (e2e/delete-account.e2e.mjs) cannot reach a successful
// delete: the SDK's offline mock has no `supabase.functions`. So the things
// that matter about the CALL are pinned here: it names the right function,
// sends exactly the phrase the function checks, shows the function's own
// refusal, and signs out on this device only, and only after the account is
// gone.

import {
  CONFIRM_PHRASE,
  fallbackError,
  deleteMyAccount,
  isConfirmed,
} from '../src/lib/deleteAccount.ts'

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

/** A client whose function answers `answer()`, recording what it was asked. */
function fakeClient(answer) {
  const calls = { invoke: [], signOut: [] }
  return {
    calls,
    functions: {
      async invoke(name, options) {
        calls.invoke.push({ name, options })
        return answer()
      },
    },
    auth: {
      async signOut(options) {
        calls.signOut.push(options)
        return { error: null }
      },
    },
  }
}

/** What supabase-js hands back for a non-2xx: a FunctionsHttpError with the Response. */
function httpError(status, body) {
  const error = new Error('Edge Function returned a non-2xx status code')
  error.context = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  return error
}

console.log('\nThe phrase\n')

ok(CONFIRM_PHRASE === 'delete-all', 'is delete-all, the phrase the platform function checks')
ok(isConfirmed('delete-all'), 'delete-all confirms')
ok(isConfirmed('  Delete-All '), 'case and stray spaces are forgiven')
ok(!isConfirmed('delete'), 'a partial phrase does not')
ok(!isConfirmed('delete all'), 'a space for the hyphen does not')
ok(!isConfirmed(''), 'nothing typed does not')

console.log('\nA successful delete\n')

{
  const client = fakeClient(async () => ({ data: { ok: true }, error: null }))
  const result = await deleteMyAccount(client)
  ok(result.ok === true, 'reports success')
  ok(client.calls.invoke.length === 1, 'calls the function exactly once')
  ok(client.calls.invoke[0]?.name === 'delete-account', 'calls delete-account')
  ok(JSON.stringify(client.calls.invoke[0]?.options?.body) === '{"confirm":"delete-all"}',
     'sends exactly {"confirm":"delete-all"}')
  ok(client.calls.signOut.length === 1 && client.calls.signOut[0]?.scope === 'local',
     'then signs out on this device only (the server has no user left to sign out)')
}

console.log('\nA refused delete\n')

{
  const refusal = "Couldn't delete your account. Please try again, or email inbox@unisim.co.uk."
  const client = fakeClient(async () => ({ data: null, error: httpError(500, { ok: false, error: refusal }) }))
  const result = await deleteMyAccount(client)
  ok(result.ok === false && result.error === refusal, "shows the function's own sentence")
  ok(client.calls.signOut.length === 0, 'and does NOT sign out: the account is still there')
}

{
  const client = fakeClient(async () => ({ data: null, error: httpError(502, '<html>Bad gateway</html>') }))
  const result = await deleteMyAccount(client)
  ok(result.ok === false && result.error === fallbackError(), 'a non-JSON answer falls back to a plain sentence')
  ok(client.calls.signOut.length === 0, 'and does not sign out')
}

{
  const client = fakeClient(async () => ({ data: null, error: httpError(400, { ok: false }) }))
  const result = await deleteMyAccount(client)
  ok(result.ok === false && result.error === fallbackError(), 'a JSON answer with no sentence falls back too')
}

console.log('\nNo network, or no functions at all (the offline mock)\n')

{
  const client = fakeClient(async () => { throw new TypeError('Failed to fetch') })
  const result = await deleteMyAccount(client)
  ok(result.ok === false && result.error === fallbackError(), 'a network failure is reported, not thrown')
  ok(client.calls.signOut.length === 0, 'and does not sign out')
}

{
  const client = { functions: undefined, auth: { async signOut() { throw new Error('must not be called') } } }
  const result = await deleteMyAccount(client)
  ok(result.ok === false, 'a client with no functions fails cleanly instead of crashing the dialog')
}

{
  // The sign-out itself failing must not turn a deleted account into a
  // reported failure: the person would try again against an account that no
  // longer exists.
  const client = fakeClient(async () => ({ data: { ok: true }, error: null }))
  client.auth.signOut = async () => { throw new Error('offline') }
  const result = await deleteMyAccount(client)
  ok(result.ok === true, 'a failed local sign-out after a successful delete is still a success')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
