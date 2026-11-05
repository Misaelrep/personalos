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
 *   "M03–M05"                 explicit range (en/em dash, same prefix): M03, M04, M05 (shown as `reading`)
 *   anything else             external condition
 *
 * IDs may have one letter (M01, A2) or more (PUB-02). When the importer passes
 * the IDs of the dossier (`known`), an ID that is not one of them is never
 * linked: it stays a condition «por verificar» with its text, so an import
 * never writes a link to a task that does not exist.
 */

const ID = /^[A-Za-zÀ-ÿ]{1,}[-_.]?\d+(?:[.-]\d+)*[A-Za-z]?$/
const EMPTY = /^(?:—|-|–|n\/a|ninguna?|no aplica)?$/i

/** The IDs of the dossier being read. Absent: any ID-shaped text is a task (unit use). */
export type KnownIds = ReadonlySet<string> | undefined

const isTask = (text: string, known: KnownIds) => ID.test(text) && (!known || known.has(text))
const part = (text: string, known: KnownIds): RequirementOption => (isTask(text, known) ? { kind: 'tarea', taskId: importedId(text) } : { kind: 'condicion', literal: text, state: 'por-verificar' })

/** "AAA-02,03,05" → ["AAA-02","AAA-03","AAA-05"], or null if it is not that shape. */
export function expandAbbreviation(text: string): string[] | null {
  const m = /^([A-Za-zÀ-ÿ]{2,}[-_.]?)(\d+)((?:\s*,\s*\d+)+)$/.exec(text.trim())
  if (!m) return null
  const width = m[2].length
  const rest = m[3].split(',').map((x) => x.trim()).filter(Boolean)
  if (rest.some((x) => x.length !== width)) return null
  return [m[2], ...rest].map((n) => `${m[1]}${n}`)
}

/** "M03–M05" → ["M03","M04","M05"]: an en/em dash between two IDs with the same prefix and width, or null. */
export function expandRange(text: string): string[] | null {
  const m = /^([A-Za-zÀ-ÿ]{1,}[-_.]?)(\d+)\s*[–—]\s*([A-Za-zÀ-ÿ]{1,}[-_.]?)(\d+)$/.exec(text.trim())
  if (!m || m[1] !== m[3] || m[2].length !== m[4].length) return null
  const a = Number(m[2])
  const b = Number(m[4])
  if (!(b > a) || b - a > 50) return null
  return Array.from({ length: b - a + 1 }, (_, i) => `${m[1]}${String(a + i).padStart(m[2].length, '0')}`)
}

export function readRequirements(literal: string | undefined, known?: KnownIds): Requirement[] {
  const text = (literal ?? '').trim()
  if (EMPTY.test(text)) return []
  const base = { id: 'r1', literal: literal! }

  if (/\.\.|…/.test(text) || /\bseg[uú]n\b/i.test(text))
    return [{ ...base, kind: 'condicional', mode: 'todas', options: [{ kind: 'condicion', literal: text, state: 'por-verificar' }] }]

  const alternatives = text.split(/\s+o\s+|\s*\|\|\s*/i)
  if (alternatives.length > 1) return [{ ...base, kind: 'alternativa', mode: 'alguna', options: alternatives.map((a) => part(a.trim(), known)) }]

  // A range or abbreviation is expanded only when every ID it names exists; otherwise it stays one condition, as written.
  for (const ids of [expandRange(text), expandAbbreviation(text)])
    if (ids) {
      if (ids.every((id) => isTask(id, known))) return [{ ...base, kind: 'tarea', mode: 'todas', options: ids.map((id) => part(id, known)), reading: `${text} → ${ids.join(', ')}` }]
      return [{ ...base, kind: 'externo', mode: 'todas', options: [{ kind: 'condicion', literal: text, state: 'por-verificar' }] }]
    }

  const pieces = text.split(/\s*\+\s*|\s*;\s*|\s*,\s*|\s+y\s+/).filter(Boolean)
  const options = pieces.map((p) => part(p, known))
  const tasks = options.filter((o) => o.kind === 'tarea').length
  const kind = tasks === options.length ? 'tarea' : tasks === 0 ? 'externo' : 'mixto'
  // Commas inside a plain condition ("acceso, permisos") are kept as ONE condition.
  if (kind === 'externo') return [{ ...base, kind, mode: 'todas', options: [{ kind: 'condicion', literal: text, state: 'por-verificar' }] }]
  return [{ ...base, kind, mode: 'todas', options }]
}
