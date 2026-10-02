import { parseDateKey, shiftDateKey, weekdayOf, type ResolvedDay } from './routine'
import { buildDayView } from './schedule'
import type { BlockCategory, ProjectId, ScheduledBlock, Weekday } from './types'

/**
 * WEEKLY ROUTINE → WEEK RESOLVER → SEMANA.
 *
 * The week is never a second dataset: each of its seven dates is resolved by
 * the same day resolver HOY and DAYSCAPE use (rotations and overrides
 * included), and read through the same schedule engine. What SEMANA shows is
 * derived here — how the week is designed, not what happens at 14:00:
 *   load       how much the day asks (deep work first, then learning and body)
 *   open       how much of it is space (recovery, transition, free time)
 *   layers     where its matter sits: mañana · tarde · noche
 * Pure: same dates and routine, same week.
 */

export type WeekTense = 'past' | 'today' | 'future'
export type DayPart = 'manana' | 'tarde' | 'noche'

/** The waking day SEMANA reads (sleep is not part of a day's design). */
export const WEEK_DAY_START = 6 * 60
export const WEEK_DAY_END = 22 * 60

/** Mañana 06–12 · Tarde 12–19 · Noche 19–22. */
export const DAY_PARTS: readonly { part: DayPart; label: string; from: number; to: number }[] = [
  { part: 'manana', label: 'Mañana', from: WEEK_DAY_START, to: 12 * 60 },
  { part: 'tarde', label: 'Tarde', from: 12 * 60, to: 19 * 60 },
  { part: 'noche', label: 'Noche', from: 19 * 60, to: WEEK_DAY_END },
]

export interface WeekMinutes {
  /** Focus-eligible work (deep work, TouchDesigner). */
  deep: number
  learning: number
  body: number
  ritual: number
  /** Admin, reflection and non-focus creative practice. */
  admin: number
  /** Recovery, transitions and intentional free time. */
  open: number
}

export interface DayLayer {
  part: DayPart
  label: string
  from: number
  to: number
  /** Share of the part taken by deep work (0–1). */
  density: number
  /** Share of the part taken by weighted load (0–1): deep 1, learning/body .6, ritual/admin .3, space 0. */
  matter: number
  /** What the part is for, as SEMANA names it: "Páginas Web", "TouchDesigner · Wellness"… */
  names: string[]
}

export interface WeekDay {
  date: string
  weekday: Weekday
  /** "Sábado". */
  dayName: string
  /** The day's function: "Máximo rendimiento creativo / estratégico". */
  theme: string
  tense: WeekTense
  minutes: WeekMinutes
  /** Weighted minutes: deep + .6 learning + .6 body + .3 ritual + .3 admin. */
  load: number
  /** Longest single focus block (min): a day built around one long period reads deeper. */
  maxDeep: number
  layers: DayLayer[]
  /** Variant of a weekly rotation that applies on this date (e.g. Sunday's "newsletter"). */
  rotation?: string
}

export interface Week {
  /** Monday. */
  start: string
  /** Sunday. */
  end: string
  days: WeekDay[]
  /** Index of today in `days`, or -1 when the week is not the current one. */
  todayIndex: number
}

const LOAD_WEIGHT: Record<keyof WeekMinutes, number> = { deep: 1, learning: 0.6, body: 0.6, ritual: 0.3, admin: 0.3, open: 0 }

const SPACE: BlockCategory[] = ['recovery', 'transition', 'free']

/** Monday of the week that contains `date` (weeks run Monday → Sunday). */
export function weekStart(date: string): string {
  return shiftDateKey(date, -((weekdayOf(date) + 6) % 7))
}

/** The seven dates of the week that contains `date`, `offset` weeks away (−1 previous, +1 next). */
export function weekDates(date: string, offset = 0): string[] {
  const monday = shiftDateKey(weekStart(date), offset * 7)
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(monday, i))
}

/** Which bucket a block's minutes go to. */
export function groupOf(block: Pick<ScheduledBlock, 'category' | 'focusEligible'>): keyof WeekMinutes | null {
  if (block.category === 'sleep') return null
  if (block.focusEligible) return 'deep'
  if (block.category === 'learning') return 'learning'
  if (block.category === 'body') return 'body'
  if (block.category === 'ritual') return 'ritual'
  if (SPACE.includes(block.category)) return 'open'
  return 'admin'
}

/** How SEMANA names a block: by its project when it has one, else by its short name. */
const PROJECT_NAME: Partial<Record<ProjectId, string>> = {
  web: 'Páginas Web',
  wellness: 'Wellness',
  newsletter: 'Newsletter',
  touchdesigner: 'TouchDesigner',
}
export const weekName = (b: Pick<ScheduledBlock, 'project' | 'shortTitle' | 'title'>) =>
  (b.project && PROJECT_NAME[b.project]) || b.shortTitle || b.title

const overlap = (b: { startMin: number; endMin: number }, from: number, to: number) =>
  Math.max(0, Math.min(b.endMin, to) - Math.max(b.startMin, from))

const unique = (names: string[]) => [...new Set(names)]

/**
 * A part of the day, named by its deep work. A part without deep work (all of
 * Thursday, Sunday morning) is named by its two largest activities instead —
 * never by a transition or a meal.
 */
function layerOf(blocks: ScheduledBlock[], part: (typeof DAY_PARTS)[number]): DayLayer {
  const { from, to } = part
  const span = to - from
  let deep = 0
  let weighted = 0
  for (const b of blocks) {
    const m = overlap(b, from, to)
    const g = groupOf(b)
    if (!m || !g) continue
    if (g === 'deep') deep += m
    weighted += m * LOAD_WEIGHT[g]
  }
  const inside = blocks.filter((b) => overlap(b, from, to) > 0)
  const focus = inside.filter((b) => b.focusEligible)
  const named = focus.length
    ? focus
    : inside
        .filter((b) => b.category !== 'transition' && b.category !== 'recovery' && b.category !== 'sleep')
        .sort((a, b) => overlap(b, from, to) - overlap(a, from, to))
        .slice(0, 2)
        .sort((a, b) => a.startMin - b.startMin)
  return {
    part: part.part,
    label: part.label,
    from,
    to,
    density: deep / span,
    matter: weighted / span,
    names: unique(named.map(weekName)),
  }
}

/** One date of the week, read from its resolved routine. */
export function weekDayOf(resolved: ResolvedDay, today: string): WeekDay {
  const { date, routine } = resolved
  // The schedule engine gives every block its real minutes (open-ended blocks included).
  const view = buildDayView(routine, { date, records: {} }, WEEK_DAY_START)
  const blocks = view.timeline.filter((b) => !b.synthetic && b.category !== 'sleep')

  const minutes: WeekMinutes = { deep: 0, learning: 0, body: 0, ritual: 0, admin: 0, open: 0 }
  let maxDeep = 0
  for (const b of blocks) {
    const g = groupOf(b)
    const m = overlap(b, WEEK_DAY_START, WEEK_DAY_END)
    if (!g || !m) continue
    minutes[g] += m
    if (g === 'deep') maxDeep = Math.max(maxDeep, m)
  }
  const load = (Object.keys(minutes) as (keyof WeekMinutes)[]).reduce((sum, k) => sum + minutes[k] * LOAD_WEIGHT[k], 0)
  const rotation = resolved.notes.find((n) => n.kind === 'rotation')

  return {
    date,
    weekday: routine.weekday,
    dayName: routine.dayName,
    theme: routine.theme,
    tense: date < today ? 'past' : date === today ? 'today' : 'future',
    minutes,
    load,
    maxDeep,
    layers: DAY_PARTS.map((p) => layerOf(blocks, p)),
    ...(rotation && rotation.kind === 'rotation' ? { rotation: rotation.variant } : {}),
  }
}

/**
 * The week that contains `today` (or `offset` weeks away), Monday → Sunday.
 * `resolve` is the product's day resolver (`routineForDate`): a missing day
 * throws, exactly as it does for HOY.
 */
export function buildWeek(today: string, resolve: (date: string) => ResolvedDay, offset = 0): Week {
  const dates = weekDates(today, offset)
  const days = dates.map((d) => weekDayOf(resolve(d), today))
  return { start: dates[0], end: dates[6], days, todayIndex: dates.indexOf(today) }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "21 — 27 sep", "28 sep — 4 oct", "28 dic 2026 — 3 ene 2027". */
export function weekRangeLabel(start: string, end: string): string {
  const a = parseDateKey(start)
  const b = parseDateKey(end)
  const day = (d: Date) => String(d.getDate())
  const month = (d: Date) => MONTHS[d.getMonth()]
  if (a.getFullYear() !== b.getFullYear())
    return `${day(a)} ${month(a)} ${a.getFullYear()} — ${day(b)} ${month(b)} ${b.getFullYear()}`
  if (a.getMonth() !== b.getMonth()) return `${day(a)} ${month(a)} — ${day(b)} ${month(b)}`
  return `${day(a)} — ${day(b)} ${month(b)}`
}

/** "26 sep". */
export function shortDateLabel(date: string): string {
  const d = parseDateKey(date)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
