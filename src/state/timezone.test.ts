import { afterAll, describe, expect, it } from 'vitest'
import { routineForDate } from '../data/routine'
import { shiftDateKey, weekdayOf } from '../domain/routine'
import { buildDayView } from '../domain/schedule'
import { dateKey, minutesOfDay } from '../domain/time'
import { emptyDay } from './dayReducer'
import { readOffset } from './clock'

/**
 * The app decides the active date, weekday, AHORA, day change, daily storage
 * and the daily entry from the browser's LOCAL time — never from UTC.
 *
 * These tests run the production path (`dateKey`, `minutesOfDay`,
 * `routineForDate`, `buildDayView`, as DayProvider does) under real non-UTC
 * time zones, at instants near midnight where the UTC date and the local date
 * differ. Node honours `process.env.TZ` changes at runtime; each test checks
 * the zone really took effect, so it can never pass vacuously in a UTC runner.
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ORIGINAL_TZ = env.TZ
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete env.TZ
  else env.TZ = ORIGINAL_TZ
})

/** What DayProvider derives from `now`. */
function appDay(now: Date) {
  const date = dateKey(now)
  const minute = Math.floor(minutesOfDay(now))
  const view = buildDayView(routineForDate(date).routine, emptyDay(date), minute, {
    yesterday: routineForDate(shiftDateKey(date, -1)).routine,
    tomorrow: routineForDate(shiftDateKey(date, 1)).routine,
  })
  return { date, weekday: weekdayOf(date), minute, view }
}

describe('local time, not UTC', () => {
  it('UTC−6 (America/Mexico_City), Sunday 21:30 local = Monday 03:30 UTC → Sunday', () => {
    env.TZ = 'America/Mexico_City'
    const now = new Date(Date.UTC(2026, 8, 28, 3, 30)) // 2026-09-28T03:30Z
    expect(now.getTimezoneOffset()).toBe(360) // the zone is really active

    expect(now.toISOString().slice(0, 10)).toBe('2026-09-28') // the UTC date: wrong for the user
    const day = appDay(now)
    expect(day.date).toBe('2026-09-27')
    expect(day.weekday).toBe(0)
    expect(day.minute).toBe(21 * 60 + 30)
    expect(day.view.routine.dayName).toBe('Domingo')
    expect(day.view.current.id).toBe('sun-reading-2100')
  })

  it('UTC+9 (Asia/Tokyo), Monday 01:30 local = Sunday 16:30 UTC → Monday, still in Sunday night’s sleep', () => {
    env.TZ = 'Asia/Tokyo'
    const now = new Date(Date.UTC(2026, 8, 27, 16, 30)) // 2026-09-27T16:30Z
    expect(now.getTimezoneOffset()).toBe(-540)

    expect(now.toISOString().slice(0, 10)).toBe('2026-09-27')
    const day = appDay(now)
    expect(day.date).toBe('2026-09-28')
    expect(day.weekday).toBe(1)
    expect(day.view.current).toMatchObject({ id: 'sun-sleep-2200', category: 'sleep' })
    expect(day.view.next?.id).toBe('mon-meditation-0600')
  })

  it('the day changes at LOCAL midnight (UTC−6: 23:59 Sunday → 00:00 Monday, at 05:59/06:00 UTC)', () => {
    env.TZ = 'America/Mexico_City'
    const before = new Date(Date.UTC(2026, 8, 28, 5, 59))
    const after = new Date(Date.UTC(2026, 8, 28, 6, 0))
    expect([dateKey(before), dateKey(after)]).toEqual(['2026-09-27', '2026-09-28'])
  })

  it('?date=&t= is read as a LOCAL moment too', () => {
    env.TZ = 'America/Mexico_City'
    const real = Date.UTC(2026, 8, 26, 12, 0)
    const simulated = new Date(real + readOffset('?date=2026-09-27&t=23:50', real))
    expect(simulated.toISOString().slice(0, 10)).toBe('2026-09-28') // 05:50Z
    expect([dateKey(simulated), simulated.getHours(), simulated.getMinutes()]).toEqual(['2026-09-27', 23, 50])
  })
})
