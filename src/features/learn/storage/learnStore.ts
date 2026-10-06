import { SIMULATED } from '../../../state/clock'
import { EMPTY_STATE, MAX_INTENTION_LENGTH, type EntryMemory, type Intention, type LearnState } from '../domain/state'
import { LEARN_ROUTES } from '../domain/types'

/**
 * APRENDER's own storage: a versioned envelope under its own namespace.
 *
 *   elyum:learn:v1:state   the intention and the composer draft
 *   elyum:learn:v1:entry   when the full ritual was last seen, and the day's phrase
 *
 * A simulated session (`?date=` / `?t=`) uses `elyum:learn:v1:sim:*`, so
 * reviewing another day never touches the real memory. Nothing here reads or
 * writes a key of the core.
 *
 * When the shape of the data changes: bump LEARN_STORAGE_VERSION (a new
 * namespace) and read the previous one once, here, to carry the data over.
 */
export const LEARN_STORAGE_VERSION = 1

const PREFIX = `elyum:learn:v${LEARN_STORAGE_VERSION}:`

export const learnKeys = (simulated: boolean) => ({
  state: `${PREFIX}${simulated ? 'sim:' : ''}state`,
  entry: `${PREFIX}${simulated ? 'sim:' : ''}entry`,
})

/** The part of `Storage` this needs: injectable, so it is testable without a browser. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LearnStore {
  loadState(): LearnState
  saveState(state: LearnState): void
  loadEntry(): EntryMemory
  saveEntry(patch: Partial<EntryMemory>): void
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function toIntention(v: unknown): Intention | undefined {
  if (!isObject(v)) return undefined
  const { text, route, savedAt } = v
  if (typeof text !== 'string' || typeof savedAt !== 'number') return undefined
  if (!(LEARN_ROUTES as readonly unknown[]).includes(route)) return undefined
  return { text: text.slice(0, MAX_INTENTION_LENGTH), route: route as Intention['route'], savedAt }
}

/** Whatever was stored, as a valid state: anything unreadable falls back to empty. */
function toState(data: unknown): LearnState {
  if (!isObject(data)) return { ...EMPTY_STATE }
  const draft = typeof data.draft === 'string' ? data.draft.slice(0, MAX_INTENTION_LENGTH) : ''
  const intention = toIntention(data.intention)
  return intention ? { draft, intention } : { draft }
}

function toEntry(data: unknown): EntryMemory {
  if (!isObject(data)) return {}
  const memory: EntryMemory = {}
  if (typeof data.lastEntryDate === 'string' && DATE_KEY.test(data.lastEntryDate)) memory.lastEntryDate = data.lastEntryDate
  const phrase = data.phrase
  if (isObject(phrase) && typeof phrase.date === 'string' && DATE_KEY.test(phrase.date) && typeof phrase.id === 'string') {
    memory.phrase = { date: phrase.date, id: phrase.id }
  }
  return memory
}

/** Unwrap an envelope of the current version; anything else (missing, corrupt, other version) is "nothing stored". */
function unwrap(raw: string | null | undefined): unknown {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isObject(parsed) && parsed.v === LEARN_STORAGE_VERSION && 'data' in parsed) return parsed.data
  } catch {
    // Unreadable: treated as empty.
  }
  return undefined
}

export function createLearnStore({ storage, simulated }: { storage?: StorageLike; simulated: boolean }): LearnStore {
  const keys = learnKeys(simulated)
  // If storage is unavailable (private mode, blocked) the session still works from memory.
  const memory: Partial<Record<keyof typeof keys, string>> = {}

  const read = (slot: keyof typeof keys): unknown => {
    try {
      const raw = storage?.getItem(keys[slot])
      if (raw != null) return unwrap(raw)
    } catch {
      // Fall through to memory.
    }
    return unwrap(memory[slot])
  }
  const write = (slot: keyof typeof keys, data: unknown) => {
    const raw = JSON.stringify({ v: LEARN_STORAGE_VERSION, data })
    memory[slot] = raw
    try {
      storage?.setItem(keys[slot], raw)
    } catch {
      // Memory copy keeps the session working.
    }
  }

  return {
    loadState: () => toState(read('state')),
    saveState: (state) => write('state', state),
    loadEntry: () => toEntry(read('entry')),
    saveEntry: (patch) => write('entry', { ...toEntry(read('entry')), ...patch }),
  }
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

export const learnStore: LearnStore = createLearnStore({ storage: browserStorage(), simulated: SIMULATED })
