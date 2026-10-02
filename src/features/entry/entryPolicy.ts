/**
 * Which entry a new session gets.
 *
 *   first real open of the local day        → 'full'  (DAILY ENTRY)
 *   same day, back after ≥ 30 min away      → 'micro' (MICRO ENTRY)
 *   same day, back after < 30 min           → 'none'  (straight to HOY)
 *
 * Decided once per page load. Tab switches, screen lock, visibilitychange or a
 * short trip to another app never re-trigger it; a day change while the app
 * stays open waits for the next real open.
 */
export type EntryKind = 'full' | 'micro' | 'none'

export const MICRO_ENTRY_AFTER_MS = 30 * 60_000

export interface EntryInput {
  /** Local date key of this session, YYYY-MM-DD. */
  today: string
  /** Date on which ENTRAR was last pressed in a full entry. */
  seenDate?: string
  /** Last moment the app was in use (ms). */
  lastActiveAt?: number
  now: number
  /** `?entry=` testing override. */
  override?: EntryKind
  /** A Focus session is running: never interrupt it. */
  focusActive?: boolean
}

export function decideEntry({ today, seenDate, lastActiveAt, now, override, focusActive }: EntryInput): EntryKind {
  if (override) return override
  if (focusActive) return 'none'
  if (seenDate !== today) return 'full'
  if (lastActiveAt === undefined) return 'micro'
  return now - lastActiveAt >= MICRO_ENTRY_AFTER_MS ? 'micro' : 'none'
}

export function readEntryOverride(search: string): EntryKind | undefined {
  const v = new URLSearchParams(search).get('entry')
  return v === 'full' || v === 'micro' || v === 'none' ? v : undefined
}

export interface FieldMode {
  /** Keep the DAY FIELD alive and open to inspection; no automatic exit. */
  hold: boolean
  /** Run the whole entry faster. */
  fast: boolean
  /** Short message and field: go straight to settling, dematerialization, particles and HOY. */
  collapse: boolean
}

/** `?field=hold`, `fast`, `collapse` (combinable: `?field=fast,hold`): review modes for the DAY FIELD. */
export function readFieldMode(search: string): FieldMode {
  const flags = (new URLSearchParams(search).get('field') ?? '').split(',').map((v) => v.trim())
  return { hold: flags.includes('hold'), fast: flags.includes('fast'), collapse: flags.includes('collapse') }
}
