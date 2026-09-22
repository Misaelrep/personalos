import { Button } from '../../components/ui/Button'
import { blockName } from '../../domain/labels'
import { formatClock } from '../../domain/time'
import { useDay } from '../../state/DayProvider'

/**
 * Excepción de meditación: if the priority meditation was not done, offer its
 * rescue slot once. Moving it replaces that slot's activity; nothing else moves.
 */
export function MeditationPrompt() {
  const { view, dispatch } = useDay()
  const prompt = view.meditationPrompt
  if (!prompt) return null

  const { block, rescue } = prompt

  return (
    <section
      aria-label="Meditación pendiente"
      className="surface-quiet flex flex-col gap-5 rounded-[22px] px-6 py-5 sm:flex-row sm:items-center sm:px-8"
    >
      <div className="flex items-start gap-3.5">
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-aurora" aria-hidden />
        <div>
          <p className="text-[16px] text-ink">Meditación pendiente</p>
          <p className="mt-1 text-[14px] text-ink-3">
            ¿Mover a las {formatClock(rescue.startMin)}? Sustituye a {blockName(rescue)}.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <Button variant="choice" className="h-11 min-w-20" onClick={() => dispatch({ type: 'moveMeditation' })}>
          Sí
        </Button>
        <Button variant="choice" className="h-11 min-w-20" onClick={() => dispatch({ type: 'skip', blockId: block.id })}>
          Omitir
        </Button>
        <Button variant="quiet" className="ml-auto sm:ml-1" onClick={() => dispatch({ type: 'complete', blockId: block.id })}>
          Ya la hice
        </Button>
      </div>
    </section>
  )
}
