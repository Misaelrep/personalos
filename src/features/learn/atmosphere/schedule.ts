/**
 * WHICH ATMOSPHERE, WHEN — APRENDER changes light with the hour.
 *
 * The hour is the person's LOCAL one (never UTC) and comes from the app clock
 * (`nowMs`, which honors `?t=` and `?date=` for review). This file knows
 * nothing of colors: it only maps a moment to an atmosphere id.
 *
 *   06:00 – 16:29   learn-day      clarity, openness
 *   16:30 – 19:29   learn-sunset   the light descends
 *   19:30 – 05:59   learn-night    depth, with a warm light inside it
 */
export type LearnThemeId = 'learn-day' | 'learn-sunset' | 'learn-night'

interface Slot {
  id: LearnThemeId
  /** Local minutes after midnight at which it begins. */
  from: number
}

/** In order of `from`. The first slot (midnight) is the night that wraps over from the evening. */
export const SCHEDULE: readonly Slot[] = [
  { id: 'learn-night', from: 0 },
  { id: 'learn-day', from: 6 * 60 },
  { id: 'learn-sunset', from: 16 * 60 + 30 },
  { id: 'learn-night', from: 19 * 60 + 30 },
]

/** Local clock time, in minutes after midnight. */
export function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}

/** The atmosphere in force at `at`. */
export function themeIdAt(at: Date): LearnThemeId {
  const minute = minutesOfDay(at)
  let current = SCHEDULE[0].id
  for (const slot of SCHEDULE) if (slot.from <= minute) current = slot.id
  return current
}

/**
 * The next moment (strictly after `at`) at which the atmosphere is a different one.
 * Built from local calendar fields, so a day that is 23 or 25 hours long (daylight
 * saving) still lands on 06:00 / 16:30 / 19:30 of the wall clock.
 */
export function nextChangeAfter(at: Date): Date {
  let best: Date | null = null
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const [i, slot] of SCHEDULE.entries()) {
      // A slot that begins with the same atmosphere as the one before it (midnight, night → night) changes nothing.
      if (SCHEDULE[(i + SCHEDULE.length - 1) % SCHEDULE.length].id === slot.id) continue
      const moment = new Date(at.getFullYear(), at.getMonth(), at.getDate() + dayOffset, Math.floor(slot.from / 60), slot.from % 60, 0, 0)
      if (moment.getTime() > at.getTime() && (best === null || moment.getTime() < best.getTime())) best = moment
    }
  }
  // Two days always contain a boundary; this only satisfies the type.
  return best ?? new Date(at.getTime() + 24 * 60 * 60 * 1000)
}
