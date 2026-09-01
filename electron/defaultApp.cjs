// Is Universal PDF the system's default .pdf handler — and, where the OS allows
// it, making it so.
//
// ⚠️ THE THREE DESKTOPS ARE THREE DIFFERENT STORIES, and only two of them can
// change the setting at all:
//
//   macOS    Launch Services takes the change outright. `osascript -l
//            JavaScript` reaches `LSSetDefaultRoleHandlerForContentType`
//            through JXA's ObjC bridge, so this needs no native addon and no
//            helper binary — the reason there is no compiled code here.
//   Linux    `xdg-mime default`, which is just a spawn. But it names a
//            .desktop FILE, and an un-integrated AppImage has never installed
//            one — so we refuse rather than write an association pointing at
//            an entry that does not exist.
//   Windows  CANNOT be done by an application. The UserChoice key carries a
//            hash of the choice, salted per user and per extension, and
//            forging it is what malware does (Windows resets associations it
//            considers tampered with). The sanctioned path is to be a
//            registered candidate — see build/installer.nsh — and send the
//            user to Settings, which is why `set` here can only open a page.
//
// Detection works everywhere, which is what lets the app ask once and then stop
// asking.
const { app, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')

const PDF_UTI = 'com.adobe.pdf'
const PDF_MIME = 'application/pdf'

// ⚠️ Must match `build.fileAssociations[0].name` in package.json — that string
// IS the Windows ProgID (electron-builder passes it to NSIS as the file class),
// and it is what UserChoice names when this app is the default.
const WIN_PROGID = 'UniversalPDF.Document'
// ⚠️ Must match the `ApplicationName` written by build/installer.nsh, which is
// the key Settings deep-links by.
const WIN_APP_NAME = 'Universal PDF'

// Spawn that resolves rather than throws — every caller here treats a failed
// probe as "cannot tell", never as an error worth showing the user.
function run(cmd, args, timeout = 10_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

const sameId = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

// ---------------------------------------------------------------- macOS -----

// The .app bundle, three levels up from Contents/MacOS/<exe>.
const macBundlePath = () => path.resolve(app.getPath('exe'), '..', '..', '..')

// Reads (and optionally sets) the Launch Services handler. Returns its result
// as JSON on stdout — the script's final expression, NOT console.log, which
// osascript sends to stderr.
function macScript(bundlePath, write) {
  const uti = JSON.stringify(PDF_UTI)
  return `
ObjC.import('CoreServices')
;(function () {
  var out = { id: null, current: null }
  var bundle = $.NSBundle.bundleWithPath($(${JSON.stringify(bundlePath)}))
  if (bundle && !bundle.isNil() && !bundle.bundleIdentifier.isNil()) {
    out.id = ObjC.unwrap(bundle.bundleIdentifier)
  }
  function current() {
    var ref = $.LSCopyDefaultRoleHandlerForContentType($(${uti}), $.kLSRolesAll)
    if (!ref) return null
    try { return ObjC.unwrap(ObjC.castRefToObject(ref)) } catch (e) { return null }
  }
  ${
    write
      ? `if (out.id) {
    out.status = $.LSSetDefaultRoleHandlerForContentType($(${uti}), $.kLSRolesAll, $(out.id))
    // Viewer as well as All: an app can hold the viewer role while something
    // else keeps the editor role, and which one a double-click follows is not
    // ours to assume.
    $.LSSetDefaultRoleHandlerForContentType($(${uti}), $.kLSRolesViewer, $(out.id))
  }`
      : ''
  }
  out.current = current()
  return JSON.stringify(out)
})()
`
}

// ⚠️ Whether Gatekeeper accepts this build — and the reason an unnotarized one
// must NEVER be offered as the default handler.
//
// macOS refuses to let a Gatekeeper-rejected app open a QUARANTINED document,
// which is every PDF that came from a browser. The refusal names the DOCUMENT,
// not the app — "Apple could not verify «invoice.pdf» is free of malware" with
// a "Move to Bin" button — so becoming the default turns every downloaded PDF
// into what reads like a virus warning about the user's own file.
//
// An ad-hoc signature (a local `dist:mac:unsigned` build) is rejected here, as
// is anything signed without a Developer ID and notarized. That is correct: the
// offer should appear only on a build that can actually honour it.
//
// ⚠️ MEMOISED, and not as micro-optimisation. `spctl --assess` re-hashes the
// whole .app every time it is asked — measured at 1.9–2.5s on this bundle with
// everything already warm in the page cache, and it scales with bundle size
// (Calculator.app, 3.4MB, answers in 0.22s). `status()` is called on mount AND
// again on every window focus, so an uncached probe spends seconds of disk and
// CPU during the launch it is least affordable in — a cost macOS pays alone,
// which is most of why this app cold-starts slower here than on Windows or
// Linux. The answer cannot change while the app runs: the bundle it is asking
// about is the one currently executing, and macOS will not let it be rewritten
// underneath itself. A new build is a new process.
let macGatekeeperVerdict
async function macGatekeeperAccepts(bundlePath) {
  if (macGatekeeperVerdict !== undefined) return macGatekeeperVerdict
  const { ok } = await run('spctl', ['--assess', '--type', 'execute', bundlePath], 20_000)
  macGatekeeperVerdict = ok
  return ok
}

async function macQuery(write) {
  const { ok, stdout } = await run('osascript', ['-l', 'JavaScript', '-e', macScript(macBundlePath(), write)])
  if (!ok) return null
  try {
    return JSON.parse(stdout.trim())
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Linux -----

// Candidate .desktop names, in the order electron-builder is likely to have
// installed one: the product name for deb/rpm, the lower-cased executable for
// everything that follows the binary's name.
function linuxDesktopCandidates() {
  const exe = path.basename(app.getPath('exe'))
  return [`${app.getName()}.desktop`, `${exe}.desktop`, `${exe.toLowerCase()}.desktop`].filter(
    (name, i, all) => all.indexOf(name) === i
  )
}

function linuxDesktopDirs() {
  const home = app.getPath('home')
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)
  return [dataHome, ...dataDirs].map((dir) => path.join(dir, 'applications'))
}

// The candidate that actually exists on disk. Without one there is nothing
// valid to point `xdg-mime` at.
function linuxInstalledDesktop() {
  for (const name of linuxDesktopCandidates()) {
    for (const dir of linuxDesktopDirs()) {
      try {
        if (fs.existsSync(path.join(dir, name))) return name
      } catch {
        /* unreadable dir — try the next */
      }
    }
  }
  return null
}

async function linuxCurrent() {
  const { ok, stdout } = await run('xdg-mime', ['query', 'default', PDF_MIME])
  return ok ? stdout.trim() || null : null
}

// -------------------------------------------------------------- Windows -----

// What Windows will ACTUALLY open a .pdf with.
//
// ⚠️ This is not the same question as "what does UserChoice say", which is what
// this used to read — and the difference is not theoretical. On the dev box
// (2026-08-28) `HKCU\...\FileExts\.pdf\UserChoice\ProgId` still named
// `Acrobat.Document.DC` from 2025-11-04, while Windows itself opened PDFs with
// Universal PDF: the installer had written `HKCU\Software\Classes\.pdf`, and
// the shell was no longer honouring that stale UserChoice. The app told the
// user "PDFs currently open in Adobe Acrobat Document" while Settings showed
// Universal PDF holding `.pdf`, which reads as the app being broken.
//
// IApplicationAssociationRegistration::QueryCurrentDefault at AL_EFFECTIVE is
// the shell's own answer to the question, so ask that. There is no way to
// reach a COM interface with no IDispatch from Node, hence PowerShell — the
// registry read stays as the fallback for when that cannot run.
const WIN_EFFECTIVE_DEFAULT_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Assoc {
  [ComImport, Guid("4e530b0a-e611-4c77-a3ac-9031d022281b"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IApplicationAssociationRegistration {
    void QueryCurrentDefault([MarshalAs(UnmanagedType.LPWStr)] string query,
      int type, int level, [MarshalAs(UnmanagedType.LPWStr)] out string result);
  }
  [ComImport, Guid("591209c7-767b-42b2-9fba-44ee4615f2c7")]
  public class ApplicationAssociationRegistration { }
  public static string Pdf() {
    var reg = (IApplicationAssociationRegistration)(new ApplicationAssociationRegistration());
    string progId;
    // AT_FILEEXTENSION = 1, AL_EFFECTIVE = 1.
    reg.QueryCurrentDefault(".pdf", 1, 1, out progId);
    return progId;
  }
}
"@
[Assoc]::Pdf()
`

async function windowsEffectiveProgId() {
  // -EncodedCommand rather than -Command: the script embeds a C# here-string
  // full of double quotes, and handing that to powershell.exe as a command
  // line is a quoting minefield that fails silently — as a blank answer, which
  // this function cannot tell from "no association".
  const encoded = Buffer.from(WIN_EFFECTIVE_DEFAULT_PS, 'utf16le').toString('base64')
  const { ok, stdout } = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    20_000
  )
  if (!ok) return null
  const progId = stdout.trim().split(/\r?\n/).pop().trim()
  return progId || null
}

// The stale-but-present key, kept only as the fallback described above.
async function windowsUserChoice() {
  const key =
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice'
  const { ok, stdout } = await run('reg', ['query', key, '/v', 'ProgId'])
  if (!ok) return null
  // `    ProgId    REG_SZ    AppXd4nrz8ff68srnhf9t5a8sbjyar1cr723`
  const match = stdout.match(/ProgId\s+REG_\w+\s+(.+)/)
  return match ? match[1].trim() : null
}

async function windowsCurrent() {
  return (await windowsEffectiveProgId()) || (await windowsUserChoice())
}

// The human name behind a ProgID — `HKCR\<ProgId>`'s default value, e.g.
// "Adobe Acrobat Document".
//
// ⚠️ This exists because the offer looked broken without it. Detection was
// investigated on 2026-08-27 as "never confirms on Windows" and turned out to
// be correct all along: the association simply had not changed, so the app kept
// asking and appeared to be ignoring the answer. Naming what currently holds
// `.pdf` turns a nag into a statement of fact the user can act on — and it is
// worth knowing that Acrobat re-claims the type on its own schedule, so
// "I set it yesterday" and "it is not set now" are both true surprisingly often.
async function windowsCurrentName(progId) {
  if (!progId) return null
  const { ok, stdout } = await run('reg', ['query', `HKCR\\${progId}`, '/ve'])
  if (!ok) return null
  const match = stdout.match(/\(Default\)\s+REG_\w+\s+(.+)/)
  const name = match ? match[1].trim() : ''
  return name || null
}

// ----------------------------------------------------------------- API ------

/**
 * `supported` is whether this build can even answer the question — false in
 * development, where the bundle/executable belongs to Electron itself and
 * "make me the default" would hand every PDF on the machine to a dev binary.
 */
async function status() {
  const base = { platform: process.platform, supported: false, isDefault: false, canSet: false }
  if (!app.isPackaged) return { ...base, reason: 'unpackaged' }

  if (process.platform === 'darwin') {
    const info = await macQuery(false)
    if (!info || !info.id) return { ...base, reason: 'no-bundle-id' }
    const isDefault = sameId(info.id, info.current)
    // Already the handler? Then `canSet` is answering a question nobody is
    // asking — there is no offer to make — and the seconds `spctl` costs would
    // buy nothing. Skipped rather than cached-away, so the common case never
    // pays it even once.
    // (`canSet` is unobservable here: every reader of it in the UI sits behind
    // `available`, which is false whenever `isDefault` is true.)
    if (isDefault)
      return { ...base, supported: true, canSet: true, isDefault: true, reason: 'already-default' }
    const notarized = await macGatekeeperAccepts(macBundlePath())
    return {
      ...base,
      supported: true,
      canSet: notarized,
      isDefault,
      reason: notarized ? undefined : 'not-notarized',
    }
  }

  if (process.platform === 'linux') {
    const desktop = linuxInstalledDesktop()
    const current = await linuxCurrent()
    const isDefault = !!current && linuxDesktopCandidates().some((name) => name === current)
    // No installed .desktop (a bare AppImage) means the question is still
    // answerable but the answer cannot be changed from here.
    return { ...base, supported: true, canSet: !!desktop, isDefault, reason: desktop ? undefined : 'no-desktop-entry' }
  }

  if (process.platform === 'win32') {
    const current = await windowsCurrent()
    const isDefault = sameId(current, WIN_PROGID)
    // `canSet` stays FALSE on Windows even though `makeDefault` does something:
    // it opens Settings. The UI says so rather than promising a switch.
    return {
      ...base,
      supported: true,
      isDefault,
      // Only when we are NOT it: naming ourselves back to the user is noise.
      currentName: isDefault ? undefined : await windowsCurrentName(current),
      reason: 'settings-only',
    }
  }

  return { ...base, reason: 'unsupported-platform' }
}

/**
 * Resolves `{ ok, isDefault }` where `ok` means the request was carried out —
 * on Windows that means Settings was opened, which is as far as an application
 * is allowed to go, so callers must read `isDefault` rather than assume.
 */
async function makeDefault() {
  if (!app.isPackaged) return { ok: false, isDefault: false, error: 'Not available in development.' }

  if (process.platform === 'darwin') {
    if (!(await macGatekeeperAccepts(macBundlePath()))) {
      return {
        ok: false,
        isDefault: false,
        error: 'This build is not signed by Apple, and macOS would refuse to open downloaded PDFs with it.',
      }
    }
    const info = await macQuery(true)
    if (!info || !info.id) return { ok: false, isDefault: false, error: 'Could not read the app bundle.' }
    const isDefault = sameId(info.id, info.current)
    return isDefault
      ? { ok: true, isDefault: true }
      : { ok: false, isDefault: false, error: 'macOS did not accept the change.' }
  }

  if (process.platform === 'linux') {
    const desktop = linuxInstalledDesktop()
    if (!desktop) {
      return {
        ok: false,
        isDefault: false,
        error: 'No desktop entry is installed for this build, so there is nothing to associate.',
      }
    }
    await run('xdg-mime', ['default', desktop, PDF_MIME])
    const current = await linuxCurrent()
    const isDefault = current === desktop
    return isDefault ? { ok: true, isDefault: true } : { ok: false, isDefault: false, error: 'xdg-mime did not take the change.' }
  }

  if (process.platform === 'win32') {
    // Windows 11 opens this app's own page; Windows 10 ignores the parameter
    // and opens the list, which is still the right place.
    await shell.openExternal(
      `ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(WIN_APP_NAME)}`
    )
    return { ok: true, isDefault: false, openedSettings: true }
  }

  return { ok: false, isDefault: false, error: 'Not supported on this platform.' }
}

module.exports = { status, makeDefault }
