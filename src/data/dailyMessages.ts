/**
 * MENSAJE DEL DÍA — editorial library, curated by hand.
 *
 * Local, fixed text: no AI, no network, no dynamic generation, and no link to
 * the current activity. One message per local date, chosen deterministically
 * (see features/entry/dailyMessage.ts). Add or edit entries here; the
 * selection logic does not change.
 *
 * Each line is shown on its own line.
 */
export interface DailyMessage {
  /** Stable id, stored with the date it was shown. Never reuse an id. */
  id: string
  lines: string[]
}

export const dailyMessages: DailyMessage[] = [
  {
    id: 'm01',
    lines: ['Lo importante no siempre necesita más tiempo.', 'A veces necesita menos interferencia.'],
  },
]
