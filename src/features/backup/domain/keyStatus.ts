import type { KeyStatus, ModuleId } from './format'

/**
 * What this version of ELYUM can read in a stored value. Display and report
 * only: the value is exported whatever its status, byte for byte.
 *
 * The checks follow what the app consumes today:
 *   day    `src/state/storage.ts` (`loadDay`) and `DayState` in `src/domain/types.ts`
 *   entry  `src/features/entry/entryStorage.ts` (`EntryMemory`)
 *   learn  the `{ v, data }` envelope of APRENDER; its content is not validated here
 *   projects  no stored format yet (P3): copied, not checked
 */
const DAY_KEY = /^personal-os:day:(\d{4}-\d{2}-\d{2})$/
const RESOLVED = ['completado', 'parcial', 'omitido']
const OUTCOMES = ['si', 'parcial', 'no']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optString = (v: unknown) => v === undefined || typeof v === 'string'
const optIn = (v: unknown, values: string[]) => v === undefined || (typeof v === 'string' && values.includes(v))

function parse(value: string): { ok: true; json: unknown } | { ok: false } {
  try {
    return { ok: true, json: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

export function isRecognizedDay(json: unknown, date: string): boolean {
  if (!isObject(json) || json.date !== date || !isObject(json.records)) return false
  for (const record of Object.values(json.records)) {
    if (!isObject(record)) return false
    if (!optIn(record.status, RESOLVED) || !optIn(record.outcome, OUTCOMES)) return false
    if (!optString(record.pendingNote) || !optString(record.objective)) return false
  }
  if (json.focus !== undefined && !(isObject(json.focus) && typeof json.focus.blockId === 'string' && typeof json.focus.startedAt === 'number')) return false
  if (json.meditationMoved !== undefined && typeof json.meditationMoved !== 'boolean') return false
  return true
}

export function isRecognizedEntry(json: unknown): boolean {
  if (!isObject(json)) return false
  if (!optString(json.dailyEntrySeenDate) || !optString(json.dayscapeHintDate)) return false
  if (json.lastActiveAt !== undefined && typeof json.lastActiveAt !== 'number') return false
  if (json.dailyMessage !== undefined && !(isObject(json.dailyMessage) && typeof json.dailyMessage.date === 'string' && typeof json.dailyMessage.id === 'string')) return false
  return true
}

export function keyStatusOf(module: ModuleId, key: string, value: string): KeyStatus {
  const parsed = parse(value)
  if (!parsed.ok) return 'ilegible'
  const json = parsed.json
  if (module === 'core') {
    const day = DAY_KEY.exec(key)
    if (day) return isRecognizedDay(json, day[1]) ? 'valido' : 'no-reconocido'
    if (key === 'personal-os:entry') return isRecognizedEntry(json) ? 'valido' : 'no-reconocido'
    return 'no-reconocido'
  }
  if (module === 'learn') return isObject(json) && Number.isInteger(json.v) && Object.hasOwn(json, 'data') ? 'sin-validador' : 'no-reconocido'
  return 'sin-validador'
}
