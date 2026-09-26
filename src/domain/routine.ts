import { toMinutes } from './time'
import type { DayRoutine, RoutineBlock, Weekday } from './types'

/**
 * WEEKLY ROUTINE → DAY RESOLVER → the concrete routine of one date.
 *
 * The weekly routine is pure configuration (src/data/routine). A date resolves
 * to its weekday's routine plus what applies to that date only: rotations
 * (e.g. Sunday's deep block) and overrides (e.g. the monthly Thursday without
 * gym). There is no fallback: a missing day is an error, never another day.
 */
export type WeeklyRoutine = Partial<Record<Weekday, DayRoutine>>

/** A one-off change to a date's routine. */
export interface DayOverride {
  remove?: string[]
  patch?: Record<string, Partial<RoutineBlock>>
  add?: RoutineBlock[]
}

export interface RotationVariant {
  key: string
  patch: Partial<RoutineBlock>
}

/** A block whose content alternates week by week through its variants (A, B, …). */
export interface Rotation {
  id: string
  blockId: string
  variants: RotationVariant[]
}

export interface ResolveConfig {
  /** Each rotation with the date on which its first variant happens (null: not decided). */
  rotations: { rotation: Rotation; anchor: string | null }[]
  overrides: (date: string) => { source: string; override: DayOverride }[]
}

export type ResolutionNote =
  | { kind: 'rotation'; rotation: string; variant: string }
  | { kind: 'rotation-unresolved'; rotation: string; blockId: string }
  | { kind: 'override'; source: string }

export interface ResolvedDay {
  date: string
  routine: DayRoutine
  notes: ResolutionNote[]
}

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export class RoutineMissingError extends Error {
  readonly weekday: Weekday
  readonly date: string
  constructor(weekday: Weekday, date: string) {
    super(`[PERSONAL OS] No hay rutina para ${DAY_KEYS[weekday]} (${date}). Defínela en src/data/routine y regístrala en WEEKLY_ROUTINE.`)
    this.name = 'RoutineMissingError'
    this.weekday = weekday
    this.date = date
  }
}

/** Local date from "YYYY-MM-DD" (no UTC shift). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const weekdayOf = (key: string) => parseDateKey(key).getDay() as Weekday

const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS)

/** "2026-09-28", 1 → "2026-09-29" (local calendar, DST-safe). */
export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Which variant of a rotation applies on `date`, or null when the anchor is not decided. */
export function rotationVariant(rotation: Rotation, anchor: string | null, date: string): RotationVariant | null {
  if (!anchor) return null
  const n = rotation.variants.length
  // Negative before the anchor; the double modulo keeps the alternation going backwards.
  const weeksSinceAnchor = Math.floor(daysBetween(anchor, date) / 7)
  return rotation.variants[((weeksSinceAnchor % n) + n) % n]
}

const byStart = (a: RoutineBlock, b: RoutineBlock) => toMinutes(a.start) - toMinutes(b.start)

export function resolveDay(weekly: WeeklyRoutine, date: string, config: ResolveConfig): ResolvedDay {
  const weekday = weekdayOf(date)
  const base = weekly[weekday]
  if (!base || base.blocks.length === 0) throw new RoutineMissingError(weekday, date)

  let blocks = base.blocks.map((b) => ({ ...b }))
  const notes: ResolutionNote[] = []

  for (const { rotation, anchor } of config.rotations) {
    const i = blocks.findIndex((b) => b.id === rotation.blockId)
    if (i === -1) continue
    const variant = rotationVariant(rotation, anchor, date)
    if (!variant) {
      notes.push({ kind: 'rotation-unresolved', rotation: rotation.id, blockId: rotation.blockId })
      continue
    }
    blocks[i] = { ...blocks[i], ...variant.patch, metadata: { ...blocks[i].metadata, rotation: rotation.id, variant: variant.key } }
    notes.push({ kind: 'rotation', rotation: rotation.id, variant: variant.key })
  }

  for (const { source, override } of config.overrides(date)) {
    if (override.remove) blocks = blocks.filter((b) => !override.remove!.includes(b.id))
    if (override.patch) blocks = blocks.map((b) => (override.patch![b.id] ? { ...b, ...override.patch![b.id] } : b))
    if (override.add) blocks = [...blocks, ...override.add]
    notes.push({ kind: 'override', source })
  }

  return { date, routine: { ...base, blocks: blocks.sort(byStart) }, notes }
}

/* ------------------------------------------------------------------------ */
/* Validation                                                                */
/* ------------------------------------------------------------------------ */

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const ID = /^(sun|mon|tue|wed|thu|fri|sat)-[a-z0-9]+(?:-[a-z0-9]+)*-(\d{4})$/
const NEVER_COUNTS = new Set(['transition', 'recovery', 'free', 'sleep'])
const MAY_FOCUS = new Set(['deep_work', 'creative_practice'])

/** Everything that would make a view read the routine differently. Empty = consistent. */
export function validateWeek(weekly: WeeklyRoutine): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  for (let d = 0 as Weekday; d <= 6; d = (d + 1) as Weekday) {
    const day = weekly[d]
    const key = DAY_KEYS[d]
    if (!day) {
      issues.push(`${key}: missing day`)
      continue
    }
    if (day.weekday !== d) issues.push(`${key}: weekday field is ${day.weekday}`)
    if (!day.blocks.length) issues.push(`${key}: no blocks`)
    const sleeps = day.blocks.filter((b) => b.category === 'sleep')
    if (sleeps.length !== 1 || day.blocks[day.blocks.length - 1]?.category !== 'sleep') issues.push(`${key}: needs exactly one sleep block, last`)
    day.blocks.forEach((b, i) => {
      const m = ID.exec(b.id)
      if (!m) issues.push(`${b.id}: id must be <day>-<slug>-<HHMM>`)
      else {
        if (!b.id.startsWith(`${key}-`)) issues.push(`${b.id}: belongs to ${key}`)
        if (m[2] !== b.start.replace(':', '')) issues.push(`${b.id}: id time ≠ start ${b.start}`)
      }
      if (seen.has(b.id)) issues.push(`${b.id}: duplicated id`)
      seen.add(b.id)
      if (!CLOCK.test(b.start) || (b.end && !CLOCK.test(b.end))) issues.push(`${b.id}: invalid time`)
      if (b.end && toMinutes(b.end) <= toMinutes(b.start)) issues.push(`${b.id}: ends before it starts`)
      const next = day.blocks[i + 1]
      if (next) {
        if (toMinutes(next.start) <= toMinutes(b.start)) issues.push(`${b.id}: blocks out of order`)
        if (b.end && toMinutes(b.end) > toMinutes(next.start)) issues.push(`${b.id}: overlaps ${next.id}`)
      }
      if (b.focusEligible && !MAY_FOCUS.has(b.category)) issues.push(`${b.id}: Focus on a ${b.category} block`)
      if (b.countsForProgress && NEVER_COUNTS.has(b.category)) issues.push(`${b.id}: ${b.category} never counts for progress`)
    })
    if (day.meditation) {
      const ids = new Set(day.blocks.map((b) => b.id))
      if (!ids.has(day.meditation.blockId)) issues.push(`${key}: meditation ${day.meditation.blockId} not found`)
      if (day.meditation.rescueBlockId && !ids.has(day.meditation.rescueBlockId)) issues.push(`${key}: rescue ${day.meditation.rescueBlockId} not found`)
    }
  }
  return issues
}
