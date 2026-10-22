import { useRef, useState } from 'react'
import { useT } from '../i18n'
import { mergePdfs } from '../lib/convert'
import { openFiles } from '../stores/tabStore'
import { formatSize } from '../components/Export/formatSize'
import { Icon, PATHS } from './icons'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, JobPage } from './parts'
import { useNav } from './nav'
import { pickFiles, useJobBackLabel, useJobs } from './jobs'
import { handOver } from './output'

// Merge PDFs, a page (was the website's dialog): the files as a pile of slips
// in the order they will go, each with ↑ ↓ and ×, "Add a PDF" as the orange
// dashed ring the Desk's Open from Files has, and Merge and open / Share at
// the foot. From What else it starts with the open document on the pile.

interface Item {
  file: File
  key: string
}

const TILTS = ['-1deg', '0.8deg', '-0.5deg', '1.1deg']

export default function MergeScreen() {
  const dialog = useJobs((s) => s.dialog)
  if (dialog?.kind !== 'merge') return null
  return <MergePage initial={dialog.initialFile ?? null} />
}

function MergePage({ initial }: { initial: File | null }) {
  const t = useT()
  const backLabel = useJobBackLabel()
  const seq = useRef(0)
  const [items, setItems] = useState<Item[]>(() => (initial ? [{ file: initial, key: `f${seq.current++}` }] : []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const back = () => useNav.getState().pop()

  function add() {
    // Straight from the tap: iOS only opens a picker inside the gesture.
    void pickFiles('application/pdf,.pdf', true).then((files) => {
      const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
      if (pdfs.length) setItems((prev) => [...prev, ...pdfs.map((file) => ({ file, key: `f${seq.current++}` }))])
    })
  }

  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function build(): Promise<Uint8Array> {
    const buffers: ArrayBuffer[] = []
    for (const it of items) buffers.push(await it.file.arrayBuffer())
    return mergePdfs(buffers)
  }

  async function run(open: boolean) {
    if (items.length < 2 || busy) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await build()
      if (open) {
        // A new document (a tab of its own when one is open), never laid over
        // the one on screen — so nothing is lost and nothing needs asking.
        await openFiles([new File([bytes.slice() as BlobPart], 'merged.pdf', { type: 'application/pdf' })])
      } else {
        await handOver(bytes, 'merged.pdf')
      }
    } catch (err) {
      setError(t('tools.merge.failed', { message: (err as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const can = items.length >= 2 && !busy

  return (
    <JobPage
      backLabel={backLabel}
      onBack={back}
      lead={t('phone.merge_lead')}
      hl={t('phone.merge_hl')}
      note={t('phone.merge_note')}
      footer={
        <>
          <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={!can} onClick={() => void run(true)}>
            {busy ? t('tools.merge.merging') : t('tools.merge.merge_open')}
          </button>
          <button type="button" className={BTN_SECOND} style={BTN_SECOND_STYLE} disabled={!can} onClick={() => void run(false)}>
            {t('phone.share')}
          </button>
        </>
      }
    >
      {items.length > 0 && (
        <ol className="m-0 p-0 list-none flex flex-col gap-3" aria-label={t('phone.merge_order')}>
          {items.map((it, i) => (
            <li
              key={it.key}
              className="np-tilt bg-white rounded-[3px] pl-3 pr-1 py-1.5 flex items-center gap-2"
              style={{ transform: `rotate(${TILTS[i % 4]})`, boxShadow: '0 6px 14px rgba(60,45,20,0.14)' }}
            >
              <span className="np-hand w-6 text-center text-[24px] leading-none text-[color:var(--np-orange-ink)]">{i + 1}</span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[15px] font-semibold truncate">{it.file.name.replace(/\.pdf$/i, '')}</span>
                <span className="text-[12px] text-[color:var(--np-muted)] tabular-nums">{formatSize(t, it.file.size)}</span>
              </span>
              <RowButton label={t('tools.merge.move_up', { name: it.file.name })} disabled={i === 0 || busy} onClick={() => move(i, -1)}>↑</RowButton>
              <RowButton label={t('tools.merge.move_down', { name: it.file.name })} disabled={i === items.length - 1 || busy} onClick={() => move(i, 1)}>↓</RowButton>
              <RowButton label={t('tools.merge.remove', { name: it.file.name })} disabled={busy} onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}>
                <Icon d={PATHS.close} size={18} width={2.4} />
              </RowButton>
            </li>
          ))}
        </ol>
      )}

      <AddSlip label={t('phone.merge_add')} note={items.length < 2 ? t('phone.merge_need_two') : undefined} onClick={add} disabled={busy} />

      {error && <p className="m-0 text-[14px] text-[#b42318]">{error}</p>}
    </JobPage>
  )
}

function RowButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex-none w-11 h-11 flex items-center justify-center text-[20px] text-[color:var(--np-cobalt)] disabled:opacity-25"
    >
      {children}
    </button>
  )
}

/** "Add a PDF" / "Add photos": the orange dashed ring of Open from Files, on a slip. */
export function AddSlip({ label, note, onClick, disabled }: { label: string; note?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[14px] min-h-[64px] px-4 py-3 flex items-center gap-3 text-left disabled:opacity-60"
      style={{ border: '2px dashed var(--np-orange)', background: 'rgba(249,115,22,0.06)' }}
    >
      <span className="flex-none w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--np-orange)' }}>
        <Icon d={PATHS.plus} size={22} stroke="#ffffff" width={2.6} />
      </span>
      <span className="flex flex-col">
        <span className="text-[16px] font-bold text-[color:var(--np-orange-ink)]">{label}</span>
        {note && <span className="text-[13px] text-[color:var(--np-muted)]">{note}</span>}
      </span>
    </button>
  )
}
