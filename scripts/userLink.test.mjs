// What a typed "Link URL" becomes.
//
//   npm run test:user-link
//
// Pinned (2026-10-04): a bare `example.com` used to be stored as typed — a
// RELATIVE href that went nowhere in the exported PDF — and a `javascript:`
// link could be typed or pasted into a text box and written into the file.

import assert from 'node:assert/strict'
import test from 'node:test'
import { userLinkHref, safeLinkUrl } from '../src/lib/links.ts'

test('a bare address gets https://', () => {
  assert.equal(userLinkHref('example.com'), 'https://example.com/')
  assert.equal(userLinkHref('  www.gov.uk/guidance?x=1 '), 'https://www.gov.uk/guidance?x=1')
  assert.equal(userLinkHref('localhost:3000/a'), 'https://localhost:3000/a')
  assert.equal(userLinkHref('//cdn.example.org/x'), 'https://cdn.example.org/x')
})

test('a full URL is kept', () => {
  assert.equal(userLinkHref('https://unisim.co.uk/pdf'), 'https://unisim.co.uk/pdf')
  assert.equal(userLinkHref('http://example.com'), 'http://example.com/')
  assert.equal(userLinkHref('tel:+441234567890'), 'tel:+441234567890')
  assert.equal(userLinkHref('mailto:inbox@unisim.co.uk'), 'mailto:inbox@unisim.co.uk')
})

test('a bare email address becomes mailto:', () => {
  assert.equal(userLinkHref('inbox@unisim.co.uk'), 'mailto:inbox@unisim.co.uk')
})

test('script and data schemes are refused, typed or pasted', () => {
  assert.equal(userLinkHref('javascript:alert(1)'), null)
  assert.equal(userLinkHref('JavaScript:alert(1)'), null)
  assert.equal(userLinkHref('data:text/html,<b>x</b>'), null)
  assert.equal(userLinkHref('file:///etc/passwd'), null)
  assert.equal(safeLinkUrl('javascript:alert(1)'), null)
})

test('things that are not addresses are refused', () => {
  assert.equal(userLinkHref(''), null)
  assert.equal(userLinkHref('hello'), null)
  assert.equal(userLinkHref('two words.com'), null)
  assert.equal(userLinkHref('https://'), null)
})
