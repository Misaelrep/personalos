import { AnimatePresence, m } from 'framer-motion'
import { useState } from 'react'
import { ActiveMatrix } from '../../components/dot/ActiveMatrix'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { StatusGlyph } from '../../components/ui/StatusGlyph'
import { alternativeLine, blockDescription, isPassive, resolutionLine } from '../../domain/labels'
import { formatClock, formatDuration, formatRange, minutesOfDay } from '../../domain/time'
import type { ScheduledBlock } from '../../domain/types'
import { fade, fadeGroup, morph, transition } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { ResultPrompt } from '../closing/ResultPrompt'
import { ObjectiveField } from './ObjectiveField'

interface NowCardProps {
  onStartFocus: (blockId: string) => void
  /** While entering Focus: the card keeps only its title. */
  focusing?: boolean
}

/** B · AHORA — the dominant surface. */
export function NowCard({ onStartFocus, focusing = false }: NowCardProps) {
  const { view, now } = useDay()
  const block = view.current

  return (
    <section
      aria-labelledby="now-title"
      className="surface relative overflow-hidden rounded-[28px] px-6 pt-7 pb-6 sm:px-10 sm:pt-9 sm:pb-9"
    >
      <div className="now-glow" aria-hidden />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-ink-3">
          <span data-now-matrix className="flex shrink-0">
            {block.status === 'activo' || block.status === 'en-focus' ? (
              <ActiveMatrix gathering={focusing} />
            ) : (
              <StatusGlyph status={block.status} />
            )}
          </span>
          <span data-now-label className="flex">
            <Label className="text-ink-2">Ahora</Label>
          </span>
        </div>
        <span className="tabular text-[14px] text-ink-2 sm:text-[15px]">
          {block.category === 'sleep' ? `hasta ${formatClock(block.endMin)}` : formatRange(block.startMin, block.endMin)}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={block.id}
          variants={morph}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative"
        >
          <h2
            id="now-title"
            aria-live="polite"
            className={`mt-8 font-display text-[clamp(40px,5.6vw,64px)] leading-[1] font-[460] tracking-[-0.045em] text-ink transition-opacity duration-500 sm:mt-10 ${
              block.record.status ? 'opacity-55' : ''
            }`}
          >
            {block.title}
          </h2>
          <p className="mt-3.5 text-[16px] text-ink-2 sm:text-[18px]">{blockDescription(block)}</p>
          {block.secondaryOption && <p className="mt-2 text-[13px] text-ink-3">{alternativeLine(block)}</p>}

          <m.div
            animate={{ opacity: focusing ? 0 : 1 }}
            transition={transition.micro}
            aria-hidden={focusing}
          >
            <TimeLine block={block} now={minutesOfDay(now)} />
            <Body block={block} onStartFocus={onStartFocus} />
          </m.div>
        </m.div>
      </AnimatePresence>
    </section>
  )
}

function TimeLine({ block, now }: { block: ScheduledBlock; now: number }) {
  const total = block.endMin - block.startMin
  const elapsed = Math.min(Math.max(now - block.startMin, 0), total)
  const left = total - elapsed
  return (
    <div className="mt-8 flex items-center gap-4 sm:mt-10">
      <div className="relative h-px flex-1 overflow-hidden bg-[var(--line)]">
        <div
          className="absolute inset-0 origin-left bg-accent opacity-70 transition-transform duration-700 ease-astral"
          style={{ transform: `scaleX(${total ? elapsed / total : 0})` }}
        />
      </div>
      <span className="tabular shrink-0 text-[13px] text-ink-3">
        {left < 1 ? (
          'terminando'
        ) : (
          <>
            <span className="text-ink-2">{formatDuration(left)}</span> restantes
          </>
        )}
      </span>
    </div>
  )
}

function Body({ block, onStartFocus }: { block: ScheduledBlock; onStartFocus: (id: string) => void }) {
  const { dispatch, view } = useDay()
  const [closing, setClosing] = useState(false)

  if (block.record.status) {
    return (
      <m.div variants={fade} initial="hidden" animate="visible" className="mt-8 sm:mt-10">
        <div className="flex items-center gap-3 text-[16px] text-ink-2">
          <StatusGlyph status={block.status} className="text-ink-3" />
          {resolutionLine(block)}
        </div>
        {block.record.pendingNote && (
          <p className="mt-3 pl-7 text-[15px] text-ink-3">Pendiente: {block.record.pendingNote}</p>
        )}
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[14px] text-ink-3">
            {view.next && !view.nextIsTomorrow
              ? `Lo siguiente empieza a las ${formatClock(view.next.startMin)}.`
              : 'Bloque cerrado.'}
          </p>
          <Button variant="quiet" onClick={() => dispatch({ type: 'reopen', blockId: block.id })}>
            Deshacer
          </Button>
        </div>
      </m.div>
    )
  }

  if (isPassive(block)) return null

  // Only deep production opens Focus; everything else is simply completed or skipped.
  const deep = block.focusEligible

  return (
    <m.div variants={fadeGroup(0.06)} initial="hidden" animate="visible">
      {deep && (
        <m.div variants={fade} className="mt-8 sm:mt-10">
          <ObjectiveField
            objective={block.objective}
            onSave={(objective) => dispatch({ type: 'setObjective', blockId: block.id, objective })}
          />
        </m.div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {closing ? (
          <m.div key="closing" variants={morph} initial="hidden" animate="visible" exit="exit" className="mt-10">
            <ResultPrompt
              onCancel={() => setClosing(false)}
              onAnswer={(outcome, note) => dispatch({ type: 'close', blockId: block.id, outcome, note })}
            />
          </m.div>
        ) : (
          <m.div
            key="actions"
            variants={morph}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-10 flex flex-col gap-3 sm:mt-12 sm:flex-row sm:items-center sm:gap-2"
          >
            {deep ? (
              <Button className="w-full sm:w-auto" onClick={() => onStartFocus(block.id)}>
                <FocusGlyph />
                Iniciar focus
              </Button>
            ) : (
              <Button className="w-full sm:w-auto" onClick={() => dispatch({ type: 'complete', blockId: block.id })}>
                <CheckGlyph />
                Completar
              </Button>
            )}
            <div className="flex justify-center gap-1 sm:ml-auto">
              {deep && (
                <Button variant="secondary" onClick={() => setClosing(true)}>
                  Cerrar bloque
                </Button>
              )}
              <Button variant="secondary" onClick={() => dispatch({ type: 'skip', blockId: block.id })}>
                Omitir
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

/** Four points drawn toward a center: CONVERGE in miniature. */
function FocusGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4">
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      {[
        [8, 2.2],
        [13.8, 8],
        [8, 13.8],
        [2.2, 8],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" opacity="0.55" />
      ))}
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 8.4 6.5 11.2 12.5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
