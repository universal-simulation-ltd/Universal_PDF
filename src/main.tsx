import React from 'react'
import ReactDOM from 'react-dom/client'
import { UniversalProvider } from '@unisim/sdk'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { usePdfStore } from './stores/pdfStore'
import { useAnnotationStore } from './stores/annotationStore'
import { useSignatureStore } from './stores/signatureStore'
import './index.css'

if (import.meta.env.DEV) {
  ;(window as unknown as { __stores: unknown }).__stores = {
    pdf: usePdfStore,
    ann: useAnnotationStore,
    sig: useSignatureStore
  }
}

const universalConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  product: 'pdf' as const,
  cookieDomain: import.meta.env.PROD ? '.unisim.co.uk' : undefined,
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
