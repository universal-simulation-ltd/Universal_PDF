import { parseVersionedName, versionedName } from '@unisim/sdk'

/**
 * The filename an export gets.
 *
 * Every download used to carry a word for what had been done to it —
 * `-updated`, `-updated-compressed`, `-filled` — appended to whatever the file
 * was already called. That is fine exactly once. Open the result and export it
 * again and you get `report-updated-updated.pdf`, and after that the name is
 * recording how many times it went round rather than what it is.
 *
 * Now it is `report-v2.pdf`, `report-v3.pdf`. `versionedName` parses the tail
 * and replaces it, so a re-export increments instead of stacking, and it strips
 * the old suffixes on the way — a `report-updated.pdf` from before this change
 * comes out as `report-v2.pdf` rather than `report-updated-v1.pdf`.
 *
 * ⚠️ THE COUNTER IS WHY THIS IS NOT JUST A CALL TO `versionedName`. Exporting
 * twice in one sitting never sends the file back through the app, so both
 * exports would work out the same next version and the browser would quietly
 * hand you `report-v2 (1).pdf`. Counting exports per document within the
 * session makes the second one v3, which is what somebody who pressed Export
 * twice actually meant.
 *
 * ⚠️ THE FIRST EXPORT IS v2, NOT v1 (James, 2026-08-20). The document you
 * opened is already a version of itself — it is v1 — so the thing you make
 * from it is the second. Naming that first export `report-v1.pdf` puts two
 * different files on the disk with the same claim, and the one that says "v1"
 * is the one that isn't the original. `versionedName` on its own means "the
 * next version of this NAME", which is a different question and the right
 * default for the SDK, so the extra step lives here rather than there: an
 * unversioned source is treated as being at v1 already.
 *
 * A name that ALREADY carries a version needs no such treatment —
 * `report-v4.pdf` is self-describing, and its next export is v5 either way.
 */
const exportsThisSession = new Map<string, number>()

/**
 * How far past the source name to count.
 *
 * `bump` is relative to the version `versionedName` can see on the name, so an
 * unversioned original needs one extra to make the first export v2.
 */
function baseBump(source: string): number {
  return parseVersionedName(source).version > 0 ? 0 : 1
}

export function nextExportName(fileName: string | null | undefined, ext = 'pdf'): string {
  const source = fileName ?? 'document.pdf'
  // Keyed on the name as opened. Two documents with the same name in one
  // session share a counter, which is the safe way round: it over-counts and
  // produces a higher version, rather than colliding.
  const key = source.toLowerCase()
  const nth = (exportsThisSession.get(key) ?? 0) + 1
  exportsThisSession.set(key, nth)
  return versionedName(source, { ext, bump: nth + baseBump(source) })
}

/**
 * The name an export WOULD get, without claiming it.
 *
 * For showing the filename in the UI before the button is pressed. Calling
 * `nextExportName` to render a label would burn a version every re-render.
 */
export function previewExportName(fileName: string | null | undefined, ext = 'pdf'): string {
  const source = fileName ?? 'document.pdf'
  const nth = (exportsThisSession.get(source.toLowerCase()) ?? 0) + 1
  return versionedName(source, { ext, bump: nth + baseBump(source) })
}
