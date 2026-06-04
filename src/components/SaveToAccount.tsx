import { useState } from 'react'
import { useUser } from '@unisim/sdk'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'

// "Save to account" — only rendered for visitors signed in with their
// Universal ID (useUser() returns a non-null user once the shared
// .unisim.co.uk session cookie is present). The core app stays 100% free and
// local; this affordance is simply hidden for anonymous visitors.
//
// UI-only stage for now: there's no server-side document store yet, so a save
// records a lightweight descriptor (filename + annotation count + timestamp)
// to localStorage keyed by the user's id. Swap the body of save() for a real
// upload (Supabase Storage + a documents table) when that lands. Mirrors
// Universal_QR/src/components/qr/SaveToAccount.tsx.
const SAVED_KEY = 'universal-pdf:saved'

export default function SaveToAccount() {
  const { user, loading } = useUser()
  const doc = usePdfStore((s) => s.doc)
  const fileName = usePdfStore((s) => s.fileName)
  const annotations = useAnnotationStore((s) => s.annotations)
  const [status, setStatus] = useState<'idle' | 'saved' | 'fail'>('idle')

  // Hidden until we know the visitor is signed in, and only meaningful once a
  // PDF is open.
  if (loading || !user || !doc) return null

  function save() {
    if (!user) return
    try {
      const raw = localStorage.getItem(SAVED_KEY)
      const all: Record<string, unknown[]> = raw ? JSON.parse(raw) : {}
      const mine = Array.isArray(all[user.id]) ? all[user.id] : []
      mine.push({
        savedAt: new Date().toISOString(),
        name: fileName ?? 'document.pdf',
        annotations: annotations.length
      })
      all[user.id] = mine
      localStorage.setItem(SAVED_KEY, JSON.stringify(all))
      setStatus('saved')
    } catch (err) {
      console.error(err)
      setStatus('fail')
    }
    setTimeout(() => setStatus('idle'), 1800)
  }

  return (
    <button
      type="button"
      onClick={save}
      title={user.email ? `Save to ${user.email}` : 'Save to your account'}
      className="hidden md:inline-flex items-center gap-1.5 px-3 h-9 rounded border border-orange-400 bg-orange-500/10 text-sm font-medium text-orange-300 hover:bg-orange-500/20 transition-colors shrink-0"
    >
      <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4h8l2 2v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M7 4v4h5M7 17v-5h6v5" />
      </svg>
      {status === 'saved' ? 'Saved ✓' : status === 'fail' ? 'Try again' : 'Save to account'}
    </button>
  )
}
