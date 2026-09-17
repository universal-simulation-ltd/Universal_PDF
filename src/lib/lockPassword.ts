// What counts as an acceptable lock password, and how honest we are about how
// good it is.
//
// ⚠️ Imports NOTHING — `scripts/lockPassword.test.mjs` loads it under Node's
// type-stripping.
//
// WHY THIS FILE EXISTS AT ALL. The encryption in `pdfCrypto.ts` is the strong
// kind: AES-256 with a deliberately slow hash, where the ONLY way in is to
// guess the password. That makes the password the entire security of the
// feature — and it means a strength meter here is not decoration, it is the
// only place a user can find out whether the thing they just did is worth
// anything.
//
// So the numbers below are deliberately pessimistic and the wording
// deliberately plain. A four-digit PIN is ten thousand guesses; somebody who
// wants the file will have it in under a second. We say so, in those words,
// rather than colouring a bar amber and hoping.

// ⚠️ `runtime.ts`, not `../i18n`: scripts/lockPassword.test.mjs imports this
// file under plain node, which cannot load React or the SDK.
import { getT } from '../i18n/runtime.ts'

export type LockMode = 'password' | 'pin'

/** The shortest we will accept. Four digits is a phone lock screen's worth. */
export const MIN_PIN = 4
export const MIN_PASSWORD = 6

/**
 * Guesses per second to assume when saying how long something would hold.
 *
 * ⚠️ Revision 6's hash is hundreds of thousands of times slower than the RC4
 * and AES-128 schemes it replaced, which is the whole reason to use it — but
 * "slow" here means tens of thousands of guesses a second on one ordinary
 * gaming GPU, not none. Somebody renting a rack of them gets more. This figure
 * is on the generous side of published hashcat rates for exactly that reason:
 * the estimate should be wrong in the direction that makes a user pick a
 * better password.
 */
const GUESSES_PER_SECOND = 200_000

function describeDuration(seconds: number): string {
  const t = getT()
  if (seconds < 1) return t('lib.lock_duration_instant')
  if (seconds < 60) return t.plural('lib.lock_duration_seconds', Math.round(seconds))
  if (seconds < 3600) return t.plural('lib.lock_duration_minutes', Math.round(seconds / 60))
  if (seconds < 86_400) return t.plural('lib.lock_duration_hours', Math.round(seconds / 3600))
  if (seconds < 2_592_000) return t.plural('lib.lock_duration_days', Math.round(seconds / 86_400))
  if (seconds < 31_536_000) return t.plural('lib.lock_duration_months', Math.round(seconds / 2_592_000))
  const years = seconds / 31_536_000
  if (years < 1000) return t.plural('lib.lock_duration_years', Math.round(years))
  return t('lib.lock_duration_forever')
}

/** The alphabet an attacker would have to search, given what was typed. */
function alphabetSize(value: string): number {
  let size = 0
  if (/[a-z]/.test(value)) size += 26
  if (/[A-Z]/.test(value)) size += 26
  if (/[0-9]/.test(value)) size += 10
  if (/[^a-zA-Z0-9]/.test(value)) size += 32
  return size || 1
}

export type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong'

export interface Strength {
  level: StrengthLevel
  /** Short label for the meter. */
  label: string
  /** One plain sentence saying what this password actually buys. */
  note: string
}

/**
 * ⚠️ This is a BRUTE-FORCE estimate and nothing more. It cannot know that
 * 'Password1!' is one of the first things any real attacker tries — by the
 * arithmetic here that string looks respectable. `COMMON` below catches the
 * worst offenders, but the honest position is that the estimate is an upper
 * bound on safety, never a promise, which is why no wording in this file says
 * "secure".
 */
const COMMON = new Set([
  'password', 'password1', 'passw0rd', 'letmein', 'welcome', 'qwerty',
  'qwerty123', 'iloveyou', 'admin', 'abc123', 'monkey', 'dragon',
  'football', 'baseball', 'sunshine', 'princess', 'changeme', 'secret',
  'trustno1', 'master', 'hello', 'freedom', 'whatever', 'starwars',
])

/** PINs that are the first thing anyone tries, whatever their length. */
function isObviousPin(value: string): boolean {
  if (/^(\d)\1*$/.test(value)) return true // 0000, 111111
  const ascending = '01234567890123456789'
  const descending = '98765432109876543210'
  if (value.length >= 3 && (ascending.includes(value) || descending.includes(value))) return true
  // 1234 repeated, 1212, 123123 — a short cycle dressed up as a long PIN.
  for (let unit = 1; unit <= value.length / 2; unit++) {
    if (value.length % unit !== 0) continue
    const head = value.slice(0, unit)
    if (head.repeat(value.length / unit) === value) return true
  }
  return false
}

export function strengthOf(mode: LockMode, value: string): Strength {
  if (!value) return { level: 'weak', label: '', note: '' }

  const t = getT()
  if (mode === 'pin') {
    if (isObviousPin(value)) {
      return {
        level: 'weak',
        label: t('lib.lock_guessable'),
        note: t('lib.lock_pin_obvious'),
      }
    }
    const seconds = Math.pow(10, value.length) / 2 / GUESSES_PER_SECOND
    const level: StrengthLevel = value.length >= 12 ? 'good' : value.length >= 8 ? 'fair' : 'weak'
    return {
      level,
      label: level === 'weak' ? t('lib.lock_weak') : level === 'fair' ? t('lib.lock_fair') : t('lib.lock_reasonable'),
      note:
        level === 'weak'
          ? t('lib.lock_pin_note_weak', { digits: value.length, time: describeDuration(seconds) })
          : t('lib.lock_pin_note', { digits: value.length, time: describeDuration(seconds) }),
    }
  }

  const lower = value.toLowerCase()
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[0-9!.]+$/, ''))) {
    return {
      level: 'weak',
      label: t('lib.lock_guessable'),
      note: t('lib.lock_password_common'),
    }
  }
  if (value.length < 8) {
    return {
      level: 'weak',
      label: t('lib.lock_too_short'),
      note: t('lib.lock_password_short'),
    }
  }

  const seconds = Math.pow(alphabetSize(value), value.length) / 2 / GUESSES_PER_SECOND
  const years = seconds / 31_536_000
  const level: StrengthLevel = years > 1000 ? 'strong' : years > 1 ? 'good' : 'fair'
  return {
    level,
    label: level === 'strong' ? t('lib.lock_strong') : level === 'good' ? t('lib.lock_good') : t('lib.lock_fair'),
    note:
      level === 'strong'
        ? t('lib.lock_password_strong')
        : t('lib.lock_password_note', { time: describeDuration(seconds) }),
  }
}

export interface Validation {
  ok: boolean
  /** Why the lock cannot be applied yet. Null when it can. */
  error: string | null
}

/**
 * ⚠️ The confirm field is not politeness. A mistyped password on a document
 * with no recovery path does not fail loudly — it produces a perfectly valid
 * file that nobody, including its author, can ever open again. This is the
 * only check standing between a user and that.
 */
export function validateLock(mode: LockMode, value: string, confirm: string): Validation {
  const t = getT()
  if (mode === 'pin') {
    if (!/^\d*$/.test(value)) return { ok: false, error: t('lib.lock_pin_digits_only') }
    if (value.length < MIN_PIN) return { ok: false, error: t('lib.lock_pin_min', { min: MIN_PIN }) }
  } else if (value.length < MIN_PASSWORD) {
    return { ok: false, error: t('lib.lock_password_min', { min: MIN_PASSWORD }) }
  }
  if (!confirm) return { ok: false, error: null }
  if (value !== confirm) {
    return { ok: false, error: mode === 'pin' ? t('lib.lock_pins_differ') : t('lib.lock_passwords_differ') }
  }
  return { ok: true, error: null }
}
