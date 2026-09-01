import { useId, useState } from 'react'
import {
  strengthOf,
  validateLock,
  MIN_PIN,
  type LockMode,
} from '../../lib/lockPassword'

// The "Lock this PDF" control, shared by the export dialog and send-to-sign.
//
// ⚠️ WHY THE WARNINGS ARE THIS LOUD. Everything else in this app is
// recoverable: an annotation can be undone, an export can be redone, a
// compressed copy sits beside its original. A locked PDF is the one thing
// Universal PDF makes that CANNOT be undone by Universal PDF. AES-256 has no
// back door for the app that wrote the file, so a forgotten password is the
// end of that document. That asymmetry is why there is a confirm field, why
// the no-recovery line is not tucked into a tooltip, and why the strength note
// is blunt about a 4-digit PIN rather than encouraging.

export interface LockState {
  enabled: boolean
  mode: LockMode
  password: string
  confirm: string
}

export const EMPTY_LOCK: LockState = { enabled: false, mode: 'password', password: '', confirm: '' }

/**
 * The password to lock with, or null when the fields are not yet complete.
 *
 * ⚠️ Callers must treat null as "do not export", not as "export unlocked".
 * Quietly handing someone an unprotected file because their confirm box was
 * one character out is the worst failure this feature has.
 */
export function lockPasswordOf(state: LockState): string | null {
  if (!state.enabled) return null
  return validateLock(state.mode, state.password, state.confirm).ok ? state.password : null
}

/** True when the lock is switched on but not yet usable — the export button
 *  must be disabled, and it needs to say why. */
export function lockIncomplete(state: LockState): boolean {
  return state.enabled && lockPasswordOf(state) === null
}

const MODES: { value: LockMode; label: string; hint: string }[] = [
  { value: 'password', label: 'Password', hint: 'Letters, digits and punctuation' },
  { value: 'pin', label: 'PIN', hint: `Digits only — at least ${MIN_PIN}` },
]

interface Props {
  value: LockState
  onChange: (next: LockState) => void
  disabled?: boolean
  /** Wording differs slightly when the file is going straight to someone. */
  context?: 'export' | 'send'
}

export default function LockFields({ value, onChange, disabled, context = 'export' }: Props) {
  const [reveal, setReveal] = useState(false)
  const pwId = useId()
  const confirmId = useId()

  const { mode, password, confirm, enabled } = value
  const strength = strengthOf(mode, password)
  const { error } = validateLock(mode, password, confirm)
  const isPin = mode === 'pin'

  function set(patch: Partial<LockState>) {
    onChange({ ...value, ...patch })
  }

  const strengthColour =
    strength.level === 'strong'
      ? 'text-emerald-700'
      : strength.level === 'good'
        ? 'text-emerald-700'
        : strength.level === 'fair'
          ? 'text-amber-700'
          : 'text-red-600'

  // ⚠️ `type="text"` with a numeric inputMode, NOT `type="number"` — a number
  // input strips leading zeros, so a PIN of 0431 silently becomes 431 and the
  // file locks with a password the user never chose and cannot reproduce.
  const inputProps = isPin
    ? { type: reveal ? ('text' as const) : ('password' as const), inputMode: 'numeric' as const, pattern: '[0-9]*', autoComplete: 'off' }
    : { type: reveal ? ('text' as const) : ('password' as const), autoComplete: 'new-password' as const }

  return (
    <div className="mb-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700 disabled:cursor-wait"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-900">
            Lock with a password
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            {context === 'send'
              ? 'The signer is asked for it before they can open the document. Tell them separately — not in the same message.'
              : 'Nobody can open the file without it, in any PDF app. Real encryption, not a "no printing" flag.'}
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-2.5 pl-6.5">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            {MODES.map((opt) => {
              const active = opt.value === mode
              return (
                <button
                  key={opt.value}
                  type="button"
                  // ⚠️ Clearing both fields on a mode switch is deliberate.
                  // Carrying 'hunter2' into PIN mode leaves a box that looks
                  // filled, refuses to validate, and gives no clue why.
                  onClick={() => set({ mode: opt.value, password: '', confirm: '' })}
                  disabled={disabled}
                  aria-pressed={active}
                  className={[
                    'rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-wait',
                    active ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {MODES.find((o) => o.value === mode)?.hint}
          </div>

          <div className="mt-2.5 space-y-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={pwId} className="sr-only">
                  {isPin ? 'PIN' : 'Password'}
                </label>
                <input
                  id={pwId}
                  {...inputProps}
                  value={password}
                  // A PIN box that accepts letters and then refuses to
                  // validate is a worse teacher than one that never takes them.
                  onChange={(e) =>
                    set({ password: isPin ? e.target.value.replace(/\D/g, '') : e.target.value })
                  }
                  disabled={disabled}
                  placeholder={isPin ? 'PIN' : 'Password'}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-700 disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                disabled={disabled}
                aria-pressed={reveal}
                className="shrink-0 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>

            <div>
              <label htmlFor={confirmId} className="sr-only">
                Confirm {isPin ? 'PIN' : 'password'}
              </label>
              <input
                id={confirmId}
                {...inputProps}
                value={confirm}
                onChange={(e) =>
                  set({ confirm: isPin ? e.target.value.replace(/\D/g, '') : e.target.value })
                }
                disabled={disabled}
                placeholder={isPin ? 'Confirm PIN' : 'Confirm password'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-700 disabled:opacity-50"
              />
            </div>
          </div>

          {strength.label && (
            <div className={`mt-2 text-xs ${strengthColour}`}>
              <span className="font-medium">{strength.label}.</span> {strength.note}
            </div>
          )}

          {error && <div className="mt-1.5 text-xs text-red-600">{error}</div>}

          {/* Always visible while the lock is on — not a tooltip, not behind a
              disclosure. This is the consequence people do not anticipate. */}
          <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            <span aria-hidden="true">⚠ </span>
            Write it down somewhere safe. A locked PDF cannot be opened without its
            password — not by us, not by anyone. There is no reset.
          </div>
        </div>
      )}
    </div>
  )
}
