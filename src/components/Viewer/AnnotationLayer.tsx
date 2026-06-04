import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Line,
  Rect,
  Ellipse,
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
    case 'ellipse':
    case 'redact':
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

// Highlighter strokes are free-draw lines that carry an opacity (pencil
// strokes leave it undefined). They are intentionally left out of marquee
// multi-select — the user can still grab them individually.
function isHighlighter(a: Annotation): boolean {
  return a.type === 'draw' && a.opacity !== undefined
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

interface Props {
  pageIndex: number
  width: number
  height: number
  scale: number
}

function isResizable(a: Annotation): boolean {
  return a.type === 'image' || a.type === 'rect' || a.type === 'ellipse' || a.type === 'redact'
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
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
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

export default function AnnotationLayer({ pageIndex, width, height, scale }: Props) {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const fontSize = useAnnotationStore((s) => s.fontSize)
  const fontFamily = useAnnotationStore((s) => s.fontFamily)
  const allAnnotations = useAnnotationStore((s) => s.annotations)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const selectedIds = useAnnotationStore((s) => s.selectedIds)
  const add = useAnnotationStore((s) => s.add)
  const update = useAnnotationStore((s) => s.update)
  const updateMany = useAnnotationStore((s) => s.updateMany)
  const remove = useAnnotationStore((s) => s.remove)
  const removeMany = useAnnotationStore((s) => s.removeMany)
  const setSelected = useAnnotationStore((s) => s.setSelected)
  const setSelectedIds = useAnnotationStore((s) => s.setSelectedIds)
  const toggleSelected = useAnnotationStore((s) => s.toggleSelected)
  const setTool = useAnnotationStore((s) => s.setTool)

  const activeSignature = useSignatureStore((s) => {
    const id = s.activeId
    return id ? s.signatures.find((x) => x.id === id) ?? null : null
  })

  const annotations = allAnnotations.filter((a) => a.pageIndex === pageIndex)

  const drawingRef = useRef(false)
  const activePointerIds = useRef(new Set<number>())
  const [currentLine, setCurrentLine] = useState<number[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Rubber-band selection rectangle (mouse/pen only — see onPointerDown). Held
  // in unscaled page coordinates and rendered as a dashed box while dragging.
  const marqueeRef = useRef<{
    startX: number
    startY: number
    curX: number
    curY: number
    moved: boolean
  } | null>(null)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // While dragging a multi-selection, the dragged node's last position so we
  // can apply the same delta to every other selected node each frame.
  const groupDragLast = useRef<{ x: number; y: number } | null>(null)
  // Pointer position used to render the ghost-signature preview that
  // follows the cursor while the signature tool is armed.
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  // Coarse pointer (touch) needs bigger Transformer anchors + a longer rotate
  // arm to be grabbable with a finger — the 9px desktop anchors are fiddly on
  // mobile. The handles themselves render on every device (the Transformer is
  // not viewport-gated); this only makes them finger-sized on touch.
  const [coarsePointer, setCoarsePointer] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    setCoarsePointer(mq.matches)
    const handler = (e: MediaQueryListEvent) => setCoarsePointer(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const editingAnnotation = annotations.find(
    (a) => a.id === editingId && a.type === 'text'
  ) as TextAnnotation | undefined

  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef(new Map<string, Konva.Node>())

  // Annotations on this page that are part of the current selection.
  const selectedOnPage = annotations.filter((a) => selectedIds.includes(a.id))
  const isMulti = selectedOnPage.length > 1

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    if (!editingId && selectedOnPage.length > 0) {
      // In a multi-selection every selected node (pen strokes included) joins
      // the Transformer so they move / resize / rotate as one group. A lone
      // free-draw stroke keeps its custom halo instead (see render below).
      const useTransformer = isMulti || isTransformable(selectedOnPage[0])
      if (useTransformer) {
        const nodes = selectedOnPage
          .map((a) => shapeRefs.current.get(a.id))
          .filter((n): n is Konva.Node => !!n)
        if (nodes.length > 0) {
          tr.nodes(nodes)
          tr.getLayer()?.batchDraw()
          return
        }
      }
    }
    tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [selectedIds, selectedOnPage, isMulti, annotations, editingId])

  function getPos(e: Konva.KonvaEventObject<PointerEvent>) {
    const p = e.target.getStage()!.getPointerPosition()!
    return { x: p.x / scale, y: p.y / scale }
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    activePointerIds.current.add(e.evt.pointerId)
    if (activePointerIds.current.size > 1) {
      // Multi-touch (pinch-to-zoom) — abort any in-progress drawing stroke
      // or rubber-band selection.
      drawingRef.current = false
      setCurrentLine(null)
      marqueeRef.current = null
      setMarquee(null)
      return
    }
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
        // Shift-click adds / removes a single item from the selection.
        if (e.evt.shiftKey && (tool === 'select' || tool === 'marquee')) {
          toggleSelected(hitId)
          if (tool !== 'select') setTool('select')
          return
        }
        // Grabbing a member of an existing multi-selection should drag the
        // whole group, not collapse it down to that one item.
        const ids = useAnnotationStore.getState().selectedIds
        if (ids.length > 1 && ids.includes(hitId)) {
          if (tool !== 'select') setTool('select')
          return
        }
        setSelected(hitId)
        if (tool !== 'select') setTool('select')
        return
      }
    }
    // Rubber-band (marquee) selection. Always available with the dedicated
    // marquee tool — touch included — since that tool reserves the gesture
    // (touchAction: none). With the plain Select tool it's a mouse/pen-only
    // shortcut so finger panning on mobile is never hijacked.
    const canMarquee =
      tool === 'marquee' || (tool === 'select' && e.evt.pointerType !== 'touch')
    if (canMarquee) {
      const p = getPos(e)
      marqueeRef.current = { startX: p.x, startY: p.y, curX: p.x, curY: p.y, moved: false }
      setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
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
        fontSize: fontSize / scale,
        fontFamily
      })
      setEditingId(id)
    } else if (tool === 'tick' || tool === 'cross') {
      const tickSize = 28 / scale
      add({
        id: crypto.randomUUID(),
        pageIndex,
        type: tool,
        x: pos.x - tickSize / 2,
        y: pos.y - tickSize / 2,
        size: tickSize,
        color
      })
    } else if (tool === 'rect' || tool === 'ellipse' || tool === 'redact') {
      drawingRef.current = true
      setCurrentLine([pos.x, pos.y, pos.x, pos.y])
    } else if (tool === 'signature') {
      const sigState = useSignatureStore.getState()
      const active = sigState.signatures.find((x) => x.id === sigState.activeId)
      if (active) {
        const targetW = 160 / scale
        const ratio = active.height / active.width
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'image',
          x: pos.x - targetW / 2,
          y: pos.y - (targetW * ratio) / 2,
          width: targetW,
          height: targetW * ratio,
          src: active.dataUrl,
        })
        useAnnotationStore.getState().setTool('select')
      }
    } else if (tool === 'image') {
      const src = useAnnotationStore.getState().uploadedImageSrc
      if (src) {
        const img = new Image()
        img.onload = () => {
          const targetW = 200 / scale
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
    if (marqueeRef.current) {
      const m = marqueeRef.current
      m.curX = pos.x
      m.curY = pos.y
      if (Math.abs(pos.x - m.startX) > 3 || Math.abs(pos.y - m.startY) > 3) m.moved = true
      setMarquee({ x1: m.startX, y1: m.startY, x2: pos.x, y2: pos.y })
      return
    }
    if (tool === 'signature' && activeSignature) {
      setHoverPos({ x: pos.x, y: pos.y })
    } else if (hoverPos) {
      setHoverPos(null)
    }
    if (!drawingRef.current) return
    setCurrentLine((prev) => {
      if (!prev) return null
      if (tool === 'rect' || tool === 'ellipse' || tool === 'redact') return [prev[0], prev[1], pos.x, pos.y]
      return [...prev, pos.x, pos.y]
    })
  }

  function onPointerLeaveStage() {
    setHoverPos(null)
    activePointerIds.current.clear()
    onPointerUp()
  }

  function onPointerUp(e?: Konva.KonvaEventObject<PointerEvent>) {
    if (e) activePointerIds.current.delete(e.evt.pointerId)
    if (marqueeRef.current) {
      const m = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      // A marquee that never moved is just a click on empty canvas — deselect.
      if (!m.moved) {
        setSelected(null)
        return
      }
      const rx = Math.min(m.startX, m.curX)
      const ry = Math.min(m.startY, m.curY)
      const rw = Math.abs(m.curX - m.startX)
      const rh = Math.abs(m.curY - m.startY)
      const box = { x: rx, y: ry, width: rw, height: rh }
      const hits = annotations.filter(
        (a) => !isHighlighter(a) && rectsIntersect(getAnnotationBBox(a), box)
      )
      setSelectedIds(hits.map((a) => a.id))
      // The marquee tool is a one-shot "draw the box" mode — once it has caught
      // something, drop into Select so the group can immediately be moved /
      // resized / rotated (touch included; group transforms aren't pointer-
      // gated). An empty sweep leaves the tool armed for another try.
      if (tool === 'marquee' && hits.length > 0) setTool('select')
      return
    }
    if (drawingRef.current && currentLine) {
      if (tool === 'draw' && currentLine.length >= 4) {
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'draw',
          points: currentLine,
          color,
          strokeWidth: strokeWidth / scale
        })
      } else if (tool === 'highlight' && currentLine.length >= 4) {
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'draw',
          points: currentLine,
          color,
          strokeWidth: HIGHLIGHT_STROKE_WIDTH / scale,
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
      } else if (tool === 'ellipse') {
        const [x1, y1, x2, y2] = currentLine
        const x = Math.min(x1, x2)
        const y = Math.min(y1, y2)
        const w = Math.abs(x2 - x1)
        const h = Math.abs(y2 - y1)
        if (w > 4 && h > 4) {
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'ellipse',
            x,
            y,
            width: w,
            height: h,
            color
          })
        }
      } else if (tool === 'redact') {
        const [x1, y1, x2, y2] = currentLine
        const x = Math.min(x1, x2)
        const y = Math.min(y1, y2)
        const w = Math.abs(x2 - x1)
        const h = Math.abs(y2 - y1)
        if (w > 4 && h > 4) {
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'redact',
            x,
            y,
            width: w,
            height: h
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

  function onShapeClick(id: string, e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool !== 'select') return
    // Shift-clicks are handled on pointerdown (toggle); don't let the trailing
    // click collapse the selection back to a single item.
    if (e?.evt && 'shiftKey' in e.evt && e.evt.shiftKey) return
    setSelected(id)
  }

  function onTextDblClick(a: TextAnnotation) {
    if (tool !== 'select') return
    setEditingId(a.id)
    setSelected(a.id)
  }

  function onShapeDragStart(a: Annotation) {
    setDraggingId(a.id)
    const ids = useAnnotationStore.getState().selectedIds
    if (ids.length > 1 && ids.includes(a.id)) {
      const node = shapeRefs.current.get(a.id)
      groupDragLast.current = node ? { x: node.x(), y: node.y() } : null
    } else {
      groupDragLast.current = null
    }
  }

  // While dragging one member of a multi-selection, translate every other
  // selected node by the same delta so the group moves rigidly together.
  function onShapeDragMove(a: Annotation, e: Konva.KonvaEventObject<DragEvent>) {
    const last = groupDragLast.current
    if (!last) return
    const ids = useAnnotationStore.getState().selectedIds
    if (ids.length <= 1) return
    const node = e.target
    const dx = node.x() - last.x
    const dy = node.y() - last.y
    if (dx === 0 && dy === 0) return
    for (const id of ids) {
      if (id === a.id) continue
      const n = shapeRefs.current.get(id)
      if (n) n.position({ x: n.x() + dx, y: n.y() + dy })
    }
    groupDragLast.current = { x: node.x(), y: node.y() }
    trRef.current?.forceUpdate()
    node.getLayer()?.batchDraw()
  }

  // Translate-only patch for a single node after a drag, branching on the
  // type-specific position conventions (draw bakes into points; ellipse x/y
  // is a centre). Shared by single-shape and group drag commits.
  function nodeMovePatch(a: Annotation, node: Konva.Node): Partial<Annotation> {
    if (a.type === 'draw') {
      const dx = node.x()
      const dy = node.y()
      const next = a.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
      node.position({ x: 0, y: 0 })
      return { points: next } as Partial<Annotation>
    }
    if (a.type === 'ellipse') {
      // Konva Ellipse position is its centre; we store the top-left bbox.
      return { x: node.x() - a.width / 2, y: node.y() - a.height / 2 } as Partial<Annotation>
    }
    return { x: node.x(), y: node.y() } as Partial<Annotation>
  }

  function onShapeDragEnd(a: Annotation, e: Konva.KonvaEventObject<DragEvent>) {
    setDraggingId(null)
    const ids = useAnnotationStore.getState().selectedIds
    if (groupDragLast.current && ids.length > 1) {
      groupDragLast.current = null
      const annos = useAnnotationStore.getState().annotations
      const patches = ids
        .map((id) => {
          const n = shapeRefs.current.get(id)
          const ann = annos.find((x) => x.id === id)
          return n && ann ? { id, patch: nodeMovePatch(ann, n) } : null
        })
        .filter((p): p is { id: string; patch: Partial<Annotation> } => !!p)
      updateMany(patches)
      return
    }
    update(a.id, nodeMovePatch(a, e.target))
  }

  // Resize / rotate patch for one node, resetting Konva's transient scale so
  // the new geometry lives in our model. Group resize also scales text/marks
  // and bakes pen strokes (none of which resize in a single selection).
  function nodeTransformPatch(a: Annotation, node: Konva.Node): Partial<Annotation> | null {
    const rotation = node.rotation()
    const sx = node.scaleX()
    const sy = node.scaleY()
    if (a.type === 'image' || a.type === 'rect' || a.type === 'redact') {
      const width = Math.max(8, node.width() * sx)
      const height = Math.max(8, node.height() * sy)
      node.scaleX(1)
      node.scaleY(1)
      return { x: node.x(), y: node.y(), width, height, rotation } as Partial<Annotation>
    }
    if (a.type === 'ellipse') {
      const width = Math.max(8, node.width() * sx)
      const height = Math.max(8, node.height() * sy)
      node.scaleX(1)
      node.scaleY(1)
      return {
        x: node.x() - width / 2,
        y: node.y() - height / 2,
        width,
        height,
        rotation
      } as Partial<Annotation>
    }
    if (a.type === 'text') {
      const fontSize = Math.max(4, a.fontSize * sy)
      node.scaleX(1)
      node.scaleY(1)
      return { x: node.x(), y: node.y(), fontSize, rotation } as Partial<Annotation>
    }
    if (a.type === 'tick' || a.type === 'cross') {
      const size = Math.max(6, a.size * ((sx + sy) / 2))
      node.scaleX(1)
      node.scaleY(1)
      return { x: node.x(), y: node.y(), size, rotation } as Partial<Annotation>
    }
    if (a.type === 'draw') {
      // Bake the node's full transform (translate + scale + rotate) into the
      // stored points, then reset the node to the identity. getTransform maps
      // local -> layer space, which is our unscaled model space.
      const tfm = node.getTransform().copy()
      const pts: number[] = []
      for (let i = 0; i < a.points.length; i += 2) {
        const p = tfm.point({ x: a.points[i], y: a.points[i + 1] })
        pts.push(p.x, p.y)
      }
      node.scaleX(1)
      node.scaleY(1)
      node.rotation(0)
      node.position({ x: 0, y: 0 })
      return { points: pts } as Partial<Annotation>
    }
    return null
  }

  // Commit a group resize / rotate as one history step. Fires from the
  // Transformer itself; per-shape handlers bail out while a group is selected.
  function onGroupTransformEnd() {
    const tr = trRef.current
    if (!tr) return
    if (useAnnotationStore.getState().selectedIds.length <= 1) return
    const annos = useAnnotationStore.getState().annotations
    const patches = tr
      .nodes()
      .map((node) => {
        const ann = annos.find((x) => x.id === node.id())
        const patch = ann ? nodeTransformPatch(ann, node) : null
        return patch ? { id: node.id(), patch } : null
      })
      .filter((p): p is { id: string; patch: Partial<Annotation> } => !!p)
    if (patches.length) updateMany(patches)
    tr.getLayer()?.batchDraw()
  }

  function onShapeTransformEnd(a: Annotation, e: Konva.KonvaEventObject<Event>) {
    // Group transforms are committed once, centrally, by onGroupTransformEnd.
    if (useAnnotationStore.getState().selectedIds.length > 1) return
    const node = e.target
    const rotation = node.rotation()
    if (a.type === 'image' || a.type === 'rect' || a.type === 'redact') {
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
    } else if (a.type === 'ellipse') {
      // Konva Ellipse.width()/height() are 2× the radii, and its x/y is the
      // centre — convert back to the stored top-left bbox.
      const newWidth = Math.max(8, node.width() * node.scaleX())
      const newHeight = Math.max(8, node.height() * node.scaleY())
      node.scaleX(1)
      node.scaleY(1)
      update(a.id, {
        x: node.x() - newWidth / 2,
        y: node.y() - newHeight / 2,
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
    tool === 'marquee' ? 'crosshair' :
    (tool === 'select' || tool === 'form') ? 'default' :
    tool === 'signature' && activeSignature ? 'none' :
    'crosshair'
  // The marquee tool reserves drags for the selection box, so the page must
  // not scroll under the gesture (touchAction: none). Select/hand/form keep
  // vertical panning + pinch-zoom available to the browser.
  const touchAction = (tool === 'select' || tool === 'form' || tool === 'hand') ? 'pan-y pinch-zoom' : 'none'

  const ghostSigWidth = 160 / scale
  const ghostSigHeight = activeSignature
    ? (ghostSigWidth * activeSignature.height) / activeSignature.width
    : 0

  return (
    <>
      <Stage
        width={width}
        height={height}
        scaleX={scale}
        scaleY={scale}
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
              onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onShapeClick(a.id, e),
              onTap: (e: Konva.KonvaEventObject<TouchEvent>) => onShapeClick(a.id, e),
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
                    fill={a.filled ? a.color : undefined}
                    stroke={a.color}
                    strokeWidth={a.filled ? 0 : 2}
                  />
                )
              case 'ellipse':
                // Konva Ellipse is centre-anchored; we store a top-left bbox.
                return (
                  <Ellipse
                    key={a.id}
                    {...common}
                    x={a.x + a.width / 2}
                    y={a.y + a.height / 2}
                    rotation={a.rotation ?? 0}
                    radiusX={a.width / 2}
                    radiusY={a.height / 2}
                    fill={a.filled ? a.color : undefined}
                    stroke={a.color}
                    strokeWidth={a.filled ? 0 : 2}
                  />
                )
              case 'redact':
                return (
                  <Rect
                    key={a.id}
                    {...common}
                    x={a.x}
                    y={a.y}
                    width={a.width}
                    height={a.height}
                    fill="#000000"
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
                    onClick={(e) => onShapeClick(a.id, e)}
                    onDblClick={() => onShapeClick(a.id)}
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
          {currentLine && tool === 'ellipse' && (() => {
            const [x1, y1, x2, y2] = currentLine
            const w = Math.abs(x2 - x1)
            const h = Math.abs(y2 - y1)
            return (
              <Ellipse
                listening={false}
                x={Math.min(x1, x2) + w / 2}
                y={Math.min(y1, y2) + h / 2}
                radiusX={w / 2}
                radiusY={h / 2}
                stroke={color}
                strokeWidth={2}
                dash={[6, 4]}
              />
            )
          })()}
          {currentLine && tool === 'redact' && (() => {
            const [x1, y1, x2, y2] = currentLine
            return (
              <Rect
                listening={false}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                fill="#000000"
                opacity={0.7}
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

          {marquee && (() => {
            const x = Math.min(marquee.x1, marquee.x2)
            const y = Math.min(marquee.y1, marquee.y2)
            return (
              <Rect
                listening={false}
                x={x}
                y={y}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill="#ea580c"
                opacity={0.08}
                stroke="#ea580c"
                strokeWidth={1}
                dash={[4, 3]}
              />
            )
          })()}

          {(() => {
            const single = !isMulti && selectedOnPage.length === 1 ? selectedOnPage[0] : null
            // In a multi-selection the group box always offers resize + rotate;
            // for a single object it follows that object's own capabilities.
            const resizable = isMulti ? true : single ? isResizable(single) : false
            // Redactions are baked as axis-aligned black boxes (the export
            // rasteriser ignores rotation), so don't offer a rotate handle
            // that would silently do nothing.
            const rotatable = isMulti
              ? !selectedOnPage.some((a) => a.type === 'redact')
              : single
                ? single.type !== 'redact'
                : true
            return (
              <Transformer
                ref={trRef}
                onTransformEnd={onGroupTransformEnd}
                rotateEnabled={rotatable}
                resizeEnabled={resizable}
                keepRatio={!isMulti && single?.type === 'image'}
                // Bigger rotate arm + anchors on touch so they clear the finger
                // and are easy to grab; desktop keeps the compact sizing.
                rotateAnchorOffset={coarsePointer ? 40 : 28}
                enabledAnchors={resizable ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
                borderStroke="#ea580c"
                borderStrokeWidth={1.5}
                borderDash={[6, 4]}
                anchorStroke="#ea580c"
                anchorFill="#ffffff"
                anchorSize={coarsePointer ? 18 : 9}
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
          scale={scale}
          onCommit={commitEdit}
          onCancel={() => {
            if (!editingAnnotation.text.trim()) {
              remove(editingAnnotation.id)
            }
            setEditingId(null)
          }}
        />
      )}

      {(() => {
        // Delete affordance on the currently-selected object — same visibility
        // as the resize/rotate Transformer (any selection, not while dragging or
        // editing text). Sits just off the top-right corner.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected) return null
        const bbox = getAnnotationBBox(selected)
        return (
          <button
            type="button"
            title="Delete"
            aria-label="Delete selected object"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); remove(selected.id) }}
            style={{
              position: 'absolute',
              left: (bbox.x + bbox.width) * scale + 8,
              top: bbox.y * scale - 8,
              zIndex: 21
            }}
            className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 flex items-center justify-center transition-colors"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M9 7V5h6v2" />
              <path d="M6 7l1 13h10l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        )
      })()}

      {(() => {
        // Group delete affordance — deletes every selected object at once.
        // Anchored to the union bounding box of the multi-selection.
        if (draggingId || editingId || !isMulti) return null
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const a of selectedOnPage) {
          const b = getAnnotationBBox(a)
          if (b.x < minX) minX = b.x
          if (b.y < minY) minY = b.y
          if (b.x + b.width > maxX) maxX = b.x + b.width
          if (b.y + b.height > maxY) maxY = b.y + b.height
        }
        if (!isFinite(minX)) return null
        return (
          <button
            type="button"
            title={`Delete ${selectedOnPage.length} objects`}
            aria-label={`Delete ${selectedOnPage.length} selected objects`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeMany(selectedIds) }}
            style={{
              position: 'absolute',
              left: maxX * scale + 8,
              top: minY * scale - 8,
              zIndex: 21
            }}
            className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 flex items-center justify-center transition-colors"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M9 7V5h6v2" />
              <path d="M6 7l1 13h10l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        )
      })()}

      {(() => {
        if (tool !== 'select') return null
        if (draggingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected || (selected.type !== 'rect' && selected.type !== 'ellipse')) return null
        const filled = !!selected.filled
        const bbox = getAnnotationBBox(selected)
        return (
          <button
            type="button"
            title={filled ? 'Clear fill' : 'Fill with active colour'}
            aria-label={filled ? 'Clear fill' : 'Fill with active colour'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              update(selected.id, { filled: !filled } as Partial<Annotation>)
            }}
            style={{
              position: 'absolute',
              left: (bbox.x + bbox.width) * scale + 8,
              top: bbox.y * scale - 8 + 36,
              zIndex: 20
            }}
            className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 hover:border-orange-500 hover:bg-orange-50 flex items-center justify-center text-base leading-none"
          >
            <span aria-hidden="true">{filled ? '⌫' : '🪣'}</span>
          </button>
        )
      })()}
    </>
  )
}

function TextEditor({
  annotation,
  scale,
  onCommit,
  onCancel
}: {
  annotation: TextAnnotation
  scale: number
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
        left: annotation.x * scale,
        top: annotation.y * scale,
        color: annotation.color,
        fontSize: (annotation.fontSize * scale) + 'px',
        fontFamily: FONT_STACK[annotation.fontFamily ?? 'sans'],
        lineHeight: 1,
        background: 'transparent',
        border: '1px dashed #ea580c',
        outline: 'none',
        padding: '0 2px',
        minWidth: '120px',
        width: Math.max(120, value.length * annotation.fontSize * 0.6 * scale + 24) + 'px',
        height: annotation.fontSize * 1.25 * scale + 'px',
        zIndex: 10
      }}
    />
  )
}
