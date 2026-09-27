#!/usr/bin/env node
// The iOS app will actually launch, and will survive reaching the camera.
//
//   npm run check:ios-launch
//
// ⚠️ WHY THIS EXISTS. Both faults below kill the PROCESS — no error screen, no
// JavaScript, nothing the app itself can catch or report — and neither can be
// seen by reading the web code, running the tests, or watching Xcode say BUILD
// SUCCEEDED. Universal PDF 1.0.3 was rejected by App Review with "the app
// crashed after the initial launch" for the first of them.
//
// 1. **The UIScene life cycle.** iOS terminates an app built against the
//    current SDK that still uses the old app-delegate window life cycle:
//    "UIScene life cycle is required for apps built with this SDK". Three
//    pieces are needed and a missing one is silent — the Info.plist manifest,
//    a scene delegate class, and `configurationForConnecting` on the app
//    delegate, because the runtime checks the delegate answers it rather than
//    trusting the plist. Capacitor adopted scenes in 8.5; this app is on 7 and
//    writes them out by hand, so nothing upstream will notice if one is lost
//    to a merge or a `cap sync`.
//
// 2. **Usage strings for what the WEB layer reaches.** A missing
//    `NS…UsageDescription` is a TCC violation, and iOS kills the process on
//    the first touch of the resource (Docs_UNI_SIM/landmines.md). An
//    `<input type="file">` makes the WebView offer "Take Photo" — unless its
//    accept rules media out — so the camera is reachable from our own UI with
//    no native code anywhere in this repo naming it. That invisibility is the
//    whole problem: this reads the file inputs out of `src/` rather than
//    trusting a list. See the note above the scan for the two shapes an
//    earlier version of it missed.
//
//    ⚠️ This is the reference copy for the rest of the suite. Porting it is a
//    backlog item, and the 2026-09-27 audit it comes from found Universal Date
//    Polling and Cyber Assess shipping image pickers with no usage string at
//    all.
//
// Run by `npm run cap:sync` alongside `check:mobile-bundle`, which answers the
// other half of the question — whether what launches has anything to show.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IOS = join(ROOT, 'ios/App/App')
const PBXPROJ = join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj')

const problems = []
const fail = (what, why) => problems.push(`${what}\n    ${why}`)

// ── A very small XML-plist reader ──────────────────────────────────────────
// Enough for the keys asked about here (dict, array, string, true, false).
// Node has no plist parser and the alternative — regexing for a key and hoping
// the value nearby is the right one — is exactly how a nested key gets read
// out of the wrong dictionary. Comments are stripped first: this plist is full
// of them, and they are the reason a naive reader falls over.
function parsePlist(xml) {
  const body = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')

  let at = 0

  // The next tag, as { name, closing, empty }, or null at the end.
  function tag() {
    const open = body.indexOf('<', at)
    if (open === -1) return null
    const close = body.indexOf('>', open)
    if (close === -1) throw new Error('unterminated tag')
    const raw = body.slice(open + 1, close).trim()
    at = close + 1
    return {
      name: raw.replace(/^\//, '').replace(/\/$/, '').split(/\s/)[0],
      closing: raw.startsWith('/'),
      empty: raw.endsWith('/')
    }
  }

  // The text between here and the next tag.
  function textUntilClose() {
    const open = body.indexOf('<', at)
    const raw = body.slice(at, open === -1 ? undefined : open)
    tag() // consume the closing tag
    return decode(raw)
  }

  function value(name) {
    if (name === 'dict') {
      const out = {}
      for (;;) {
        const t = tag()
        if (!t) throw new Error('unterminated <dict>')
        if (t.closing && t.name === 'dict') return out
        if (t.name !== 'key') throw new Error(`expected <key>, got <${t.name}>`)
        const key = textUntilClose()
        const v = tag()
        if (!v) throw new Error(`no value for <key>${key}</key>`)
        out[key] = v.empty ? v.name === 'true' : value(v.name)
      }
    }
    if (name === 'array') {
      const out = []
      for (;;) {
        const t = tag()
        if (!t) throw new Error('unterminated <array>')
        if (t.closing && t.name === 'array') return out
        out.push(t.empty ? t.name === 'true' : value(t.name))
      }
    }
    return textUntilClose() // string, integer, date, …
  }

  for (;;) {
    const t = tag()
    if (!t) throw new Error('no root <dict> in the plist')
    if (t.name === 'dict' && !t.closing) return value('dict')
  }
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()

// ── 1. The UIScene life cycle ──────────────────────────────────────────────
const infoPlistPath = join(IOS, 'Info.plist')
let info = {}
try {
  info = parsePlist(readFileSync(infoPlistPath, 'utf8'))
} catch (err) {
  fail('Info.plist could not be read', String(err))
}

const scenes = info.UIApplicationSceneManifest
const roles = scenes?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication
const sceneConfig = Array.isArray(roles) ? roles[0] : undefined
const delegateClass = sceneConfig?.UISceneDelegateClassName

if (!scenes) {
  fail(
    'Info.plist has no UIApplicationSceneManifest',
    'iOS terminates an app built against this SDK that has not adopted the UIScene life cycle.'
  )
} else if (!delegateClass) {
  fail(
    'The scene manifest names no UISceneDelegateClassName',
    'UIApplicationSceneManifest > UISceneConfigurations > UIWindowSceneSessionRoleApplication[0] needs one.'
  )
}

// "$(PRODUCT_MODULE_NAME).SceneDelegate" -> "SceneDelegate"
const delegateName = delegateClass?.split('.').pop()
if (delegateName) {
  const source = `${delegateName}.swift`
  if (!existsSync(join(IOS, source))) {
    fail(`${source} does not exist`, `The scene manifest names ${delegateClass}, so that class has to be here.`)
  }
  const pbxproj = readFileSync(PBXPROJ, 'utf8')
  const sources = pbxproj.match(/isa = PBXSourcesBuildPhase;[\s\S]*?\);/)?.[0] ?? ''
  if (!sources.includes(source)) {
    fail(
      `${source} is not in the Xcode target's Sources build phase`,
      'A Swift file that is not compiled in is not there at run time, and the app is killed at launch.'
    )
  }
}

// Comments stripped first, and the whole signature matched rather than the
// selector name: the method commented out, or mentioned only in a note like
// this one, must not read as implemented.
const appDelegate = readFileSync(join(IOS, 'AppDelegate.swift'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
const connects = /func\s+application\s*\([^)]*\bconfigurationForConnecting\b[^)]*\)\s*->\s*UISceneConfiguration/
if (!connects.test(appDelegate)) {
  fail(
    'AppDelegate does not implement application(_:configurationForConnecting:options:)',
    'The scene manifest alone does not satisfy the runtime check — it asks the app delegate.'
  )
}

// ── 2. Usage strings for what the web layer can reach ──────────────────────
// Every `accept` on an <input type="file"> in src/. A file input that takes an
// image gets a "Take Photo" entry in the WebView's picker, and tapping it
// opens the camera.
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

// ⚠️ TWO WAYS THIS USED TO MISS ONE, both found by auditing the suite with it
// on 2026-09-27 — it read `accept="…"` and nothing else:
//
//   1. **The accept is not always in the markup.** The SDK's `useFileDrop`
//      takes it as an option and spreads `inputProps` onto the input, so the
//      app's own source says `accept: 'image/png,…'` — a colon, single quotes.
//      That is how Universal Date Polling writes its poll-logo picker, and its
//      Info.plist had no usage strings at all.
//   2. **An input with NO accept reaches the camera too.** iOS decides the
//      action sheet from the accept: restrict it to documents and there is no
//      camera entry, but leave it off and "Take Photo or Video" is right there.
//      A bare `<input type="file">` is therefore a camera reach, not a safe
//      default — which is the opposite of how it reads.
//
// So: find every file input, then ask what its accept rules IN or OUT.
const cameraReaches = []
for (const file of sourceFiles(join(ROOT, 'src'))) {
  const source = readFileSync(file, 'utf8')
  const where = file.slice(ROOT.length + 1)

  // `type="file"` or `type: 'file'`, in markup or in an options object.
  for (const match of source.matchAll(/type\s*[=:]\s*["'`]file["'`]/g)) {
    // The element or object literal around it, so a neighbour's accept is not
    // read as this one's.
    const open = Math.max(0, source.lastIndexOf('<', match.index))
    const close = source.indexOf('>', match.index)
    const element = source.slice(open, close === -1 ? match.index + 400 : close + 1)
    const accept = element.match(/accept\s*[=:]\s*\{?\s*["'`]([^"'`]*)["'`]/)
    if (!accept) cameraReaches.push(`${where} (a file input with no accept — iOS offers "Take Photo")`)
    else if (/image\/|video\//.test(accept[1])) cameraReaches.push(`${where} (accept "${accept[1]}")`)
  }

  // An accept handed to a hook rather than written on an element — the input is
  // in the SDK, so the loop above never sees it here.
  for (const [, accept] of source.matchAll(/accept\s*:\s*["'`]([^"'`]*)["'`]/g)) {
    if (/image\/|video\//.test(accept)) cameraReaches.push(`${where} (accept: "${accept}", passed to a hook)`)
  }
}

if (cameraReaches.length > 0 && !info.NSCameraUsageDescription) {
  fail(
    'Info.plist has no NSCameraUsageDescription, but the app offers a picker that can reach the camera',
    'iOS kills the process when the camera is reached without one:\n      ' +
      [...new Set(cameraReaches)].join('\n      ')
  )
}

// ── Report ─────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error('\niOS: this build would be killed by the OS, not caught by the app.\n')
  for (const problem of problems) console.error(`  · ${problem}\n`)
  process.exit(1)
}

console.log(
  `iOS: scene life cycle adopted (${delegateClass}), ` +
    `${new Set(cameraReaches).size} camera reach(es) covered by NSCameraUsageDescription. OK`
)
