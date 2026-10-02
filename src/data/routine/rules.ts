import type { ClockTime, ProjectId, Weekday } from '../../domain/types'

/**
 * Global rules of the week. Informative for now: PERSONAL OS does not block
 * anything on the device. Kept as data so SEMANA / SISTEMA can use them later.
 */
export const ROUTINE_RULES = {
  /** Target sleep. */
  sleep: { from: '22:00', to: '06:00' } as { from: ClockTime; to: ClockTime },
  /** No WhatsApp, email, social, news or reactive input in the morning. */
  noInputs: {
    from: '06:00',
    to: '12:00',
    blocked: ['WhatsApp', 'Email', 'Redes', 'Noticias', 'Estímulo reactivo'],
    /** Sunday: email 08:30–09:30 (block `sun-email-0830`). */
    exceptions: [{ weekday: 0 as Weekday, from: '08:30', to: '09:30', what: 'Email' }],
  },
  /**
   * Breathwork energizante · 08:25 (3 min) when the day's routine schedules it —
   * not a daily obligation. Not on Friday (08:00–10:00 Páginas Web is one
   * continuous block) nor Saturday (its morning sequence is already set).
   * The routine files are the truth; a test keeps this list in step with them.
   */
  breathworkEnergizing: { at: '08:25' as ClockTime, minutes: 3, scheduledDays: [0, 1, 2, 3, 4] as Weekday[] },
  /** Screens off, generally. */
  screensOff: '20:50' as ClockTime,
  /** Preferred length of a deep block. */
  deepBlockMinutes: 120,
  /** Days Substack is published (Friday: worked on, never published). */
  substackPublishDays: [1, 2, 3, 6] as Weekday[],
  /** Days with a gym block (Thursday: except one a month — see config.ts). */
  gymDays: [0, 1, 2, 3, 4, 5] as Weekday[],
  /** Projects that are deep work when they appear. */
  deepProjects: ['web', 'wellness', 'newsletter', 'touchdesigner'] as ProjectId[],
} as const
