// The rules for a lock password, and how honestly they are described.
//
//   npm run test:lock-password
//
// ⚠️ The strength wording is not decoration. AES-256 R6 has no way in except
// guessing, so what this file says about a 4-digit PIN is the ONLY warning a
// user gets that their locked document is a second's work. Tests below pin the
// two properties that matter: nothing weak is ever described as safe, and the
// confirm field cannot be satisfied by a typo.

import {
  strengthOf,
  validateLock,
  MIN_PIN,
  MIN_PASSWORD,
} from '../src/lib/lockPassword.ts'

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

console.log('\nWhat we refuse\n')

ok(!validateLock('pin', '123', '123').ok, `a ${MIN_PIN - 1}-digit PIN is refused`)
ok(validateLock('pin', '4913', '4913').ok, `a ${MIN_PIN}-digit PIN is accepted`)
ok(!validateLock('pin', '12a4', '12a4').ok, 'a PIN with a letter is refused')
ok(validateLock('pin', '12a4', '12a4').error.includes('digits'), 'and says why')
ok(!validateLock('password', 'short', 'short').ok, `under ${MIN_PASSWORD} characters is refused`)
ok(validateLock('password', 'longenough', 'longenough').ok, 'a long-enough password is accepted')

console.log('\nThe confirm field\n')

ok(!validateLock('password', 'correct', 'correkt').ok, 'a mistyped confirmation blocks the lock')
ok(validateLock('password', 'correct', 'correkt').error !== null, 'and says the two do not match')
// ⚠️ An empty confirm box is not an ERROR — it is a user who has not finished
// typing. Showing "the two passwords do not match" under a box nobody has
// touched trains people to ignore the message that matters.
ok(validateLock('password', 'correcthorse', '').error === null, 'an untouched confirm box shows no error')
ok(!validateLock('password', 'correcthorse', '').ok, 'but does not let the lock through either')
ok(!validateLock('pin', '4913', '4914').ok, 'two different PINs block the lock')

console.log('\nHonesty about strength\n')

const shortPin = strengthOf('pin', '4913')
ok(shortPin.level === 'weak', 'a 4-digit PIN is called weak')
ok(shortPin.note.includes('less than a second'), 'and is said to fall in less than a second')

ok(strengthOf('pin', '0000').label === 'Guessable', 'an all-same PIN is called guessable')
ok(strengthOf('pin', '1234').label === 'Guessable', 'a run is called guessable')
ok(strengthOf('pin', '9876').label === 'Guessable', 'a descending run too')
ok(strengthOf('pin', '123123').label === 'Guessable', 'a repeated unit is not saved by its length')
ok(strengthOf('pin', '111111').label === 'Guessable', 'nor is a longer repeat')
ok(strengthOf('pin', '739104').label !== 'Guessable', 'an arbitrary 6-digit PIN is not')

ok(strengthOf('password', 'password').label === 'Guessable', 'the obvious password is called out')
ok(strengthOf('password', 'Password1').label === 'Guessable', 'and the obvious dressing-up of it')
ok(strengthOf('password', 'letmein').label === 'Guessable', 'as is another from the list')

const strong = strengthOf('password', 'gS7#kq2Vb!zR9wLm')
ok(strong.level === 'strong', 'a long mixed password is called strong')
ok(!/secure/i.test(strong.note), 'no wording anywhere promises "secure"')

// ⚠️ The property that actually matters: nothing weak may be described in
// reassuring terms. A meter that says "Fair" over a 4-digit PIN is worse than
// no meter, because it converts a user's correct unease into false confidence.
for (const pin of ['0000', '1234', '4913', '9999', '1111']) {
  const s = strengthOf('pin', pin)
  ok(s.level === 'weak', `"${pin}" is never rated above weak`)
}

// And the no-way-back warning has to appear exactly where someone is most
// likely to pick something they will forget.
ok(strong.note.includes('no way back in'), 'a strong password still warns there is no recovery')

console.log('\nEdge cases\n')
ok(strengthOf('pin', '').label === '', 'an empty box says nothing at all')
ok(strengthOf('password', '').label === '', 'same for a password')
ok(strengthOf('pin', '739104819273').level === 'good', 'a 12-digit PIN reaches reasonable')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
