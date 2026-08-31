// A stand-in web server for the extension e2e: the four shapes a PDF actually
// arrives in on the web, including the two that break.
//
// Kept separate from the spec so the request LOG is a first-class object. Half
// of what the extension claims is about how many times a document is fetched,
// and you cannot assert that from the browser side.

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export function startPdfHost(port = 0) {
  const pdf = readFileSync(join(HERE, 'fixtures', 'sample.pdf'))
  const log = []
  const spent = new Set()

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const cookie = req.headers.cookie ?? ''
    log.push({ path: url.pathname, search: url.search, cookie })

    const sendPdf = (extra = {}) => {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, ...extra })
      res.end(pdf)
    }
    const deny = (code, text) => {
      res.writeHead(code, { 'Content-Type': 'text/plain' })
      res.end(text)
    }

    switch (url.pathname) {
      case '/':
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end(
          '<!doctype html><title>Host</title><h1>Fixture host</h1>' +
            '<a id="plain" href="/plain.pdf">A plain PDF link</a><br>' +
            '<a id="report" href="/download">A PDF at an extensionless address</a>'
        )
      // A PDF at a `.pdf` address — the ordinary case.
      case '/plain.pdf':
        return sendPdf({ 'Cache-Control': 'max-age=300' })
      // The same PDF at an address with no extension, named only by
      // Content-Disposition — what a "download" endpoint really looks like.
      case '/download':
        return sendPdf({
          'Cache-Control': 'max-age=300',
          'Content-Disposition': 'inline; filename="Quarterly report.pdf"'
        })
      case '/login':
        res.writeHead(302, { 'Set-Cookie': 'sid=good; Path=/; SameSite=Lax', Location: '/' })
        return res.end()
      // Behind a session cookie. The browser's viewer can show it; the question
      // is whether the extension can still read it back.
      case '/private.pdf':
        if (!/sid=good/.test(cookie)) return deny(403, 'no session')
        return sendPdf({ 'Cache-Control': 'private, max-age=300' })
      // The shape that genuinely cannot be reopened: a single-use link whose
      // response may not be cached, so the bytes are gone the moment the
      // browser has painted them.
      case '/onetime.pdf': {
        if (spent.has(url.search)) return deny(403, 'token already used')
        spent.add(url.search)
        return sendPdf({ 'Cache-Control': 'no-store' })
      }
      default:
        return deny(404, 'not found')
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        log,
        /** How many times the server was asked for `path`. */
        gets: (path) => log.filter((entry) => entry.path === path).length,
        cookiesSeenFor: (path) => log.filter((entry) => entry.path === path).map((entry) => entry.cookie),
        // ⚠️ `closeAllConnections` first. Chrome holds the socket open after a
        // page load, and `server.close()` waits for every connection to drain —
        // so closing the fixture host at the end of a spec hangs FOREVER,
        // several minutes after the last assertion has already passed. It looks
        // exactly like a browser that never came back.
        close: () =>
          new Promise((done) => {
            server.closeAllConnections()
            server.close(done)
          })
      })
    })
  })
}
