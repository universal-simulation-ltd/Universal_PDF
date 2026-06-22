import { useSearchStore } from '../../stores/searchStore'

// Translucent boxes over every find match on this page. Purely presentational
// (pointer-events: none) — it sits above the canvas but below the Konva
// annotation layer so it never intercepts editing. The active match is
// emphasised and tagged `data-search-active` so the FindBar can scroll to it.
export default function SearchHighlightLayer({
  pageIndex,
  scale
}: {
  pageIndex: number
  scale: number
}) {
  const matches = useSearchStore((s) => s.matches)
  const activeIndex = useSearchStore((s) => s.activeIndex)

  // Keep each match's flat-array index so we know which one is active without
  // re-deriving it from coordinates.
  const onPage = matches
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.pageIndex === pageIndex)

  if (onPage.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-[5]">
      {onPage.map(({ m, i }) => {
        const active = i === activeIndex
        return m.rects.map((r, ri) => (
          <div
            key={`${i}-${ri}`}
            data-search-active={active ? 'true' : undefined}
            style={{
              position: 'absolute',
              left: r.x * scale,
              top: r.y * scale,
              width: r.w * scale,
              height: r.h * scale,
              backgroundColor: active ? 'rgba(234,88,12,0.45)' : 'rgba(250,204,21,0.4)',
              outline: active ? '1.5px solid rgba(234,88,12,0.9)' : 'none',
              borderRadius: 1
            }}
          />
        ))
      })}
    </div>
  )
}
