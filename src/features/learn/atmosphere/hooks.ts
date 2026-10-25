import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { advanceSeen, learnAtmosphere, type LearnAtmosphereProps, type Seen } from './atmosphere'
import { learnThemeClock } from './clock'
import type { LearnThemeId } from './schedule'
import { LEARN_THEMES, type LearnTheme } from './themes'

const NEVER = () => () => {}

/** The atmosphere in force, kept current: it changes by itself when the clock crosses a boundary. */
function useLearnThemeId(listen = true): LearnThemeId {
  return useSyncExternalStore(listen ? learnThemeClock.subscribe : NEVER, learnThemeClock.read)
}

/** The theme of the screen: re-renders only when the atmosphere changes (never the ritual, never what is typed). */
export function useLearnTheme(): LearnTheme {
  return LEARN_THEMES[useLearnThemeId()]
}

/**
 * What the shared Atmosphere should show for APRENDER. Listens only while
 * APRENDER is open (`active`); elsewhere it costs nothing.
 */
export function useLearnAtmosphere(active: boolean): LearnAtmosphereProps {
  const id = useLearnThemeId(active)
  const [seen, setSeen] = useState<Seen | null>(null)
  const next = advanceSeen(seen, active, id)
  if (next !== seen) setSeen(next)
  const live = next?.live ?? false
  // While the atmosphere changes in front of the person, the document says so (atmosphere.css evens out the easing).
  useLayoutEffect(() => {
    if (!live) return
    document.documentElement.dataset.learnLive = ''
    return () => {
      delete document.documentElement.dataset.learnLive
    }
  }, [live])
  return useMemo(() => learnAtmosphere(id, live), [id, live])
}
