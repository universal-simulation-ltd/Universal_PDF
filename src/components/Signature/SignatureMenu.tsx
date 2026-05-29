import { useEffect, useRef, useState } from 'react'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'

interface SignatureMenuProps {
  openUpward?: boolean
  compact?: boolean
}

type Tab = 'signatures' | 'stamps'

export default function SignatureMenu({ openUpward = false, compact = false }: SignatureMenuProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('signatures')
  const ref = useRef<HTMLDivElement>(null)

  const signatures = useSignatureStore((s) => s.signatures)
  const activeId = useSignatureStore((s) => s.activeId)
  const setActive = useSignatureStore((s) => s.setActive)
  const openPad = useSignatureStore((s) => s.openPad)
  const openImport = useSignatureStore((s) => s.openImport)
  const openStampPicker = useSignatureStore((s) => s.openStampPicker)
  const openEmailVerify = useSignatureStore((s) => s.openEmailVerify)
  const remove = useSignatureStore((s) => s.remove)

  const tool = useAnnotationStore((s) => s.tool)
  const setTool = useAnnotationStore((s) => s.setTool)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pick(id: string) {
    setActive(id)
    setTool('signature')
    setOpen(false)
  }

  const active = signatures.find((s) => s.id === activeId)
  const armed = tool === 'signature' && !!active

  // Separate hand-drawn signatures from stamps (stamps have " Stamp" suffix in name)
  const handSigs = signatures.filter((s) => !s.name.endsWith(' Stamp'))
  const stamps = signatures.filter((s) => s.name.endsWith(' Stamp'))
  const displayList = tab === 'signatures' ? handSigs : stamps

  return (
    <div className="relative" ref={ref}>
      {compact ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex flex-col items-center justify-center w-full h-full gap-0.5 rounded transition-colors ${
            armed ? 'text-orange-400' : 'text-slate-200'
          }`}
        >
          <span className="text-xl leading-none">✍</span>
          <span className="text-[10px] font-medium">Sign</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`h-10 px-3 rounded flex items-center gap-2 text-sm font-medium transition-colors ${
            armed ? 'bg-orange-600 hover:bg-orange-500' : 'bg-slate-700 hover:bg-slate-600'
          }`}
        >
          <span>✍</span>
          <span>Sign</span>
          <span className="opacity-60 text-xs">▾</span>
        </button>
      )}

      {open && (
        <div className={`bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden ${
          compact
            ? 'fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-1rem)] z-50'
            : `absolute right-0 w-80 z-40 ${openUpward ? 'bottom-full mb-2' : 'top-full mt-1'}`
        }`}>
          {/* Tab bar */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setTab('signatures')}
              className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === 'signatures'
                  ? 'text-orange-600 border-b-2 border-orange-500 -mb-px'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Signatures
            </button>
            <button
              onClick={() => setTab('stamps')}
              className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === 'stamps'
                  ? 'text-orange-600 border-b-2 border-orange-500 -mb-px'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Stamps
            </button>
          </div>

          <div className="max-h-72 overflow-auto">
            {displayList.length === 0 ? (
              <div className="px-3 py-6 text-sm text-slate-500 text-center">
                {tab === 'signatures' ? 'No signatures yet' : 'No saved stamps yet'}
              </div>
            ) : (
              displayList.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 ${
                    s.id === activeId ? 'bg-orange-50' : ''
                  }`}
                  onClick={() => pick(s.id)}
                >
                  <img
                    src={s.dataUrl}
                    alt={s.name}
                    className="h-10 max-w-32 object-contain bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    {s.verifiedEmail && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                          ✓ Verified: {s.verifiedEmail}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {tab === 'signatures' && !s.verifiedEmail && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEmailVerify(s.id); setOpen(false) }}
                        title="Verify email"
                        className="text-slate-300 hover:text-blue-600 text-xs px-1"
                      >
                        ✉
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(s.id) }}
                      className="text-slate-300 hover:text-red-600 text-sm"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {tab === 'signatures' ? (
            <div className="grid grid-cols-2 border-t border-slate-100">
              <button
                onClick={() => { openPad(); setOpen(false) }}
                className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
              >
                + Draw new
              </button>
              <button
                onClick={() => { openImport('signature'); setOpen(false) }}
                className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 border-l border-slate-100"
              >
                + Import image
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 border-t border-slate-100">
              <button
                onClick={() => { openStampPicker(); setOpen(false) }}
                className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
              >
                + Preset stamps
              </button>
              <button
                onClick={() => { openImport('stamp'); setOpen(false) }}
                className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 border-l border-slate-100"
              >
                + Import image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
