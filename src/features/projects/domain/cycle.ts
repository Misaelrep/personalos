import { parseDateKey, shiftDateKey, weekdayOf } from '../../../domain/routine'
import type { Cycle } from './types'

/**
 * The 90-day cycle and its weeks (Monday to Sunday, local calendar — the same
 * week SEMANA shows). The last week may end before Sunday.
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const d = parseDateKey(value)
  return shiftDateKey(value, 0) === value && !Number.isNaN(d.getTime())
}

/** The Monday of the week a date belongs to. */
export function weekStartOf(date: string): string {
  const wd = weekdayOf(date)
  return shiftDateKey(date, wd === 0 ? -6 : 1 - wd)
}

export function cycleDays(cycle: Cycle): number {
  return Math.round((parseDateKey(cycle.end).getTime() - parseDateKey(cycle.start).getTime()) / 86_400_000) + 1
}

export interface CycleWeek {
  /** 1-based. */
  n: number
  start: string
  /** Sunday, or the cycle's last day. */
  end: string
}

export function cycleWeeks(cycle: Cycle): CycleWeek[] {
  const weeks: CycleWeek[] = []
  for (let start = weekStartOf(cycle.start), n = 1; start <= cycle.end; start = shiftDateKey(start, 7), n++) {
    const sunday = shiftDateKey(start, 6)
    weeks.push({ n, start: start < cycle.start ? cycle.start : start, end: sunday > cycle.end ? cycle.end : sunday })
  }
  return weeks
}

/** Which week of the cycle a date falls in, or null outside it. */
export function cycleWeekOf(cycle: Cycle, date: string): CycleWeek | null {
  if (date < cycle.start || date > cycle.end) return null
  return cycleWeeks(cycle).find((w) => date >= w.start && date <= w.end) ?? null
}

export function cycleIssues(cycle: Cycle): string[] {
  const issues: string[] = []
  if (!isDateKey(cycle.start) || !isDateKey(cycle.end)) return ['el ciclo necesita fechas válidas (AAAA-MM-DD)']
  if (weekdayOf(cycle.start) !== 1) issues.push('el ciclo empieza en lunes')
  if (cycle.end < cycle.start) issues.push('el ciclo termina antes de empezar')
  return issues
}
