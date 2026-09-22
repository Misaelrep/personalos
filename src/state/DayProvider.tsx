import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { routineFor } from '../data/routines'
import { buildDayView, type DayView } from '../domain/schedule'
import { dateKey, minutesOfDay } from '../domain/time'
import type { DayState } from '../domain/types'
import { useNow } from './clock'
import { dayReducer, type DayAction } from './dayReducer'
import { loadDay, saveDay } from './storage'

interface DayContextValue {
  now: Date
  state: DayState
  view: DayView
  /** Today has no routine of its own yet; showing the fallback (martes). */
  isFallback: boolean
  dispatch: Dispatch<DayAction>
}

const Ctx = createContext<DayContextValue | null>(null)

export function DayProvider({ children }: { children: ReactNode }) {
  const now = useNow(10_000)
  const key = dateKey(now)
  const [state, dispatch] = useReducer(dayReducer, key, loadDay)

  // Midnight rollover while the app stays open.
  useEffect(() => {
    if (state.date !== key) dispatch({ type: 'load', state: loadDay(key) })
  }, [key, state.date])

  useEffect(() => saveDay(state), [state])

  const { routine, isFallback } = routineFor(now)
  const minute = Math.floor(minutesOfDay(now))
  const view = useMemo(() => buildDayView(routine, state, minute), [routine, state, minute])

  return <Ctx.Provider value={{ now, state, view, isFallback, dispatch }}>{children}</Ctx.Provider>
}

export function useDay(): DayContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDay must be used inside <DayProvider>')
  return ctx
}
