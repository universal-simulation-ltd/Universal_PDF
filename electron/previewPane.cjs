// Whether PDFs appear in Explorer's preview pane (Alt+P), and turning that on.
//
// The preview handler itself ships in resources\UniversalPdfThumb.dll and the
// installer registers its per-user half. What it cannot do is the last step:
//
// ⚠️ Windows only OFFERS a preview handler whose CLSID is listed in
// HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\PreviewHandlers. Every one of
// the handlers on a stock machine — Word, Excel, Adobe's — is there, none is
// per-user, and that key needs administrator rights, which a per-user installer
// deliberately does not ask for. Registered per-user alone the failure is
// silent and misleading: the shell starts prevhost.exe, never loads the DLL,
// and the pane just says "This file can't be previewed."
//
// So this is one elevation, asked for only by someone who actually wants the
// feature, and undoable the same way. Everything else about the install stays
// admin-free.
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')

// ⚠️ Must match CLSID_UniversalPdfPreviewHandler in
// native/win-thumbnail/src/dllmain.cpp and the CLSID in build/installer.nsh.
const PREVIEW_CLSID = '{7A337FC1-F731-4F4F-A3FB-3E1935248DED}'
const PREVIEW_NAME = 'Universal PDF Preview Handler'
const HANDLERS_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers'
// The per-user half, written by the installer: the ShellEx entry that points
// our ProgID at the handler. Without it the allow-list entry is meaningless.
const SHELLEX_KEY =
  'HKCU\\Software\\Classes\\UniversalPDF.Document\\ShellEx\\{8895b1c6-b41f-4c1c-a562-0d564250836f}'

const isWindows = () => process.platform === 'win32'

// Spawn that resolves rather than throws — same convention as defaultApp.cjs:
// a failed probe is "cannot tell", never an error worth showing.
function run(cmd, args, timeout = 30_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout || '') })
    })
  })
}

// The DLL is only there when the app was installed by our installer with the
// native build staged in; a `dist:win` run on a machine with no C++ toolchain
// ships without it, and the offer must not appear then.
function handlerDllPath() {
  return path.join(process.resourcesPath || '', 'UniversalPdfThumb.dll')
}

async function readsAsRegistered() {
  const res = await run('reg.exe', ['query', HANDLERS_KEY, '/v', PREVIEW_CLSID])
  return res.ok && res.stdout.includes(PREVIEW_CLSID)
}

async function shellExPresent() {
  const res = await run('reg.exe', ['query', SHELLEX_KEY])
  return res.ok && res.stdout.toUpperCase().includes(PREVIEW_CLSID.toUpperCase())
}

async function status() {
  if (!isWindows()) {
    return {
      platform: process.platform,
      supported: false,
      enabled: false,
      // macOS previews PDFs in Quick Look already, and GNOME/KDE through
      // poppler — there is nothing to switch on.
      reason: 'The preview pane is a Windows feature.',
    }
  }

  const installed = fs.existsSync(handlerDllPath())
  if (!installed) {
    return {
      platform: 'win32',
      supported: false,
      enabled: false,
      reason: 'This build does not include the preview handler.',
    }
  }

  const [enabled, registered] = await Promise.all([readsAsRegistered(), shellExPresent()])
  return {
    platform: 'win32',
    supported: true,
    enabled,
    // Enabled in the allow-list but missing the per-user half is a broken
    // half-install rather than "on": say so rather than showing a switch that
    // is already on and does nothing.
    incomplete: enabled && !registered,
    needsAdmin: true,
  }
}

// One elevated `reg.exe`, run through PowerShell because that is the only way
// to raise a child process from Node. The result is never trusted: the answer
// is whatever the registry says afterwards, which also covers the user simply
// dismissing the UAC prompt.
async function setEnabled(enable) {
  if (!isWindows()) return { ok: false, enabled: false, error: 'Windows only.' }
  if (!fs.existsSync(handlerDllPath())) {
    return { ok: false, enabled: false, error: 'This build does not include the preview handler.' }
  }

  // ⚠️ ONE string, values double-quoted, passed to -ArgumentList whole.
  // Windows PowerShell's Start-Process joins an ArgumentList ARRAY with spaces
  // and NO quoting, so a per-element list turned the spaced display name into
  // three bare words, reg.exe rejected the command, and the switch reported
  // "declined" to people who had just accepted the UAC prompt (v0.6.4).
  const regArgs = enable
    ? `add "${HANDLERS_KEY}" /v "${PREVIEW_CLSID}" /t REG_SZ /d "${PREVIEW_NAME}" /f`
    : `delete "${HANDLERS_KEY}" /v "${PREVIEW_CLSID}" /f`

  const script =
    `$ErrorActionPreference='Stop'; ` +
    `try { Start-Process -FilePath reg.exe -ArgumentList '${regArgs}' ` +
    `-Verb RunAs -WindowStyle Hidden -Wait } catch { exit 1 }`

  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])

  const enabledNow = await readsAsRegistered()
  if (enabledNow === !!enable) {
    return { ok: true, enabled: enabledNow, restartShell: true }
  }
  return {
    ok: false,
    enabled: enabledNow,
    // The overwhelmingly likely cause, and the only one worth naming: an
    // administrator prompt that was dismissed.
    error: enable
      ? 'Windows did not allow the change — the administrator prompt was declined.'
      : 'Windows did not allow the change — the administrator prompt was declined.',
  }
}

module.exports = { status, setEnabled, PREVIEW_CLSID }
