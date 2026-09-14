// Where the reader was in a document — its zoom and scroll — kept while the
// document sits in a background tab, so bringing the tab back puts them back on
// the same page at the same size instead of re-fitting page 1.
//
// The zoom and scroll live in `PdfViewer`'s own state, not in a store, so the
// tab store cannot read them directly. The viewer registers a provider while it
// is mounted; the tab store asks it just before sending a tab to the back, and
// hands the answer back keyed by the document object when the tab returns. The
// viewer's fit-on-open then takes the remembered view instead of fitting.
//
// ⚠️ Asked for BEFORE the swap, never recorded afterwards. By the time an effect
// cleanup could run, the outgoing document's pages have already unmounted and
// the scroll box has clamped to 0 — so a recorder there only ever remembers the
// top of the document.

export interface ViewState {
  zoom: number
  top: number
  left: number
}

let provider: (() => ViewState | null) | null = null
const restoring = new WeakMap<object, ViewState>()

/** Called by the viewer on mount. Returns the matching unregister. */
export function registerViewProvider(fn: () => ViewState | null): () => void {
  provider = fn
  return () => {
    if (provider === fn) provider = null
  }
}

/** The view on screen right now, or null when no viewer is mounted. */
export function captureView(): ViewState | null {
  try {
    return provider?.() ?? null
  } catch {
    return null
  }
}

/** Ask the viewer to open `doc` at `view` rather than fitting it. */
export function restoreViewFor(doc: object, view: ViewState): void {
  restoring.set(doc, view)
}

/** The view to open `doc` at, if one is waiting — consumed on read. */
export function takeRestoredView(doc: object): ViewState | null {
  const view = restoring.get(doc) ?? null
  if (view) restoring.delete(doc)
  return view
}
