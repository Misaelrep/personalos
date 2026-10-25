import { SIMULATED } from '../../../state/clock'
import { EMPTY_STATE, MAX_INTENTION_LENGTH, type EntryMemory, type Intention, type LearnState } from '../domain/state'
import { LEARN_ROUTES } from '../domain/types'
import { CAPABILITY_SCHEMA, EMPTY_STORED, decodeCapability, encodeCapability, type StoredCapability } from './capabilityCodec'

/**
 * APRENDER's own storage: a versioned envelope under its own namespace.
 *
 *   elyum:learn:v1:state        the intention and the composer draft
 *   elyum:learn:v1:entry        when the full ritual was last seen, and the day's phrase
 *   elyum:learn:v1:capability   DESARROLLAR (Phase B1): objectives, skills, attempts, evidence, and where the person is
 *
 * A simulated session (`?date=` / `?t=`) uses `elyum:learn:v1:sim:*`, so
 * reviewing another day never touches the real memory. Nothing here reads or
 * writes a key of the core.
 *
 * When the shape of the data changes: bump LEARN_STORAGE_VERSION (a new
 * namespace) and read the previous one once, here, to carry the data over.
 *
 * Phase B1 (migration strategy). DESARROLLAR is ADDED as a third slot of the same namespace, not folded into `state`:
 *   · `state` and `entry` keep their exact keys, envelope and content — nothing of Phase A is renamed, moved or rewritten;
 *     a Phase A install simply has no `capability` slot yet, which reads as empty (no migration step is needed);
 *   · the capability slot is written whole, in one setItem: a write is atomic as far as localStorage allows, and a broken
 *     capability record can never take the draft or the intention down with it (nor the other way round);
 *   · inside the usual envelope the slot carries its own `schema` (capabilityCodec.ts). On reading:
 *       missing                      → empty
 *       unreadable / not this shape  → 'corrupt': the raw text is copied once to `…capability:backup`, the session starts empty
 *       a newer envelope or schema   → 'newer': nothing is read AND nothing is written — newer data is never overwritten by older code
 *       this schema                  → each record is checked on its own; one that does not hold is dropped, the rest kept
 *   · a simulated session uses `elyum:learn:v1:sim:capability`, as it does for the other slots.
 */
export const LEARN_STORAGE_VERSION = 1

const PREFIX = `elyum:learn:v${LEARN_STORAGE_VERSION}:`

export const learnKeys = (simulated: boolean) => ({
  state: `${PREFIX}${simulated ? 'sim:' : ''}state`,
  entry: `${PREFIX}${simulated ? 'sim:' : ''}entry`,
  capability: `${PREFIX}${simulated ? 'sim:' : ''}capability`,
})

/** How the capability slot was found: 'newer' and 'corrupt' are reported to the screen, never thrown. */
export type CapabilityLoad = { status: 'empty' | 'ok' | 'corrupt' | 'newer'; stored: StoredCapability; dropped: number }

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
  loadCapability(): CapabilityLoad
  /** False when the slot holds newer data than this code knows (it is left untouched). */
  saveCapability(stored: StoredCapability): boolean
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
  // Set when the capability slot holds data from a newer version: from then on this session never writes it.
  let capabilityFrozen = false
  let capabilityChecked = false

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

  const rawOf = (slot: keyof typeof keys): string | null | undefined => {
    try {
      const raw = storage?.getItem(keys[slot])
      if (raw != null) return raw
    } catch {
      // Fall through to memory.
    }
    return memory[slot]
  }

  const loadCapability = (): CapabilityLoad => {
    capabilityChecked = true
    const raw = rawOf('capability')
    if (!raw) return { status: 'empty', stored: EMPTY_STORED, dropped: 0 }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = undefined
    }
    const envelope = isObject(parsed) ? parsed : undefined
    const data = envelope && 'data' in envelope ? envelope.data : undefined
    const newer = (typeof envelope?.v === 'number' && envelope.v > LEARN_STORAGE_VERSION) || (isObject(data) && typeof data.schema === 'number' && data.schema > CAPABILITY_SCHEMA)
    if (newer) {
      capabilityFrozen = true
      return { status: 'newer', stored: EMPTY_STORED, dropped: 0 }
    }
    if (envelope?.v !== LEARN_STORAGE_VERSION || !isObject(data) || data.schema !== CAPABILITY_SCHEMA) {
      // Keep what was there before anything new is written over it (once: a backup is never itself overwritten).
      try {
        if (storage && storage.getItem(`${keys.capability}:backup`) == null) storage.setItem(`${keys.capability}:backup`, raw)
      } catch {
        // Nothing more can be done; the session goes on.
      }
      return { status: 'corrupt', stored: EMPTY_STORED, dropped: 0 }
    }
    const { stored, dropped } = decodeCapability(data)
    return { status: 'ok', stored, dropped }
  }

  return {
    loadCapability,
    saveCapability: (stored) => {
      // Never write before knowing what is there.
      if (!capabilityChecked) loadCapability()
      if (capabilityFrozen) return false
      write('capability', encodeCapability(stored))
      return true
    },
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
