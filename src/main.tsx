import React from 'react'
import ReactDOM from 'react-dom/client'
import { UniversalProvider } from '@unisim/sdk'
import App from './App'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UniversalProvider config={universalConfig}>
        <App />
      </UniversalProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
