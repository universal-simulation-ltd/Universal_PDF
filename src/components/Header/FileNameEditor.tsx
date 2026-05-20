import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'

export default function FileNameEditor() {
  const fileName = usePdfStore((s) => s.fileName)
  const renameFile = usePdfStore((s) => s.renameFile)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    const value = el.value
    const stem = /\.pdf$/i.test(value) ? value.length - 4 : value.length
    el.setSelectionRange(0, stem)
    // Run only when entering edit mode — otherwise the selection would
    // be reset on every keystroke, replacing each character typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!fileName) return null

  function start() {
    setDraft(fileName ?? '')
    setEditing(true)
  }
  function commit() {
    const next = draft.trim()
    if (!next || next === fileName) {
      setEditing(false)
      return
    }
    renameFile(next)
    setEditing(false)
  }
  function cancel() {
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        className="px-2 py-0.5 rounded bg-white text-slate-900 text-base w-56 max-w-[40vw] outline-none border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500"
        aria-label="Rename file"
      />
    )
  }

  return (
    <button
      onClick={start}
      title="Click to rename"
      className="group flex items-center gap-1 max-w-xs px-1.5 py-0.5 rounded text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-300 transition-colors truncate"
    >
      <span className="truncate">{fileName}</span>
      <span aria-hidden="true" className="opacity-0 group-hover:opacity-60 text-xs">✎</span>
    </button>
  )
}
