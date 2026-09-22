import { Label } from '../../components/ui/Label'
import { blockDescription, blockName } from '../../domain/labels'
import { formatClock, formatDuration, formatRange } from '../../domain/time'
import { useDay } from '../../state/DayProvider'

/** C · SIGUIENTE — what comes after, and much more quietly, what comes after that. */
export function NextUp() {
  const { view } = useDay()
  const { next, after, nextIsTomorrow } = view
  if (!next) return null

  return (
    <section aria-label="Siguiente" className="surface-quiet rounded-[24px] px-6 py-6 sm:px-10 sm:py-7">
      <div className="flex items-center justify-between gap-4">
        <Label>{nextIsTomorrow ? 'Mañana' : 'Siguiente'}</Label>
        <span className="tabular text-[13px] text-ink-3">{formatRange(next.startMin, next.endMin)}</span>
      </div>
      <p className="mt-4 text-[24px] leading-tight tracking-[-0.022em] text-ink sm:text-[26px]">{next.title}</p>
      <p className="mt-1.5 text-[15px] text-ink-3">
        {blockDescription(next)}
        {next.kind !== 'sleep' && <> · {formatDuration(next.endMin - next.startMin)}</>}
      </p>
      {after && (
        <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] text-ink-3">
          Después <span className="text-ink-4">·</span> <span className="tabular">{formatClock(after.startMin)}</span>{' '}
          <span className="text-ink-4">·</span> {blockName(after)}
        </p>
      )}
    </section>
  )
}
