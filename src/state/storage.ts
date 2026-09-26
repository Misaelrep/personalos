import { weekdayOf } from '../domain/routine'
import type { DayState } from '../domain/types'
import { emptyDay } from './dayReducer'

/**
 * The day's state lives in localStorage under its date, so a reload keeps
 * the morning's decisions and the next day starts clean. No backend.
 */
const PREFIX = 'personal-os:day:'

/**
 * Block ids of the routine before RUTINA MAESTRA V3 (a single Tuesday used for
 * every day) → their V3 ids. Only meaningful on a Tuesday: on any other date
 * those ids described the fallback Tuesday, not that day, so they are dropped.
 */
export const LEGACY_TUESDAY_IDS: Record<string, string> = {
  merkaba: 'tue-merkaba-0600',
  hermana: 'tue-transfer-0630',
  escritura: 'tue-writing-0800',
  'breathwork-am': 'tue-breathwork-0825',
  substack: 'tue-substack-0830',
  ingles: 'tue-english-0835',
  pausa: 'tue-pause-0915',
  lectura: 'tue-reading-0930',
  'paginas-web': 'tue-web-1000',
  velocity: 'tue-velocity-1200',
  alimentacion: 'tue-meal-1220',
  'wellness-1': 'tue-wellness-1400',
  gimnasio: 'tue-gym-1600',
  'comida-ducha': 'tue-shower-1800',
  'wellness-2': 'tue-wellness-1900',
  'cierre-digital': 'tue-screens-off-2050',
  'breathwork-pm': 'tue-breathwork-relax-2145',
  dormir: 'tue-sleep-2200',
}

const isLegacy = (id: string) => Object.prototype.hasOwnProperty.call(LEGACY_TUESDAY_IDS, id)

/**
 * Bring a stored day up to the V3 ids. Records and an open Focus on legacy ids
 * are translated on Tuesdays and dropped elsewhere; everything else (V3 ids,
 * objectives, notes, `meditationMoved`) is kept untouched.
 */
export function migrateDay(state: DayState): DayState {
  const keys = Object.keys(state.records)
  const legacyFocus = !!state.focus && isLegacy(state.focus.blockId)
  if (!legacyFocus && !keys.some(isLegacy)) return state

  const tuesday = weekdayOf(state.date) === 2
  const records: DayState['records'] = {}
  for (const k of keys) {
    if (!isLegacy(k)) records[k] = state.records[k]
    else if (tuesday && !state.records[LEGACY_TUESDAY_IDS[k]]) records[LEGACY_TUESDAY_IDS[k]] = state.records[k]
  }
  let focus = state.focus
  if (focus && legacyFocus) focus = tuesday ? { ...focus, blockId: LEGACY_TUESDAY_IDS[focus.blockId] } : undefined
  return { ...state, records, focus }
}

export function loadDay(date: string): DayState {
  try {
    const raw = window.localStorage.getItem(PREFIX + date)
    if (raw) {
      const parsed = JSON.parse(raw) as DayState
      if (parsed && parsed.date === date && parsed.records && typeof parsed.records === 'object') return migrateDay(parsed)
    }
  } catch {
    // Storage unavailable (private mode, blocked) or unreadable: start empty.
  }
  return emptyDay(date)
}

export function saveDay(state: DayState): void {
  try {
    window.localStorage.setItem(PREFIX + state.date, JSON.stringify(state))
  } catch {
    // Ignore: the session still works in memory.
  }
}
