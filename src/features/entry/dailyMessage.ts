import type { DailyMessage } from '../../data/dailyMessages'

/** 1 for January 1st … 365/366, in local time. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0)
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((today - start) / 86_400_000)
}

/**
 * The message for a local date: dayOfYear % library length. If a message was
 * already recorded for that date (and still exists), it wins, so the whole
 * day shows the same text even if the library is edited meanwhile.
 */
export function messageForDate(
  date: Date,
  library: DailyMessage[],
  recorded?: { date: string; id: string },
  dateKeyOf: (d: Date) => string = defaultKey,
): DailyMessage {
  const key = dateKeyOf(date)
  if (recorded && recorded.date === key) {
    const kept = library.find((m) => m.id === recorded.id)
    if (kept) return kept
  }
  return library[dayOfYear(date) % library.length]
}

function defaultKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
