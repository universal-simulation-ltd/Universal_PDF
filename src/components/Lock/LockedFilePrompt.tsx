import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'

/**
 * Asks for the password of a locked PDF somebody has just opened.
 *
 * ⚠️ There is no attempt limit and no lockout, deliberately. This is a file on
 * the user's own device, not an account: a wrong-guess counter would stop
 * nobody (the file can be reopened, or handed to any other PDF app) while
 * genuinely stranding the person who owns the document and is close to
 * remembering. The protection is the strength of the password and the cost of
 * the hash, both of which are in `pdfCrypto.ts` where they belong.
 */
export default function LockedFilePrompt() {
  const locked = usePdfStore((s) => s.lockedFile)
  const loadFile = usePdfStore((s) => s.loadFile)
  const cancel = usePdfStore((s) => s.cancelLockedFile)

  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const name = locked?.file.name ?? ''

  // A new file (or a fresh rejection) gets a fresh, focused box.
  useEffect(() => {
    if (!locked) return
    setPassword('')
    setBusy(false)
    inputRef.current?.focus()
  }, [locked?.file, locked?.error])

  useEffect(() => {
    if (!locked) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, cancel])

  if (!locked) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || busy || !locked) return
    setBusy(true)
    // ⚠️ No try/catch that swallows: `loadFile` reports a wrong password by
    // putting it back on `lockedFile.error`, and the effect above then clears
    // the box. A throw here would be a real fault and should reach the
    // error boundary rather than look like a bad password.
    await loadFile(locked.file, { notice: locked.notice, password })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">This PDF is locked</h2>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{name}</span> needs its password
          before it can be opened.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            ref={inputRef}
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoFocus
            // `current-password` and not `new-password`: this is a password the
            // user already has, so a password manager should offer to fill it.
            autoComplete="current-password"
            placeholder="Password or PIN"
            aria-label="Password or PIN"
            aria-invalid={locked.error ? true : undefined}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-700 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            disabled={busy}
            aria-pressed={reveal}
            className="shrink-0 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>

        {locked.error && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {locked.error}
          </p>
        )}

        {/* ⚠️ Said before the first wrong guess, not after the fifth. Somebody
            who does not have the password needs to stop and go and ask for it,
            and the app cannot help them — better they learn that immediately
            than after ten minutes of trying birthdays. */}
        <p className="mt-3 text-xs text-slate-500">
          Universal PDF cannot recover or reset this password. Without it the document
          cannot be opened by any app.
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="submit"
            disabled={!password || busy}
            className="rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
