import type { BlockCategory, ClockTime, EnergyState, RoutineBlock } from '../../domain/types'

/**
 * What each category means for Focus and progress unless a block says
 * otherwise. Every resolved block carries both flags explicitly.
 */
export const CATEGORY_DEFAULTS: Record<BlockCategory, { focusEligible: boolean; countsForProgress: boolean }> = {
  deep_work: { focusEligible: true, countsForProgress: true },
  learning: { focusEligible: false, countsForProgress: true },
  ritual: { focusEligible: false, countsForProgress: true },
  creative_practice: { focusEligible: false, countsForProgress: true },
  body: { focusEligible: false, countsForProgress: true },
  admin: { focusEligible: false, countsForProgress: true },
  reflection: { focusEligible: false, countsForProgress: true },
  recovery: { focusEligible: false, countsForProgress: false },
  transition: { focusEligible: false, countsForProgress: false },
  free: { focusEligible: false, countsForProgress: false },
  sleep: { focusEligible: false, countsForProgress: false },
}

type Extra = Partial<Omit<RoutineBlock, 'id' | 'start' | 'end' | 'title' | 'category' | 'energy'>>

/**
 * One block of the routine, one line of data:
 *   block('tue-web-1000', '10:00', '12:00', 'Páginas Web', 'deep_work', 'focus', { project: 'web' })
 * `end` may be omitted: the block then lasts until the next one starts.
 */
export function block(
  id: string,
  start: ClockTime,
  end: ClockTime | undefined,
  title: string,
  category: BlockCategory,
  energy: EnergyState,
  extra: Extra = {},
): RoutineBlock {
  return {
    id,
    start,
    ...(end ? { end } : {}),
    title,
    category,
    energy,
    ...CATEGORY_DEFAULTS[category],
    ...extra,
  }
}
