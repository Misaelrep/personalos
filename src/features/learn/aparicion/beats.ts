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

/** After this the fragments are gone: the canvas stops and clears. */
export const FRAGMENTS_END = 1.75

/**
 * FRASE → AHORA: the same glass clears, AHORA begins to emerge, and the matter finishes disappearing — never "scene ends, cut, a new page".
 * Once the phrase has begun to dissolve (6.0 s) the deep glass first clears while still opaque (6.05–6.6 s, aparicion.css: .apa[data-leaving]),
 * then dissolves over sunset-ahora (the same plates) from 0.45 s after the defragmentation, over 0.8 s, ending at the 7.25 s target.
 * The question (7.0 s) begins to appear while a residue of the scene is still there (≈21 % at 7.0 s, ≈4 % at 7.14 s): approved, not a defect.
 */
export const STAGE_LEAVES = { after: 0.45, duration: 0.8 } as const

/** When the scene's exit is timed to end (s): the approved overlap with the question ends here. */
export const SCENE_END_TARGET = 7.25

/**
 * On screen the end lands on a painted frame, so it may be observed up to one frame (60 Hz) after the target — measured at 7.256 s
 * in Chromium at 390 and 320 px. Accepted as tolerance; the animation is not shortened for it.
 */
export const SCENE_END_FRAME_TOLERANCE = 1 / 60

/** The phrase is read on a calmer surface: the optical layers lose some of their presence (INTENSITY: from APRENDER's to the phrase's level) between these two moments (s). */
export const CALM = { from: 2.3, over: 1.4 } as const

/**
 * How much of the optical surface — the threads of light along the glass, the leaks of red and orange, the reflections, the spill of
 * the prismatic fringe — is there at each moment: the same identity, less of it as the ritual goes from the touch to the question.
 * APARICIÓN and the contact are the surface at its fullest; the last step is AHORA's, where only a trace of it stays (see atmosphere).
 */
export const INTENSITY = { aparicion: 1, contacto: 1, convergencia: 0.75, aprender: 0.55, frase: 0.35, ahora: 0.15 } as const

/** The level of the curve, over time: held through the contact, falling as the structure forms, held for APRENDER, then calming through the phrase (from CALM.from, over CALM.over). */
export const INTENSITY_KEYS: readonly (readonly [at: number, level: number])[] = [
  [0, INTENSITY.aparicion],
  [1.1, INTENSITY.contacto],
  [1.4, INTENSITY.convergencia],
  [1.9, INTENSITY.aprender],
  [CALM.from, INTENSITY.aprender],
  [CALM.from + CALM.over, INTENSITY.frase],
]

export function intensityAt(t: number): number {
  const keys = INTENSITY_KEYS
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, l1] = keys[i]
    if (t <= t1) {
      const [t0, l0] = keys[i - 1]
      const u = (t - t0) / (t1 - t0)
      const e = u * u * (3 - 2 * u)
      return l0 + (l1 - l0) * e
    }
  }
  return keys[keys.length - 1][1]
}
