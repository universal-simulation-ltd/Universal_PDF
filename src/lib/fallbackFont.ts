// ---------------------------------------------------------------------------
// The face the PDF writer falls back to for alphabets the base-14 fonts cannot
// spell — Cyrillic, Greek and Hebrew.
//
// WHY IT IS FETCHED AND NOT BUNDLED
// ---------------------------------
// The file is 350 KB, and it only matters to somebody opening a Word file
// written in Cyrillic, Greek or Hebrew. Compiled into the bundle it would be
// paid for by every visitor; fetched on demand it is paid for by the people it
// helps. It is kept OUT of the install-time precache and runtime-cached on
// first use, so that person has it offline from then on.
//
// `@unisim/doc` calls this ONLY when a document contains something WinAnsi
// cannot write, so an all-Latin import never touches the network.
//
// ⚠️ FAILING IS A SUPPORTED ANSWER. Offline on the first Cyrillic document, a
// 404 from a half-deployed build, a corrupt file — every one of them returns
// null, and the document converts exactly as it did before this existed: the
// characters come out as '?' and are NAMED in the amber bar over the document
// (`importNoticeFor`). A missing font must never cost somebody their import.
//
// Liberation Sans 2.00.1, SIL Open Font License 1.1 — `public/fonts/OFL.txt`,
// which has to travel with the font.
// ---------------------------------------------------------------------------

const FONT_URL = `${import.meta.env.BASE_URL}fonts/LiberationSans-Regular.ttf`

let inFlight: Promise<Uint8Array | null> | null = null

export function loadFallbackFont(): Promise<Uint8Array | null> {
  // Cached across conversions — the second Russian document in a session should
  // not re-fetch 350 KB. ⚠️ A FAILURE is deliberately NOT cached: the usual
  // reason for one is being offline, and somebody who reconnects and tries
  // again should get the font rather than the answer we gave them last time.
  inFlight ??= fetchFont().catch(() => {
    inFlight = null
    return null
  })
  return inFlight
}

async function fetchFont(): Promise<Uint8Array | null> {
  const response = await fetch(FONT_URL)
  if (!response.ok) {
    inFlight = null
    return null
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  // A dev server and some SPA hosts answer a missing file with index.html and a
  // 200. Checking the sfnt magic here turns that into the honest "no font"
  // answer instead of a font parse error further down.
  if (bytes.length < 4 || !(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    inFlight = null
    return null
  }
  return bytes
}
