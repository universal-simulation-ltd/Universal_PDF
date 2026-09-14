import { useAnnotationStore } from '../stores/annotationStore'
import { useFormStore, type FormFieldValue } from '../stores/formStore'
import type { Annotation } from '../types/annotations'

// "Has this document been amended since the last time a copy was saved out?"
//
// The answer drives the exit guard (`stores/exitGuard.ts`) — the popup that
// offers Save and exit / Exit / Cancel when a document with amendments is about
// to be closed, replaced, or taken down with the window.
//
// ⚠️ "Saved" here means EXPORTED — a PDF written to disk (desktop) or
// downloaded (web). It does not mean "persisted": annotations and form values
// are already written to the IndexedDB recents 600 ms after every change (see
// `pdfStore`'s subscription), so nothing is lost by exiting either way. What
// exiting costs is the *file*, which is exactly what the popup offers to write
// — and why its wording says so rather than shouting about lost work.
//
// ⚠️ This module deliberately does NOT import `pdfStore`, which imports it. The
// callers know whether a document is open; asking here would close the cycle.

// The state at the last save (or load). `null` means "never baselined", which
// only happens before the first document is opened.
let savedAnnotations: Annotation[] | null = null
let savedFormValues: FormFieldValue[] | null = null

// Edits that rewrite the PDF bytes themselves rather than the annotation layer
// — page reorder / delete / move, and the metadata scrub. They leave both
// arrays untouched, so they get their own counter or they would be invisible
// here. A monotonic count rather than a flag: `markSaved` records the value it
// saw, so the comparison stays correct without anything to reset.
let structuralEdits = 0
let savedStructuralEdits = 0

const listeners = new Set<() => void>()

function notify() {
  for (const cb of listeners) cb()
}

/**
 * Subscribe to the moments this module changes its own answer — a save, or a
 * structural edit. Store-driven changes (annotations, form values) are NOT
 * covered: subscribe to those stores directly for them. Returns an unsubscribe.
 */
export function onSavedStateChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Baseline "this is what the last saved copy contains". Called on load, on
 *  close, and after every successful export. */
export function markSaved(): void {
  savedAnnotations = useAnnotationStore.getState().annotations
  savedFormValues = useFormStore.getState().values
  savedStructuralEdits = structuralEdits
  notify()
}

/** Record an edit that changed the document's pages/bytes rather than its
 *  annotation layer. */
export function noteStructuralEdit(): void {
  structuralEdits++
  notify()
}

/**
 * Are there amendments that no saved copy contains?
 *
 * Compares by REFERENCE, not by value: both stores replace their arrays
 * immutably on every edit, so identity is an O(1) proxy for "something changed"
 * however large the annotations get (an imported picture is a multi-megabyte
 * data URL — deep-comparing those on every window close would be paid for in
 * frames). The one place identity lies is undo-back-to-the-start, which leaves
 * a fresh-but-equal array; the empty-vs-empty test below catches the common
 * case of that (draw one box, undo it) and anything subtler errs towards
 * offering to save, which is the safe direction.
 */
export function hasUnsavedChanges(): boolean {
  return isAmended(
    captureSavedBaseline(),
    useAnnotationStore.getState().annotations,
    useFormStore.getState().values
  )
}

/**
 * Everything this module knows about one document — the baseline AND the
 * structural-edit counter it is compared against.
 *
 * ⚠️ Per DOCUMENT, which is why it can be lifted out at all. With tabs, a
 * window holds several documents but these module variables only ever describe
 * the one on screen; `stores/tabStore.ts` captures the pair when a tab goes to
 * the background and puts it back when it returns, so a tab that was amended
 * is still amended when you come back to it (and one that was saved is not).
 */
export interface SavedBaseline {
  annotations: Annotation[] | null
  formValues: FormFieldValue[] | null
  structuralEdits: number
  savedStructuralEdits: number
}

export function captureSavedBaseline(): SavedBaseline {
  return {
    annotations: savedAnnotations,
    formValues: savedFormValues,
    structuralEdits,
    savedStructuralEdits
  }
}

/** Make `baseline` the state of the document now on screen. */
export function restoreSavedBaseline(baseline: SavedBaseline): void {
  savedAnnotations = baseline.annotations
  savedFormValues = baseline.formValues
  structuralEdits = baseline.structuralEdits
  savedStructuralEdits = baseline.savedStructuralEdits
  notify()
}

/**
 * The same question as `hasUnsavedChanges`, asked of a document that is NOT on
 * screen — a background tab, whose edits and baseline both live in a snapshot.
 * Same reference-identity rules; see above.
 */
export function isAmended(
  baseline: SavedBaseline,
  annotations: Annotation[],
  formValues: FormFieldValue[]
): boolean {
  if (baseline.structuralEdits !== baseline.savedStructuralEdits) return true
  const saved = baseline.annotations
  if (annotations !== saved && !(annotations.length === 0 && (saved?.length ?? 0) === 0)) {
    return true
  }
  const savedForms = baseline.formValues
  if (formValues !== savedForms && !(formValues.length === 0 && (savedForms?.length ?? 0) === 0)) {
    return true
  }
  return false
}
