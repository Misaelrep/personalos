import { Label } from '../../components/ui/Label'
import { blockDescription, blockName } from '../../domain/labels'
import { formatClock, formatDuration, formatRange } from '../../domain/time'
import { useDay } from '../../state/DayProvider'

/**
 * C · SIGUIENTE — what comes after, and much more quietly, what comes after
 * that. Always a step below AHORA: smaller name, softer ink, no competition.
 */
export function NextUp() {
  const { view } = useDay()
  const { next, after, nextIsTomorrow } = view
  if (!next) return null

  return (
    <section aria-label="Siguiente" className="surface-quiet rounded-[24px] px-6 py-5 sm:px-10 sm:py-6">
      <div className="flex items-center justify-between gap-4">
        <Label>{nextIsTomorrow ? 'Mañana' : 'Siguiente'}</Label>
        <span className="tabular text-[13px] text-ink-3">{formatRange(next.startMin, next.endMin)}</span>
      </div>
      <p className="mt-3.5 font-display text-[20px] leading-tight font-[420] tracking-[-0.03em] text-ink-2 sm:text-[22px]">
        {next.title}
      </p>
      <p className="mt-1.5 text-[14px] text-ink-3">
        {blockDescription(next)}
        {next.category !== 'sleep' && <> · {formatDuration(next.endMin - next.startMin)}</>}
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
