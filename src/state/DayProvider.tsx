import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { routineForDate } from '../data/routine'
import { RoutineMissingError, shiftDateKey, type ResolvedDay } from '../domain/routine'
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
  /** How today's routine was resolved (rotations, overrides). */
  resolved: ResolvedDay
  dispatch: Dispatch<DayAction>
}

const Ctx = createContext<DayContextValue | null>(null)

/** Today plus its neighbours, so the night never breaks at midnight. */
function resolveAround(key: string) {
  try {
    return {
      today: routineForDate(key),
      yesterday: routineForDate(shiftDateKey(key, -1)),
      tomorrow: routineForDate(shiftDateKey(key, 1)),
    }
  } catch (error) {
    if (error instanceof RoutineMissingError) return { error }
    throw error
  }
}

export function DayProvider({ children }: { children: ReactNode }) {
  const now = useNow(10_000)
  const key = dateKey(now)
  const [state, dispatch] = useReducer(dayReducer, key, loadDay)

  // Midnight rollover while the app stays open.
  useEffect(() => {
    if (state.date !== key) dispatch({ type: 'load', state: loadDay(key) })
  }, [key, state.date])

  useEffect(() => saveDay(state), [state])

  const days = useMemo(() => resolveAround(key), [key])
  const minute = Math.floor(minutesOfDay(now))
  const view = useMemo(
    () =>
      'error' in days
        ? undefined
        : buildDayView(days.today.routine, state, minute, {
            yesterday: days.yesterday.routine,
            tomorrow: days.tomorrow.routine,
          }),
    [days, state, minute],
  )

  useEffect(() => {
    if ('error' in days) console.error(days.error)
  }, [days])

  // No fallback to another day: a missing routine is a visible development error.
  if ('error' in days || !view) return <RoutineError error={'error' in days ? days.error : undefined} />

  return <Ctx.Provider value={{ now, state, view, resolved: days.today, dispatch }}>{children}</Ctx.Provider>
}

function RoutineError({ error }: { error?: RoutineMissingError }) {
  return (
    <main role="alert" className="grid min-h-dvh place-items-center px-6 text-ink">
      <div className="max-w-md space-y-3">
        <p className="text-[11px] font-medium tracking-[0.3em] text-ink-3 uppercase">Error de rutina</p>
        <p className="text-[17px] leading-relaxed">{error?.message ?? 'No se pudo construir el día.'}</p>
      </div>
    </main>
  )
}

export function useDay(): DayContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDay must be used inside <DayProvider>')
  return ctx
}
