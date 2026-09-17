import { Component, type ErrorInfo, type ReactNode } from 'react'
import { getT } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const t = getT()

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8 text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-semibold text-slate-900">{t('app.error_title')}</h1>
          <p className="text-sm text-slate-500">
            {t('app.error_body')}
          </p>
          <details className="text-left text-xs bg-slate-50 rounded-lg p-3 text-slate-600 cursor-pointer">
            <summary className="font-medium select-none">{t('app.error_details')}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('app.error_reload')}
          </button>
        </div>
      </div>
    )
  }
}
