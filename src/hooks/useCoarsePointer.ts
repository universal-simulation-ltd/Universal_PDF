import { useEffect, useState } from 'react'

// True on touch-first devices (phones / tablets), where controls want to sit
// under the user's finger and be finger-sized. Tracks live so plugging in a
// mouse (or a devtools device-mode toggle) updates the UI without a reload.
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    setCoarse(mq.matches)
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return coarse
}
