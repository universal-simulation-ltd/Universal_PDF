import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Line,
  Rect,
  Text,
  Group,
  Image as KonvaImage,
  Transformer
} from 'react-konva'
import type Konva from 'konva'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useSignatureStore } from '../../stores/signatureStore'
import { useImage } from '../../lib/useImage'
import type { Annotation, FontFamily, ImageAnnotation, TextAnnotation } from '../../types/annotations'

const FONT_STACK: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace'
}

const HIGHLIGHT_STROKE_WIDTH = 16
const HIGHLIGHT_OPACITY = 0.4

function getAnnotationIdFromTarget(target: Konva.Node | null): string | null {
  let node: Konva.Node | null = target
  while (node) {
    const id = node.id()
    if (id) return id
    node = node.getParent()
  }
  return null
}

// True if the click landed on Konva's Transformer (any anchor, rotation
// knob, or its bounding-box border). Used to skip our pointerdown logic so
// the Transformer can run the resize/rotate gesture unmolested.
function isTransformerTarget(target: Konva.Node | null): boolean {
  let node: Konva.Node | null = target
  while (node) {
    if (node.getClassName() === 'Transformer') return true
    node = node.getParent()
  }
  return false
}

function getAnnotationBBox(a: Annotation): { x: number; y: number; width: number; height: number } {
  switch (a.type) {
    case 'text': {
      const w = Math.max(80, a.text.length * a.fontSize * 0.6 + 8)
      return { x: a.x - 2, y: a.y - 2, width: w + 4, height: a.fontSize * 1.25 + 4 }
    }
    case 'rect':
      return { x: a.x - 2, y: a.y - 2, width: a.width + 4, height: a.height + 4 }
    case 'tick':
    case 'cross':
      return { x: a.x - 4, y: a.y - 4, width: a.size + 8, height: a.size + 8 }
    case 'image':
      return { x: a.x - 2, y: a.y - 2, width: a.width + 4, height: a.height + 4 }
    case 'draw': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < a.points.length; i += 2) {
        const x = a.points[i], y = a.points[i + 1]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      const pad = (a.strokeWidth ?? 2) + 6
      return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 }
    }
  }
}

interface Props {
  pageIndex: number
  width: number
  height: number
}

function isResizable(a: Annotation): boolean {
  return a.type === 'image' || a.type === 'rect'
}

function isTransformable(a: Annotation): boolean {
  // Everything except free-draw works well with Konva's Transformer.
  return a.type !== 'draw'
}

// Cursor-following preview of the active signature shown while the signature
// tool is armed. Rendered at full opacity so it reads as the signature itself
// following the mouse, ready to be dropped on click. Non-interactive so it
// never swallows pointer events from the underlying Stage.
function SignatureGhost({
  src,
  x,
  y,
  width,
  height
}: {
  src: string
  x: number
  y: number
  width: number
  height: number
}) {
  const img = useImage(src)
  if (!img) return null
  return (
    <KonvaImage
      listening={false}
      image={img}
      x={x}
      y={y}
      width={width}
      height={height}
    />
  )
}

function SignatureImage({
  a,
  shapeRef,
  draggable,
  onClick,
  onDblClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd
}: {
  a: ImageAnnotation
  shapeRef: (n: Konva.Node | null) => void
  draggable: boolean
  onClick: () => void
  onDblClick: () => void
  onDragStart: () => void
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void
}) {
  const img = useImage(a.src)
  if (!img) return null
  return (
    <KonvaImage
      ref={shapeRef}
      id={a.id}
      image={img}
      x={a.x}
      y={a.y}
      rotation={a.rotation ?? 0}
      width={a.width}
      height={a.height}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  )
}

export default function AnnotationLayer({ pageIndex, width, height }: Props) {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const fontSize = useAnnotationStore((s) => s.fontSize)
  const fontFamily = useAnnotationStore((s) => s.fontFamily)
  const allAnnotations = useAnnotationStore((s) => s.annotations)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const add = useAnnotationStore((s) => s.add)
  const update = useAnnotationStore((s) => s.update)
  const remove = useAnnotationStore((s) => s.remove)
  const setSelected = useAnnotationStore((s) => s.setSelected)
  const setTool = useAnnotationStore((s) => s.setTool)

  const activeSignature = useSignatureStore((s) => {
    const id = s.activeId
    return id ? s.signatures.find((x) => x.id === id) ?? null : null
  })

  const annotations = allAnnotations.filter((a) => a.pageIndex === pageIndex)

  const drawingRef = useRef(false)
  const [currentLine, setCurrentLine] = useState<number[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Pointer position used to render the ghost-signature preview that
  // follows the cursor while the signature tool is armed.
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  // ID of an annotation that, on its next drag, should move on its own
  // (uncoupled from its linked partner). Re-armed via double-click.
  const [unlinkOnceId, setUnlinkOnceId] = useState<string | null>(null)
  // While a linked drag is in progress, remember the partner's start
  // position so we can mirror the drag delta onto its Konva node.
  const linkedDragRef = useRef<{
    partnerId: string
    partnerStart: { x: number; y: number }
    draggerStart: { x: number; y: number }
  } | null>(null)
  const editingAnnotation = annotations.find(
    (a) => a.id === editingId && a.type === 'text'
  ) as TextAnnotation | undefined

  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef(new Map<string, Konva.Node>())

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const selected = annotations.find((a) => a.id === selectedId)
    if (selected && isTransformable(selected) && !editingId) {
      const node = shapeRefs.current.get(selected.id)
      if (node) {
        tr.nodes([node])
        tr.getLayer()?.batchDraw()
        return
      }
    }
    tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [selectedId, annotations, editingId])

  function getPos(e: Konva.KonvaEventObject<PointerEvent>) {
    return e.target.getStage()!.getPointerPosition()!
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (editingId) return // ignore stage events while typing
    if (tool === 'hand') return // pan handled by PdfViewer
    // Let Konva's Transformer own clicks on its anchors / rotate knob —
    // don't deselect the annotation and tear down the Transformer before
    // the resize / rotate gesture can begin.
    if (isTransformerTarget(e.target)) return
    const stage = e.target.getStage()
    // If the click landed on an existing annotation, select it instead of
    // adding a new one — even when an annotation tool (tick/cross/etc.) is
    // active. Empty stage clicks fall through to the add/select logic below.
    if (e.target !== stage) {
      const hitId = getAnnotationIdFromTarget(e.target)
      if (hitId) {
        setSelected(hitId)
        if (tool !== 'select') setTool('select')
        return
      }
    }
    if (tool === 'select' || tool === 'form') {
      setSelected(null)
      return
    }
    const pos = getPos(e)
    if (tool === 'draw' || tool === 'highlight') {
      drawingRef.current = true
      setCurrentLine([pos.x, pos.y])
    } else if (tool === 'text') {
      const id = crypto.randomUUID()
      add({
        id,
        pageIndex,
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: '',
        color,
        fontSize,
        fontFamily
      })
      setEditingId(id)
    } else if (tool === 'tick' || tool === 'cross') {
      add({
        id: crypto.randomUUID(),
        pageIndex,
        type: tool,
        x: pos.x - 14,
        y: pos.y - 14,
        size: 28,
        color
      })
    } else if (tool === 'rect') {
      drawingRef.current = true
      setCurrentLine([pos.x, pos.y, pos.x, pos.y])
    } else if (tool === 'signature') {
      const sigState = useSignatureStore.getState()
      const active = sigState.signatures.find((x) => x.id === sigState.activeId)
      if (active) {
        const targetW = 160
        const ratio = active.height / active.width
        const sigId = crypto.randomUUID()
        const labelId = active.verifiedEmail ? crypto.randomUUID() : undefined
        add({
          id: sigId,
          pageIndex,
          type: 'image',
          x: pos.x - targetW / 2,
          y: pos.y - (targetW * ratio) / 2,
          width: targetW,
          height: targetW * ratio,
          src: active.dataUrl,
          linkedTo: labelId
        })
        // If signature has a verified email, place a linked label below it
        if (labelId && active.verifiedEmail) {
          add({
            id: labelId,
            pageIndex,
            type: 'text',
            x: pos.x - targetW / 2,
            y: pos.y + (targetW * ratio) / 2 + 4,
            text: `✓ Verified as: ${active.verifiedEmail}`,
            color: '#16a34a',
            fontSize: 10,
            linkedTo: sigId
          })
        }
        useAnnotationStore.getState().setTool('select')
      }
    } else if (tool === 'image') {
      const src = useAnnotationStore.getState().uploadedImageSrc
      if (src) {
        const img = new Image()
        img.onload = () => {
          const targetW = 200
          const ratio = img.naturalHeight / img.naturalWidth
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'image',
            x: pos.x - targetW / 2,
            y: pos.y - (targetW * ratio) / 2,
            width: targetW,
            height: targetW * ratio,
            src
          })
          useAnnotationStore.getState().setTool('select')
        }
        img.src = src
      }
    }
  }

  function onPointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    const pos = getPos(e)
    if (tool === 'signature' && activeSignature) {
      setHoverPos({ x: pos.x, y: pos.y })
    } else if (hoverPos) {
      setHoverPos(null)
    }
    if (!drawingRef.current) return
    setCurrentLine((prev) => {
      if (!prev) return null
      if (tool === 'rect') return [prev[0], prev[1], pos.x, pos.y]
      return [...prev, pos.x, pos.y]
    })
  }

  function onPointerLeaveStage() {
    setHoverPos(null)
    onPointerUp()
  }

  function onPointerUp() {
    if (drawingRef.current && currentLine) {
      if (tool === 'draw' && currentLine.length >= 4) {
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'draw',
          points: currentLine,
          color,
          strokeWidth
        })
      } else if (tool === 'highlight' && currentLine.length >= 4) {
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'draw',
          points: currentLine,
          color,
          strokeWidth: HIGHLIGHT_STROKE_WIDTH,
          opacity: HIGHLIGHT_OPACITY
        })
      } else if (tool === 'rect') {
        const [x1, y1, x2, y2] = currentLine
        const x = Math.min(x1, x2)
        const y = Math.min(y1, y2)
        const w = Math.abs(x2 - x1)
        const h = Math.abs(y2 - y1)
        if (w > 4 && h > 4) {
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'rect',
            x,
            y,
            width: w,
            height: h,
            color
          })
        }
      }
    }
    drawingRef.current = false
    setCurrentLine(null)
  }

  function shapeRefSetter(id: string) {
    return (node: Konva.Node | null) => {
      if (node) shapeRefs.current.set(id, node)
      else shapeRefs.current.delete(id)
    }
  }

  function onShapeClick(id: string) {
    if (tool !== 'select') return
    setSelected(id)
  }

  function onTextDblClick(a: TextAnnotation) {
    if (tool !== 'select') return
    if (a.linkedTo) {
      // Linked text labels (e.g. the verified-signature caption) use
      // double-click to unlink for the next move instead of entering edit
      // mode — editing the auto-generated caption isn't a flow the user
      // typically wants here.
      setSelected(a.id)
      setUnlinkOnceId(a.id)
      return
    }
    setEditingId(a.id)
    setSelected(a.id)
  }

  function onLinkedDblClick(a: Annotation) {
    if (tool !== 'select') return
    if (!a.linkedTo) return
    setSelected(a.id)
    setUnlinkOnceId(a.id)
  }

  function onShapeDragStart(a: Annotation) {
    setDraggingId(a.id)
    // Set up linked-drag state if this annotation is paired and we
    // haven't been told to move it on its own this time.
    linkedDragRef.current = null
    const partnerId = a.linkedTo
    if (!partnerId || unlinkOnceId === a.id) return
    const partner = allAnnotations.find((x) => x.id === partnerId)
    const partnerNode = shapeRefs.current.get(partnerId)
    if (!partner || !partnerNode || 'points' in partner) return
    const draggerStartX = 'x' in a ? (a.x as number) : 0
    const draggerStartY = 'y' in a ? (a.y as number) : 0
    linkedDragRef.current = {
      partnerId,
      partnerStart: { x: partnerNode.x(), y: partnerNode.y() },
      draggerStart: { x: draggerStartX, y: draggerStartY }
    }
  }

  function onShapeDragMove(a: Annotation, e: Konva.KonvaEventObject<DragEvent>) {
    const link = linkedDragRef.current
    if (!link) return
    const node = e.target
    const dx = node.x() - link.draggerStart.x
    const dy = node.y() - link.draggerStart.y
    const partnerNode = shapeRefs.current.get(link.partnerId)
    if (!partnerNode) return
    partnerNode.position({ x: link.partnerStart.x + dx, y: link.partnerStart.y + dy })
    partnerNode.getLayer()?.batchDraw()
    void a // unused param kept for handler symmetry
  }

  function onShapeDragEnd(a: Annotation, e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target
    const link = linkedDragRef.current
    setDraggingId(null)
    if (a.type === 'draw') {
      const dx = node.x()
      const dy = node.y()
      const next = a.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
      node.position({ x: 0, y: 0 })
      update(a.id, { points: next })
    } else {
      update(a.id, { x: node.x(), y: node.y() } as Partial<Annotation>)
    }
    if (link) {
      const partnerNode = shapeRefs.current.get(link.partnerId)
      if (partnerNode) {
        update(link.partnerId, {
          x: partnerNode.x(),
          y: partnerNode.y()
        } as Partial<Annotation>)
      }
    }
    // The "unlink once" arming consumed by this drag — re-arm requires
    // another double-click.
    if (unlinkOnceId === a.id) setUnlinkOnceId(null)
    linkedDragRef.current = null
  }

  function onShapeTransformEnd(a: Annotation, e: Konva.KonvaEventObject<Event>) {
    const node = e.target
    const rotation = node.rotation()
    if (a.type === 'image' || a.type === 'rect') {
      const newWidth = Math.max(8, node.width() * node.scaleX())
      const newHeight = Math.max(8, node.height() * node.scaleY())
      node.scaleX(1)
      node.scaleY(1)
      update(a.id, {
        x: node.x(),
        y: node.y(),
        width: newWidth,
        height: newHeight,
        rotation
      } as Partial<Annotation>)
    } else if (a.type === 'text' || a.type === 'tick' || a.type === 'cross') {
      update(a.id, {
        x: node.x(),
        y: node.y(),
        rotation
      } as Partial<Annotation>)
    }
  }

  function commitEdit(value: string) {
    if (!editingAnnotation) return
    const trimmed = value
    if (!trimmed.trim()) {
      remove(editingAnnotation.id)
    } else {
      update(editingAnnotation.id, { text: trimmed })
    }
    setEditingId(null)
  }

  const selectable = tool === 'select'
  const cursor =
    tool === 'hand' ? 'grab' :
    (tool === 'select' || tool === 'form') ? 'default' :
    tool === 'signature' && activeSignature ? 'none' :
    'crosshair'
  const touchAction = (tool === 'select' || tool === 'form' || tool === 'hand') ? 'pan-y pinch-zoom' : 'none'

  const ghostSigWidth = 160
  const ghostSigHeight = activeSignature
    ? (ghostSigWidth * activeSignature.height) / activeSignature.width
    : 0

  return (
    <>
      <Stage
        width={width}
        height={height}
        style={{
          position: 'absolute',
          inset: 0,
          cursor,
          touchAction
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeaveStage}
      >
        <Layer>
          {annotations.map((a) => {
            const common = {
              id: a.id,
              draggable: selectable,
              onClick: () => onShapeClick(a.id),
              onTap: () => onShapeClick(a.id),
              onDragStart: () => onShapeDragStart(a),
              onDragMove: (e: Konva.KonvaEventObject<DragEvent>) =>
                onShapeDragMove(a, e),
              onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
                onShapeDragEnd(a, e),
              onTransformEnd: (e: Konva.KonvaEventObject<Event>) =>
                onShapeTransformEnd(a, e),
              ref: shapeRefSetter(a.id)
            }

            switch (a.type) {
              case 'draw':
                return (
                  <Line
                    key={a.id}
                    {...common}
                    x={0}
                    y={0}
                    points={a.points}
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    opacity={a.opacity ?? 1}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.4}
                    hitStrokeWidth={Math.max(20, a.strokeWidth + 14)}
                  />
                )
              case 'text':
                return (
                  <Text
                    key={a.id}
                    {...common}
                    x={a.x}
                    y={a.y}
                    rotation={a.rotation ?? 0}
                    text={a.text}
                    fill={a.color}
                    fontSize={a.fontSize}
                    fontFamily={FONT_STACK[a.fontFamily ?? 'sans']}
                    visible={a.id !== editingId}
                    onDblClick={() => onTextDblClick(a)}
                    onDblTap={() => onTextDblClick(a)}
                  />
                )
              case 'rect':
                return (
                  <Rect
                    key={a.id}
                    {...common}
                    x={a.x}
                    y={a.y}
                    rotation={a.rotation ?? 0}
                    width={a.width}
                    height={a.height}
                    stroke={a.color}
                    strokeWidth={2}
                  />
                )
              case 'tick': {
                const s = a.size
                return (
                  <Group key={a.id} {...common} x={a.x} y={a.y} rotation={a.rotation ?? 0}>
                    <Line
                      points={[0, s * 0.55, s * 0.35, s * 0.9, s, s * 0.1]}
                      stroke={a.color}
                      strokeWidth={3.5}
                      lineCap="round"
                      lineJoin="round"
                      hitStrokeWidth={24}
                    />
                  </Group>
                )
              }
              case 'cross': {
                const s = a.size
                return (
                  <Group key={a.id} {...common} x={a.x} y={a.y} rotation={a.rotation ?? 0}>
                    <Line
                      points={[0, 0, s, s]}
                      stroke={a.color}
                      strokeWidth={3.5}
                      lineCap="round"
                      hitStrokeWidth={20}
                    />
                    <Line
                      points={[s, 0, 0, s]}
                      stroke={a.color}
                      strokeWidth={3.5}
                      lineCap="round"
                      hitStrokeWidth={20}
                    />
                  </Group>
                )
              }
              case 'image':
                return (
                  <SignatureImage
                    key={a.id}
                    a={a}
                    shapeRef={shapeRefSetter(a.id)}
                    draggable={selectable}
                    onClick={() => onShapeClick(a.id)}
                    onDblClick={() => onLinkedDblClick(a)}
                    onDragStart={() => onShapeDragStart(a)}
                    onDragMove={(e) => onShapeDragMove(a, e)}
                    onDragEnd={(e) => onShapeDragEnd(a, e)}
                    onTransformEnd={(e) => onShapeTransformEnd(a, e)}
                  />
                )
              default:
                return null
            }
          })}

          {currentLine && tool === 'draw' && (
            <Line
              listening={false}
              points={currentLine}
              stroke={color}
              strokeWidth={strokeWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
            />
          )}
          {currentLine && tool === 'highlight' && (
            <Line
              listening={false}
              points={currentLine}
              stroke={color}
              strokeWidth={HIGHLIGHT_STROKE_WIDTH}
              opacity={HIGHLIGHT_OPACITY}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
            />
          )}
          {currentLine && tool === 'rect' && (() => {
            const [x1, y1, x2, y2] = currentLine
            return (
              <Rect
                listening={false}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                stroke={color}
                strokeWidth={2}
                dash={[6, 4]}
              />
            )
          })()}

          {tool === 'signature' && activeSignature && hoverPos && (
            <SignatureGhost
              src={activeSignature.dataUrl}
              x={hoverPos.x - ghostSigWidth / 2}
              y={hoverPos.y - ghostSigHeight / 2}
              width={ghostSigWidth}
              height={ghostSigHeight}
            />
          )}

          {(() => {
            const selected = annotations.find((a) => a.id === selectedId)
            const resizable = selected ? isResizable(selected) : false
            return (
              <Transformer
                ref={trRef}
                rotateEnabled
                resizeEnabled={resizable}
                keepRatio={selected?.type === 'image'}
                rotateAnchorOffset={28}
                enabledAnchors={resizable ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
                borderStroke="#ea580c"
                borderStrokeWidth={1.5}
                borderDash={[6, 4]}
                anchorStroke="#ea580c"
                anchorFill="#ffffff"
                anchorSize={9}
                anchorCornerRadius={2}
                boundBoxFunc={(_oldBox, newBox) => {
                  if (newBox.width < 12 || newBox.height < 12) return _oldBox
                  return newBox
                }}
              />
            )
          })()}

          {(() => {
            const selected = annotations.find((a) => a.id === selectedId)
            // Only draw annotations still rely on the custom dashed halo
            // (Konva's Transformer covers every other type). Skip while the
            // user is moving the shape so the box doesn't lag behind.
            if (!selected || selected.type !== 'draw' || editingId) return null
            if (draggingId === selected.id) return null
            const bbox = getAnnotationBBox(selected)
            return (
              <Rect
                listening={false}
                x={bbox.x}
                y={bbox.y}
                width={bbox.width}
                height={bbox.height}
                stroke="#ea580c"
                strokeWidth={1.5}
                dash={[6, 4]}
                cornerRadius={4}
              />
            )
          })()}
        </Layer>
      </Stage>

      {editingAnnotation && (
        <TextEditor
          annotation={editingAnnotation}
          onCommit={commitEdit}
          onCancel={() => {
            if (!editingAnnotation.text.trim()) {
              remove(editingAnnotation.id)
            }
            setEditingId(null)
          }}
        />
      )}
    </>
  )
}

function TextEditor({
  annotation,
  onCommit,
  onCancel
}: {
  annotation: TextAnnotation
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(annotation.text)
  // Suppress the very first blur so a focus race in Firefox doesn't silently
  // delete the empty annotation before the user gets a chance to type.
  const justMountedRef = useRef(true)

  // Focus synchronously after DOM mutations, then again on the next frame as
  // a safety net for browsers that drop the first focus call.
  useLayoutEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      justMountedRef.current = false
    })
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <input
      autoFocus
      ref={inputRef}
      type="text"
      inputMode="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        // If we blur in the same frame as mount (focus never landed), keep
        // the editor open instead of silently removing an empty annotation.
        if (justMountedRef.current) {
          inputRef.current?.focus()
          return
        }
        onCommit(value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      style={{
        position: 'absolute',
        left: annotation.x,
        top: annotation.y,
        color: annotation.color,
        fontSize: annotation.fontSize + 'px',
        fontFamily: FONT_STACK[annotation.fontFamily ?? 'sans'],
        lineHeight: 1,
        background: 'transparent',
        border: '1px dashed #ea580c',
        outline: 'none',
        padding: '0 2px',
        minWidth: '120px',
        width: Math.max(120, value.length * annotation.fontSize * 0.6 + 24) + 'px',
        height: annotation.fontSize * 1.25 + 'px',
        zIndex: 10
      }}
    />
  )
}
