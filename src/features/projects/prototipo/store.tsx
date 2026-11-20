import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Ctx } from '../domain/ops'
import type { ProjectsData } from '../domain/types'
import DATOS from './datos-prototipo.json'
import { exampleSprint, proposeStrategy, type Sprint } from './plan'

/**
 * PROTOTYPE · Everything lives in this component's memory. No localStorage,
 * no sessionStorage, no IndexedDB, no network: reloading the page starts over.
 * That is on purpose — the real planner's storage is a later, separate step.
 */

export const INITIAL = DATOS as unknown as ProjectsData
export const TODAY = '2026-11-19'

export interface Proto {
  data: ProjectsData
  sprint: Sprint | null
  /** Simulated local date «YYYY-MM-DD». */
  today: string
  /** Last thing done, shown once. */
  notice?: string
  /** Projects whose map intro was already played (this session only). */
  introSeen: string[]
  /** Movement on the map: full, or reduced (no intro, instant transitions). */
  motion: 'completo' | 'reducido'
  /** The person's own edits of a task's orientation or expected result (they replace the AI proposal). */
  notes: Record<string, { hacer?: string; porque?: string; implies?: string; deliver?: string }>
  /** Key results the person confirmed («projectId:resultId»). */
  confirmed: string[]
  /** The exact map point a task was opened from, to return to it. */
  mapFrom?: string
  /** Liquid Platinum finish being compared: A satin silver, B iridescent liquid metal. */
  acabado: 'A' | 'B'
}

const prefersReduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const fresh = (): Proto => ({ data: INITIAL, sprint: null, today: TODAY, introSeen: [], motion: prefersReduced() ? 'reducido' : 'completo', notes: {}, confirmed: [], acabado: 'B' })

interface Store {
  s: Proto
  set: (f: (s: Proto) => Proto) => void
  ctx: () => Ctx
}

const StoreCtx = createContext<Store | null>(null)

let tick = 0
export function ProtoProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Proto>(fresh)
  const ctx = (): Ctx => {
    tick++
    const ss = String(tick % 60).padStart(2, '0')
    return { now: `${s.today}T10:${String(Math.floor(tick / 60) % 60).padStart(2, '0')}:${ss}-06:00` }
  }
  return <StoreCtx.Provider value={{ s, set: setS, ctx }}>{children}</StoreCtx.Provider>
}

export function useProto(): Store {
  const v = useContext(StoreCtx)
  if (!v) throw new Error('useProto fuera de ProtoProvider')
  return v
}

/** The scenarios the prototype controls offer. */
export const SCENARIOS = {
  'sin-plan': (s: Proto): Proto => ({ ...s, data: INITIAL, sprint: null, today: TODAY, notes: {}, confirmed: [] }),
  borrador: (s: Proto): Proto => ({ ...s, data: INITIAL, sprint: proposeStrategy(INITIAL, 6), today: TODAY }),
  'aprobado-antes': (s: Proto): Proto => ({ ...s, data: INITIAL, sprint: exampleSprint(INITIAL, `${TODAY}T09:00:00-06:00`), today: TODAY }),
  aprobado: (s: Proto): Proto => ({ ...s, data: INITIAL, sprint: exampleSprint(INITIAL, `${TODAY}T09:00:00-06:00`), today: s.today < '2026-12-01' ? '2026-12-10' : s.today }),
}

export const DATES = [
  { value: '2026-11-19', label: '19 nov' },
  { value: '2026-12-10', label: '10 dic' },
  { value: '2027-01-15', label: '15 ene' },
  { value: '2027-02-10', label: '10 feb' },
]

/** Clears the one-shot notice a few seconds after it is shown. */
export function useNotice(): string | undefined {
  const { s, set } = useProto()
  useEffect(() => {
    if (!s.notice) return
    const id = setTimeout(() => set((x) => ({ ...x, notice: undefined })), 3500)
    return () => clearTimeout(id)
  }, [s.notice, set])
  return s.notice
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} ${MES[Number(m) - 1]}`
}
