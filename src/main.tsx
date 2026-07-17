import React from 'react'
import ReactDOM from 'react-dom/client'
import { UniversalProvider } from '@unisim/sdk'
import App from './App'
import SignMobilePage from './components/Signature/SignMobilePage'
import SignRequestPage from './components/Signature/SignRequestPage'
import UsageTracker from './UsageTracker'
import ErrorBoundary from './components/ErrorBoundary'
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

const universalConfig = {
  supabaseUrl: import.meta.env.VITE_PLATFORM_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_PLATFORM_SUPABASE_ANON_KEY,
  product: 'pdf' as const,
  cookieDomain: !isDesktop && import.meta.env.PROD ? '.unisim.co.uk' : undefined,
}

// `?sign=<token>` is the phone-side of the sign-on-mobile handoff (opened by
// scanning the QR in the signature pad) — render just the signing page.
// `?signdoc=<token>` is a "Send to sign" recipient link — the full editor with
// the sender's stored PDF loaded and a sign-and-return banner.
const params = new URLSearchParams(window.location.search)
const signToken = params.get('sign')
const signDocToken = params.get('signdoc')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UniversalProvider config={universalConfig}>
        <UsageTracker />
        {signToken ? <SignMobilePage token={signToken} />
          : signDocToken ? <SignRequestPage token={signDocToken} />
          : <App />}
      </UniversalProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
