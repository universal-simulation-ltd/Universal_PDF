// Export naming — the rule is "the document you opened is v1".
//
//   npm run test:names
//
// Runs under Node's type-stripping, so `exportName.ts` is imported directly.
// ⚠️ That means any module it reaches must import its neighbours WITH the
// `.ts` extension — type-stripping does not resolve extensionless specifiers.
// (Same landmine that silently broke Universal Converter's self-tests.)
//
// The behaviour worth pinning, and the reason it is not just a call to the
// SDK's `versionedName`: that function answers "the next version of this
// NAME", so an unversioned `report.pdf` becomes `report-v1.pdf`. But the file
// on disk is already a version of itself, so that puts two different documents
// on the disk both claiming to be v1 — and the one labelled v1 is the one that
// isn't the original. Here the first export is v2.
//
// Negative control (2026-08-20): forcing `baseBump` to return 0 — i.e. the old
// start-at-v1 behaviour — turns 10 of these 14 red. If a future edit makes them
// all pass trivially, that is the thing to check first.

import { nextExportName, previewExportName } from '../src/lib/exportName.ts'

let pass = 0
let fail = 0
const eq = (actual, expected, label) => {
  if (actual === expected) {
    pass++
    console.log(`  ok   ${label}  -> ${actual}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n       expected ${expected}\n       actual   ${actual}`)
  }
}

// `previewExportName` renders the name in the modal on every keystroke, so it
// must be free of side effects — calling it must not burn a version.
console.log('preview (does not consume a version):')
eq(previewExportName('report.pdf'), 'report-v2.pdf', 'unversioned original previews as v2')
eq(previewExportName('report.pdf'), 'report-v2.pdf', 'previewing twice does not advance')
eq(previewExportName('report-v4.pdf'), 'report-v5.pdf', 'a v4 source previews as v5')
eq(previewExportName('report-updated.pdf'), 'report-v2.pdf', 'legacy suffix stripped, still v2')

// The in-session counter exists because a second export never sends the file
// back through the app — without it both downloads would compute the same name
// and the browser would invent `report-v2 (1).pdf`.
console.log('\nnextExportName (consumes one per press):')
eq(nextExportName('report.pdf'), 'report-v2.pdf', 'first export of an unversioned doc')
eq(nextExportName('report.pdf'), 'report-v3.pdf', 'second export in the same session')
eq(nextExportName('report.pdf'), 'report-v4.pdf', 'third export in the same session')

// A name that already carries a version needs no adjusting — it is
// self-describing, and its next export is the one after it either way.
eq(nextExportName('deck-v1.pdf'), 'deck-v2.pdf', 'a v1 source exports as v2')
eq(nextExportName('deck-v1.pdf'), 'deck-v3.pdf', 'and again in-session -> v3')
eq(nextExportName('slides-v9.pdf'), 'slides-v10.pdf', 'double digits carry')

eq(nextExportName('scan.PDF'), 'scan-v2.pdf', 'extension normalised to the default ext')
eq(nextExportName('photo.png', 'jpg'), 'photo-v2.jpg', 'a changed extension still starts at v2')
eq(nextExportName(null), 'document-v2.pdf', 'no filename at all')
eq(nextExportName('my.report.final.pdf'), 'my.report.final-v2.pdf', 'dots in the stem survive')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
