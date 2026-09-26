import { SIMULATED } from '../../state/clock'

/**
 * Entry memory, kept apart from the day state: it spans days. A simulated
 * session (`?date=` / `?t=`) uses its own copy, so reviewing another day never
 * marks the real day's entry as seen.
 */
export const entryStorageKey = (simulated = SIMULATED) => (simulated ? 'personal-os:sim:entry' : 'personal-os:entry')
const KEY = entryStorageKey()

export interface EntryMemory {
  /** Local date on which ENTRAR was pressed in the full daily entry. */
  dailyEntrySeenDate?: string
  /** Message shown on a given date (kept stable for the whole day). */
  dailyMessage?: { date: string; id: string }
  /** Last moment the app was in use, real time (ms). */
  lastActiveAt?: number
  /** Local date on which DAYSCAPE was first touched: its hint does not return that day. */
  dayscapeHintDate?: string
}

export function loadEntryMemory(): EntryMemory {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as EntryMemory) : {}
  } catch {
    return {}
  }
}

export function saveEntryMemory(patch: Partial<EntryMemory>): void {
  try {
    const next = { ...loadEntryMemory(), ...patch }
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: entries simply behave as a first open.
  }
}
