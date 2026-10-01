import { pathToFileURL } from 'node:url'
const cands = ['../../Universal_Beam/node_modules/playwright/index.js','../../Universal_Exports/node_modules/playwright/index.js','../../Universal_Video/node_modules/playwright/index.js','../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js']
let pw
for (const c of cands) { try { const m = (await import(pathToFileURL(new URL(c, import.meta.url).pathname).href)).default; const b = await m.chromium.launch(); await b.close(); pw = m; break } catch {} }
const base = process.argv[2]
const browser = await pw.chromium.launch()
const p = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
await p.goto(base)
await p.getByText('Try with example PDF').click()
await p.waitForTimeout(4000)
console.log(JSON.stringify(await p.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, file: document.body.innerText.match(/\d+ pages?/)?.[0] }))))
console.log(errs.slice(0, 10).join('\n'))
await p.screenshot({ path: process.argv[3] })
await browser.close()
