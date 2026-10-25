import { afterAll, describe, expect, it } from 'vitest'
import { SCHEDULE, minutesOfDay, nextChangeAfter, themeIdAt } from './schedule'

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ORIGINAL_TZ = env.TZ
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete env.TZ
  else env.TZ = ORIGINAL_TZ
})

/** A local wall-clock moment on 2026-10-06. */
const at = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 9, 6, h, m, s, ms)

describe('themeIdAt — the boundaries, to the minute', () => {
  it('DÍA is 06:00–16:29', () => {
    expect(themeIdAt(at(6, 0))).toBe('learn-day')
    expect(themeIdAt(at(11, 40))).toBe('learn-day')
    expect(themeIdAt(at(16, 29))).toBe('learn-day')
    expect(themeIdAt(at(16, 29, 59, 999))).toBe('learn-day')
  })

  it('ATARDECER is 16:30–19:29', () => {
    expect(themeIdAt(at(16, 30))).toBe('learn-sunset')
    expect(themeIdAt(at(18, 0))).toBe('learn-sunset')
    expect(themeIdAt(at(19, 29))).toBe('learn-sunset')
    expect(themeIdAt(at(19, 29, 59, 999))).toBe('learn-sunset')
  })

  it('NOCHE is 19:30–05:59, over midnight', () => {
    expect(themeIdAt(at(19, 30))).toBe('learn-night')
    expect(themeIdAt(at(23, 59))).toBe('learn-night')
    expect(themeIdAt(at(0, 0))).toBe('learn-night')
    expect(themeIdAt(at(3, 15))).toBe('learn-night')
    expect(themeIdAt(at(5, 59))).toBe('learn-night')
    expect(themeIdAt(at(5, 59, 59, 999))).toBe('learn-night')
  })

  it('every minute of the day belongs to exactly one atmosphere, in the three stretches given', () => {
    const counts = { 'learn-day': 0, 'learn-sunset': 0, 'learn-night': 0 }
    for (let minute = 0; minute < 24 * 60; minute++) counts[themeIdAt(at(Math.floor(minute / 60), minute % 60))]++
    expect(counts).toEqual({ 'learn-day': 10 * 60 + 30, 'learn-sunset': 3 * 60, 'learn-night': 10 * 60 + 30 })
  })

  it('the table is ordered, starts at midnight and only holds real minutes', () => {
    expect(SCHEDULE[0].from).toBe(0)
    for (let i = 1; i < SCHEDULE.length; i++) expect(SCHEDULE[i].from).toBeGreaterThan(SCHEDULE[i - 1].from)
    for (const slot of SCHEDULE) expect(slot.from).toBeLessThan(24 * 60)
  })
})

describe('themeIdAt — LOCAL time, never UTC', () => {
  // 2026-10-06 01:30 UTC: 19:30 on the 5th in Mexico City (night) and 10:30 on the 6th in Tokyo (day).
  const INSTANT = Date.UTC(2026, 9, 6, 1, 30)

  it('Mexico City: that instant is 19:30 — exactly when the night begins', () => {
    env.TZ = 'America/Mexico_City'
    expect(new Date(INSTANT).getHours()).toBe(19)
    expect(minutesOfDay(new Date(INSTANT))).toBe(19 * 60 + 30)
    expect(themeIdAt(new Date(INSTANT))).toBe('learn-night')
  })

  it('Tokyo: the same instant is 10:30, day', () => {
    env.TZ = 'Asia/Tokyo'
    expect(new Date(INSTANT).getHours()).toBe(10)
    expect(themeIdAt(new Date(INSTANT))).toBe('learn-day')
  })

  it('a UTC afternoon is not an afternoon everywhere', () => {
    const noonUtc = Date.UTC(2026, 9, 6, 12, 0)
    env.TZ = 'America/Mexico_City' // 06:00 — the day has just begun
    expect(themeIdAt(new Date(noonUtc))).toBe('learn-day')
    env.TZ = 'America/Los_Angeles' // 05:00 — still night
    expect(themeIdAt(new Date(noonUtc))).toBe('learn-night')
    env.TZ = 'Asia/Kolkata' // 17:30 — sunset
    expect(themeIdAt(new Date(noonUtc))).toBe('learn-sunset')
  })
})

describe('nextChangeAfter — the moment the timer is set for', () => {
  const next = (h: number, m = 0, s = 0, ms = 0) => nextChangeAfter(at(h, m, s, ms))

  it('from the night before dawn: 06:00 today', () => {
    expect(next(3, 0)).toEqual(at(6, 0))
    expect(next(5, 59, 59, 999)).toEqual(at(6, 0))
  })

  it('16:29 → 16:30 and 19:29 → 19:30', () => {
    expect(next(16, 29)).toEqual(at(16, 30))
    expect(next(16, 29, 59, 999)).toEqual(at(16, 30))
    expect(next(19, 29)).toEqual(at(19, 30))
  })

  it('is strictly after: standing on a boundary looks to the next one', () => {
    expect(next(6, 0)).toEqual(at(16, 30))
    expect(next(16, 30)).toEqual(at(19, 30))
    expect(next(19, 30)).toEqual(new Date(2026, 9, 7, 6, 0))
  })

  it('from the late night: tomorrow 06:00 — midnight changes nothing', () => {
    expect(next(23, 59)).toEqual(new Date(2026, 9, 7, 6, 0))
    expect(next(0, 0)).toEqual(at(6, 0))
  })

  it('always points at a moment where the atmosphere really is a different one', () => {
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const from = at(Math.floor(minute / 60), minute % 60, 13)
      const change = nextChangeAfter(from)
      expect(change.getTime()).toBeGreaterThan(from.getTime())
      expect(themeIdAt(change)).not.toBe(themeIdAt(from))
      expect(themeIdAt(new Date(change.getTime() - 1))).toBe(themeIdAt(from))
    }
  })

  it('month and year ends', () => {
    expect(nextChangeAfter(new Date(2026, 11, 31, 22, 0))).toEqual(new Date(2027, 0, 1, 6, 0))
    expect(nextChangeAfter(new Date(2028, 1, 28, 20, 0))).toEqual(new Date(2028, 1, 29, 6, 0)) // leap day
  })

  it('daylight saving: the wall clock decides, not 24 hours', () => {
    env.TZ = 'America/New_York'
    // 2026-03-08: clocks go forward at 02:00 (a 23-hour day). 01:30 → dawn is 06:00 local, 3.5 h of real time later.
    const before = new Date(2026, 2, 8, 1, 30)
    const dawn = nextChangeAfter(before)
    expect([dawn.getDate(), dawn.getHours(), dawn.getMinutes()]).toEqual([8, 6, 0])
    expect(dawn.getTime() - before.getTime()).toBe(4.5 * 3600 * 1000 - 3600 * 1000)
    // 2026-11-01: clocks go back at 02:00 (a 25-hour day). 19:30 on the 1st → dawn of the 2nd.
    const evening = new Date(2026, 10, 1, 19, 30)
    const next = nextChangeAfter(evening)
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([2, 6, 0])
  })
})
