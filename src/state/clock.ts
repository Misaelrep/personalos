import { useEffect, useState } from 'react'

/**
 * App clock: the browser's LOCAL date and time (its own time zone, never UTC).
 * For review only, two optional URL params move it:
 *   `?t=HH:MM`           that time of day, today;
 *   `?date=YYYY-MM-DD`   that date, at the current time of day;
 *   both together        that exact moment (e.g. `?date=2026-09-28&t=10:30`).
 * The clock keeps ticking from there. Without them it is the real clock.
 */
function readParams(search: string) {
  const params = new URLSearchParams(search)
  return {
    t: params.get('t')?.match(/^(\d{1,2}):(\d{2})$/),
    date: params.get('date')?.match(/^(\d{4})-(\d{2})-(\d{2})$/),
  }
}

/** A review session: the clock is simulated and persistence is kept apart (see storage). */
export function isSimulation(search: string): boolean {
  const { t, date } = readParams(search)
  return Boolean(t || date)
}

export function readOffset(search: string, realNow: number): number {
  const { t, date } = readParams(search)
  if (!t && !date) return 0
  const target = new Date(realNow)
  if (date) {
    const [y, m, d] = [Number(date[1]), Number(date[2]) - 1, Number(date[3])]
    const probe = new Date(y, m, d)
    // Reject impossible dates (2026-02-31) instead of silently rolling them over.
    if (probe.getFullYear() !== y || probe.getMonth() !== m || probe.getDate() !== d) return 0
    target.setFullYear(y, m, d)
  }
  if (t) target.setHours(Number(t[1]), Number(t[2]), 0, 0)
  return target.getTime() - realNow
}

const OFFSET = typeof window === 'undefined' ? 0 : readOffset(window.location.search, Date.now())
export const SIMULATED = typeof window !== 'undefined' && isSimulation(window.location.search)

export function nowMs(): number {
  return Date.now() + OFFSET
}

/** Re-renders every `intervalMs`, aligned to the interval boundary. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date(nowMs()))
  useEffect(() => {
    let timer: number
    const tick = () => {
      const t = nowMs()
      setNow(new Date(t))
      timer = window.setTimeout(tick, intervalMs - (t % intervalMs))
    }
    timer = window.setTimeout(tick, intervalMs - (nowMs() % intervalMs))
    return () => window.clearTimeout(timer)
  }, [intervalMs])
  return now
}
