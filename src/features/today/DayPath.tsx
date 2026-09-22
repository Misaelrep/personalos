import { AnimatePresence, m } from 'framer-motion'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { STATUS_LABEL, StatusGlyph } from '../../components/ui/StatusGlyph'
import { blockDescription, blockName, resolutionLine } from '../../domain/labels'
import { formatClock, formatRange, minutesOfDay } from '../../domain/time'
import type { BlockStatus, ScheduledBlock } from '../../domain/types'
import { expand } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'

const TEXT: Record<BlockStatus, string> = {
  activo: 'text-ink font-medium',
  'en-focus': 'text-ink font-medium',
  proximo: 'text-ink-2',
  completado: 'text-ink-3',
  parcial: 'text-ink-3',
  omitido: 'text-ink-4 line-through decoration-[var(--line)]',
}

const GLYPH: Record<BlockStatus, string> = {
  activo: 'text-accent',
  'en-focus': 'text-accent',
  proximo: 'text-ink-4',
  completado: 'text-ink-3',
  parcial: 'text-ink-3',
  omitido: 'text-ink-4',
}

/** D + E · Camino del día with minimal progress. Subordinate to AHORA. */
export function DayPath({ defaultOpen }: { defaultOpen: boolean }) {
  const { view } = useDay()
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()
  const { done, total } = view.progress

  return (
    <section aria-label="Camino del día">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="group flex w-full items-center justify-between gap-4 rounded-2xl py-2 text-left"
      >
        <Label>Camino del día</Label>
        <span className="flex items-center gap-3 text-[13px] text-ink-3">
          <span className="tabular">
            {done} / {total} <span className="text-ink-4">bloques</span>
          </span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={`size-3.5 text-ink-4 transition-transform duration-300 ease-astral group-hover:text-ink-2 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <ProgressDots blocks={view.path} />

      <AnimatePresence initial={false}>
        {open && (
          <m.ol
            id={listId}
            key="path"
            variants={expand}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="-mx-3 mt-4 overflow-hidden"
          >
            {view.path.map((block) => (
              <PathItem key={block.id} block={block} />
            ))}
          </m.ol>
        )}
      </AnimatePresence>
    </section>
  )
}

function ProgressDots({ blocks }: { blocks: ScheduledBlock[] }) {
  const counted = blocks.filter((b) => b.kind !== 'sleep')
  return (
    <div className="mt-3 flex items-center gap-[7px]" aria-hidden>
      {counted.map((b) => {
        const s = b.status
        const cls =
          s === 'completado'
            ? 'bg-ink-3'
            : s === 'parcial'
              ? 'bg-[linear-gradient(90deg,var(--ink-3)_50%,transparent_50%)] ring-1 ring-inset ring-[var(--ink-3)]'
              : s === 'activo' || s === 'en-focus'
                ? 'bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]'
                : s === 'omitido'
                  ? 'ring-1 ring-inset ring-[var(--ink-4)] opacity-60'
                  : 'ring-1 ring-inset ring-[var(--ink-4)]'
        return <span key={b.id} className={`size-[6px] rounded-full ${cls}`} />
      })}
    </div>
  )
}

function PathItem({ block }: { block: ScheduledBlock }) {
  const { dispatch, now } = useDay()
  const [open, setOpen] = useState(false)
  const current = block.status === 'activo' || block.status === 'en-focus'
  const past = block.endMin <= minutesOfDay(now) && !current
  const detailId = useId()

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        aria-current={current ? 'step' : undefined}
        className={`grid w-full grid-cols-[16px_46px_1fr] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--line)] ${
          current ? 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : ''
        }`}
      >
        <StatusGlyph status={block.status} className={GLYPH[block.status]} />
        <span className={`tabular text-[13px] ${current ? 'text-ink-2' : 'text-ink-4'}`}>{formatClock(block.startMin)}</span>
        <span className={`truncate text-[15px] tracking-[-0.005em] ${TEXT[block.status]}`}>
          {blockName(block)}
          {block.status === 'proximo' && past && (
            <span className="ml-2.5 inline-flex items-center gap-1.5 text-[12px] font-normal text-ink-3">
              <span className="size-1 rounded-full bg-aurora" />
              pendiente
            </span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={detailId}
            variants={expand}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-1 pr-3 pb-4 pl-[80px] text-[13px] leading-relaxed text-ink-3">
              <p>
                <span className="tabular">{formatRange(block.startMin, block.endMin)}</span> · {blockDescription(block)}
              </p>
              <p>
                {block.record.status ? resolutionLine(block) : STATUS_LABEL[block.status]}
                {block.implicit && block.status === 'completado' && <span className="text-ink-4"> · según la rutina</span>}
              </p>
              {block.objective && <p>Objetivo: {block.objective}</p>}
              {block.record.pendingNote && <p className="text-ink-2">Pendiente: {block.record.pendingNote}</p>}
              {past && <Correction block={block} onAction={dispatch} />}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </li>
  )
}

/** Past blocks can be corrected — never rearranged. */
function Correction({
  block,
  onAction,
}: {
  block: ScheduledBlock
  onAction: ReturnType<typeof useDay>['dispatch']
}) {
  if (block.record.status) {
    return (
      <Button variant="quiet" className="-ml-4 h-8" onClick={() => onAction({ type: 'reopen', blockId: block.id })}>
        Deshacer
      </Button>
    )
  }
  if (block.status === 'completado') {
    return (
      <Button variant="quiet" className="-ml-4 h-8" onClick={() => onAction({ type: 'skip', blockId: block.id })}>
        Marcar omitido
      </Button>
    )
  }
  return (
    <Button variant="quiet" className="-ml-4 h-8" onClick={() => onAction({ type: 'complete', blockId: block.id })}>
      Marcar completado
    </Button>
  )
}
