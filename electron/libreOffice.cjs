// Convert a Word / OpenDocument file with LibreOffice, when the user happens to
// have it installed.
//
// WHY THIS EXISTS. `@unisim/doc` *re-typesets* an office document — it reads the
// text and structure and lays them out again. That is honest (the app says so in
// the amber bar) and it works everywhere, including the web build and the phone.
// What it is not, and never will be, is a facsimile of Word's own pagination.
// LibreOffice has Word's layout engine's nearest free equivalent, so where it is
// already on the machine we can hand the user a genuinely faithful PDF instead.
//
// It is a FALLBACK IN THE OPTIMISTIC DIRECTION: nothing is required, nothing is
// bundled, and a machine without LibreOffice behaves exactly as it did before.
// We never install it, never prompt to install it, and never block on it.
//
// ⚠️ WE DO NOT BUNDLE IT, DELIBERATELY. A bundled LibreOffice is ~400MB per
// platform and drags in its own signing and notarisation problems on macOS. This
// module exists precisely so we get the fidelity for free from the copy that is
// already there, or not at all.
//
// LICENCE NOTE: LibreOffice is MPL-2.0. Invoking it as a separate process is not
// linking and does not affect this app's MIT licence. Do not "simplify" this by
// pulling any LibreOffice code in-process.
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')

// A cold LibreOffice start is genuinely slow — it builds a user profile on the
// first run and loads a large amount of code. This is generous on purpose: a
// timeout here means the user gets the re-typeset PDF instead, which is a
// correct but worse answer, so we would rather wait than downgrade too eagerly.
const CONVERT_TIMEOUT_MS = 90_000
// The probe just runs `--version`, which is fast even cold.
const PROBE_TIMEOUT_MS = 20_000

/**
 * ⚠️ THE SINGLE MOST IMPORTANT LINE IN THIS FILE.
 *
 * `soffice` is a single-instance application built around a user profile. Run
 * it headless while the user has LibreOffice OPEN — the overwhelmingly common
 * case on a machine that has it at all — and the new process hands the job to
 * the running GUI instance and exits 0 immediately, having converted nothing.
 * The symptom is the worst kind: success, no error, no output file.
 *
 * Pointing it at a profile directory of our own makes it a genuinely separate
 * instance, so it converts whatever the user happens to be doing. This is the
 * documented remedy and it is not optional.
 */
function profileDirUrl() {
  let base
  try {
    // Persistent, so the expensive first-run profile build happens once ever
    // rather than once per conversion.
    base = require('electron').app.getPath('userData')
  } catch {
    base = os.tmpdir()
  }
  const dir = path.join(base, 'libreoffice-profile')
  // pathToFileURL gets the Windows spelling right (file:///C:/...), which a
  // hand-built 'file://' + path does not.
  return pathToFileURL(dir).href
}

/** Where LibreOffice actually lives, per platform. First hit wins. */
function candidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
      '/opt/homebrew/bin/soffice',
      '/usr/local/bin/soffice',
    ]
  }
  if (process.platform === 'win32') {
    const dirs = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['ProgramW6432'],
    ].filter(Boolean)
    return dirs.map((d) => path.join(d, 'LibreOffice', 'program', 'soffice.exe'))
  }
  return [
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/snap/bin/libreoffice',
    '/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice',
    // Last: let PATH answer, for a distro that put it somewhere else entirely.
    'soffice',
    'libreoffice',
  ]
}

/** execFile that resolves rather than throws — a failed probe is "cannot tell". */
function run(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), err })
    })
  })
}

// Resolved once per app run. `null` means "looked, not found".
let cached
async function detect() {
  if (cached !== undefined) return cached
  for (const bin of candidates()) {
    // A bare name (PATH lookup) cannot be stat'd, so let the probe decide.
    if (path.isAbsolute(bin) && !fs.existsSync(bin)) continue
    const res = await run(bin, ['--version'], PROBE_TIMEOUT_MS)
    if (res.ok) {
      cached = { path: bin, version: res.stdout.trim().split('\n')[0] || 'LibreOffice' }
      return cached
    }
  }
  cached = null
  return cached
}

/** For the UI: is the faithful path available, and what is it? */
async function status() {
  const found = await detect()
  return found
    ? { available: true, version: found.version }
    : { available: false }
}

/**
 * ⚠️ CONVERSIONS ARE RUN ONE AT A TIME, AND MUST BE.
 *
 * `profileDirUrl()` makes us a separate instance from the USER's LibreOffice.
 * It does not make us separate from OURSELVES: two of our own `soffice`
 * processes pointed at the same profile are the same single-instance clash all
 * over again, and the second one loses. Measured on 2026-08-31 — three
 * concurrent conversions of one fixture returned two PDFs and one empty result.
 *
 * A queue rather than a profile per conversion, because a fresh profile makes
 * LibreOffice do its expensive first-run build every single time. Serial and
 * warm (~1.5s) beats parallel and cold (~4s each) at every batch size we will
 * realistically see, and it cannot fail.
 */
let queue = Promise.resolve()
function convert(bytes, fileName) {
  const run = queue.then(() => convertNow(bytes, fileName))
  // The chain must survive a rejection or every later conversion inherits it.
  // `convertNow` resolves rather than throws, but a bug in it must not wedge
  // the queue for the rest of the session.
  queue = run.then(() => undefined, () => undefined)
  return run
}

/**
 * Convert `bytes` (a .docx/.odt file) to PDF. Resolves `{ ok: false }` for every
 * failure rather than throwing — the caller's answer to "no" is always "use the
 * built-in converter", never "show an error", because the built-in converter
 * would have been the only option a moment ago anyway.
 */
async function convertNow(bytes, fileName) {
  const found = await detect()
  if (!found) return { ok: false, reason: 'not-installed' }

  // Its own directory per conversion: `--outdir` writes `<basename>.pdf`, and
  // two conversions of files that differ only by extension would otherwise
  // collide.
  let dir
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'unipdf-lo-'))
  } catch (err) {
    return { ok: false, reason: 'temp-failed', error: String(err && err.message) }
  }

  try {
    // Keep the real extension: LibreOffice picks its import filter from it, and
    // a .docx called .tmp imports as nothing.
    const ext = (path.extname(fileName || '') || '.docx').toLowerCase()
    const stem = 'input'
    const input = path.join(dir, stem + ext)
    await fs.promises.writeFile(input, Buffer.from(bytes))

    const res = await run(
      found.path,
      [
        `-env:UserInstallation=${profileDirUrl()}`, // ⚠️ see profileDirUrl()
        '--headless',
        '--norestore', // don't offer to recover documents from a past crash
        '--invisible',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        input,
      ],
      CONVERT_TIMEOUT_MS,
    )

    // ⚠️ EXIT CODE IS NOT THE ANSWER. soffice exits 0 on plenty of conversions
    // it did not perform (see profileDirUrl). The output file existing is the
    // only reliable signal, so it is what we check.
    const output = path.join(dir, stem + '.pdf')
    let pdf
    try {
      pdf = await fs.promises.readFile(output)
    } catch {
      return {
        ok: false,
        reason: res.ok ? 'no-output' : 'convert-failed',
        error: (res.stderr || res.stdout || '').trim().slice(0, 500),
      }
    }
    if (pdf.length === 0) return { ok: false, reason: 'no-output' }

    return { ok: true, bytes: pdf, version: found.version }
  } catch (err) {
    return { ok: false, reason: 'convert-failed', error: String(err && err.message) }
  } finally {
    // Never leave the user's document sitting in a temp directory.
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = { status, convert }
