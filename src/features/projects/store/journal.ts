/**
 * P2-R1.2 · H03 · The recovery journal, read without trusting it.
 *
 * The journal (`…:antes-de-recuperar`) holds the exact stored text a recovery
 * replaces. A journal is only taken for what it says when its WHOLE structure
 * is right: every field with its type, a known state, the fields that state
 * needs, and the text before matching its fingerprint. Anything else is
 * «ilegible»: it is never read as closed, never overwritten or deleted
 * silently, and it blocks writes until the person resolves it (H04).
 *
 * Here and not in `restore.ts` because the store (P3) also reads it: a save
 * is refused while a recovery is unresolved (H04).
 */

export const JOURNAL_KEY = 'elyum:projects:v1:antes-de-recuperar'
export const JOURNAL_FORMAT = 'elyum-projects-restore/1'

export const JOURNAL_STATES = ['en-curso', 'completada', 'fallida', 'no-aplicada', 'revisada'] as const
export type JournalState = (typeof JOURNAL_STATES)[number]
/** States in which the recovery is over: nothing is pending. */
export const CLOSED_STATES: readonly JournalState[] = ['completada', 'fallida', 'no-aplicada', 'revisada']

export interface Journal {
  format: typeof JOURNAL_FORMAT
  state: JournalState
  startedAt: string
  finishedAt?: string
  writer: string
  baseGeneration: number
  /** The stored text the recovery replaced, exactly (null: nothing was stored). */
  before: string | null
  /** SHA-256 of `before` (null when `before` is null; may be null in journals written by 8c7ea4c while open). */
  beforeSha256: string | null
  /** SHA-256 of the data it writes. */
  targetSha256: string
  resultGeneration?: number
  source: { exportedAt: string; storedSha256: string; generation: number; name?: string; origin?: string }
  summary: string
  error?: string
  /** A damaged journal the person saved and closed: its text, exactly as it was found (H03). */
  damaged?: string
}

export type JournalRead = { ok: true; journal: Journal } | { ok: false; reason: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isHash = (v: unknown): v is string => isStr(v) && /^[0-9a-f]{64}$/.test(v)
const isGen = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const optStr = (v: unknown) => v === undefined || isStr(v)

/** The structure, field by field. Synchronous: the store calls it inside its lock. */
export function parseJournal(raw: string): JournalRead {
  let j: unknown
  try {
    j = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'no es JSON válido (cortado o dañado)' }
  }
  if (!isObject(j)) return { ok: false, reason: 'no es un objeto' }
  if (j.format !== JOURNAL_FORMAT) return { ok: false, reason: `formato desconocido: ${String(j.format)}` }
  const problems: string[] = []
  if (!(JOURNAL_STATES as readonly unknown[]).includes(j.state)) problems.push(`estado desconocido: ${String(j.state)}`)
  if (!isStr(j.startedAt)) problems.push('falta la fecha de inicio')
  if (!optStr(j.finishedAt)) problems.push('fecha de cierre no válida')
  if (!isStr(j.writer)) problems.push('falta quién la hizo')
  if (!isGen(j.baseGeneration)) problems.push('generación base no válida')
  if (!(j.before === null || isStr(j.before))) problems.push('el texto anterior no es texto')
  if (!(j.beforeSha256 === null || isHash(j.beforeSha256))) problems.push('huella del texto anterior no válida')
  if (j.before === null && j.beforeSha256 !== null) problems.push('huella de un texto anterior que no existe')
  if (!isHash(j.targetSha256)) problems.push('falta la huella de lo que escribe')
  if (j.resultGeneration !== undefined && !isGen(j.resultGeneration)) problems.push('generación resultante no válida')
  if (!isObject(j.source) || !isStr(j.source.exportedAt) || !isStr(j.source.storedSha256) || !isGen(j.source.generation) || !optStr(j.source.name) || !optStr(j.source.origin))
    problems.push('falta el origen (la copia) o está incompleto')
  if (!isStr(j.summary)) problems.push('falta el resumen')
  if (!optStr(j.error) || !optStr(j.damaged)) problems.push('notas mal formadas')
  // What each state needs.
  const state = j.state as JournalState
  if (state !== 'en-curso' && !isStr(j.finishedAt)) problems.push(`«${state}» sin fecha de cierre`)
  if (state === 'completada' && !isGen(j.resultGeneration)) problems.push('«completada» sin generación resultante')
  if (state === 'completada' && j.before !== null && j.beforeSha256 === null) problems.push('«completada» sin huella del texto anterior')
  if (problems.length) return { ok: false, reason: problems.join('; ') }
  return { ok: true, journal: j as unknown as Journal }
}

/**
 * Why a write must wait, or `undefined`. A journal that is open («en-curso»)
 * or cannot be read means a recovery is unresolved: what it would recover is
 * still at stake, so nothing else writes until the person resolves it (H04).
 */
export function pendingRecovery(raw: string | null): string | undefined {
  if (raw === null) return undefined
  const r = parseJournal(raw)
  if (!r.ok) return `Hay un diario de recuperación dañado (${r.reason}). No se escribe nada hasta revisarlo en Recuperar.`
  if (!CLOSED_STATES.includes(r.journal.state)) return 'Hay una recuperación sin resolver. No se escribe nada hasta resolverla en Recuperar.'
  return undefined
}
