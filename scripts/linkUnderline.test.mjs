// A link in a text annotation looks on screen the way it will in the export.
//
//   npm run test:link-underline
//
// Runs under Node's type-stripping; `textRuns.ts` imports only types.
//
// What is pinned (James, 2026-09-14: "show styling as it will appear in
// export"). The export draws a linked run as an UNDERLINE IN THE TEXT'S OWN
// COLOUR — no blue, no change of weight — and bakes an invisible (border-0)
// /Link annotation over it. Three places draw a text annotation, and all three
// must agree:
//
//   • the export              lib/export.ts
//   • the committed canvas    AnnotationLayer's Konva <Text>
//   • the open editor         the contentEditable overlay, styled by index.css
//
// The editor was the one that disagreed: Tailwind's preflight gives every `a`
// `text-decoration: inherit`, so a freshly linked word looked like plain text
// until the edit committed. The pixel-level comparison of canvas against the
// exported file rendered by pdf.js is e2e/link-style.e2e.mjs; this file pins
// the rule and that every renderer goes through it.
//
// Negative control (2026-09-14, run): with the `.upd-text-editor a` rule
// deleted from index.css the last test goes red; with `|| r.link` dropped from
// runUnderlined the first and fourth go red.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { effectiveRuns, runFontStyle, runUnderlined, runsToHtml } from '../src/lib/textRuns.ts'

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8')

test('a linked run is underlined', () => {
  assert.equal(runUnderlined({ text: 'our site', link: 'https://example.com' }), true)
})

test('an underlined run still is, and plain / bold / italic runs are not', () => {
  assert.equal(runUnderlined({ text: 'a', underline: true }), true)
  assert.equal(runUnderlined({ text: 'a' }), false)
  assert.equal(runUnderlined({ text: 'a', bold: true }), false)
  assert.equal(runUnderlined({ text: 'a', italic: true }), false)
})

test('a link changes neither weight nor slant', () => {
  // The export picks its font from bold/italic alone, so a link must not add
  // either on the canvas.
  assert.equal(runFontStyle({ text: 'a', link: 'https://example.com' }), 'normal')
})

test('a whole-annotation link (the pill, not the editor) is underlined too', () => {
  const runs = effectiveRuns({
    id: 't', pageIndex: 0, type: 'text', x: 0, y: 0, text: 'Visit', color: '#c2410c', fontSize: 14,
    link: 'https://example.com',
  })
  assert.equal(runs.length, 1)
  assert.equal(runUnderlined(runs[0]), true)
})

test('the editor is seeded with an <a> for a link — the element index.css styles', () => {
  assert.equal(
    runsToHtml([{ text: 'Visit ' }, { text: 'our site', link: 'https://example.com/x' }]),
    'Visit <a href="https://example.com/x">our site</a>',
  )
})

test('the export, the canvas and the editor all draw a link through the same rule', () => {
  assert.match(src('lib/export.ts'), /if \(runUnderlined\(run\)\)/, 'export.ts')
  const layer = src('components/Viewer/AnnotationLayer.tsx')
  assert.match(layer, /textDecoration=\{runUnderlined\(run\) \? 'underline' : ''\}/, 'Konva Text')
  assert.match(layer, /className="upd-text-editor"/, 'the editor carries the hook class')

  const rule = src('index.css').match(/\.upd-text-editor a\s*\{([^}]*)\}/)
  assert.ok(rule, 'index.css has a rule for links in the editor')
  assert.match(rule[1], /text-decoration:\s*underline/, 'underlined, as exported')
  // Its colour is the text's own, never the browser's link blue.
  assert.match(rule[1], /color:\s*inherit/, 'coloured as the text')
  assert.doesNotMatch(rule[1], /font-weight/, 'no weight change')
})
