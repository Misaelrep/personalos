import { APARICION_PROPAGATION, APARICION_TIMELINE } from '../domain/ritual'

/**
 * APARICIÓN — the first thing the first entry of the day shows, before APRENDER.
 *
 * The metaphor: information, scattered → contact / attention → organization →
 * understanding. A finger arrives and touches the glass; the glass answers with
 * fronts that leave the point of contact one after another and cross it at a
 * constant speed; the fragments of the words the system is made of are disturbed
 * as each front passes and are left a little more in order; then the structure
 * converges and becomes APRENDER (the dots of the wordmark).
 *
 * Seconds from the start. The propagation (APARICION_PROPAGATION) adds its 3 s between
 * the contact and the convergence; everything after it keeps its own length.
 */
export const BEATS = {
  /** The glass is there, with the fragments scattered over it. */
  surface: 0,
  /** The finger begins to appear. */
  contact: 0.2,
  /** The touch is complete: the finger rests, the light at the point is full. */
  touched: 0.82,
  /** The first front leaves the point of contact (the next ones follow it, ≈0.75 s apart: light.ts, FRONT_BIRTHS). */
  wave: 0.85,
  /** The structure begins to converge, the nearest pieces first — while the last front is still crossing the glass. */
  converge: 3.3,
  /** The propagation is over: the last front has spent itself. */
  propagated: 3.85,
  /** The structure is stable: every piece has reached its dot (the dots of the wordmark settle a few tenths later, ≈4.8 s). */
  stable: 4.5,
} as const

/** After this the fragments are gone: the canvas stops and clears. */
export const FRAGMENTS_END = 4.75

/**
 * FRASE → AHORA: the same glass clears, AHORA begins to emerge, and the matter finishes disappearing — never "scene ends, cut, a new page".
 * Once the phrase has begun to dissolve (defrag, 9.0 s) the deep glass first clears while still opaque (+0.05–0.6 s, aparicion.css: .apa[data-leaving]),
 * then dissolves over sunset-ahora (the same plates) from 0.45 s after the defragmentation, over 0.8 s, ending at the target (10.25 s).
 * The question (defrag + 1.0 s) begins to appear while a residue of the scene is still there: approved, not a defect. Unchanged by the propagation.
 */
export const STAGE_LEAVES = { after: 0.45, duration: 0.8 } as const

/** When the scene's exit is timed to end (s): the approved overlap with the question ends here — 7.25 s before the propagation, the same exit later. */
export const SCENE_END_TARGET = APARICION_TIMELINE.defrag! + STAGE_LEAVES.after + STAGE_LEAVES.duration

/**
 * On screen the end lands on a painted frame, so it may be observed up to one frame (60 Hz) after the target (measured in Chromium
 * at 390 and 320 px). Accepted as tolerance; the animation is not shortened for it.
 */
export const SCENE_END_FRAME_TOLERANCE = 1 / 60

/** The phrase is read on a calmer surface: the optical layers lose some of their presence (INTENSITY: from APRENDER's to the phrase's level) between these two moments (s). */
export const CALM = { from: APARICION_TIMELINE.phrase!, over: 1.4 } as const

/**
 * How much of the optical surface — the threads of light along the glass, the leaks of red and orange, the reflections, the spill of
 * the prismatic fringe — is there at each moment: the same identity, less of it as the ritual goes from the touch to the question.
 * APARICIÓN and the contact are the surface at its fullest; the last step is AHORA's, where only a trace of it stays (see atmosphere).
 */
export const INTENSITY = { aparicion: 1, contacto: 1, convergencia: 0.75, aprender: 0.55, frase: 0.35, ahora: 0.15 } as const

/** The level of the curve, over time: held through the contact and the propagation, falling as the structure forms, held for APRENDER, then calming through the phrase (from CALM.from, over CALM.over). */
export const INTENSITY_KEYS: readonly (readonly [at: number, level: number])[] = [
  [0, INTENSITY.aparicion],
  [BEATS.converge, INTENSITY.contacto],
  [BEATS.converge + 0.65, INTENSITY.convergencia],
  [1.9 + APARICION_PROPAGATION, INTENSITY.aprender],
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
