// The list of origins the user has opted in on — somewhere to see them and take
// them back that is not buried in chrome://extensions.
//
// It is also the only place a site can be added while you are not standing on
// it, which matters more than it sounds: `chrome.permissions.request` must be
// called from a page during a gesture, and the popup can only ever speak for
// the tab in front of it.

const sites = document.getElementById('sites')
const status = document.getElementById('status')
const send = (msg) => chrome.runtime.sendMessage(msg)

// ⚠️ A match pattern's host may not carry a port, so this cannot be
// `${origin}/*` — see the note on the same function in background.js.
function permissionPattern(origin) {
  const { protocol, hostname } = new URL(origin)
  return `${protocol}//${hostname}/*`
}


function say(text) {
  status.textContent = text ?? ''
}

/** Every origin we hold both a permission and a redirect rule for. */
async function currentSites() {
  const { ruleIds = {} } = await chrome.storage.local.get('ruleIds')
  const rules = await chrome.declarativeNetRequest.getDynamicRules()
  const live = new Set(rules.map((r) => r.id))
  return Object.entries(ruleIds)
    .filter(([, id]) => live.has(id))
    .map(([origin]) => origin)
    .sort()
}

async function render() {
  const origins = await currentSites()
  sites.replaceChildren()
  if (!origins.length) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'No sites yet.'
    sites.appendChild(li)
    return
  }
  for (const origin of origins) {
    const li = document.createElement('li')
    const label = document.createElement('code')
    label.textContent = origin
    const remove = document.createElement('button')
    remove.className = 'remove'
    remove.textContent = 'Remove'
    remove.dataset.origin = origin
    remove.addEventListener('click', async () => {
      await send({ cmd: 'disableAlways', origin })
      say(`Removed ${origin}.`)
      await render()
    })
    li.append(label, remove)
    sites.appendChild(li)
  }
}

/** Accept "example.com", "example.com/reports", or a full URL. */
function toOrigin(text) {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin
  } catch {
    return null
  }
}

document.getElementById('add-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  say('')
  const input = document.getElementById('site')
  const origin = toOrigin(input.value)
  if (!origin) {
    say('That does not look like a web address.')
    return
  }
  // The submit click is the gesture this call needs.
  const granted = await chrome.permissions.request({ origins: [permissionPattern(origin)] })
  if (!granted) {
    say(`Not added — Universal PDF needs permission for ${origin}.`)
    return
  }
  const res = await send({ cmd: 'enableAlways', origin })
  if (!res?.ok) {
    say('Could not switch that on.')
    return
  }
  input.value = ''
  say(
    res.matching === 'content-type'
      ? `${origin} added.`
      : `${origin} added — this browser can only match addresses ending in .pdf, so other addresses will still open in the browser viewer.`
  )
  await render()
})

void render()
