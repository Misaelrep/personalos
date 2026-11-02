import { weekStartOf } from './cycle'
import { allIds, newId } from './ids'
import { OpError, setStatus, type Ctx } from './ops'
import type { HistoryEntry, Project, ProjectsData, Vocabulary, WorkClass } from './types'

/**
 * P4b · The operations the screens add on top of P1: creating a project,
 * the status words ELYUM offers next to a dossier's, and closing the Sunday
 * review. Pure, each with its line in the history, like `ops.ts`.
 */

const log = (data: ProjectsData, ctx: Ctx, e: Omit<HistoryEntry, 'at' | 'by'>): HistoryEntry[] => [...data.history, { at: ctx.now, by: 'usuario', ...e }]

/**
 * The status words ELYUM offers in every project, with their class. A project
 * created in ELYUM starts with these; an imported one gets one only when the
 * person picks it (its own dossier words are never renamed or removed).
 */
export const ELYUM_STATUSES: { literal: string; workClass: WorkClass }[] = [
  { literal: 'Pendiente', workClass: 'pendiente' },
  { literal: 'En curso', workClass: 'en-curso' },
  { literal: 'En espera', workClass: 'en-espera' },
  { literal: 'Ejecutada', workClass: 'ejecutada' },
  { literal: 'Descartada', workClass: 'descartada' },
]

/** Vocabulary key of a project created in ELYUM (it has no dossier file). */
export const elyumDossierKey = (projectId: string) => `elyum:${projectId}`

/** A project created in ELYUM: name and objective; the id is generated, never typed. */
export function createProject(data: ProjectsData, input: { name: string; objective?: string }, ctx: Ctx): { data: ProjectsData; project: Project } {
  const name = input.name.trim()
  if (!name) throw new OpError('El proyecto necesita un nombre.')
  const id = newId(allIds(data), ctx.random)
  const dossier = elyumDossierKey(id)
  const objective = input.objective?.trim()
  const project: Project = { id, name, dossier, ...(objective ? { objective } : {}), expectedResults: [], atlasRefs: [] }
  const vocabulary: Vocabulary = { status: ELYUM_STATUSES.map((s) => ({ ...s })), priority: [], approval: [] }
  return {
    data: {
      ...data,
      vocabularies: { ...data.vocabularies, [dossier]: vocabulary },
      projects: [...data.projects, project],
      history: log(data, ctx, { entity: 'project', id, field: 'created', to: name }),
    },
    project,
  }
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^dossier operativo\b/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * Projects whose name looks like this one: the same once accents, case and
 * punctuation are ignored, one inside the other, or most words in common.
 * A hint for the person — never a silent merge.
 */
export function similarProjects(data: ProjectsData, name: string): Project[] {
  const n = normalize(name)
  if (!n) return []
  const words = new Set(n.split(' ').filter((w) => w.length > 2))
  return data.projects.filter((p) => {
    const m = normalize(p.name)
    if (!m) return false
    if (m === n) return true
    if ((m.length >= 4 && n.includes(m)) || (n.length >= 4 && m.includes(n))) return true
    const other = new Set(m.split(' ').filter((w) => w.length > 2))
    const shared = [...words].filter((w) => other.has(w)).length
    const union = new Set([...words, ...other]).size
    return union > 0 && shared / union >= 0.6
  })
}

/** Status words the person can choose for a task: the project's own, then ELYUM's that it lacks. */
export function statusChoices(data: ProjectsData, projectId: string): { literal: string; workClass: WorkClass; fromElyum: boolean }[] {
  const p = data.projects.find((x) => x.id === projectId)
  const own = p ? (data.vocabularies[p.dossier]?.status ?? []) : []
  const extra = ELYUM_STATUSES.filter((s) => !own.some((o) => o.literal === s.literal))
  return [...own.map((s) => ({ ...s, fromElyum: false })), ...extra.map((s) => ({ ...s, fromElyum: true }))]
}

/**
 * Change a task's status explicitly. A status word ELYUM offers that the
 * project's vocabulary lacks is added first (with its class), in the same
 * change; the dossier's own words are untouched. The history keeps both steps.
 */
export function changeStatus(data: ProjectsData, taskId: string, literal: string, ctx: Ctx): ProjectsData {
  const t = data.tasks.find((x) => x.id === taskId)
  if (!t) throw new OpError(`Tarea desconocida: ${taskId}`)
  if (t.status === literal) throw new OpError('La tarea ya tiene ese estado.')
  const p = data.projects.find((x) => x.id === t.projectId)
  if (!p) throw new OpError(`Proyecto desconocido: ${t.projectId}`)
  const v = data.vocabularies[p.dossier]
  if (!v) throw new OpError(`El proyecto no tiene vocabulario: ${p.dossier}`)
  let next = data
  if (!v.status.some((s) => s.literal === literal)) {
    const offered = ELYUM_STATUSES.find((s) => s.literal === literal)
    if (!offered) throw new OpError(`Estado «${literal}» fuera del vocabulario del proyecto.`)
    next = {
      ...data,
      vocabularies: { ...data.vocabularies, [p.dossier]: { ...v, status: [...v.status, { ...offered }] } },
      history: log(data, ctx, { entity: 'vocabulary', id: p.dossier, field: `status:${literal}`, to: offered.workClass, note: 'estado de ELYUM añadido al elegirlo' }),
    }
  }
  return setStatus(next, taskId, literal, ctx)
}

/** The Sunday review is done for this week. Commitments stay editable; the moment is recorded. */
export function closeWeekReview(data: ProjectsData, weekStart: string, ctx: Ctx): ProjectsData {
  if (weekStartOf(weekStart) !== weekStart) throw new OpError(`La semana empieza en lunes: ${weekStart}`)
  const current = data.weeks.find((w) => w.weekStart === weekStart) ?? { weekStart, commitments: [], notes: [], decisions: [] }
  const next = { ...current, closedAt: ctx.now }
  const weeks = data.weeks.some((w) => w.weekStart === weekStart) ? data.weeks.map((w) => (w.weekStart === weekStart ? next : w)) : [...data.weeks, next]
  return { ...data, weeks, history: log(data, ctx, { entity: 'week', id: weekStart, field: 'closed', to: ctx.now }) }
}
