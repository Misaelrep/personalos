import { resolveDay, validateWeek, type ResolveConfig, type ResolvedDay, type WeeklyRoutine } from '../../domain/routine'
import { DATE_OVERRIDES, SUNDAY_ROTATION, SUNDAY_ROTATION_ANCHOR, THURSDAYS_WITHOUT_GYM } from './config'
import { friday } from './friday'
import { monday } from './monday'
import { saturday } from './saturday'
import { sunday, sundayDeepRotation } from './sunday'
import { THURSDAY_WITHOUT_GYM, thursday } from './thursday'
import { tuesday } from './tuesday'
import { wednesday } from './wednesday'

/**
 * RUTINA MAESTRA V3 — the single source of truth for the week.
 * DAYSCAPE, HOY and FOCUS (and later SEMANA) read only from here, through
 * `routineForDate`. Edit a day in its own file; decide open exceptions in
 * config.ts. Components never hold times.
 */
export const WEEKLY_ROUTINE: WeeklyRoutine = {
  0: sunday,
  1: monday,
  2: tuesday,
  3: wednesday,
  4: thursday,
  5: friday,
  6: saturday,
}

export const SUNDAY_DEEP_ROTATION = sundayDeepRotation(SUNDAY_ROTATION)

export const RESOLVE_CONFIG: ResolveConfig = {
  rotations: [{ rotation: SUNDAY_DEEP_ROTATION, anchor: SUNDAY_ROTATION_ANCHOR }],
  overrides: (date) => [
    ...(THURSDAYS_WITHOUT_GYM.includes(date) ? [{ source: 'monthlyThursdayNoGym', override: THURSDAY_WITHOUT_GYM }] : []),
    ...(DATE_OVERRIDES[date] ? [{ source: `override ${date}`, override: DATE_OVERRIDES[date] }] : []),
  ],
}

/** The routine of a real date (YYYY-MM-DD). Throws RoutineMissingError if its day is not defined. */
export function routineForDate(date: string): ResolvedDay {
  return resolveDay(WEEKLY_ROUTINE, date, RESOLVE_CONFIG)
}

// Development: an inconsistent routine is reported loudly, never silently patched.
if (import.meta.env?.DEV) {
  const issues = validateWeek(WEEKLY_ROUTINE)
  if (issues.length) console.error('[ELYUM] Rutina maestra inconsistente:\n' + issues.join('\n'))
}
