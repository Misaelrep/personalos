/**
 * THE RITUAL — one idea appears, dissolves, and leaves room for yours.
 *
 *   ATMÓSFERA → APRENDER → FRASE DEL DÍA → desfragmentación
 *   → ¿QUÉ TIENES EN MENTE? → campo → sugerencias → (estado funcional)
 *
 * The times below are a rhythm, not a lock: any click, tap or key brings the
 * person to the functional state in SKIP_MS (see useRitual).
 */
export type RitualStage = 'atmosphere' | 'wordmark' | 'phrase' | 'defrag' | 'prompt' | 'field' | 'suggestions' | 'ready'

export const STAGE_ORDER: RitualStage[] = ['atmosphere', 'wordmark', 'phrase', 'defrag', 'prompt', 'field', 'suggestions', 'ready']

/** Seconds from the start at which each stage begins. A stage that is absent never happens. */
export type Timeline = Partial<Record<RitualStage, number>>

/**
 * First entry of the day. Marks, as the spec gives them:
 *   0.0 atmosphere · 0.2 APRENDER starts forming (the dots settle ≈1.5 s later)
 *   2.3 the phrase starts (fully visible at 3.2) · 6.0 defragmentation
 *   7.0 the question · 7.6 the field · 8.2 the suggestions
 * `ready` = the suggestions have finished fading in.
 */
export const FULL_TIMELINE: Timeline = {
  atmosphere: 0,
  wordmark: 0.2,
  phrase: 2.3,
  defrag: 6.0,
  prompt: 7.0,
  field: 7.6,
  suggestions: 8.2,
  ready: 8.7,
}

/**
 * The first entry of the day when it begins with APARICIÓN (see ../aparicion/beats.ts).
 * The same rhythm and the same total length: only the wordmark's dots start a little
 * later (0.35 s), so the fragments can reach them as they take shape.
 */
export const APARICION_TIMELINE: Timeline = { ...FULL_TIMELINE, wordmark: 0.35 }

/** Any later entry that day: no wordmark, no phrase, no immersive wait. */
export const BRIEF_TIMELINE: Timeline = {
  atmosphere: 0,
  prompt: 0.15,
  field: 0.3,
  suggestions: 0.45,
  ready: 0.9,
}

/**
 * After an interaction, everything settles into the functional state in this long (ms).
 * The limit is 400 ms measured to the composer being usable, which also pays for the render
 * and one frame: the settle itself is kept well under it.
 */
export const SKIP_MS = 220

/** Has the ritual got to (or past) `at`? */
export function reached(stage: RitualStage, at: RitualStage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(at)
}

/** The stage a ritual is in `elapsedMs` after it began. */
export function stageAt(timeline: Timeline, elapsedMs: number): RitualStage {
  let current: RitualStage = 'atmosphere'
  for (const stage of STAGE_ORDER) {
    const at = timeline[stage]
    if (at !== undefined && at * 1000 <= elapsedMs) current = stage
  }
  return current
}

/** The wordmark and phrase layer is on stage between `wordmark` and the end of `defrag`. */
export function introVisible(stage: RitualStage, timeline: Timeline): boolean {
  return timeline.wordmark !== undefined && reached(stage, 'wordmark') && !reached(stage, 'prompt')
}
