// What a click on a PDF's own link does.
//
//   npm run test:link-safety
//
// Pinned (2026-10-04): a link annotation's address comes out of the file, and
// the words under it can say anything. Lookalike/punycode hosts, user@host
// tricks, bare IPs, http: and shorteners ask before opening; javascript:,
// data: and file: are never followed in any spelling a browser would run.

import assert from 'node:assert/strict'
import test from 'node:test'
import { hrefToOpen, judgePdfLink } from '../src/lib/links.ts'

const warn = (raw) => {
  const v = judgePdfLink(raw)
  assert.equal(v?.kind, 'follow', `${raw} should be followable`)
  return v.warnings
}

test('an ordinary https link opens without a question', () => {
  assert.deepEqual(warn('https://unisim.co.uk/pdf'), [])
  assert.equal(judgePdfLink('https://unisim.co.uk/pdf').host, 'unisim.co.uk')
})

test('mailto and tel are followed and never warned about', () => {
  assert.deepEqual(judgePdfLink('mailto:inbox@unisim.co.uk'), {
    kind: 'follow', href: 'mailto:inbox@unisim.co.uk', host: null, warnings: [],
  })
  assert.deepEqual(warn('tel:+441234567890'), [])
})

test('http: is flagged as unencrypted', () => {
  assert.deepEqual(warn('http://example.com/'), ['insecure'])
})

test('user@host shows the host it really opens', () => {
  const v = judgePdfLink('https://paypal.com@evil.example/login')
  assert.deepEqual(v.warnings, ['credentials'])
  assert.equal(v.host, 'evil.example')
})

test('punycode and non-Latin lookalike hosts are flagged, shown as punycode', () => {
  assert.deepEqual(warn('https://xn--pypal-4ve.com/'), ['lookalike'])
  const v = judgePdfLink('https://раураl.com/')
  assert.deepEqual(v.warnings, ['lookalike'])
  assert.match(v.host, /^xn--/)
})

test('bare IPs are flagged, in every spelling the URL parser normalises', () => {
  assert.deepEqual(warn('https://192.168.0.1/x'), ['ip'])
  assert.deepEqual(warn('https://3232235521/'), ['ip'])
  assert.deepEqual(warn('https://0xC0.0xA8.0.1/'), ['ip'])
  assert.deepEqual(warn('https://[::1]/'), ['ip'])
})

test('shorteners are flagged', () => {
  assert.deepEqual(warn('https://bit.ly/abc'), ['shortener'])
  assert.deepEqual(warn('https://www.tinyurl.com/abc'), ['shortener'])
})

test('several tricks at once are all reported', () => {
  assert.deepEqual(warn('http://bank.com@10.0.0.1/'), ['insecure', 'credentials', 'ip'])
})

test('script, data and file addresses are blocked in any spelling', () => {
  for (const raw of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' \tjava\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'blob:https://unisim.co.uk/1234',
  ]) {
    const v = judgePdfLink(raw)
    assert.equal(v?.kind, 'blocked', JSON.stringify(raw))
  }
  assert.equal(judgePdfLink('javascript:alert(1)').scheme, 'javascript')
})

test('nothing to follow: relative, unknown scheme, empty', () => {
  assert.equal(judgePdfLink('page2.html'), null)
  assert.equal(judgePdfLink('ftp://example.com/x'), null)
  assert.equal(judgePdfLink(''), null)
  assert.equal(judgePdfLink(undefined), null)
})

test('"Open anyway" drops the user@ disguise and keeps everything else', () => {
  assert.equal(hrefToOpen('https://paypal.com@evil.example/login?a=1#x'), 'https://evil.example/login?a=1#x')
  assert.equal(hrefToOpen('https://unisim.co.uk/pdf'), 'https://unisim.co.uk/pdf')
  assert.equal(hrefToOpen('mailto:inbox@unisim.co.uk'), 'mailto:inbox@unisim.co.uk')
})
