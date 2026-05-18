import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'

const PAD_W = 600
const PAD_H = 240

export default function SignaturePad() {
  const open = useSignatureStore((s) => s.padOpen)
  const closePad = useSignatureStore((s) => s.closePad)
  const add = useSignatureStore((s) => s.add)
  const openEmailVerify = useSignatureStore((s) => s.openEmailVerify)

  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [padW, setPadW] = useState(PAD_W)
  const [lines, setLines] = useState<number[][]>([])
  const drawingRef = useRef(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const available = Math.max(200, Math.min(PAD_W, el.clientWidth))
      setPadW(Math.floor(available))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const padH = Math.round((padW / PAD_W) * PAD_H)

  if (!open) return null

  function pos(e: Konva.KonvaEventObject<PointerEvent>) {
    return e.target.getStage()!.getPointerPosition()!
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    drawingRef.current = true
    const p = pos(e)
    setLines((prev) => [...prev, [p.x, p.y]])
  }

  function onPointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!drawingRef.current) return
    const p = pos(e)
    setLines((prev) => {
      const out = prev.slice(0, -1)
      const last = prev[prev.length - 1]
      out.push([...last, p.x, p.y])
      return out
    })
  }

  function onPointerUp() {
    drawingRef.current = false
  }

  function clear() {
    setLines([])
  }

  function cancel() {
    setLines([])
    setName('')
    closePad()
  }

  function save(andVerify = false) {
    if (lines.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const line of lines) {
      for (let i = 0; i < line.length; i += 2) {
        const x = line[i], y = line[i + 1]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    const pad = 10
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(padW, maxX + pad)
    maxY = Math.min(padH, maxY + pad)
    const w = maxX - minX
    const h = maxY - minY
    const stage = stageRef.current!
    const dataUrl = stage.toDataURL({
      x: minX,
      y: minY,
      width: w,
      height: h,
      pixelRatio: 2,
      mimeType: 'image/png'
    })
    const sigName = name.trim() || `Signature ${useSignatureStore.getState().signatures.length + 1}`
    const id = add({ name: sigName, dataUrl, width: w, height: h })
    setLines([])
    setName('')
    closePad()
    if (andVerify) {
      openEmailVerify(id)
    } else {
      // Arm the signature tool so the user can immediately drop the new
      // signature — the active signature was set by add() above.
      useAnnotationStore.getState().setTool('signature')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) cancel() }}
    >
      <div className="bg-white rounded-lg shadow-2xl p-5 max-w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Draw signature</h2>
          <button
            onClick={cancel}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div ref={containerRef} className="border-2 border-dashed border-slate-300 rounded bg-slate-50 w-full">
          <Stage
            ref={stageRef}
            width={padW}
            height={padH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ touchAction: 'none', cursor: 'crosshair' }}
          >
            <Layer>
              {lines.map((points, i) => (
                <Line
                  key={i}
                  points={points}
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                />
              ))}
            </Layer>
          </Stage>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="flex-1 min-w-40 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={clear}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
          >
            Clear
          </button>
          <button
            onClick={cancel}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            disabled={lines.length === 0}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
          >
            Save
          </button>
          <button
            onClick={() => save(true)}
            disabled={lines.length === 0}
            title="Save and verify with email"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded text-sm font-medium flex items-center gap-1.5"
          >
            <span>✉</span>
            <span>Save &amp; Verify</span>
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          "Save &amp; Verify" lets you attach a verified email address to this signature.
        </p>
      </div>
    </div>
  )
}
