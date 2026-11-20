// PDF's own Tune switches on the SDK's synced store (src/stores/pdfSettings.ts,
// @unisim/sdk 0.232.0 createSyncedSettings): what a stored or synced set reads
// as, that nobody's settings from before are lost, and that the two
// zustand-style views (toolPrefsStore.ts, native/prefs.ts) still behave.
//
//   npm run test:pdf-settings
//
// A stand-in localStorage, seeded with the two old zustand `persist` keys
// before the store is made, as an existing user's browser would be.

const store = new Map([
  ['universal-pdf-tool-prefs', JSON.stringify({ state: { noConfirm: true, penColours: ['#FF0000', 'nope', '#000000'], noteTopLeft: 'yes' }, version: 0 })],
  ['unipdf:phone-prefs', JSON.stringify({ state: { keepAwake: true, plainPaper: false }, version: 0 })],
])
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis
globalThis.addEventListener ??= () => {}

const { normalisePdfSettings, readLegacyPdfSettings, usePdfSettings, PDF_SETTINGS_DEFAULTS } = await import('../src/stores/pdfSettings.ts')
const { useToolPrefs } = await import('../src/stores/toolPrefsStore.ts')
const { usePhonePrefs } = await import('../src/native/prefs.ts')

let pass = 0
let fail = 0
function ok(cond, label, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

console.log('\nwhat a set reads as')
ok(JSON.stringify(normalisePdfSettings(undefined)) === JSON.stringify(PDF_SETTINGS_DEFAULTS), 'nothing → the defaults')
ok(Object.entries(PDF_SETTINGS_DEFAULTS).every(([k, v]) => typeof v !== 'boolean' || v === false), 'every switch starts off')
const odd = normalisePdfSettings({ stayOnTool: 'true', penColours: [], highlightColours: ['#123456', '#abcdef', '#000000'] })
ok(odd.stayOnTool === false, 'only a real true turns a switch on')
ok(JSON.stringify(odd.penColours) === JSON.stringify(PDF_SETTINGS_DEFAULTS.penColours), 'no usable colours → the default pair')
ok(odd.highlightColours.length === 2 && odd.highlightColours[0] === '#123456', 'at most two colour shortcuts')

console.log('\nsettings from before')
ok(readLegacyPdfSettings({ getItem: () => null }) === undefined, 'no old keys → nothing to migrate')
ok(readLegacyPdfSettings({ getItem: () => '{bad' }) === undefined, 'corrupt old keys → nothing to migrate')
const s = usePdfSettings.getState()
ok(s.noConfirm === true && s.keepAwake === true, 'both old stores’ switches are on the new one', JSON.stringify(s))
ok(s.penColours[0] === '#FF0000' && s.penColours.length === 2, 'a pinned colour is kept (junk dropped)', JSON.stringify(s.penColours))
ok(s.noteTopLeft === false, 'a junk value reads as off')
ok(JSON.parse(store.get('unisim:settings:pdf') ?? '{}').noConfirm === true, 'saved under the new key straight away')

console.log('\nthe views the app uses')
ok(useToolPrefs.getState().noConfirm === true && usePhonePrefs.getState().keepAwake === true, 'toolPrefs and phone prefs read the one store')
useToolPrefs.getState().setStayOnTool(true)
ok(usePdfSettings.getState().stayOnTool === true && JSON.parse(store.get('unisim:settings:pdf')).stayOnTool === true, 'a tool switch is saved')
useToolPrefs.getState().addPreferredColour('pen', '#00FF00')
ok(JSON.stringify(usePdfSettings.getState().penColours) === '["#00ff00","#FF0000"]', 'a pinned colour goes first, the oldest drops out', JSON.stringify(usePdfSettings.getState().penColours))
useToolPrefs.getState().addPreferredColour('pen', '#ff0000')
ok(usePdfSettings.getState().penColours[0] === '#00ff00', 'pinning one already there leaves the pair where it is')
usePhonePrefs.getState().setPlainPaper(true)
ok(usePdfSettings.getState().plainPaper === true, 'a phone switch is saved')
useToolPrefs.getState().reset()
const r = usePdfSettings.getState()
ok(!r.stayOnTool && !r.noConfirm && r.penColours[0] === '#000000' && r.plainPaper === true, 'the tools’ reset leaves the phone switches', JSON.stringify(r))
usePdfSettings.reset()
ok(JSON.stringify(usePdfSettings.getState()) === JSON.stringify(PDF_SETTINGS_DEFAULTS), 'Reset to defaults puts all of it back')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
