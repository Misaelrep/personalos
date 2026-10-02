import type { FlowPhase } from '../features/focus/useFocusFlow'

export interface AppMoment {
  phase: FlowPhase
  /** A Focus session is open (stored), even if its view is not on screen yet. */
  focusOpen: boolean
  /** The daily entry (full or micro) is playing. */
  entryActive: boolean
  /** A day opened from SEMANA holds the whole stage. */
  immersive: boolean
}

/**
 * A new version is offered — and may reload the page — only at rest on HOY or
 * SEMANA: never during Focus (entering, the session itself, its closing), the
 * daily entry, or a day opened from the week.
 */
export function isUpdateMoment({ phase, focusOpen, entryActive, immersive }: AppMoment): boolean {
  return phase === 'today' && !focusOpen && !entryActive && !immersive
}
