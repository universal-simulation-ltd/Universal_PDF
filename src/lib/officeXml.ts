// Namespace-agnostic XML helpers shared by the two office importers.
//
// Both OOXML and ODF are heavily namespaced, and the *prefixes* are not
// dependable — a producer may bind `w:` to a different letter, and ODF splits
// its vocabulary across a dozen namespaces (`text:`, `table:`, `style:`, `fo:`).
// Matching on `localName` sidesteps all of it: `w:tbl` and `tbl` are the same
// element to everything below, which is what makes one parser survive documents
// written by Word, LibreOffice, Google Docs and Pages alike.

import type { Block } from './blockPdf'

/** What either office importer hands back: a block document, plus its own title. */
export interface OfficeDocument {
  blocks: Block[]
  /** The document's own title, if it declares one worth using. */
  title?: string
}

/** Thrown when a document can't be read. Every message is written for the user. */
export class OfficeParseError extends Error {}

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  // DOMParser never throws — it hands back a document whose root is
  // <parsererror>, which would otherwise read as "a document with no content".
  if (doc.querySelector('parsererror')) {
    throw new OfficeParseError('That document could not be read (malformed XML).')
  }
  return doc
}

/** An attribute's value by local name, whatever prefix it was written with. */
export function attr(el: Element, localName: string): string | null {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === localName) return a.value
  }
  return null
}

/** Direct children matching a local name (or all of them). */
export function children(el: Element, localName?: string): Element[] {
  const out: Element[] = []
  for (const child of Array.from(el.children)) {
    if (!localName || child.localName === localName) out.push(child)
  }
  return out
}

/** The first direct child matching a local name. */
export function child(el: Element, localName: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === localName) return c
  }
  return null
}

/** Every descendant matching a local name, in document order. */
export function descendants(el: Element | Document, localName: string): Element[] {
  const out: Element[] = []
  const walk = (node: Element) => {
    for (const c of Array.from(node.children)) {
      if (c.localName === localName) out.push(c)
      walk(c)
    }
  }
  const root = 'documentElement' in el ? el.documentElement : el
  if (!root) return out
  if (root.localName === localName) out.push(root)
  walk(root)
  return out
}

/** The first descendant matching a local name. */
export function descendant(el: Element | Document, localName: string): Element | null {
  return descendants(el, localName)[0] ?? null
}

/**
 * Word and ODF both spell a boolean flag several ways: present-and-empty means
 * on, and an explicit `0`/`false`/`none` means off — which matters, because a
 * run that switches bold *off* against a bold paragraph style is common.
 */
export function isOn(value: string | null | undefined, presentMeansOn = true): boolean {
  if (value === null || value === undefined) return presentMeansOn
  const v = value.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'off' || v === 'none' || v === 'normal') return false
  return true
}
