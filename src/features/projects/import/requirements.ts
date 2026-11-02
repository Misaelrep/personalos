import type { Requirement, RequirementOption } from '../domain/types'
import { importedId } from '../domain/ids'

/**
 * P3 · Reading a dependency cell into requirements (P1.1 · M3), keeping the
 * literal. The reading only ever ADDS constraints: an unclear piece becomes a
 * condition «por verificar», never a met one.
 *
 *   "AAA-02"                  one task
 *   "AAA-02, AAA-05"          every task (cumulative)
 *   "AAA-02,03,05"            abbreviation, read as AAA-02, AAA-03, AAA-05 (shown as `reading`)
 *   "A o B"                   alternative: one valid option is enough
 *   "AAA-03 + material"       cumulative, task + condition
 *   "AAA-01..06 según parte"  conditional range: one condition, not expanded
 *   anything else             external condition
 */

const ID = /^[A-Za-zÀ-ÿ]{2,}[-_.]?\d+(?:[.-]\d+)*[A-Za-z]?$/
const EMPTY = /^(?:—|-|–|n\/a|ninguna?|no aplica)?$/i

const part = (text: string): RequirementOption => (ID.test(text) ? { kind: 'tarea', taskId: importedId(text) } : { kind: 'condicion', literal: text, state: 'por-verificar' })

/** "AAA-02,03,05" → ["AAA-02","AAA-03","AAA-05"], or null if it is not that shape. */
export function expandAbbreviation(text: string): string[] | null {
  const m = /^([A-Za-zÀ-ÿ]{2,}[-_.]?)(\d+)((?:\s*,\s*\d+)+)$/.exec(text.trim())
  if (!m) return null
  const width = m[2].length
  const rest = m[3].split(',').map((x) => x.trim()).filter(Boolean)
  if (rest.some((x) => x.length !== width)) return null
  return [m[2], ...rest].map((n) => `${m[1]}${n}`)
}

export function readRequirements(literal: string | undefined): Requirement[] {
  const text = (literal ?? '').trim()
  if (EMPTY.test(text)) return []
  const base = { id: 'r1', literal: literal! }

  if (/\.\.|…/.test(text) || /\bseg[uú]n\b/i.test(text))
    return [{ ...base, kind: 'condicional', mode: 'todas', options: [{ kind: 'condicion', literal: text, state: 'por-verificar' }] }]

  const alternatives = text.split(/\s+o\s+|\s*\|\|\s*/i)
  if (alternatives.length > 1) return [{ ...base, kind: 'alternativa', mode: 'alguna', options: alternatives.map((a) => part(a.trim())) }]

  const abbreviated = expandAbbreviation(text)
  if (abbreviated)
    return [{ ...base, kind: 'tarea', mode: 'todas', options: abbreviated.map((id) => part(id)), reading: `${text} → ${abbreviated.join(', ')}` }]

  const pieces = text.split(/\s*\+\s*|\s*;\s*|\s*,\s*|\s+y\s+/).filter(Boolean)
  const options = pieces.map((p) => part(p))
  const tasks = options.filter((o) => o.kind === 'tarea').length
  const kind = tasks === options.length ? 'tarea' : tasks === 0 ? 'externo' : 'mixto'
  // Commas inside a plain condition ("acceso, permisos") are kept as ONE condition.
  if (kind === 'externo') return [{ ...base, kind, mode: 'todas', options: [{ kind: 'condicion', literal: text, state: 'por-verificar' }] }]
  return [{ ...base, kind, mode: 'todas', options }]
}
