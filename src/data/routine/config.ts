import type { DayOverride } from '../../domain/routine'

/**
 * Decisions the routine leaves open ON PURPOSE. Nothing here is guessed:
 * while a value is unset, the app shows the open state instead of inventing one.
 */

/**
 * ROTACIÓN DOMINGO 13:00–16:00 (Newsletter ⇄ Páginas Web).
 * A Sunday (YYYY-MM-DD) on which variant A — Newsletter — happens; every other
 * week alternates from there. `null`: not decided yet → the block reads
 * "Trabajo profundo rotativo · variante sin definir".
 */
export const SUNDAY_ROTATION_ANCHOR: string | null = null

/**
 * UN JUEVES AL MES SIN GIMNASIO (monthlyThursdayNoGym).
 * Explicit Thursdays (YYYY-MM-DD) on which the gym is also dropped. Empty: none decided yet.
 */
export const THURSDAYS_WITHOUT_GYM: string[] = []

/** Any other one-off change for a specific date (YYYY-MM-DD). */
export const DATE_OVERRIDES: Record<string, DayOverride> = {}
