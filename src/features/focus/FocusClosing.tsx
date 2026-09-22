import { AnimatePresence, m } from 'framer-motion'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { blockDescription } from '../../domain/labels'
import { formatClock, formatDuration, minutesOfDay } from '../../domain/time'
import type { Outcome, ScheduledBlock } from '../../domain/types'
import { fade, fadeGroup, morph } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { ResultPrompt } from '../closing/ResultPrompt'

interface FocusClosingProps {
  phase: 'result' | 'next'
  block: ScheduledBlock
  onAnswer: (outcome: Outcome, note?: string) => void
  onDone: () => void
}

/**
 * The exhale: BLOQUE COMPLETADO → ¿Se consiguió el resultado? → SIGUIENTE → HOY.
 */
export function FocusClosing({ phase, block, onAnswer, onDone }: FocusClosingProps) {
  const { view, now } = useDay()
  const i = view.timeline.findIndex((b) => b.id === block.id)
  const next = view.timeline.slice(i + 1).find((b) => !b.synthetic) ?? (i >= 0 ? undefined : view.next)
  const nextStarted = next ? minutesOfDay(now) >= next.startMin : false

  return (
    <m.div
      className="tone-ink fixed inset-0 z-10 grid place-items-center overflow-y-auto px-6 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      <AnimatePresence mode="wait">
        {phase === 'result' ? (
          <m.div
            key="result"
            variants={fadeGroup(0.5, 0.1)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-[520px] text-center"
          >
            <m.div variants={fade}>
              <Label>{block.title}</Label>
              <h2 className="mt-5 text-[clamp(34px,6vw,52px)] leading-none font-light tracking-[-0.035em] text-ink">
                Bloque completado
              </h2>
              {block.objective && <p className="mt-4 text-[16px] text-ink-3">{block.objective}</p>}
            </m.div>
            <m.div variants={fade} className="mt-14">
              <ResultPrompt align="center" onAnswer={onAnswer} />
            </m.div>
          </m.div>
        ) : (
          <m.div
            key="next"
            variants={morph}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-[520px] text-center"
          >
            {next ? (
              <>
                <Label>{nextStarted ? 'Ahora' : 'Siguiente'}</Label>
                <p className="mt-6 text-[clamp(40px,7vw,60px)] leading-none font-normal tracking-[-0.035em] text-ink">
                  {next.title}
                </p>
                <p className="tabular mt-5 text-[17px] text-ink-2">
                  {formatDuration(next.endMin - next.startMin, true)} · {formatClock(next.startMin)}
                </p>
                <p className="mt-1.5 text-[15px] text-ink-3">{blockDescription(next)}</p>
              </>
            ) : (
              <Label>Día cerrado</Label>
            )}
            <Button variant="quiet" className="mt-12" onClick={onDone}>
              Volver a Hoy
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
