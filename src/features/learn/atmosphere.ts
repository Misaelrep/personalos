import type { AtmosphereKey } from '../../atmosphere/presets'

/**
 * TEMPORARY (Phase A). APRENDER borrows an existing deep atmosphere by name so
 * the core's presets stay untouched; nothing about it is adapted for APRENDER,
 * and nothing in the core knows why it was chosen. APRENDER gets its own
 * atmosphere later: replace the values here and nowhere else.
 *
 * `scene: 'flow'` keeps HOY's light system out; `duration` lets the ground
 * deepen in time for the wordmark's first dots.
 */
export const LEARN_ATMOSPHERE: { preset: AtmosphereKey; scene: 'today' | 'flow'; duration: number } = {
  preset: 'focus-session',
  scene: 'flow',
  duration: 0.9,
}
