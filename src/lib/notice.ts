// Messages and one-line questions that the shared code raises, routed to
// whichever screens are showing.
//
// The website and the desktop app use the browser's own `alert()` and
// `prompt()`. The phone screens (src/native/) never put up a browser box (the
// mobile-first pass, "review every popup", 2026-10-22). They register their own
// handlers here: a short message at the foot of the screen, and a bottom sheet
// with a text box. Code outside `src/native/` calls `notice()` / `askText()` and
// does not need to know which one it gets.

type Notifier = (message: string) => void
type TextAsker = (question: string, value: string) => Promise<string | null>

let notifier: Notifier | null = null
let asker: TextAsker | null = null

/** The phone screens take over messages while they are mounted. Returns the undo. */
export function setNotifier(fn: Notifier | null): () => void {
  notifier = fn
  return () => {
    if (notifier === fn) notifier = null
  }
}

/** The phone screens take over one-line questions while they are mounted. Returns the undo. */
export function setTextAsker(fn: TextAsker | null): () => void {
  asker = fn
  return () => {
    if (asker === fn) asker = null
  }
}

/** Tell the user something: `alert()` on the website, a short message on the phone. */
export function notice(message: string): void {
  if (notifier) notifier(message)
  else window.alert(message)
}

/**
 * Ask for one line of text: `prompt()` on the website, a sheet on the phone.
 * Resolves with null when the question is dismissed.
 */
export function askText(question: string, value = ''): Promise<string | null> {
  if (asker) return asker(question, value)
  return Promise.resolve(window.prompt(question, value))
}
