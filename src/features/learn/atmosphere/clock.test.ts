import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThemeClock } from './clock'

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ORIGINAL_TZ = env.TZ
const local = (h: number, m = 0, s = 0) => new Date(2026, 9, 6, h, m, s).getTime()

beforeEach(() => {
  env.TZ = 'America/Mexico_City'
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete env.TZ
  else env.TZ = ORIGINAL_TZ
})

/** A clock that follows the (fake) system time, like the app's does. */
function make() {
  const win = new EventTarget()
  const doc = new EventTarget()
  return { win, doc, clock: createThemeClock({ now: () => Date.now(), win, doc }) }
}

describe('the atmosphere clock', () => {
  it('reads the atmosphere in force from the app clock', () => {
    vi.setSystemTime(local(11, 40))
    expect(make().clock.read()).toBe('learn-day')
    vi.setSystemTime(local(17, 45))
    expect(make().clock.read()).toBe('learn-sunset')
    vi.setSystemTime(local(22, 10))
    expect(make().clock.read()).toBe('learn-night')
  })

  it('16:29:30 → 16:30: it calls the listener once the boundary is crossed, and the atmosphere has changed', () => {
    vi.setSystemTime(local(16, 29, 30))
    const { clock } = make()
    const seen: string[] = []
    clock.subscribe(() => seen.push(clock.read()))
    expect(clock.read()).toBe('learn-day')

    vi.advanceTimersByTime(29_000)
    expect(seen).toEqual([]) // not yet: 16:29:59
    vi.advanceTimersByTime(1_100)
    expect(seen).toEqual(['learn-sunset'])
  })

  it('then it sets itself for the next one: 19:29 → 19:30, and 05:59 → 06:00 the day after', () => {
    vi.setSystemTime(local(19, 29, 50))
    const { clock } = make()
    const seen: string[] = []
    clock.subscribe(() => seen.push(clock.read()))
    vi.advanceTimersByTime(11_000)
    expect(seen).toEqual(['learn-night'])
    // Nothing more until dawn (06:00 next day = 10 h 30 min later).
    vi.advanceTimersByTime(10 * 3600_000 + 29 * 60_000)
    expect(seen).toEqual(['learn-night'])
    vi.advanceTimersByTime(61_000)
    expect(seen).toEqual(['learn-night', 'learn-day'])
  })

  it('a timer that wakes a hair early does not lose the change: it looks again', () => {
    vi.setSystemTime(local(16, 29, 59))
    const { clock } = make()
    const calls = vi.fn()
    clock.subscribe(calls)
    // The wake-up arrives, but the clock still says 16:29:59.9 (an early timer).
    vi.setSystemTime(local(16, 29, 59) + 900)
    vi.advanceTimersByTime(0)
    vi.advanceTimersByTime(1_100) // the margin passes: it is 16:30 now
    expect(clock.read()).toBe('learn-sunset')
    expect(calls).toHaveBeenCalled()
  })

  it('coming back to the app looks again at once (visibility, pageshow, focus, online)', () => {
    vi.setSystemTime(local(16, 20))
    const { clock, win, doc } = make()
    const calls = vi.fn()
    clock.subscribe(calls)
    // The app slept through the boundary: the timer never ran, the time moved.
    vi.setSystemTime(local(16, 45))
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls).toHaveBeenCalledTimes(1)
    expect(clock.read()).toBe('learn-sunset')
    win.dispatchEvent(new Event('pageshow'))
    win.dispatchEvent(new Event('focus'))
    win.dispatchEvent(new Event('online'))
    expect(calls).toHaveBeenCalledTimes(4)
  })

  it('after a wake-up it is armed for the NEXT boundary from the new time, not the old one', () => {
    vi.setSystemTime(local(16, 20))
    const { clock, win } = make()
    const seen: string[] = []
    clock.subscribe(() => seen.push(clock.read()))
    vi.setSystemTime(local(17, 0))
    win.dispatchEvent(new Event('focus')) // sunset now; next change 19:30
    seen.length = 0
    vi.advanceTimersByTime(2 * 3600_000 + 29 * 60_000)
    expect(seen).toEqual([])
    vi.advanceTimersByTime(61_000)
    expect(seen).toEqual(['learn-night'])
  })

  it('costs nothing while nobody listens: no timer, no listeners; unsubscribing stops everything', () => {
    vi.setSystemTime(local(16, 29, 30))
    const { clock, win, doc } = make()
    expect(vi.getTimerCount()).toBe(0)
    const calls = vi.fn()
    const off = clock.subscribe(calls)
    expect(vi.getTimerCount()).toBe(1)
    off()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(120_000)
    win.dispatchEvent(new Event('focus'))
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls).not.toHaveBeenCalled()
  })

  it('several listeners share one timer', () => {
    vi.setSystemTime(local(16, 29, 30))
    const { clock } = make()
    const a = vi.fn()
    const b = vi.fn()
    const offA = clock.subscribe(a)
    clock.subscribe(b)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(31_000)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    expect(vi.getTimerCount()).toBe(1) // b is still listening
  })

  it('the clock can be moved (?t= / ?date=): it is whatever `now` says, not the system time', () => {
    vi.setSystemTime(local(3, 0)) // the real clock says 03:00…
    const offset = local(16, 29, 50) - Date.now() // …and the app's, moved like `?t=16:29`, says 16:29:50
    const clock = createThemeClock({ now: () => Date.now() + offset })
    const seen: string[] = []
    clock.subscribe(() => seen.push(clock.read()))
    expect(clock.read()).toBe('learn-day')
    vi.advanceTimersByTime(11_000)
    expect(seen).toEqual(['learn-sunset'])
  })
})
