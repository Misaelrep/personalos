import type { DayRoutine, Weekday } from '../../domain/types'
import { tuesday } from './tuesday'

/**
 * Weekly routine registry. Add a day by creating its file next to
 * `tuesday.ts` and registering it here — the UI reads only from this map.
 */
export const routines: Partial<Record<Weekday, DayRoutine>> = {
  2: tuesday,
}

/** Used while a weekday has no routine of its own yet. */
export const FALLBACK_ROUTINE = tuesday

export function routineFor(date: Date): { routine: DayRoutine; isFallback: boolean } {
  const own = routines[date.getDay() as Weekday]
  return own ? { routine: own, isFallback: false } : { routine: FALLBACK_ROUTINE, isFallback: true }
}
