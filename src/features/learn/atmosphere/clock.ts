import { nowMs } from '../../../state/clock'
import { nextChangeAfter, themeIdAt, type LearnThemeId } from './schedule'

/** The timer fires at least this long after the boundary, so it never wakes a hair before it. */
const MARGIN_MS = 25

export interface ThemeClockEnv {
  /** The app clock: local time, with `?t=` / `?date=` already applied. */
  now: () => number
  /** Where `pageshow`, `focus` and `online` are heard. */
  win?: EventTarget
  /** Where `visibilitychange` is heard. */
  doc?: EventTarget
}

export interface ThemeClock {
  /** The atmosphere in force now. */
  read: () => LearnThemeId
  /** Calls `listener` whenever the atmosphere may have changed. While nobody listens, nothing runs. */
  subscribe: (listener: () => void) => () => void
}

/**
 * One timer, set for the next boundary (06:00, 16:30, 19:30 local) — not a poll.
 * The atmosphere is always *derived* from the clock (`read`), never stored, so a
 * wake-up that is early, late or missed cannot leave it wrong; the listeners
 * only learn that it is time to look.
 *
 * A timer sleeps while the app is in the background, and the clock or the
 * time zone can change under it: coming back (visibility, pageshow, focus,
 * online) looks again and sets the timer anew.
 */
export function createThemeClock(env: ThemeClockEnv): ThemeClock {
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const events: [EventTarget, string][] = []
  if (env.doc) events.push([env.doc, 'visibilitychange'])
  if (env.win) events.push([env.win, 'pageshow'], [env.win, 'focus'], [env.win, 'online'])

  const read = () => themeIdAt(new Date(env.now()))
  const emit = () => listeners.forEach((l) => l())

  const arm = () => {
    clearTimeout(timer)
    const now = env.now()
    timer = setTimeout(() => {
      emit()
      arm()
    }, nextChangeAfter(new Date(now)).getTime() - now + MARGIN_MS)
  }
  const recheck = () => {
    arm()
    emit()
  }

  return {
    read,
    subscribe(listener) {
      if (listeners.size === 0) {
        arm()
        for (const [target, type] of events) target.addEventListener(type, recheck)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        clearTimeout(timer)
        for (const [target, type] of events) target.removeEventListener(type, recheck)
      }
    },
  }
}

/** APRENDER's clock: the app's own (`nowMs`), so `?t=` and `?date=` move it like everything else. */
export const learnThemeClock = createThemeClock({
  now: nowMs,
  win: typeof window === 'undefined' ? undefined : window,
  doc: typeof document === 'undefined' ? undefined : document,
})
