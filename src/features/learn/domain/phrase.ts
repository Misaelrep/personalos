/**
 * PHRASE OF THE DAY — local, fixed text: no network, no AI.
 * One local date = one phrase, stable for the whole day.
 */
export interface Phrase {
  /** Stable id. Never reuse one. */
  id: string
  quote: string
  /** Shown only when there is a verified author; `null` shows nothing. */
  author: string | null
  /** DEVELOPMENT SEED: placeholder text to exercise the mechanism, never an editorial quote. */
  seed?: true
}

const MS_PER_DAY = 86_400_000

/**
 * Whole days from a calendar date key (YYYY-MM-DD). Built from the key's own
 * year, month and day — never from a timestamp — so the result cannot depend
 * on the time zone the code runs in.
 */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

/**
 * The phrase for a local date: day number % library length. If a phrase was
 * already recorded for that date (and still exists) it wins, so the whole day
 * shows the same text even if the library is edited meanwhile.
 */
export function phraseForDate(dateKey: string, library: Phrase[], recorded?: { date: string; id: string }): Phrase {
  if (library.length === 0) throw new Error('[ELYUM] The phrase library is empty.')
  if (recorded && recorded.date === dateKey) {
    const kept = library.find((p) => p.id === recorded.id)
    if (kept) return kept
  }
  const n = library.length
  return library[((dayNumber(dateKey) % n) + n) % n]
}
