import type { Activity } from './model'

/**
 * DAYSCAPE choreography — every moment of the approved storyboard, in one
 * place. Seconds from the start of DAYSCAPE unless noted.
 */

/** Seconds an activity takes to form: form → Astral Fade → core. */
export const FORM_S = 1.2

/**
 * A temporary name: it appears after its form, stays readable ~1.5–2 s and
 * dissolves in place. Waves overlap: the first names are dissolving while the
 * last ones appear, so the whole day is never labelled at once.
 */
export const NAME = {
  /** After the activity starts forming. */
  after: 0.45,
  fadeIn: 0.4,
  hold: 1.5,
  fadeOut: 0.8,
  /** The time line follows the name. */
  timeLag: 0.15,
} as const
export const NAME_S = NAME.fadeIn + NAME.hold + NAME.fadeOut

/** AHORA keeps its name: it appears this long after the present starts forming, and stays. */
export const NOW_LABEL_AFTER = 0.5

/** When a temporary name starts to appear. */
export const nameAt = (a: Pick<Activity, 'revealAt'>) => a.revealAt + NAME.after

/** How present a temporary name is at time `t` (0–1). */
export function nameOpacity(a: Pick<Activity, 'revealAt' | 'side'>, t: number): number {
  if (a.side === 'current') return 0
  const s = t - nameAt(a)
  if (s <= 0 || s >= NAME_S) return 0
  if (s < NAME.fadeIn) return s / NAME.fadeIn
  if (s < NAME.fadeIn + NAME.hold) return 1
  return 1 - (s - NAME.fadeIn - NAME.hold) / NAME.fadeOut
}

/** The field is clean (only AHORA named) once everything has formed and the last temporary name is gone. */
export function cleanAt(activities: Pick<Activity, 'revealAt' | 'side'>[]): number {
  const names = activities.filter((a) => a.side !== 'current').map((a) => nameAt(a) + NAME_S)
  const present = activities.filter((a) => a.side === 'current').map((a) => a.revealAt + FORM_S + NOW_LABEL_AFTER + 0.6)
  return Math.max(0, ...names, ...present)
}

/** CONTINUAR → appears, quietly, this long after DAYSCAPE began (full day). */
export const CONTINUE_AT = 14

/** CONTINUAR follows the day: ~14 s for a full day, sooner for a light one, never before the field is clean. */
export function continueAt(activities: Pick<Activity, 'revealAt' | 'side'>[]): number {
  return Math.max(cleanAt(activities) + 0.5, CONTINUE_AT * Math.min(1, Math.max(0.3, activities.length / 18)))
}

/** The exploration hint appears once the field is clean and fades on its own after a while. */
export const HINT = { after: 0.3, stay: 6 } as const

/* ------------------------------------------------------------------------ */
/* Polymorphic life while exploring                                          */
/* ------------------------------------------------------------------------ */

export interface MorphEvent {
  /** Seconds after the field became clean. */
  at: number
  /** Seconds the morph takes. */
  duration: number
  /** A secondary activity picked by its place along the day (0 = earliest eligible, 1 = latest). */
  target: number
}

const TARGETS = [0.72, 0.22, 0.92, 0.45, 0.1, 0.6, 0.35, 0.82]
const MORPH_EVERY = 5.2
const MORPH_S = 2.4

/** One slow morph at a time, in a different zone of the day each time; the present stays stable. */
export function exploreMorphs(until: number): MorphEvent[] {
  const plan: MorphEvent[] = []
  for (let i = 0, at = 0.6; at < until; i++, at += MORPH_EVERY + ((i * 7) % 5) * 0.2)
    plan.push({ at, duration: MORPH_S, target: TARGETS[i % TARGETS.length] })
  return plan
}

/* ------------------------------------------------------------------------ */
/* Exit: FORMS → FRAGMENTS → PARTICLE FIELD → CONVERGENCE → HOY               */
/* ------------------------------------------------------------------------ */

/**
 * Milliseconds from CONTINUAR. Every step must read as progress, never as a
 * near-identical variation of the previous frame:
 *   forms → fragments (0.4–2 s) → particle field → AHORA breaks (2 s) →
 *   convergence (2.7 s): diffuse → recognizable → structured → named (3.5 s) →
 *   HOY (3.9–5.3 s).
 */
export const EXIT = {
  /** Calm: selection closes, the field returns to its place, morphs finish. */
  calm: 400,
  /** The far plane lets go first, then the middle, then the near one. */
  release: { bg: 400, mid: 650, fg: 900 },
  /** Spread inside a plane, so no two forms break in the same instant. */
  jitter: 250,
  /** The present turns into its Dissolving configuration while the rest is already matter… */
  nowMorph: 1400,
  /** …and is the last to break. */
  nowBreak: 2050,
  /** Matter converges on AHORA. */
  gather: 2700,
  /** The modular core becomes the 3 × 3 AHORA module: it sharpens, gains contrast and settles. */
  module: [2800, 3700] as const,
  /** The module takes its name: it can be acted upon. */
  named: 3450,
  /** HOY mounts underneath and the module lands on its AHORA. */
  handoff: 3900,
  done: 5300,
} as const

/** Duration of each exit stage of the entry (ms), from the timeline above. */
export const EXIT_STAGES = {
  settle: EXIT.calm,
  dematerialize: EXIT.nowBreak - EXIT.calm,
  gather: EXIT.handoff - EXIT.nowBreak,
  handoff: EXIT.done - EXIT.handoff,
} as const

/** When (ms after CONTINUAR) an activity starts to come apart. */
export function releaseAtMs(a: Pick<Activity, 'side' | 'plane' | 'order'>): number {
  if (a.side === 'current') return EXIT.nowBreak
  return EXIT.release[a.plane] + (((a.order + 1) * 97) % EXIT.jitter)
}
