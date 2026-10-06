/**
 * Which entry APRENDER gets each time the section opens.
 *
 *   first entry of the LOCAL date  → 'full'  (the whole ritual)
 *   any later entry that date      → 'brief' (no wait: straight to the composer)
 *
 * The date is the device's local date, never UTC. "Seen" is recorded only when
 * the ritual reaches its functional state (by time or by the person skipping
 * it), so a ritual that was interrupted by closing the app plays again.
 */
export type LearnEntryKind = 'full' | 'brief'

export interface LearnEntryInput {
  /** Local date key of this visit, YYYY-MM-DD. */
  today: string
  /** Local date on which the full ritual was last completed or skipped. */
  lastEntryDate?: string
  /** `?learn=` review override. */
  override?: LearnEntryKind
}

export function decideLearnEntry({ today, lastEntryDate, override }: LearnEntryInput): LearnEntryKind {
  if (override) return override
  return lastEntryDate === today ? 'brief' : 'full'
}

/** `?learn=full` or `?learn=brief`: review modes; they never record anything. */
export function readLearnOverride(search: string): LearnEntryKind | undefined {
  const v = new URLSearchParams(search).get('learn')
  return v === 'full' || v === 'brief' ? v : undefined
}
