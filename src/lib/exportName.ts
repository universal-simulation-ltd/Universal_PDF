import { versionedName } from '@unisim/sdk'

/**
 * The filename an export gets.
 *
 * Every download used to carry a word for what had been done to it —
 * `-updated`, `-updated-compressed`, `-filled` — appended to whatever the file
 * was already called. That is fine exactly once. Open the result and export it
 * again and you get `report-updated-updated.pdf`, and after that the name is
 * recording how many times it went round rather than what it is.
 *
 * Now it is `report-v1.pdf`, `report-v2.pdf`. `versionedName` parses the tail
 * and replaces it, so a re-export increments instead of stacking, and it strips
 * the old suffixes on the way — a `report-updated.pdf` from before this change
 * comes out as `report-v1.pdf` rather than `report-updated-v1.pdf`.
 *
 * ⚠️ THE COUNTER IS WHY THIS IS NOT JUST A CALL TO `versionedName`. Exporting
 * twice in one sitting never sends the file back through the app, so both
 * exports would work out the same next version and the browser would quietly
 * hand you `report-v1 (1).pdf`. Counting exports per document within the
 * session makes the second one v2, which is what somebody who pressed Export
 * twice actually meant.
 */
const exportsThisSession = new Map<string, number>()

export function nextExportName(fileName: string | null | undefined, ext = 'pdf'): string {
  const source = fileName ?? 'document.pdf'
  // Keyed on the name as opened. Two documents with the same name in one
  // session share a counter, which is the safe way round: it over-counts and
  // produces a higher version, rather than colliding.
  const key = source.toLowerCase()
  const bump = (exportsThisSession.get(key) ?? 0) + 1
  exportsThisSession.set(key, bump)
  return versionedName(source, { ext, bump })
}

/**
 * The name an export WOULD get, without claiming it.
 *
 * For showing the filename in the UI before the button is pressed. Calling
 * `nextExportName` to render a label would burn a version every re-render.
 */
export function previewExportName(fileName: string | null | undefined, ext = 'pdf'): string {
  const source = fileName ?? 'document.pdf'
  const bump = (exportsThisSession.get(source.toLowerCase()) ?? 0) + 1
  return versionedName(source, { ext, bump })
}
