import { useAnnotationStore } from '../../stores/annotationStore'
import { useSignatureStore } from '../../stores/signatureStore'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'

// The banner that says a placement is ARMED and waiting for a tap.
//
// ⚠️ Why this exists (owner, 2026-08-30: "you need an indicator to show that you
// need to tap to place the signature / name / date, or QR code for example,
// otherwise you're not sure what to do"). Saving a signature, or hitting "Add to
// page" in the QR dialog, closes the dialog and leaves the app in a state with
// no visible difference from the one before it: a tool is armed and the very
// next tap on the page drops something. The only feedback was the cursor-
// following ghost in AnnotationLayer — which needs a HOVER, so on a phone there
// was no feedback at all, and even on desktop only the signature had one (an
// armed QR / picture had none on any device).
//
// It is deliberately not a toast: it must stay up for exactly as long as the
// state it describes, and go the instant the thing lands. Nothing is timed.

type Prompt = {
  /** The instruction itself. */
  label: string
  /** Secondary line — what specifically is about to land. */
  detail?: string
  /** Thumbnail of the thing being placed, when there is an image of it. */
  preview?: string
  /** Undo the armed state. Named so the button can say what it abandons. */
  cancel: () => void
}

const EXTRA_NOUN: Record<'name' | 'details' | 'date', string> = {
  name: 'name',
  details: 'details',
  date: 'date',
}

export default function PlacementHint() {
  const tool = useAnnotationStore((s) => s.tool)
  const uploadedImageSrc = useAnnotationStore((s) => s.uploadedImageSrc)
  const uploadedImageQr = useAnnotationStore((s) => s.uploadedImageQr)
  const pendingExtras = useSignatureStore((s) => s.pendingExtras)
  const activeSignature = useSignatureStore((s) => {
    const id = s.activeId
    return id ? s.signatures.find((x) => x.id === id) ?? null : null
  })
  // "Tap" on glass, "Click" with a mouse. The instruction is only useful if it
  // names the gesture the reader actually has.
  const verb = useCoarsePointer() ? 'Tap' : 'Click'

  const prompt = ((): Prompt | null => {
    // Mid-sequence first: with extras queued the signature is already down and
    // the tool is still 'signature', so this case has to win over the one below.
    if (tool === 'signature' && pendingExtras.length > 0) {
      const next = pendingExtras[0]
      const more = pendingExtras.length - 1
      return {
        label: `${verb} where the ${EXTRA_NOUN[next.kind]} should go`,
        detail: more > 0 ? `“${next.text}” — ${more} more after this` : `“${next.text}”`,
        cancel: () => {
          useSignatureStore.getState().setPendingExtras([])
          useAnnotationStore.getState().setTool('select')
        },
      }
    }
    // Both of the tools below do NOTHING on a tap without their payload, so the
    // payload — not the tool — is what gates the banner.
    if (tool === 'signature' && activeSignature) {
      return {
        label: `${verb} the page to place your signature`,
        preview: activeSignature.dataUrl,
        cancel: () => useAnnotationStore.getState().setTool('select'),
      }
    }
    if (tool === 'image' && uploadedImageSrc) {
      return {
        label: `${verb} the page to place your ${uploadedImageQr ? 'QR code' : 'image'}`,
        preview: uploadedImageSrc,
        cancel: () => {
          useAnnotationStore.getState().setUploadedImageSrc(null)
          useAnnotationStore.getState().setTool('select')
        },
      }
    }
    if (tool === 'text') {
      return {
        label: `${verb} the page to add a text box`,
        cancel: () => useAnnotationStore.getState().setTool('select'),
      }
    }
    if (tool === 'tick' || tool === 'cross') {
      return {
        label: `${verb} the page to place a ${tool === 'tick' ? 'tick' : 'cross'}`,
        detail: 'Stays on until you pick another tool',
        cancel: () => useAnnotationStore.getState().setTool('select'),
      }
    }
    return null
  })()

  if (!prompt) return null

  return (
    // ⚠️ pointer-events-none on everything but the Cancel button. This floats over
    // the top of the page, and the whole point of the state it announces is that
    // the next tap on the page places something — a banner that ate that tap
    // would be worse than no banner.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%]"
    >
      {/* ⚠️ `w-max max-w-full` is what makes this readable on a phone, and it is
          not decoration. The pill is content-sized, so a label merely allowed to
          wrap collapses to MIN-content — "Tap the page to place your QR code"
          came out one word per line, seven lines tall, on a 390px screen.
          w-max asks for the single-line width first and the max-w clamps it, so
          it wraps only when it genuinely has to. rounded-2xl (not -full) is so
          the two-line case still looks like a banner rather than a lozenge.
          This is the one screen where the banner is the ONLY feedback there is:
          no hover, so no cursor ghost. */}
      <div className="flex w-max max-w-full items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur px-3.5 py-2 shadow-lg ring-1 ring-orange-200">
        <span
          aria-hidden="true"
          className="shrink-0 w-2 h-2 rounded-full bg-orange-500 animate-pulse motion-reduce:animate-none"
        />
        {prompt.preview && (
          <img
            src={prompt.preview}
            alt=""
            aria-hidden="true"
            className="shrink-0 h-6 w-auto max-w-[72px] object-contain"
          />
        )}
        <span className="min-w-0 flex-1 text-[13px] leading-tight">
          <span className="block font-semibold text-slate-900">{prompt.label}</span>
          {prompt.detail && (
            <span className="block text-slate-500 truncate">{prompt.detail}</span>
          )}
        </span>
        <button
          type="button"
          onClick={prompt.cancel}
          className="pointer-events-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
