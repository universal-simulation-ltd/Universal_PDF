import React from 'react'
import ReactDOM from 'react-dom/client'
import { UniversalProvider } from '@unisim/sdk'
import { I18nRoot } from './i18n'

console.log(`build: ${import.meta.env.VITE_BUILD_SHA}`)
import App from './App'
import SignMobilePage from './components/Signature/SignMobilePage'
import SignRequestPage from './components/Signature/SignRequestPage'
import SignQueueSync from './components/Signature/SignQueueSync'
import SignCertificatePage from './components/Signature/SignCertificatePage'
import { UsageTracker } from '@unisim/sdk'
import ErrorBoundary from './components/ErrorBoundary'
import { installPauseAnimationsOnBlur } from './lib/pauseAnimationsOnBlur'
import { isNativeShell } from './lib/nativeOpen'
import { accountsOff } from './lib/accounts'
import { usePdfStore } from './stores/pdfStore'
import { useAnnotationStore } from './stores/annotationStore'
import { useSignatureStore } from './stores/signatureStore'
import './index.css'
import './styles/xfa.css'
import './styles/textlayer.css'

if (import.meta.env.DEV) {
  ;(window as unknown as { __stores: unknown }).__stores = {
    pdf: usePdfStore,
    ann: useAnnotationStore,
    sig: useSignatureStore
  }
}

// The packaged Electron renderer loads index.html over file://, which has
// no parent zone to scope a cookie to — leave cookieDomain undefined so the
// SDK falls back to localStorage. The browser web build (Vite mode
// 'production') still rides the shared .unisim.co.uk cookie.
const isDesktop = import.meta.env.MODE === 'desktop'

// `?mockauth=1` in a DEV build only: the SDK serves its offline fixture world
// (demo@example.invalid / offline-demo, org "UNI·SIM Demo") instead of the real
// Supabase project, so the signed-in chrome — the profile dropdown, the company
// badge, the hosted-backup gate — can be opened and driven with no network and
// no real account. `e2e/actions-menu.e2e.mjs` runs on it.
//
// ⚠️ Deliberately opt-in per page load AND fenced behind `import.meta.env.DEV`,
// which is statically false in every shipped build, so the flag cannot be typed
// into a URL in the packaged desktop app or on the website. The SDK adds a
// second guard of its own (mockAuth is ignored whenever `cookieDomain` is set).
const mockAuth =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('mockauth')

const universalConfig = {
  supabaseUrl: import.meta.env.VITE_PLATFORM_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_PLATFORM_SUPABASE_ANON_KEY,
  product: 'pdf' as const,
  cookieDomain: !isDesktop && import.meta.env.PROD ? '.unisim.co.uk' : undefined,
  mockAuth,
  // No `presence` option: the suite user count it controlled is retired (SDK
  // 0.187.0 sends no beat whatever it says). What replaced it is the SDK's
  // anonymous daily open count (product + kind of device, no identifier), on
  // by default. It stays on the website only: the phone apps send nothing
  // (James, 2026-10-12: the App Store and Play figures already count
  // installs, and the store labels say the phone app collects nothing), and
  // nor do the desktop app or the browser extension. Every one of those builds
  // is Vite mode 'desktop' (build:desktop, build:mobile and build:extension),
  // so `isDesktop` covers all three; `isNativeShell()` stays as a second guard
  // for the phone shell.
  openCount: !isDesktop && !isNativeShell(),
  // No sign-in at all in the phone apps or the extension (James, 2026-10-12):
  // signing and sending for signature need no account there and upload
  // nothing. `noAccounts` drops every account row and keeps the app signed out
  // of any suite session the device already holds (SDK 0.187.0). The website
  // and the desktop app keep an optional Universal ID for the certified
  // signature and the saved main signature. See lib/accounts.ts.
  noAccounts: accountsOff(),
  // No "Sign in" in the profile menu for a guest (James, 2026-10-26: "there
  // really isn't much need to sign in", and signing in pulls the account's
  // Global Tuning over what the guest had set). The one thing that needs an
  // account, the certified signature in Send to sign, asks for it in place;
  // once signed in the account rows and Sign out are back (SDK 0.205.0).
  signInInMenu: false,
}
const noAccounts = universalConfig.noAccounts

// `?sign=<token>` is the phone-side of the sign-on-mobile handoff (opened by
// scanning the QR in the signature pad) — render just the signing page.
// `?signdoc=<token>` is a "Send to sign" recipient link — the full editor with
// the sender's stored PDF loaded and a sign-and-return banner.
// `?cert=<cert_id>` is the public tamper-evident certificate page for a signed
// document (preview + download + timestamped provenance log).
const params = new URLSearchParams(window.location.search)
const signToken = params.get('sign')
// The certified route's pages are the website's. A shell build never gets
// these links (they are web addresses) and has no server path for them.
const signDocToken = noAccounts ? null : params.get('signdoc')
const certId = noAccounts ? null : params.get('cert')

// Endless animations finish their loop and rest while the window is not
// focused — see lib/pauseAnimationsOnBlur.
installPauseAnimationsOnBlur()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UniversalProvider config={universalConfig}>
        <I18nRoot>
          <UsageTracker />
          {signToken ? <SignMobilePage token={signToken} />
            : signDocToken ? <SignRequestPage token={signDocToken} />
            : certId ? <SignCertificatePage certId={certId} />
            : <><App />{!noAccounts && <SignQueueSync />}</>}
        </I18nRoot>
      </UniversalProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
