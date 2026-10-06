import type { LearnRoute } from './types'

/**
 * What APRENDER remembers in Phase A — nothing about knowledge yet, only the
 * intention the person brought. Pure transitions; persistence lives in storage/.
 */

/** What the person wants to do with this visit, and the route they chose. */
export interface Intention {
  /** What they wrote. Empty when they only tapped a route. */
  text: string
  route: LearnRoute
  /** App-clock time (ms) it was saved. */
  savedAt: number
}

export interface LearnState {
  /** Text in the composer, kept so a reload never loses it. */
  draft: string
  /** The saved intention, if any. While it exists there is no active capability yet. */
  intention?: Intention
}

/** What the entry remembers (kept apart from the state, like the core's entry memory). */
export interface EntryMemory {
  /** Local date (YYYY-MM-DD) on which the full ritual was completed or skipped. */
  lastEntryDate?: string
  /** Phrase shown on a given local date, so it stays the same all day even if the library changes. */
  phrase?: { date: string; id: string }
}

export const MAX_INTENTION_LENGTH = 500

export const EMPTY_STATE: LearnState = { draft: '' }

export function setDraft(state: LearnState, draft: string): LearnState {
  return { ...state, draft: draft.slice(0, MAX_INTENTION_LENGTH) }
}

/** Save the intention: the route is always an explicit choice, never inferred from the text. */
export function commitIntention(state: LearnState, route: LearnRoute, text: string, now: number): LearnState {
  return { ...state, draft: '', intention: { text: text.trim().slice(0, MAX_INTENTION_LENGTH), route, savedAt: now } }
}

/** Start over: the previous words come back into the composer, nothing is lost. */
export function restartIntention(state: LearnState): LearnState {
  return { draft: state.intention?.text ?? state.draft }
}
