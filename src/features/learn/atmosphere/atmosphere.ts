import type { AtmosphereKey, AtmospherePreset } from '../../../atmosphere/presets'
import type { LearnThemeId } from './schedule'
import { LEARN_THEMES } from './themes'

/** Seconds the light takes to change: arriving at APRENDER, and crossing a boundary while the person is here. */
export const ENTER_SECONDS = 0.9
export const LIVE_SECONDS = 3.2

/** What the shared Atmosphere is given while APRENDER is open. `scene: 'flow'` keeps HOY's light system out. */
export interface LearnAtmosphereProps {
  preset: AtmosphereKey | AtmospherePreset
  scene: 'flow'
  duration: number
}

export function learnAtmosphere(id: LearnThemeId, live: boolean): LearnAtmosphereProps {
  return { preset: LEARN_THEMES[id].atmosphere, scene: 'flow', duration: live ? LIVE_SECONDS : ENTER_SECONDS }
}

/**
 * What APRENDER has seen since it opened: the atmosphere it arrived with and
 * whether it has changed since — so arriving is quick and a change in front
 * of the person is slow. Closing APRENDER forgets it.
 */
export interface Seen {
  id: LearnThemeId
  live: boolean
}

export function advanceSeen(prev: Seen | null, active: boolean, id: LearnThemeId): Seen | null {
  if (!active) return null
  if (prev === null) return { id, live: false }
  if (prev.id !== id) return { id, live: true }
  return prev
}
