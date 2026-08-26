import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { usePdfStore } from '../../stores/pdfStore'
import { useSignatureStore } from '../../stores/signatureStore'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import { useImage } from '../../lib/useImage'
import { layerPixelRatio, pagePixelBudget } from '../../lib/renderBudget'
import { RedactIcon } from '../icons/RedactIcon'
import { SIGNATURE_INK, formatSigningDate } from '../../lib/signature'
import { composeSignature, sigHasLabels, DEFAULT_LABEL_SCALE } from '../../lib/composeSignature'
import { inkColorFor, renderInkSignature } from '../../lib/renderInk'
import { FONT_CSS } from '../../lib/fonts'
import { effectiveRuns, runFontStyle, runHasStyle, runsToPlainText, runsToHtml, parseRunsFromDom, mergeRuns } from '../../lib/textRuns'
import type { Annotation, DrawAnnotation, ImageAnnotation, SignatureData, SignatureFieldAnnotation, SigAlign, TextAnnotation, Tool, TextRun } from '../../types/annotations'
import type { QrPlacement } from '../../lib/qr/design'

// On-screen font stacks, keyed by family id (shared with the toolbar + export).
const FONT_STACK = FONT_CSS

// Shared offscreen 2D context for measuring run widths in unscaled model space.
// Konva itself measures with canvas measureText, so widths derived here match
// the on-canvas advance, keeping the per-run layout and the editor aligned.
const _measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
const _measureCtx = _measureCanvas?.getContext('2d') ?? null

// Width of one run at the annotation's (unscaled) font size + family.
function runWidth(run: TextRun, fontSize: number, cssFamily: string): number {
  if (!_measureCtx) return run.text.length * fontSize * 0.6
  _measureCtx.font = `${runFontStyle(run)} ${fontSize}px ${cssFamily}`
  return _measureCtx.measureText(run.text).width
}

// Total on-screen width (unscaled) of a text annotation across all its runs.
function textWidth(a: TextAnnotation): number {
  const cssFamily = FONT_STACK[a.fontFamily ?? 'sans']
  return effectiveRuns(a).reduce((sum, r) => sum + runWidth(r, a.fontSize, cssFamily), 0)
}

const HIGHLIGHT_STROKE_WIDTH = 16
const HIGHLIGHT_OPACITY = 0.4

// Remembers the user's "don't show again" choice for the fill-vs-redact
// warning. A filled box/circle only paints over content — the text beneath
// stays selectable/extractable — so we nudge the user toward redaction once.
const FILL_WARNING_KEY = 'updf:fillWarningDismissed'
function fillWarningDismissed(): boolean {
  try {
    return localStorage.getItem(FILL_WARNING_KEY) === '1'
  } catch {
    return false
  }
}
function dismissFillWarning() {
  try {
    localStorage.setItem(FILL_WARNING_KEY, '1')
  } catch {
    // Ignore storage failures (private mode etc.) — we just keep warning.
  }
}

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
      const w = Math.max(24, textWidth(a) + 8)
      return { x: a.x - 2, y: a.y - 2, width: w + 4, height: a.fontSize * 1.25 + 4 }
    }
    case 'rect':
    case 'ellipse':
    case 'redact':
    case 'sigfield':
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

// Tools that drop a new object and then stay armed, so the next click on empty
// page space places another one (ticking a column of checkboxes in a row).
// Because the fresh object is auto-selected, these are exactly the cases where
// the confirm affordance is worth showing next to Delete: it's the way out of
// the loop, back to Select, without hunting for the toolbar. 'select',
// 'marquee', 'hand', 'selecttext' and 'form' place nothing, so a selection made
// with them has nothing to confirm.
const PLACEMENT_TOOLS = new Set<Tool>([
  'text',
  'draw',
  'highlight',
  'rect',
  'ellipse',
  'redact',
  'tick',
  'cross',
  'line',
  'image',
  'signature',
  'sigfield'
])

// A newly placed object is sized in display pixels (`N / scale`) so it looks
// the same on screen at any zoom. Zoomed right out that stops making sense: at
// 25% a 160px-wide signature is 640pt on a 595pt-wide A4 page — wider than the
// sheet it lands on. Cap a placement at half the page in either direction,
// scaling both sides together so the aspect ratio survives.
const MAX_PLACEMENT_FRACTION = 0.5

function fitPlacement(
  w: number,
  h: number,
  pageW: number,
  pageH: number
): { width: number; height: number } {
  const k = Math.min(
    1,
    w > 0 ? (pageW * MAX_PLACEMENT_FRACTION) / w : 1,
    h > 0 ? (pageH * MAX_PLACEMENT_FRACTION) / h : 1
  )
  return { width: w * k, height: h * k }
}

// Where a Konva node sits when it is faithfully showing the model's position —
// the inverse of nodeMovePatch. Used to put a node back after a drag is
// cancelled (a pinch starting mid-drag), so the shape returns to where the user
// left it instead of committing a move they never meant to make.
function nodeHomePosition(a: Annotation): { x: number; y: number } {
  // A pen stroke carries its position in `points`, so its node sits at origin.
  if (a.type === 'draw') return { x: 0, y: 0 }
  // Konva Ellipse is positioned by its centre; we store the top-left bbox.
  if (a.type === 'ellipse') return { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  return { x: a.x, y: a.y }
}

// Highlighter strokes are free-draw lines that carry an opacity (pencil
// strokes leave it undefined). They are intentionally left out of marquee
// multi-select — the user can still grab them individually.
function isHighlighter(a: Annotation): boolean {
  return a.type === 'draw' && a.opacity !== undefined
}

// A straight line drawn with the line tool: a two-point free-draw stroke tagged
// with shape === 'line'. These get endpoint grabbers + a contextual panel. Kept
// as a plain boolean (not a type predicate) so negating it doesn't narrow a
// DrawAnnotation down to `never` at the call sites.
function isLine(a: Annotation): boolean {
  return a.type === 'draw' && a.shape === 'line' && a.points.length >= 4
}

// True if the click landed on one of our line endpoint grabbers, so the Stage
// pointerdown handler can leave the grabber's own drag gesture alone (same idea
// as isTransformerTarget).
function isLineAnchorTarget(target: Konva.Node | null): boolean {
  let node: Konva.Node | null = target
  while (node) {
    if (node.name() === 'lineAnchor') return true
    node = node.getParent()
  }
  return false
}

// Constrain a line's end point to the nearest 45° axis (horizontal, vertical
// or diagonal) while keeping its length. Used to draw "rigid" lines when the
// line-snap option is on or Shift is held.
function snapLineEnd(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { x: x2, y: y2 }
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: x1 + Math.cos(angle) * dist, y: y1 + Math.sin(angle) * dist }
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
  // Locked signature-request boxes (re-detected from an exported PDF) can't be
  // resized — their outline is baked into the page.
  if (a.type === 'sigfield') return !a.locked
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

// Contain a source image (natural size srcW×srcH) inside a box, leaving a small
// margin, and return the offset + size of the fitted image within the box.
function containRect(
  boxW: number,
  boxH: number,
  srcW: number,
  srcH: number,
  marginFrac = 0.08
): { x: number; y: number; width: number; height: number } {
  const availW = Math.max(1, boxW * (1 - marginFrac * 2))
  const availH = Math.max(1, boxH * (1 - marginFrac * 2))
  const ratio = srcW > 0 && srcH > 0 ? srcW / srcH : 1
  let w = availW
  let h = w / ratio
  if (h > availH) {
    h = availH
    w = h * ratio
  }
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, width: w, height: h }
}

// Read the editable signature payload from a placed signature (a dropped
// library signature / stamp / image, or a signed request box), if any.
function sigDataOf(a: Annotation): SignatureData | null {
  if (a.type === 'image') return a.sig ?? null
  if (a.type === 'sigfield') return a.signed?.data ?? null
  return null
}

// The editable payload for an image, synthesising one on first edit for images
// placed before this existed (or plain imported pictures / stamps): the current
// rendered image becomes the untouched "ink" and labels compose on top of it.
function ensureImageSigData(a: ImageAnnotation): SignatureData {
  return (
    a.sig ?? {
      ink: a.src,
      inkWidth: a.width,
      inkHeight: a.height,
      showName: false,
      showDate: false,
      align: 'center',
      labelScale: DEFAULT_LABEL_SCALE,
      color: SIGNATURE_INK
    }
  )
}

// Whether an annotation is a signature that can be double-tapped to edit its
// name/date options: any placed image (drawn signature, stamp or picture) or a
// request box that's been signed in-app (has re-editable data).
function isEditableSignature(a: Annotation | undefined): boolean {
  if (!a) return false
  if (a.type === 'image') return true
  if (a.type === 'sigfield') return !!a.signed?.data
  return false
}

// A "Request signature" box. Unsigned it's a dashed placeholder with a
// "Sign here" caption (and the requested Name / Date lines); signed it shows the
// baked signature image contained inside the box. The whole box is clickable —
// the click handler on the group opens the pad to sign it.
function SigField({
  a,
  scale,
  common,
  armed,
  onDblClick
}: {
  a: SignatureFieldAnnotation
  scale: number
  // The shared shape props (id, draggable, event handlers, ref) spread onto the
  // group so it selects / drags / transforms like every other annotation.
  common: React.ComponentProps<typeof Group>
  // Selected but not yet "armed to sign" — show the "Click again to sign" hint
  // (the first click selects so the box can be dragged/placed; the second signs).
  armed: boolean
  // Double-tap a signed box to edit its name/date options (never redraws ink).
  onDblClick: () => void
}) {
  const img = useImage(a.signed?.src ?? '')
  const captionRef = useRef<Konva.Text>(null)
  const hintRef = useRef<Konva.Group>(null)
  const stroke = 1.5 / scale
  const radius = 4 / scale
  const parts: string[] = []
  if (a.requireName) parts.push('Name')
  if (a.requireDate) parts.push('Date')
  if (a.requireLive) parts.push('Live')
  const caption = ['Sign here', ...parts].join(' • ')
  // Fixed, small caption size — deliberately NOT derived from the box height, so
  // resizing the box never rescales (and blurs) the text. Clamped down only so
  // it can't dwarf a very small box.
  const fs = Math.min(12 / scale, a.height * 0.5, a.width * 0.14)
  // Inset the caption from the box's top-left corner.
  const pad = Math.min(8 / scale, a.height * 0.12, a.width * 0.06)
  const fit = a.signed ? containRect(a.width, a.height, a.signed.width, a.signed.height) : null
  // Locked boxes come from an exported PDF whose outline is already baked into
  // the page, so the overlay is just an invisible click-to-sign hit area — no
  // border/caption to avoid doubling up on the baked one. Unlocked boxes are
  // live editing overlays and draw the dashed box + caption themselves.
  const locked = !!a.locked
  const decorated = !a.signed && !locked

  // The Transformer scales the whole group live while resizing, which would
  // stretch/blur the caption AND the "Click again to sign" hint. Counter-scale
  // both each frame so they hold a constant on-screen size; onTransformEnd
  // resets the group scale to 1 and clears these inverses so the committed
  // render is crisp. The caption is anchored top-left, the hint at the box
  // centre — both counter-scale around their own origin, so a centre-anchored
  // hint stays pinned to the (live-scaling) box centre.
  function onTransform(e: Konva.KonvaEventObject<Event>) {
    const node = e.target
    const sx = node.scaleX() || 1
    const sy = node.scaleY() || 1
    const inv = { x: 1 / sx, y: 1 / sy }
    captionRef.current?.scale(inv)
    hintRef.current?.scale(inv)
    node.getLayer()?.batchDraw()
  }

  // "Click again to sign" hint pill, centred in the box (screen-constant size).
  // The Group sits at the box centre and its children are offset around (0,0),
  // so counter-scaling it during a resize keeps the pill centred and unstretched.
  const hintFs = 12 / scale
  const hintText = 'Click again to sign'
  const hintW = hintText.length * hintFs * 0.52
  const hintH = hintFs * 1.7
  const hintPad = 7 / scale

  return (
    <Group
      {...common}
      x={a.x}
      y={a.y}
      draggable={!!common.draggable && !locked}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onTransform={onTransform}
      onTransformEnd={(e) => {
        captionRef.current?.scale({ x: 1, y: 1 })
        hintRef.current?.scale({ x: 1, y: 1 })
        common.onTransformEnd?.(e)
      }}
    >
      {/* Backing rect — the pointer hit area. A faint fill keeps the whole box
          clickable; the border/caption only render for live (unlocked) boxes. */}
      <Rect
        width={a.width}
        height={a.height}
        cornerRadius={radius}
        // A signed box that came from a flattened/exported PDF (locked) has the
        // "Sign here • Name • Date" caption baked into the page beneath it —
        // paint the box opaque white so the signature replaces it cleanly.
        fill={decorated ? 'rgba(234,88,12,0.06)' : (a.signed && locked ? '#ffffff' : 'rgba(255,255,255,0.01)')}
        stroke={decorated ? '#ea580c' : undefined}
        strokeWidth={decorated ? stroke : 0}
        dash={decorated ? [6 / scale, 4 / scale] : undefined}
      />
      {a.signed && img && fit ? (
        <KonvaImage
          listening={false}
          image={img}
          x={fit.x}
          y={fit.y}
          width={fit.width}
          height={fit.height}
        />
      ) : decorated ? (
        <Text
          ref={captionRef}
          listening={false}
          x={pad}
          y={pad}
          text={caption}
          align="left"
          verticalAlign="top"
          wrap="none"
          fontStyle="bold"
          fontSize={fs}
          fill="#c2410c"
          fontFamily={FONT_STACK.sans}
        />
      ) : null}
      {armed && !a.signed && (
        <Group ref={hintRef} listening={false} x={a.width / 2} y={a.height / 2}>
          <Rect
            x={-hintW / 2 - hintPad}
            y={-hintH / 2 - hintPad / 2}
            width={hintW + hintPad * 2}
            height={hintH + hintPad}
            cornerRadius={(hintH + hintPad) / 2}
            fill="#ea580c"
            shadowColor="#000000"
            shadowOpacity={0.25}
            shadowBlur={6 / scale}
            shadowOffsetY={1 / scale}
          />
          <Text
            x={-hintW / 2}
            y={-hintH / 2}
            width={hintW}
            height={hintH}
            text={hintText}
            align="center"
            verticalAlign="middle"
            wrap="none"
            fontStyle="bold"
            fontSize={hintFs}
            fill="#ffffff"
            fontFamily={FONT_STACK.sans}
          />
        </Group>
      )}
    </Group>
  )
}

export default function AnnotationLayer({ pageIndex, width, height, scale }: Props) {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const redactFill = useAnnotationStore((s) => s.redactFill)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const lineSnap = useAnnotationStore((s) => s.lineSnap)
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
  const setLineSnap = useAnnotationStore((s) => s.setLineSnap)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const setFontSize = useAnnotationStore((s) => s.setFontSize)

  // Two fingers are down on the viewer for a pinch-zoom (see PdfViewer). While
  // this is true the layer starts nothing and finishes nothing — the gesture
  // belongs entirely to the zoom.
  const pinching = usePdfStore((s) => s.pinching)

  // Konva sizes its scene canvas at `devicePixelRatio` by default, and it is
  // the size of the whole page: at 400% on a 3× phone screen that is half a
  // gigabyte of backing store PER PAGE, which is what used to kill the web view
  // mid-pinch. The page's share of the render budget decides how much of that
  // it can afford — the same call `PdfPage` makes for the bitmap underneath, so
  // the two stay in step — and `maxZoomForDocument` stops the zoom before even
  // a CSS-resolution stage would blow the budget.
  //
  // ⚠️ Konva has no `pixelRatio` prop on either Stage or Layer; the scene
  // canvas has to be told imperatively. (Its hit canvas is fixed at 1 and is
  // counted in the budget as such.)
  const stageRef = useRef<Konva.Stage>(null)
  const numPages = usePdfStore((s) => s.numPages)
  const pixelRatio = layerPixelRatio(width, height, pagePixelBudget(numPages))
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    for (const layer of stage.getLayers()) {
      const canvas = layer.getCanvas()
      if (canvas.getPixelRatio() === pixelRatio) continue
      // setPixelRatio re-sizes (and so clears) the backing store, hence the redraw.
      canvas.setPixelRatio(pixelRatio)
      layer.batchDraw()
    }
  }, [pixelRatio, width, height])

  const activeSignature = useSignatureStore((s) => {
    const id = s.activeId
    return id ? s.signatures.find((x) => x.id === id) ?? null : null
  })
  // Name/date pieces awaiting click-placement after a "separate" signature.
  const pendingExtras = useSignatureStore((s) => s.pendingExtras)

  const annotations = allAnnotations.filter((a) => a.pageIndex === pageIndex)

  const drawingRef = useRef(false)
  const activePointerIds = useRef(new Set<number>())
  // Set by cancelGesture; makes the dragend handlers discard the move instead
  // of writing it to the store. Cleared when a fresh gesture legitimately
  // starts (a new pointerdown or dragstart) or when the cancelled drag ends.
  const gestureCancelled = useRef(false)
  // A placement that is waiting to find out whether this gesture is a tap or a
  // swipe. The one-shot tools (text/tick/cross/signature/image) used to commit
  // on pointerDOWN, so on a phone the box landed the instant a finger touched
  // the page — picking Text and then scrolling left a stray empty text box
  // behind. Now the position is remembered here and only committed if the
  // finger lifts without travelling (see TAP_SLOP_PX).
  //
  // Screen coordinates, not stage coordinates: the slop must mean the same
  // number of physical pixels at every zoom level.
  const pendingTapRef = useRef<
    { x: number; y: number; clientX: number; clientY: number } | null
  >(null)
  const [currentLine, setCurrentLine] = useState<number[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // A signature-request box that's been selected (first click) and is now
  // "armed" — a second click on it opens the signing pad. The ref is the
  // synchronous source of truth for the click handler; the state drives the
  // "Click again to sign" overlay. Cleared whenever the selection moves away.
  const armedSigfieldRef = useRef<string | null>(null)
  const [armedSigfieldId, setArmedSigfieldId] = useState<string | null>(null)
  const armSigfield = (id: string | null) => {
    armedSigfieldRef.current = id
    setArmedSigfieldId(id)
  }
  // Disarm as soon as the selection leaves the armed box (clicked elsewhere,
  // deselected, or another shape selected) so the "Click again to sign" hint
  // never lingers on a box the user has moved on from.
  useEffect(() => {
    if (armedSigfieldRef.current && selectedId !== armedSigfieldRef.current) {
      armSigfield(null)
    }
  }, [selectedId])
  // Live override for the endpoint currently being dragged by a line grabber, so
  // the line follows the handle without committing a history step every frame.
  const [lineDrag, setLineDrag] = useState<{ id: string; index: 0 | 1; x: number; y: number } | null>(null)
  // Id of the rect/ellipse awaiting confirmation before it gets filled — drives
  // the "text is still readable, redact instead?" warning dialog.
  const [fillWarnId, setFillWarnId] = useState<string | null>(null)
  const [fillWarnDontShow, setFillWarnDontShow] = useState(false)
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
  // Id of the placed signature whose name/date options are open in the
  // double-tap editor. The editor only ever changes labels/styling — it
  // re-composes from the untouched ink, never the strokes.
  const [sigEditId, setSigEditId] = useState<string | null>(null)
  // Coarse pointer (touch) needs bigger Transformer anchors + a longer rotate
  // arm to be grabbable with a finger — the 9px desktop anchors are fiddly on
  // mobile. The handles themselves render on every device (the Transformer is
  // not viewport-gated); this only makes them finger-sized on touch.
  const coarsePointer = useCoarsePointer()

  // Abandon a half-finished separate-signature placement if the user switches
  // away from the signature tool before dropping every name/date piece.
  useEffect(() => {
    if (tool !== 'signature' && pendingExtras.length > 0) {
      useSignatureStore.getState().setPendingExtras([])
    }
  }, [tool, pendingExtras.length])

  const editingAnnotation = annotations.find(
    (a) => a.id === editingId && a.type === 'text'
  ) as TextAnnotation | undefined

  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef(new Map<string, Konva.Node>())
  // Imperative handle the rich-text editor publishes while mounted, so the
  // contextual pill can apply bold/italic/underline/link to the current text
  // selection (execCommand) instead of the whole annotation.
  const editorApiRef = useRef<{ format: (kind: 'bold' | 'italic' | 'underline' | 'link') => void } | null>(null)

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

  // The page in the annotation store's own units (PDF points). `width`/`height`
  // are display pixels at the current zoom, so dividing out the scale gives a
  // zoom-independent page size to measure placements against.
  const pageW = width / scale
  const pageH = height / scale

  // Abandon every gesture in flight on this page and put anything mid-drag back
  // where it started. A pinch is a zoom and only a zoom, so the drag / stroke /
  // rubber-band the first finger began is discarded rather than half-committed.
  // Also the right response to `pointercancel`, where the browser has taken the
  // pointer away from us and no pointerup is coming.
  function cancelGesture() {
    drawingRef.current = false
    pendingTapRef.current = null
    setCurrentLine(null)
    marqueeRef.current = null
    setMarquee(null)
    setLineDrag(null)
    groupDragLast.current = null
    // Tell the dragend handlers (Konva fires them from stopDrag, and line
    // anchors fire theirs whenever the finger finally lifts) to drop the move.
    gestureCancelled.current = true
    const annos = useAnnotationStore.getState().annotations
    for (const [id, node] of shapeRefs.current) {
      if (!node.isDragging()) continue
      node.stopDrag()
      const ann = annos.find((a) => a.id === id)
      if (ann) node.position(nodeHomePosition(ann))
    }
    // Members of a group drag are moved directly by onShapeDragMove, so they
    // are not "dragging" themselves and need putting back explicitly.
    for (const id of useAnnotationStore.getState().selectedIds) {
      const node = shapeRefs.current.get(id)
      const ann = annos.find((a) => a.id === id)
      if (node && ann) node.position(nodeHomePosition(ann))
    }
    // A resize/rotate already under way is stopped where it stands rather than
    // reverted — Konva's Transformer has no undo for a partial transform, and
    // the alternative (letting it keep tracking finger one while the zoom
    // changes underneath) is the dual action we're here to prevent.
    trRef.current?.stopTransform()
    trRef.current?.forceUpdate()
    trRef.current?.getLayer()?.batchDraw()
    setDraggingId(null)
  }

  // A pinch can begin with its second finger on a different page (each page has
  // its own Stage and pointer bookkeeping), so react to the viewer's flag too
  // rather than relying on this layer seeing both fingers.
  useEffect(() => {
    if (pinching) cancelGesture()
    // cancelGesture only touches refs + setState, so re-running solely on the
    // pinch edge is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinching])

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    activePointerIds.current.add(e.evt.pointerId)
    if (activePointerIds.current.size > 1 || pinching) {
      // Multi-touch (pinch-to-zoom) — abort any in-progress drawing stroke
      // or rubber-band selection. The local pointer count catches a pinch
      // that lands entirely on this page; `pinching` (set by the viewer's own
      // touch handler) also catches one straddling two pages, where each
      // layer only ever sees a single finger.
      cancelGesture()
      return
    }
    // A clean single-pointer gesture is starting — whatever a previous pinch
    // cancelled is behind us.
    gestureCancelled.current = false
    if (editingId) return // ignore stage events while typing
    if (tool === 'hand') return // pan handled by PdfViewer
    // Let Konva's Transformer own clicks on its anchors / rotate knob —
    // don't deselect the annotation and tear down the Transformer before
    // the resize / rotate gesture can begin.
    if (isTransformerTarget(e.target)) return
    // Likewise, let a line endpoint grabber run its own drag without the Stage
    // deselecting the line or starting a marquee underneath it.
    if (isLineAnchorTarget(e.target)) return
    // Mid-sequence placement: dropping the name/date for a "separate" signature.
    // Each click drops the next text piece exactly where clicked (hit-testing
    // skipped, so the user can target a form field directly).
    if (tool === 'signature' && pendingExtras.length > 0) {
      const p = getPos(e)
      pendingTapRef.current = { x: p.x, y: p.y, clientX: e.evt.clientX, clientY: e.evt.clientY }
      return
    }
    const stage = e.target.getStage()
    // If the click landed on an existing annotation, select it instead of
    // adding a new one — even when an annotation tool (tick/cross/etc.) is
    // active. Empty stage clicks fall through to the add/select logic below.
    if (e.target !== stage) {
      const hitId = getAnnotationIdFromTarget(e.target)
      if (hitId) {
        // A locked signature box (baked into an exported page) is click-to-sign
        // only: open the pad and don't select it, so no move/resize/delete
        // affordances appear and it can't be dragged off its baked outline.
        const hit = useAnnotationStore.getState().annotations.find((a) => a.id === hitId)
        if (hit?.type === 'sigfield' && hit.locked) {
          setSelected(null)
          useSignatureStore.getState().startSigningField(hitId)
          return
        }
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
    } else if (tool === 'rect' || tool === 'ellipse' || tool === 'redact' || tool === 'line' || tool === 'sigfield') {
      drawingRef.current = true
      setCurrentLine([pos.x, pos.y, pos.x, pos.y])
    } else {
      // Everything else is a one-shot placement. Arm it; onPointerUp decides.
      pendingTapRef.current = { x: pos.x, y: pos.y, clientX: e.evt.clientX, clientY: e.evt.clientY }
    }
  }

  // How far a finger may travel between down and up and still count as a tap,
  // in CSS pixels. 10 is the usual platform slop (iOS ~10pt, Android ~8dp) —
  // low enough that a deliberate swipe never places, high enough that the
  // wobble in a real tap on glass still does.
  const TAP_SLOP_PX = 10

  // Commit a one-shot placement at a point the user actually tapped.
  function commitTapPlacement(pos: { x: number; y: number }) {
    // Mid-sequence placement: dropping the name/date for a "separate"
    // signature. Each tap drops the next text piece exactly where tapped
    // (hit-testing skipped, so a form field can be targeted directly).
    if (tool === 'signature' && pendingExtras.length > 0) {
      const item = pendingExtras[0]
      add({
        id: crypto.randomUUID(),
        pageIndex,
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: item.text,
        color: item.color,
        fontSize: fontSize / scale,
        fontFamily
      })
      useSignatureStore.getState().consumePendingExtra()
      if (pendingExtras.length <= 1) useAnnotationStore.getState().setTool('select')
      return
    }
    if (tool === 'text') {
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
    } else if (tool === 'signature') {
      const sigState = useSignatureStore.getState()
      const active = sigState.signatures.find((x) => x.id === sigState.activeId)
      if (active) {
        const ratio = active.height / active.width
        // Capped at half the page — see fitPlacement. The ghost preview runs
        // the same numbers, so what you see under the cursor is what lands.
        const fit = fitPlacement(160 / scale, (160 / scale) * ratio, pageW, pageH)
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'image',
          x: pos.x - fit.width / 2,
          y: pos.y - fit.height / 2,
          width: fit.width,
          height: fit.height,
          src: active.dataUrl,
          // Carry the re-editable ink + options so the placed signature's
          // name/date can be changed (double-tap) / restyled (pill) later.
          sig: active.sig,
        })
        // If this signature carries separate name/date pieces, arm them for
        // click-placement instead of dropping straight into Select.
        const extras = active.extras
        const inkColor = extras?.color ?? SIGNATURE_INK
        const queue: { kind: 'name' | 'date'; text: string; color: string }[] = []
        if (extras?.name) queue.push({ kind: 'name', text: extras.name, color: inkColor })
        if (extras?.date) queue.push({ kind: 'date', text: formatSigningDate(), color: inkColor })
        if (queue.length > 0) {
          sigState.setPendingExtras(queue)
        } else {
          useAnnotationStore.getState().setTool('select')
        }
      }
    } else if (tool === 'image') {
      const { uploadedImageSrc: src, uploadedImageQr: qr } = useAnnotationStore.getState()
      if (src) {
        const img = new Image()
        img.onload = () => {
          const ratio = img.naturalHeight / img.naturalWidth
          const fit = fitPlacement(200 / scale, (200 / scale) * ratio, pageW, pageH)
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'image',
            x: pos.x - fit.width / 2,
            y: pos.y - fit.height / 2,
            width: fit.width,
            height: fit.height,
            src,
            // A generated QR carries the design it was drawn from, so the code
            // on the page can be edited (✏️ / double-tap) rather than only
            // deleted and re-made. Plain pictures have none and stay pictures.
            ...(qr ? { qr } : {})
          })
          useAnnotationStore.getState().setTool('select')
        }
        img.src = src
      }
    }
  }

  function onPointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (pinching) return
    const tap = pendingTapRef.current
    if (tap) {
      const dx = e.evt.clientX - tap.clientX
      const dy = e.evt.clientY - tap.clientY
      // Travelled too far to be a tap — this is a scroll or a drag. Disarm.
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) pendingTapRef.current = null
    }
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
      if (tool === 'line') {
        // Snap to horizontal / vertical / diagonal when rigid mode is on, or
        // while Shift is held as a one-off constraint.
        if (lineSnap || e.evt.shiftKey) {
          const { x, y } = snapLineEnd(prev[0], prev[1], pos.x, pos.y)
          return [prev[0], prev[1], x, y]
        }
        return [prev[0], prev[1], pos.x, pos.y]
      }
      if (tool === 'rect' || tool === 'ellipse' || tool === 'redact' || tool === 'sigfield') return [prev[0], prev[1], pos.x, pos.y]
      return [...prev, pos.x, pos.y]
    })
  }

  function onPointerLeaveStage() {
    setHoverPos(null)
    activePointerIds.current.clear()
    onPointerUp()
  }

  // The browser has taken this pointer over (it decided the touch was a scroll
  // or a pinch). No pointerup is coming, so drop the id here — otherwise it
  // sticks in the set and makes the next single-finger touch look like
  // multi-touch — and abandon whatever it had started.
  function onPointerCancel(e: Konva.KonvaEventObject<PointerEvent>) {
    activePointerIds.current.delete(e.evt.pointerId)
    setHoverPos(null)
    cancelGesture()
  }

  function onPointerUp(e?: Konva.KonvaEventObject<PointerEvent>) {
    if (e) activePointerIds.current.delete(e.evt.pointerId)
    // A one-shot placement armed on pointerdown and never disarmed by travel,
    // a pinch or a browser-owned scroll: the finger stayed put, so it was a tap.
    const tap = pendingTapRef.current
    pendingTapRef.current = null
    if (tap && !gestureCancelled.current) {
      commitTapPlacement({ x: tap.x, y: tap.y })
      return
    }
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
        (a) =>
          !isHighlighter(a) &&
          !(a.type === 'sigfield' && a.locked) &&
          rectsIntersect(getAnnotationBBox(a), box)
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
      } else if (tool === 'line') {
        // A straight line is stored as a two-point free-draw stroke, so it
        // reuses all of draw's rendering, selection, move and PDF-export paths.
        const [x1, y1, x2, y2] = currentLine
        if (Math.hypot(x2 - x1, y2 - y1) > 4) {
          add({
            id: crypto.randomUUID(),
            pageIndex,
            type: 'draw',
            shape: 'line',
            points: [x1, y1, x2, y2],
            color,
            strokeWidth: strokeWidth / scale
          })
        }
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
            height: h,
            fill: redactFill
          })
        }
      } else if (tool === 'sigfield') {
        const [x1, y1, x2, y2] = currentLine
        // Give a stray tap a sensible default-sized box so the field still
        // lands somewhere usable; a real drag uses the swept rectangle.
        const dragged = Math.abs(x2 - x1) > 8 && Math.abs(y2 - y1) > 8
        // A swept rectangle is explicit intent and kept as drawn; the tap
        // default is a display-pixel size, so cap it against the page the same
        // way a dropped signature is (see fitPlacement).
        const tapFit = fitPlacement(200 / scale, 70 / scale, pageW, pageH)
        const w = dragged ? Math.abs(x2 - x1) : tapFit.width
        const h = dragged ? Math.abs(y2 - y1) : tapFit.height
        const x = dragged ? Math.min(x1, x2) : x1 - w / 2
        const y = dragged ? Math.min(y1, y2) : y1 - h / 2
        const sig = useSignatureStore.getState()
        add({
          id: crypto.randomUUID(),
          pageIndex,
          type: 'sigfield',
          x,
          y,
          width: w,
          height: h,
          requireName: sig.requestName,
          requireDate: sig.requestDate,
          requireLive: sig.requestLive
        })
        // One box per arming — drop back to Select so it can be signed / moved.
        useAnnotationStore.getState().setTool('select')
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
    const ann = useAnnotationStore.getState().annotations.find((a) => a.id === id)
    // A locked box (baked into an exported page) is click-to-sign only — don't
    // select it, so no move/resize/delete affordances appear; just open the pad.
    if (ann?.type === 'sigfield' && ann.locked) {
      useSignatureStore.getState().startSigningField(id)
      return
    }
    setSelected(id)
    // An UNSIGNED signature-request box takes two clicks: the first selects it
    // (so it can be dragged into place and shows the "Click again to sign"
    // hint), the second opens the pad. A signed box just selects — its options
    // are edited by double-tapping (and it can be re-drawn from that editor), so
    // a stray second click can't accidentally reopen the pad and lose the ink.
    if (ann?.type === 'sigfield' && !ann.signed) {
      if (armedSigfieldRef.current === id) {
        armSigfield(null)
        useSignatureStore.getState().startSigningField(id)
      } else {
        armSigfield(id)
      }
    }
  }

  function onTextDblClick(a: TextAnnotation) {
    if (tool !== 'select') return
    setEditingId(a.id)
    setSelected(a.id)
  }

  // Double-tap a placed signature (or a signed request box) to edit its
  // name/date options. Selects it and opens the options editor. Never touches
  // the ink — only the labels are re-composed.
  //
  // A generated QR code is an image annotation too, so it would otherwise land
  // in the signature options editor, which has nothing to say about it. It gets
  // its own generator instead — the same one that drew it.
  function openSigEditor(id: string) {
    const ann = useAnnotationStore.getState().annotations.find((a) => a.id === id)
    if (ann?.type === 'image' && ann.qr) {
      openQrEditor(id, ann.qr)
      return
    }
    if (!isEditableSignature(ann)) return
    setSelected(id)
    setSigEditId(id)
  }

  /** Bring the QR generator back up on a code already on the page. */
  function openQrEditor(id: string, qr: QrPlacement) {
    setSelected(id)
    usePdfStore.getState().openQrEditor(id, qr)
  }

  // Re-compose a signature from new label options and write it back, keeping the
  // ink untouched. Images keep their on-page width and take the new aspect ratio
  // (so the ink stays put and labels grow downward); signed request boxes just
  // re-fit inside their fixed box.
  async function applySigData(id: string, next: SignatureData) {
    const cur = useAnnotationStore.getState().annotations.find((a) => a.id === id)
    if (!cur) return
    const composed = await composeSignature(next)
    if (cur.type === 'image') {
      const aspect = composed.height / composed.width
      update(id, {
        src: composed.dataUrl,
        height: cur.width * aspect,
        sig: next
      } as Partial<Annotation>)
    } else if (cur.type === 'sigfield') {
      update(id, {
        signed: {
          src: composed.dataUrl,
          width: composed.width,
          height: composed.height,
          data: next
        }
      } as Partial<Annotation>)
    }
  }

  function onShapeDragStart(a: Annotation) {
    gestureCancelled.current = false
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
    if (gestureCancelled.current) return
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

  // Resolve a line endpoint grabber's live position, applying 45° snapping
  // (relative to the fixed end) when rigid mode is on or Shift is held. Keeps
  // the dragged handle glued to the snapped point so it never drifts off the line.
  function resolveLineAnchor(
    a: DrawAnnotation,
    index: 0 | 1,
    e: Konva.KonvaEventObject<DragEvent>
  ): { x: number; y: number } {
    const node = e.target
    const otherIdx = index === 0 ? 1 : 0
    const ox = a.points[otherIdx * 2]
    const oy = a.points[otherIdx * 2 + 1]
    let x = node.x()
    let y = node.y()
    if (lineSnap || e.evt.shiftKey) {
      const snapped = snapLineEnd(ox, oy, x, y)
      x = snapped.x
      y = snapped.y
      node.position({ x, y })
    }
    return { x, y }
  }

  function onLineAnchorDragMove(a: DrawAnnotation, index: 0 | 1, e: Konva.KonvaEventObject<DragEvent>) {
    if (gestureCancelled.current) return
    const { x, y } = resolveLineAnchor(a, index, e)
    setLineDrag({ id: a.id, index, x, y })
  }

  function onLineAnchorDragEnd(a: DrawAnnotation, index: 0 | 1, e: Konva.KonvaEventObject<DragEvent>) {
    if (gestureCancelled.current) {
      // Cancelled by a pinch — the anchor's x/y props snap it back to the
      // line's untouched endpoint on the next render.
      gestureCancelled.current = false
      setLineDrag(null)
      return
    }
    const { x, y } = resolveLineAnchor(a, index, e)
    const points = [...a.points]
    points[index * 2] = x
    points[index * 2 + 1] = y
    setLineDrag(null)
    update(a.id, { points } as Partial<Annotation>)
  }

  function onShapeDragEnd(a: Annotation, e: Konva.KonvaEventObject<DragEvent>) {
    setDraggingId(null)
    if (gestureCancelled.current) {
      // A pinch (or a browser pointercancel) took this gesture over.
      // cancelGesture already put the nodes back; commit nothing.
      gestureCancelled.current = false
      groupDragLast.current = null
      return
    }
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
    if (a.type === 'sigfield') {
      // Rendered as a Konva Group (no intrinsic width/height), so derive the new
      // size from the stored box times the live scale.
      const width = Math.max(24, a.width * sx)
      const height = Math.max(16, a.height * sy)
      node.scaleX(1)
      node.scaleY(1)
      return { x: node.x(), y: node.y(), width, height } as Partial<Annotation>
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
    if (a.type === 'sigfield') {
      // Group node — size comes from the stored box scaled by the transform.
      const newWidth = Math.max(24, a.width * node.scaleX())
      const newHeight = Math.max(16, a.height * node.scaleY())
      node.scaleX(1)
      node.scaleY(1)
      update(a.id, {
        x: node.x(),
        y: node.y(),
        width: newWidth,
        height: newHeight
      } as Partial<Annotation>)
    } else if (a.type === 'image' || a.type === 'rect' || a.type === 'redact') {
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

  function commitEdit(runs: TextRun[]) {
    if (!editingAnnotation) return
    const plain = runsToPlainText(runs)
    if (!plain.trim()) {
      remove(editingAnnotation.id)
    } else {
      // Uniform, unstyled text collapses back to a plain `text` (no runs) to
      // keep the model minimal; anything styled stores the runs. Either way the
      // whole-annotation style flags are cleared — the runs (or their absence)
      // are now authoritative, so a stale flag can't double-apply.
      const styled = runs.length > 1 || (runs[0] && runHasStyle(runs[0]))
      update(editingAnnotation.id, {
        text: plain,
        runs: styled ? runs : undefined,
        bold: undefined,
        italic: undefined,
        underline: undefined,
        link: undefined
      } as Partial<Annotation>)
    }
    setEditingId(null)
  }

  // Dragging is off while a pinch is running, so a second finger can never
  // turn a zoom into a zoom-plus-drag.
  const selectable = tool === 'select' && !pinching
  const cursor =
    tool === 'hand' ? 'grab' :
    tool === 'marquee' ? 'crosshair' :
    // 'selecttext' is handled by the TextSelectLayer on top (cursor: text); this
    // is just the fallback for the Stage underneath.
    tool === 'selecttext' ? 'text' :
    (tool === 'select' || tool === 'form') ? 'default' :
    tool === 'signature' && activeSignature ? 'none' :
    'crosshair'
  // The marquee tool reserves drags for the selection box, so the page must
  // not scroll under the gesture (touchAction: none). Select/hand/form and the
  // passive selecttext tool keep vertical panning + pinch-zoom available.
  //
  // ⚠️ The one-shot placement tools (text/tick/cross/signature/image) belong on
  // the panning side too. They need a TAP, not a drag, so reserving the gesture
  // bought nothing and cost everything: with Text active the page could not be
  // scrolled at all, and the swipe that tried left a stray text box behind.
  // Only the tools that genuinely draw through a drag keep 'none'.
  const dragDrawTool =
    tool === 'draw' || tool === 'highlight' || tool === 'rect' || tool === 'ellipse' ||
    tool === 'redact' || tool === 'line' || tool === 'sigfield' || tool === 'marquee'
  const touchAction = dragDrawTool ? 'none' : 'pan-y pinch-zoom'

  // Mirrors the drop sizing above (cap included) so the ghost under the cursor
  // is exactly what gets placed.
  const ghostSig = activeSignature
    ? fitPlacement(
        160 / scale,
        ((160 / scale) * activeSignature.height) / activeSignature.width,
        pageW,
        pageH
      )
    : { width: 0, height: 0 }
  const ghostSigWidth = ghostSig.width
  const ghostSigHeight = ghostSig.height

  return (
    <>
      <Stage
        ref={stageRef}
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
        onPointerCancel={onPointerCancel}
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
              case 'draw': {
                // Mid-drag, render the line through the grabber's live endpoint
                // so it tracks the handle before the move is committed.
                const points =
                  lineDrag && lineDrag.id === a.id
                    ? a.points.map((v, i) =>
                        i === lineDrag.index * 2
                          ? lineDrag.x
                          : i === lineDrag.index * 2 + 1
                            ? lineDrag.y
                            : v
                      )
                    : a.points
                return (
                  <Line
                    key={a.id}
                    {...common}
                    x={0}
                    y={0}
                    points={points}
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    opacity={a.opacity ?? 1}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.4}
                    hitStrokeWidth={Math.max(20, a.strokeWidth + 14)}
                  />
                )
              }
              case 'text': {
                // Rendered as a Group of per-run Text nodes laid out along one
                // line (measured widths give each run's x offset), so bold /
                // italic / underline / link can vary within the text. Events
                // bubble from the child Texts up to the Group's shared handlers.
                const cssFamily = FONT_STACK[a.fontFamily ?? 'sans']
                const runs = effectiveRuns(a)
                let offset = 0
                return (
                  <Group
                    key={a.id}
                    {...common}
                    x={a.x}
                    y={a.y}
                    rotation={a.rotation ?? 0}
                    visible={a.id !== editingId}
                    onDblClick={() => onTextDblClick(a)}
                    onDblTap={() => onTextDblClick(a)}
                  >
                    {runs.map((run, i) => {
                      const rx = offset
                      offset += runWidth(run, a.fontSize, cssFamily)
                      return (
                        <Text
                          key={i}
                          x={rx}
                          y={0}
                          text={run.text}
                          fill={a.color}
                          fontSize={a.fontSize}
                          fontFamily={cssFamily}
                          fontStyle={runFontStyle(run)}
                          textDecoration={run.underline || run.link ? 'underline' : ''}
                        />
                      )
                    })}
                  </Group>
                )
              }
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
                    fill={a.fill === 'white' ? '#ffffff' : '#000000'}
                    // A white redaction blanks a white page, so without a hint it
                    // would be invisible in the editor — outline it (the border is
                    // editor-only; export bakes a clean fill).
                    stroke={a.fill === 'white' ? '#94a3b8' : undefined}
                    strokeWidth={a.fill === 'white' ? 1 : 0}
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
                    onDblClick={() => openSigEditor(a.id)}
                    onDragStart={() => onShapeDragStart(a)}
                    onDragMove={(e) => onShapeDragMove(a, e)}
                    onDragEnd={(e) => onShapeDragEnd(a, e)}
                    onTransformEnd={(e) => onShapeTransformEnd(a, e)}
                  />
                )
              case 'sigfield':
                return (
                  <SigField
                    key={a.id}
                    a={a}
                    scale={scale}
                    common={common}
                    armed={armedSigfieldId === a.id}
                    onDblClick={() => openSigEditor(a.id)}
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
          {currentLine && tool === 'line' && (
            <Line
              listening={false}
              points={currentLine}
              stroke={color}
              strokeWidth={strokeWidth}
              lineCap="round"
              lineJoin="round"
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
                fill={redactFill === 'white' ? '#ffffff' : '#000000'}
                stroke={redactFill === 'white' ? '#94a3b8' : undefined}
                strokeWidth={redactFill === 'white' ? 1 : 0}
                opacity={0.7}
              />
            )
          })()}

          {currentLine && tool === 'sigfield' && (() => {
            const [x1, y1, x2, y2] = currentLine
            return (
              <Rect
                listening={false}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                fill="rgba(234,88,12,0.06)"
                stroke="#ea580c"
                strokeWidth={1.5}
                dash={[6, 4]}
              />
            )
          })()}

          {tool === 'signature' && activeSignature && hoverPos && pendingExtras.length === 0 && (
            <SignatureGhost
              src={activeSignature.dataUrl}
              x={hoverPos.x - ghostSigWidth / 2}
              y={hoverPos.y - ghostSigHeight / 2}
              width={ghostSigWidth}
              height={ghostSigHeight}
            />
          )}

          {/* While placing separate name/date pieces, preview the next piece's
              text at the cursor so the user knows what they're dropping. */}
          {tool === 'signature' && pendingExtras.length > 0 && hoverPos && (
            <Text
              listening={false}
              x={hoverPos.x}
              y={hoverPos.y}
              text={pendingExtras[0].text}
              fontSize={fontSize / scale}
              fontFamily={FONT_STACK.sans}
              fill={pendingExtras[0].color}
              opacity={0.65}
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
            // Redactions and signature-request boxes are baked axis-aligned on
            // export, so a rotate handle would silently do nothing.
            const nonRotatable = (a: Annotation) => a.type === 'redact' || a.type === 'sigfield'
            const rotatable = isMulti
              ? !selectedOnPage.some(nonRotatable)
              : single
                ? !nonRotatable(single)
                : true
            return (
              <Transformer
                ref={trRef}
                onTransformEnd={onGroupTransformEnd}
                // Both handles go dead during a pinch, so a second finger
                // can't turn a zoom into a zoom-plus-resize.
                rotateEnabled={rotatable && !pinching}
                resizeEnabled={resizable && !pinching}
                keepRatio={!isMulti && single?.type === 'image'}
                // Bigger rotate arm + anchors on touch so they clear the finger
                // and are easy to grab; desktop keeps the compact sizing.
                rotateAnchorOffset={coarsePointer ? 40 : 28}
                enabledAnchors={resizable && !pinching ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
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
            // (Konva's Transformer covers every other type). Lines use endpoint
            // grabbers instead, so they skip the halo. Skip while the user is
            // moving the shape so the box doesn't lag behind.
            if (!selected || selected.type !== 'draw' || isLine(selected) || editingId) return null
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

          {(() => {
            // Endpoint grabbers for a selected line — the same white-square
            // anchors Konva's Transformer puts on a box, but one per line end so
            // each can be repositioned independently. Sizes are divided by scale
            // to stay a constant on-screen size at any zoom.
            const selected = annotations.find((a) => a.id === selectedId)
            if (!selected || selected.type !== 'draw' || !isLine(selected) || editingId) return null
            if (draggingId === selected.id) return null
            const live =
              lineDrag && lineDrag.id === selected.id
                ? selected.points.map((v, i) =>
                    i === lineDrag.index * 2
                      ? lineDrag.x
                      : i === lineDrag.index * 2 + 1
                        ? lineDrag.y
                        : v
                  )
                : selected.points
            const size = (coarsePointer ? 18 : 11) / scale
            const indices: (0 | 1)[] = [0, 1]
            return (
              <>
                {indices.map((index) => (
                  <Rect
                    key={index}
                    name="lineAnchor"
                    x={live[index * 2]}
                    y={live[index * 2 + 1]}
                    offsetX={size / 2}
                    offsetY={size / 2}
                    width={size}
                    height={size}
                    cornerRadius={2 / scale}
                    fill="#ffffff"
                    stroke="#ea580c"
                    strokeWidth={1.5 / scale}
                    draggable
                    hitStrokeWidth={(coarsePointer ? 12 : 8) / scale}
                    onDragMove={(e) => onLineAnchorDragMove(selected, index, e)}
                    onDragEnd={(e) => onLineAnchorDragEnd(selected, index, e)}
                  />
                ))}
              </>
            )
          })()}
        </Layer>
      </Stage>

      {editingAnnotation && (
        <TextEditor
          key={editingAnnotation.id}
          annotation={editingAnnotation}
          scale={scale}
          apiRef={editorApiRef}
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
        //
        // While a placement tool is still armed, a Confirm affordance sits
        // beside it. Placing (say) a cross leaves the tool armed so the next
        // click drops another one — which is what you want when ticking a run of
        // boxes — and this gives the object three outcomes without a trip to the
        // toolbar: confirm it and drop back to Select, bin it, or just click
        // elsewhere on the page to place the next one.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected) return null
        // Locked (baked) request boxes can't be deleted — their outline lives in
        // the page. They shouldn't get selected anyway, but guard here too.
        if (selected.type === 'sigfield' && selected.locked) return null
        const bbox = getAnnotationBBox(selected)
        const left = (bbox.x + bbox.width) * scale + 8
        const top = bbox.y * scale - 8
        // Delete and Confirm run rightwards off the top-right corner; the QR
        // Edit button stacks BENEATH Delete instead of extending that row, so a
        // code sitting against the right margin of a narrow screen doesn't push
        // it out past the page.
        const placedQr = selected.type === 'image' ? selected.qr : undefined
        return (
          <>
            <button
              type="button"
              title="Delete"
              aria-label="Delete selected object"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); remove(selected.id) }}
              style={{ position: 'absolute', left, top, zIndex: 21 }}
              className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M6 7l1 13h10l1-13" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
            {PLACEMENT_TOOLS.has(tool) && (
              <button
                type="button"
                title="Done — keep this and go back to Select"
                aria-label="Confirm placement and switch to the Select tool"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setSelected(null); setTool('select') }}
                style={{ position: 'absolute', left: left + 36, top, zIndex: 21 }}
                className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-emerald-600 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
            {placedQr && (
              // Edit ✏️ — reopens the generator on THIS code, so the link, the
              // style or the branding can be changed after placing it. Only on
              // codes generated in-app: a picture of a QR has no design behind
              // it to bring back up. (Double-tapping the code does the same.)
              <button
                type="button"
                title="Edit this QR code — link, style or branding"
                aria-label="Edit this QR code"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); openQrEditor(selected.id, placedQr) }}
                style={{ position: 'absolute', left, top: top + 36, zIndex: 21 }}
                className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-orange-700 hover:bg-orange-700 hover:text-white hover:border-orange-700 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4l10-10a2.83 2.83 0 0 0-4-4L4 16v4z" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
            )}
          </>
        )
      })()}

      {(() => {
        // Contextual text pill floated just beneath the selected text box:
        // size stepper + bold / italic / underline / link. Placement prefers
        // below the text, flips above when there's no room (text near the page
        // bottom), and clamps horizontally so it never runs off the page —
        // "below" also keeps it clear of the delete affordance at the top-right
        // corner. Shown on every device (touch + mouse); the mobile Toolbar no
        // longer draws its own bottom size-pill so the two never both appear.
        // Stays up during editing too, so size / bold / italic / underline /
        // link can be toggled live while typing.
        if (draggingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected || selected.type !== 'text') return null
        const t = selected
        const bbox = getAnnotationBBox(selected)
        const bx = bbox.x * scale
        const by = bbox.y * scale
        const bw = bbox.width * scale
        const bh = bbox.height * scale
        const CHIP_W = 292
        const CHIP_H = 44
        const GAP = 10
        const left = Math.min(
          Math.max(bx + bw / 2 - CHIP_W / 2, GAP),
          Math.max(GAP, width - CHIP_W - GAP)
        )
        let top: number
        if (by + bh + GAP + CHIP_H <= height) {
          top = by + bh + GAP // below (preferred)
        } else if (by - CHIP_H - GAP >= 0) {
          top = by - CHIP_H - GAP // above (text near the page bottom)
        } else {
          top = Math.min(Math.max(by + bh + GAP, GAP), Math.max(GAP, height - CHIP_H - GAP))
        }
        const styleBtn = (
          active: boolean,
          onClick: () => void,
          label: string,
          title: string,
          extra: string
        ) => (
          <button
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            className={`w-8 h-8 rounded-full leading-none text-base flex items-center justify-center transition-colors ${extra} ${
              active ? 'bg-orange-700 text-white' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            {label}
          </button>
        )
        // Style buttons apply to the highlighted range while editing (via the
        // editor's execCommand handle) and to the whole text otherwise.
        const editingThis = editingId === t.id
        const runs = effectiveRuns(t)
        const allHave = (k: 'bold' | 'italic' | 'underline') => runs.length > 0 && runs.every((r) => r[k])
        const anyLink = runs.some((r) => r.link)
        // Commit a fresh run set to the whole annotation (collapsing to plain
        // text when nothing is styled), matching commitEdit's normalisation.
        const writeRuns = (rs: TextRun[]) => {
          const merged = mergeRuns(rs)
          const styled = merged.length > 1 || (merged[0] && runHasStyle(merged[0]))
          update(t.id, {
            text: runsToPlainText(merged),
            runs: styled ? merged : undefined,
            bold: undefined,
            italic: undefined,
            underline: undefined,
            link: undefined
          } as Partial<Annotation>)
        }
        const applyWhole = (kind: 'bold' | 'italic' | 'underline' | 'link') => {
          if (kind === 'link') {
            const cur = runs.find((r) => r.link)?.link ?? ''
            const next = window.prompt('Link URL (leave blank to remove):', cur || 'https://')
            if (next === null) return
            const url = next.trim()
            writeRuns(runs.map((r) => ({ ...r, link: url ? url : undefined })))
            return
          }
          const on = !allHave(kind)
          writeRuns(runs.map((r) => ({ ...r, [kind]: on })))
        }
        const applyStyle = (kind: 'bold' | 'italic' | 'underline' | 'link') => {
          if (editingThis && editorApiRef.current) editorApiRef.current.format(kind)
          else applyWhole(kind)
        }
        return (
          <div
            // preventDefault keeps focus on the text input while editing, so
            // tapping a pill button (size / B / I / U / link) styles the text
            // live instead of blurring and committing the edit.
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left, top, zIndex: 21 }}
            className="inline-flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-slate-300 px-1 py-1"
          >
            <button
              type="button"
              aria-label="Decrease text size"
              onClick={(e) => { e.stopPropagation(); setFontSize(Math.max(8, fontSize - 2)) }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700 leading-none"
            >
              −
            </button>
            <FontSizeField value={fontSize} min={8} max={144} onCommit={setFontSize} />
            <button
              type="button"
              aria-label="Increase text size"
              onClick={(e) => { e.stopPropagation(); setFontSize(Math.min(144, fontSize + 2)) }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700 leading-none"
            >
              +
            </button>
            <span className="w-px h-6 bg-slate-200 mx-0.5" />
            {styleBtn(allHave('bold'), () => applyStyle('bold'), 'B', 'Bold', 'font-bold')}
            {styleBtn(allHave('italic'), () => applyStyle('italic'), 'I', 'Italic', 'italic font-semibold')}
            {styleBtn(allHave('underline'), () => applyStyle('underline'), 'U', 'Underline', 'underline font-semibold')}
            {styleBtn(anyLink, () => applyStyle('link'), '🔗', editingThis ? 'Link selected text' : (anyLink ? 'Edit link' : 'Add link'), 'text-sm')}
          </div>
        )
      })()}

      {(() => {
        // Contextual stroke + snap controls for a selected line, floated next to
        // the line itself rather than buried in the toolbar menu. Stroke reuses
        // the store action (updates this line + the default for the next one);
        // toggling Snap on also re-snaps this line's far end to the nearest 45°.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected || selected.type !== 'draw' || !isLine(selected)) return null
        const bbox = getAnnotationBBox(selected)
        const toggleSnap = () => {
          const next = !lineSnap
          setLineSnap(next)
          if (next) {
            const [x1, y1, x2, y2] = selected.points
            const s = snapLineEnd(x1, y1, x2, y2)
            update(selected.id, { points: [x1, y1, s.x, s.y] } as Partial<Annotation>)
          }
        }
        return (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: bbox.x * scale,
              top: (bbox.y + bbox.height) * scale + 10,
              zIndex: 21
            }}
            className="inline-flex items-center gap-2 bg-white rounded-full shadow-lg border border-slate-300 px-3 py-1.5 whitespace-nowrap"
          >
            <span className="text-xs text-slate-500 font-medium">Stroke</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-slate-600 tabular-nums w-10 text-right">{strokeWidth.toFixed(1)}px</span>
            <span className="w-px h-5 bg-slate-200" />
            <button
              type="button"
              onClick={toggleSnap}
              title="Rigid line — snap to horizontal, vertical or diagonal (hold Shift while dragging an end for a one-off snap)"
              className={`px-2.5 h-7 rounded-full text-xs font-medium transition-colors ${
                lineSnap ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Snap {lineSnap ? 'On' : 'Off'}
            </button>
          </div>
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
        // Send-to-sign affordance on a selected "Sign here" box. Placing the
        // boxes and emailing the document for signing are two halves of one
        // job, and the dialog refuses to mint a link until at least one box
        // exists — so the moment a box is on the page is exactly the moment to
        // offer the next step, rather than sending the user back to
        // the Sign icon → Request → Send to sign. Sits under the Delete affordance,
        // where a box/ellipse would carry its Fill toggle.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected || selected.type !== 'sigfield') return null
        if (selected.locked) return null
        const bbox = getAnnotationBBox(selected)
        return (
          <button
            type="button"
            title="Send to sign — email this document as a signature request"
            aria-label="Send to sign"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); usePdfStore.getState().setSendToSignOpen(true) }}
            style={{
              position: 'absolute',
              left: (bbox.x + bbox.width) * scale + 8,
              top: bbox.y * scale - 8 + 36,
              zIndex: 20
            }}
            className="h-8 px-2 rounded-full bg-white shadow-lg border border-slate-300 hover:border-orange-500 hover:bg-orange-50 flex items-center justify-center gap-0.5 text-sm leading-none whitespace-nowrap"
          >
            <span aria-hidden="true">✉️</span>
            <span aria-hidden="true">✍️</span>
          </button>
        )
      })()}

      {(() => {
        // Fill toggle follows the same visibility as the Delete affordance: any
        // single rect/ellipse selection (not while dragging or editing text),
        // regardless of the active tool. A box is auto-selected the moment it's
        // drawn while the 'rect' tool is still active, so gating on
        // tool==='select' hid the Fill button until the user re-clicked it.
        if (draggingId || editingId) return null
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
              // Clearing a fill is harmless. Turning one on hides content only
              // visually, so warn (once) that the text is still machine-readable
              // and offer a real redaction instead.
              if (filled || fillWarningDismissed()) {
                update(selected.id, { filled: !filled } as Partial<Annotation>)
              } else {
                setFillWarnDontShow(false)
                setFillWarnId(selected.id)
              }
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

      {(() => {
        // Redact toggle — sits directly under the Fill pill on a selected
        // box/ellipse. Where Fill only paints over the page, this swaps the
        // shape for a true redaction: a black box whose underlying text is
        // permanently removed when the document is exported. Nothing is
        // destroyed yet (the swap is undoable) — export is the point of no
        // return — so this button stays frictionless and the confirmation
        // lives in the export dialog instead.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected || (selected.type !== 'rect' && selected.type !== 'ellipse')) return null
        const bbox = getAnnotationBBox(selected)
        return (
          <button
            type="button"
            title="Redact — blacks out the area and permanently removes the text on export"
            aria-label="Redact this area"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const id = crypto.randomUUID()
              remove(selected.id)
              add({
                id,
                pageIndex: selected.pageIndex,
                type: 'redact',
                x: selected.x,
                y: selected.y,
                width: selected.width,
                height: selected.height
              })
              setSelected(id)
            }}
            style={{
              position: 'absolute',
              left: (bbox.x + bbox.width) * scale + 8,
              top: bbox.y * scale - 8 + 72,
              zIndex: 20
            }}
            className="w-8 h-8 rounded-full bg-white shadow-lg border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 flex items-center justify-center transition-colors"
          >
            <RedactIcon size={16} />
          </button>
        )
      })()}

      {fillWarnId && (() => {
        const target = annotations.find((a) => a.id === fillWarnId)
        if (!target || (target.type !== 'rect' && target.type !== 'ellipse')) {
          // Selection changed out from under us — drop the prompt.
          return null
        }
        const close = () => setFillWarnId(null)
        const applyDontShow = () => {
          if (fillWarnDontShow) dismissFillWarning()
        }
        const fillAnyway = () => {
          applyDontShow()
          update(target.id, { filled: true } as Partial<Annotation>)
          close()
        }
        const redactInstead = () => {
          applyDontShow()
          // Swap the shape for a true redaction over the same box: on export the
          // page is rasterised so the underlying text is permanently removed.
          remove(target.id)
          add({
            id: crypto.randomUUID(),
            pageIndex: target.pageIndex,
            type: 'redact',
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height
          })
          close()
        }
        return createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            onMouseDown={close}
          >
            <div
              className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none" aria-hidden="true">⚠️</span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Filling won't hide the text</h2>
                    <p className="mt-1.5 text-sm text-slate-600">
                      A filled box only paints over the page. The text underneath
                      stays selectable and readable by a computer. To remove it
                      for good, redact instead.
                    </p>
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-2 text-xs text-slate-500 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fillWarnDontShow}
                    onChange={(e) => setFillWarnDontShow(e.target.checked)}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  Don't show this again
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={fillAnyway}
                  className="px-3 h-9 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Fill anyway
                </button>
                <button
                  type="button"
                  onClick={redactInstead}
                  className="px-3 h-9 rounded-md text-sm font-medium text-white bg-orange-700 hover:bg-orange-800"
                >
                  Redact instead
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}

      {(() => {
        // Size + alignment pill for a selected signature — only when it's
        // showing name/date labels (nothing to style otherwise). The size
        // stepper scales the labels and the alignment icon cycles
        // left → centre → right; both re-compose from the untouched ink.
        if (draggingId || editingId) return null
        const selected = annotations.find((a) => a.id === selectedId)
        if (!selected) return null
        const data = sigDataOf(selected)
        if (!data || !sigHasLabels(data)) return null
        const bbox = getAnnotationBBox(selected)
        const bx = bbox.x * scale
        const by = bbox.y * scale
        const bw = bbox.width * scale
        const bh = bbox.height * scale
        const CHIP_W = 210
        const CHIP_H = 44
        const GAP = 10
        const left = Math.min(
          Math.max(bx + bw / 2 - CHIP_W / 2, GAP),
          Math.max(GAP, width - CHIP_W - GAP)
        )
        let top: number
        if (by + bh + GAP + CHIP_H <= height) top = by + bh + GAP
        else if (by - CHIP_H - GAP >= 0) top = by - CHIP_H - GAP
        else top = Math.min(Math.max(by + bh + GAP, GAP), Math.max(GAP, height - CHIP_H - GAP))
        const labelScale = data.labelScale ?? DEFAULT_LABEL_SCALE
        const align: SigAlign = data.align ?? 'center'
        const setScale = (v: number) =>
          applySigData(selected.id, { ...data, labelScale: Math.min(2.5, Math.max(0.5, Math.round(v * 100) / 100)) })
        const cycleAlign = () => {
          const order: SigAlign[] = ['left', 'center', 'right']
          const next = order[(order.indexOf(align) + 1) % order.length]
          applySigData(selected.id, { ...data, align: next })
        }
        // Justify three little rules per the current alignment.
        const rowW = [15, 9, 15]
        const alignLabel = align === 'left' ? 'left' : align === 'right' ? 'right' : 'centre'
        return (
          <div
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left, top, zIndex: 21 }}
            className="inline-flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-slate-300 px-1 py-1"
          >
            <span className="px-1.5 text-xs font-medium text-slate-500 select-none">Size</span>
            <button
              type="button"
              aria-label="Smaller labels"
              onClick={(e) => { e.stopPropagation(); setScale(labelScale - 0.15) }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700 leading-none"
            >
              −
            </button>
            <span className="w-9 text-center text-xs tabular-nums text-slate-600 select-none">
              {Math.round(labelScale * 100)}%
            </span>
            <button
              type="button"
              aria-label="Bigger labels"
              onClick={(e) => { e.stopPropagation(); setScale(labelScale + 0.15) }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700 leading-none"
            >
              +
            </button>
            <span className="w-px h-6 bg-slate-200 mx-0.5" />
            <button
              type="button"
              title={`Align labels: ${alignLabel} (click to cycle)`}
              aria-label={`Align labels ${alignLabel}, click to change`}
              onClick={(e) => { e.stopPropagation(); cycleAlign() }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-700 flex items-center justify-center"
            >
              <svg viewBox="0 0 20 14" width="18" height="14" aria-hidden="true">
                {rowW.map((w, i) => {
                  const y = 2.5 + i * 4.5
                  const x = align === 'left' ? 2.5 : align === 'right' ? 17.5 - w : (20 - w) / 2
                  return <rect key={i} x={x} y={y} width={w} height={2} rx={1} fill="currentColor" />
                })}
              </svg>
            </button>
          </div>
        )
      })()}

      {sigEditId && (() => {
        // Options editor — opened by double-tapping a placed signature. Changes
        // name / date / (via the pill) size + alignment only; the ink is never
        // redrawn, just re-composited beneath the labels.
        const target = annotations.find((a) => a.id === sigEditId)
        if (!target) return null
        let data: SignatureData | null = null
        if (target.type === 'image') data = ensureImageSigData(target)
        else if (target.type === 'sigfield' && target.signed?.data) data = target.signed.data
        if (!data) return null
        return (
          <SignatureOptionsModal
            data={data}
            onApply={(next) => { void applySigData(sigEditId, next) }}
            onRedraw={
              target.type === 'sigfield'
                ? () => { setSigEditId(null); useSignatureStore.getState().startSigningField(sigEditId) }
                : undefined
            }
            onClose={() => setSigEditId(null)}
          />
        )
      })()}
    </>
  )
}

// Wording in front of one label line, with a one-tap suggestion. Disabled while
// its line is hidden, so it can never be typed into with no visible effect.
function ModalPrefixField({
  value,
  onChange,
  enabled,
  placeholder,
  suggestion,
  label
}: {
  value: string
  onChange: (v: string) => void
  enabled: boolean
  placeholder: string
  suggestion: string
  label: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        disabled={!enabled}
        className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      {value.trim() === '' && (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className="shrink-0 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
        >
          {suggestion}
        </button>
      )}
    </div>
  )
}

// Double-tap options editor for a placed signature. Edits name / add-name /
// add-date, plus the realistic-ink look when the signature was drawn in-app —
// size + alignment live on the on-canvas pill. Holds its own draft state so
// typing stays smooth while each change re-composes the image from the ink.
function SignatureOptionsModal({
  data,
  onApply,
  onRedraw,
  onClose
}: {
  data: SignatureData
  onApply: (next: SignatureData) => void
  onRedraw?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(data.name ?? '')
  const [showName, setShowName] = useState(!!data.showName)
  const [showDate, setShowDate] = useState(!!data.showDate)
  const [details, setDetails] = useState(data.details ?? '')
  const [namePrefix, setNamePrefix] = useState(data.namePrefix ?? '')
  const [datePrefix, setDatePrefix] = useState(data.datePrefix ?? '')
  const [realistic, setRealistic] = useState(!!data.realistic)
  // Latest base payload (ink + size/alignment) — re-read on every apply so the
  // pill's size/alignment edits aren't clobbered by a name/date change.
  const dataRef = useRef(data)
  dataRef.current = data

  // The realism toggle is only offered for signatures drawn in-app, where the
  // pen strokes were kept alongside the ink. An imported picture is just
  // pixels — there is nothing to re-render, so the option stays hidden rather
  // than pretending to do something.
  const strokes = data.strokes
  const canRestyle = !!strokes && strokes.length > 0

  // Every applier sends the whole label set, so changing one field never drops
  // another that is only held in this draft state.
  const apply = (patch: Partial<SignatureData>) =>
    onApply({
      ...dataRef.current,
      name,
      showName,
      showDate,
      details,
      showDetails: !!details.trim(),
      namePrefix: namePrefix.trim() || undefined,
      datePrefix: datePrefix.trim() || undefined,
      ...patch
    })

  const changeName = (v: string) => {
    setName(v)
    apply({ name: v, showName: showName || !!v })
    if (v && !showName) setShowName(true)
  }
  const toggleName = (v: boolean) => {
    setShowName(v)
    apply({ showName: v })
  }
  const toggleDate = (v: boolean) => {
    setShowDate(v)
    apply({ showDate: v })
  }
  // No toggle of its own: typing details is the decision to show them, and
  // emptying the box is the decision to take them away.
  const changeDetails = (v: string) => {
    setDetails(v)
    apply({ details: v, showDetails: !!v.trim() })
  }
  const changeNamePrefix = (v: string) => {
    setNamePrefix(v)
    apply({ namePrefix: v.trim() || undefined })
  }
  const changeDatePrefix = (v: string) => {
    setDatePrefix(v)
    apply({ datePrefix: v.trim() || undefined })
  }
  // Re-render the ink from the original strokes at the new realism setting and
  // swap it in — the labels are then re-composited over it by applySigData.
  // The ink colour follows the toggle exactly as it does in the pad, and the
  // labels pick up the same colour so the two never drift apart.
  const toggleRealistic = (v: boolean) => {
    if (!strokes) return
    const color = inkColorFor(v)
    const ink = renderInkSignature(strokes, color, v)
    if (!ink) return
    setRealistic(v)
    onApply({
      ...dataRef.current,
      ink: ink.dataUrl,
      inkWidth: ink.width,
      inkHeight: ink.height,
      color,
      realistic: v
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-slate-900">Signature options</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <p className="text-xs text-slate-500">
            {canRestyle
              ? 'Changes the labels and the pen style — the strokes you drew stay exactly as drawn. Use the pill on the signature to resize or align the labels.'
              : 'Changes the name and date only — your signature itself stays exactly as drawn. Use the pill on the signature to resize or align the labels.'}
          </p>
          <input
            value={name}
            onChange={(e) => changeName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <textarea
            value={details}
            onChange={(e) => changeDetails(e.target.value)}
            rows={2}
            placeholder="Add your role, email address, etc. (optional)"
            aria-label="Details to show under the signature"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <label className="flex items-center justify-between gap-2 text-sm text-slate-700 select-none cursor-pointer">
            <span>Add name</span>
            <input
              type="checkbox"
              checked={showName}
              onChange={(e) => toggleName(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative w-9 h-5 rounded-full bg-slate-300 transition-colors peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
          </label>
          <ModalPrefixField
            value={namePrefix}
            onChange={changeNamePrefix}
            enabled={showName}
            placeholder="Wording before the name (optional)"
            suggestion="Signed by:"
            label="Wording before the name"
          />
          <label className="flex items-center justify-between gap-2 text-sm text-slate-700 select-none cursor-pointer">
            <span>Add date (today)</span>
            <input
              type="checkbox"
              checked={showDate}
              onChange={(e) => toggleDate(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative w-9 h-5 rounded-full bg-slate-300 transition-colors peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
          </label>
          <ModalPrefixField
            value={datePrefix}
            onChange={changeDatePrefix}
            enabled={showDate}
            placeholder="Wording before the date (optional)"
            suggestion="Signed on"
            label="Wording before the date"
          />
          {canRestyle && (
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700 select-none cursor-pointer border-t border-slate-100 pt-3">
              <span>
                Make it look more realistic
                <span className="block text-xs text-slate-400 font-normal">
                  Blue ink, uneven pressure and a hand wobble
                </span>
              </span>
              <input
                type="checkbox"
                checked={realistic}
                onChange={(e) => toggleRealistic(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-9 h-5 rounded-full bg-slate-300 transition-colors peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          {onRedraw ? (
            <button
              type="button"
              onClick={onRedraw}
              className="px-3 h-9 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Redraw signature…
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-md text-sm font-medium text-white bg-orange-700 hover:bg-orange-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Editable size readout for the text pill: shows the current size and lets the
// user type an exact value (Enter / blur commits, Escape reverts). Kept as its
// own component so it can hold the in-progress draft in state — the pill body is
// rendered inside an IIFE where hooks can't live. `onMouseDown` stops
// propagation so the pill's focus-preserving preventDefault doesn't block the
// input from focusing.
function FontSizeField({
  value,
  min,
  max,
  onCommit
}: {
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  // Re-sync when the value changes externally (stepper +/−, selecting another
  // text) — but not while the field is focused, so typing isn't clobbered.
  const focusedRef = useRef(false)
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])
  const commit = () => {
    const n = parseInt(draft, 10)
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
    else setDraft(String(value))
  }
  return (
    <span className="inline-flex items-baseline">
      <input
        type="text"
        inputMode="numeric"
        aria-label="Font size in points"
        value={draft}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => { focusedRef.current = true; e.currentTarget.select() }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
        onBlur={() => { focusedRef.current = false; commit() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur() }
          else if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); e.currentTarget.blur() }
        }}
        className="w-6 text-xs font-medium text-right tabular-nums text-slate-700 bg-transparent outline-none rounded focus:bg-slate-100"
      />
      <span className="text-xs font-medium text-slate-500 pl-0.5">px</span>
    </span>
  )
}

function selectAllContents(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

// Rich-text editor: a contentEditable seeded from the annotation's runs. The
// browser handles selection-based styling; the pill drives it through the
// `format` handle (execCommand), and on commit the DOM is parsed back into runs.
function TextEditor({
  annotation,
  scale,
  apiRef,
  onCommit,
  onCancel
}: {
  annotation: TextAnnotation
  scale: number
  apiRef: React.MutableRefObject<{ format: (kind: 'bold' | 'italic' | 'underline' | 'link') => void } | null>
  onCommit: (runs: TextRun[]) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Suppress the very first blur so a focus race in Firefox doesn't silently
  // delete the empty annotation before the user gets a chance to type.
  const justMountedRef = useRef(true)
  // True while a formatting prompt (link URL) has stolen focus, so the ensuing
  // blur doesn't commit and tear the editor down mid-operation.
  const formattingRef = useRef(false)
  const committedRef = useRef(false)

  // Seed the editable HTML from the runs, once, then focus + select all so the
  // first keystroke replaces the placeholder text (matching the old input).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = runsToHtml(effectiveRuns(annotation))
    el.focus()
    selectAllContents(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      if (document.activeElement !== ref.current) ref.current?.focus()
      justMountedRef.current = false
    })
    return () => cancelAnimationFrame(t)
  }, [])

  // Publish the imperative format handle for the pill.
  useEffect(() => {
    apiRef.current = {
      format(kind) {
        const el = ref.current
        if (!el) return
        if (kind === 'link') {
          // A prompt blurs the editor and drops the selection, so save the range
          // first and restore it before applying the link.
          const sel = window.getSelection()
          const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
          formattingRef.current = true
          const url = window.prompt('Link URL for the selected text (blank to remove):', '')
          el.focus()
          if (saved) {
            const s = window.getSelection()
            s?.removeAllRanges()
            s?.addRange(saved)
          }
          formattingRef.current = false
          if (url === null) return
          if (url.trim()) document.execCommand('createLink', false, url.trim())
          else document.execCommand('unlink')
          return
        }
        el.focus()
        try { document.execCommand('styleWithCSS', false, 'false') } catch { /* ignore */ }
        document.execCommand(kind)
      }
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef])

  function commit() {
    if (committedRef.current) return
    committedRef.current = true
    const el = ref.current
    onCommit(el ? parseRunsFromDom(el) : [])
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={() => {
        // If we blur in the same frame as mount (focus never landed), or a link
        // prompt has focus, keep the editor open.
        if (justMountedRef.current) {
          ref.current?.focus()
          return
        }
        if (formattingRef.current) return
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          // Block the trailing blur (fired as we unmount) from committing the
          // discarded edits over the original annotation.
          committedRef.current = true
          onCancel()
        }
      }}
      style={{
        position: 'absolute',
        // Pixel-align with the committed Konva <Text> so glyphs don't shift when
        // the edit ends. Konva draws the top-left at (x, y) with a "middle"
        // baseline (glyph centre at y + fontSize/2). This box is 1.25×fontSize
        // tall with its line centred by an equal line-height, so the glyph
        // centre sits at 0.625×fontSize from the top — nudging the box up by the
        // extra 0.125×fontSize lines the two centres up. The dashed affordance
        // uses `outline` (no layout effect) and padding is zero, so the left
        // edge matches Konva's x exactly.
        left: annotation.x * scale,
        top: annotation.y * scale - annotation.fontSize * scale * 0.125,
        color: annotation.color,
        fontSize: (annotation.fontSize * scale) + 'px',
        fontFamily: FONT_STACK[annotation.fontFamily ?? 'sans'],
        lineHeight: (annotation.fontSize * 1.25 * scale) + 'px',
        whiteSpace: 'pre',
        background: 'transparent',
        border: 'none',
        outline: '1px dashed #ea580c',
        outlineOffset: '1px',
        padding: 0,
        margin: 0,
        boxSizing: 'content-box',
        minWidth: '120px',
        height: annotation.fontSize * 1.25 * scale + 'px',
        zIndex: 10
      }}
    />
  )
}
