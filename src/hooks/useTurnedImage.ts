import { useEffect, useState } from 'react'

// A thumbnail turned by staged quarter turns clockwise, for the page lists that
// stage a turn before it is applied: the phone's Pages page and the website's
// Pages list (James, 2026-11-03). Undefined until drawn, and for no turn.
// Turned thumbnails, drawn once each: a canvas turned a quarter at a time.
const turnedCache = new Map<string, string>()
export function useTurned(src: string | undefined, q: number): string | undefined {
  const key = src && q ? `${q}:${src}` : ''
  const [url, setUrl] = useState<string | undefined>(() => (key ? turnedCache.get(key) : undefined))
  useEffect(() => {
    if (!src || !q) return
    const hit = turnedCache.get(key)
    if (hit) {
      setUrl(hit)
      return
    }
    let live = true
    const img = new Image()
    img.onload = () => {
      const odd = q % 2 === 1
      const c = document.createElement('canvas')
      c.width = odd ? img.naturalHeight : img.naturalWidth
      c.height = odd ? img.naturalWidth : img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.translate(c.width / 2, c.height / 2)
      ctx.rotate((q * Math.PI) / 2)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      const out = c.toDataURL('image/jpeg', 0.85)
      if (turnedCache.size > 64) turnedCache.delete(turnedCache.keys().next().value as string)
      turnedCache.set(key, out)
      if (live) setUrl(out)
    }
    img.src = src
    return () => {
      live = false
    }
  }, [key, src, q])
  return key ? url : undefined
}
