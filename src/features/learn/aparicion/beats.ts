/**
 * APARICIÓN — the first thing the first entry of the day shows, before APRENDER.
 *
 * The metaphor: information, scattered → contact / attention → organization →
 * understanding. A finger arrives and touches the glass; a soft wave crosses it;
 * the fragments of the words the system is made of react, find structure, and
 * the structure becomes APRENDER (the dots of the wordmark).
 *
 * Seconds from the start. The ritual's total length does not change: the phrase
 * still comes at 2.3 s (see APARICION_TIMELINE in domain/ritual.ts).
 */
export const BEATS = {
  /** The glass is there, with the fragments scattered over it. */
  surface: 0,
  /** The finger begins to appear. */
  contact: 0.2,
  /** The first soft wave leaves the point of contact. */
  wave: 0.5,
  /** The fragments begin to reorganize. */
  reorganize: 0.7,
  /** The structure converges on APRENDER… */
  converge: 1.2,
  /** …and it is stable (the dots of the wordmark settle a few tenths later). */
  stable: 1.5,
} as const

/** The stage deepens (light glass → dark sky) between these two moments. */
export const DARKEN = { from: 0.7, to: 1.6 } as const

/** After this the fragments are gone: the canvas stops and clears. */
export const FRAGMENTS_END = 1.75

/**
 * The ritual's stage stays until the question is about to come: once the phrase has begun to dissolve (6.0 s)
 * it leaves, 0.55 s later, and is gone at 7.0 s — the moment the question starts to appear on the light glass.
 */
export const STAGE_LEAVES = { after: 0.55, duration: 0.45 } as const
