import type { DayOverride } from '../../domain/routine'
import type { SundayVariant } from './sunday'

/**
 * Decisions the routine leaves open ON PURPOSE. Nothing here is guessed:
 * while a value is unset, the app shows the open state instead of inventing one.
 */

/**
 * ROTACIÓN DOMINGO 13:00–16:00 (sun-rotation-1300).
 * On the anchor Sunday the first variant of SUNDAY_ROTATION happens; from there
 * they alternate week by week: variant = SUNDAY_ROTATION[weeksSinceAnchor % 2]
 * (dates before the anchor alternate backwards the same way).
 *   2026-09-27 Newsletter · 2026-10-04 Páginas Web · 2026-10-11 Newsletter · …
 * To shift the cycle, set another anchor Sunday. To invert it, swap the order
 * below. `null` would leave the block unresolved ("Trabajo profundo rotativo").
 */
export const SUNDAY_ROTATION_ANCHOR: string | null = '2026-09-27'
export const SUNDAY_ROTATION: SundayVariant[] = ['newsletter', 'web']

/**
 * UN JUEVES AL MES SIN GIMNASIO (monthlyThursdayNoGym).
 * Explicit Thursdays (YYYY-MM-DD) on which the gym is also dropped. Empty: none decided yet.
 */
export const THURSDAYS_WITHOUT_GYM: string[] = []

/** Any other one-off change for a specific date (YYYY-MM-DD). */
export const DATE_OVERRIDES: Record<string, DayOverride> = {}
