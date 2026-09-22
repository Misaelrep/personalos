import type { DayState } from '../domain/types'
import { emptyDay } from './dayReducer'

/**
 * The day's state lives in localStorage under its date, so a reload keeps
 * the morning's decisions and the next day starts clean. No backend.
 */
const PREFIX = 'personal-os:day:'

export function loadDay(date: string): DayState {
  try {
    const raw = window.localStorage.getItem(PREFIX + date)
    if (raw) {
      const parsed = JSON.parse(raw) as DayState
      if (parsed && parsed.date === date && typeof parsed.records === 'object') return parsed
    }
  } catch {
    // Storage unavailable (private mode, blocked): start empty.
  }
  return emptyDay(date)
}

export function saveDay(state: DayState): void {
  try {
    window.localStorage.setItem(PREFIX + state.date, JSON.stringify(state))
  } catch {
    // Ignore: the session still works in memory.
  }
}
