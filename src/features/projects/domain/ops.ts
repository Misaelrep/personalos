import { weekStartOf } from './cycle'
import { allIds, newId } from './ids'
import type { ApprovalState, Evidence, HistoryEntry, Owner, ProjectsData, RoutineLink, Task, WeekPlan } from './types'

/**
 * The changes a person makes in ELYUM. Pure: each returns new data and adds
 * its line to the history. None of them can touch what came from a dossier —
 * `sourceId` and `origin` are never written here — and none of them changes a
 * task's status on its own (a FOCUS session is evidence, not a status).
 */
export interface Ctx {
  /** Local ISO instant of the change. */
  now: string
  /** Injectable for tests. */
  random?: () => string
}

export class OpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpError'
  }
}

const log = (data: ProjectsData, ctx: Ctx, e: Omit<HistoryEntry, 'at' | 'by'>): HistoryEntry[] => [...data.history, { at: ctx.now, by: 'usuario', ...e }]

function withTask(data: ProjectsData, taskId: string, ctx: Ctx, field: string, update: (t: Task) => Task, note?: string): ProjectsData {
  const t = data.tasks.find((x) => x.id === taskId)
  if (!t) throw new OpError(`Tarea desconocida: ${taskId}`)
  const next = update(t)
  const from = (t as unknown as Record<string, unknown>)[field]
  const to = (next as unknown as Record<string, unknown>)[field]
  return {
    ...data,
    tasks: data.tasks.map((x) => (x.id === taskId ? { ...next, id: t.id, sourceId: t.sourceId, origin: t.origin } : x)),
    history: log(data, ctx, { entity: 'task', id: taskId, field, from, to, ...(note ? { note } : {}) }),
  }
}

const statusLiterals = (data: ProjectsData, projectId: string) => {
  const p = data.projects.find((x) => x.id === projectId)
  return p ? (data.vocabularies[p.dossier]?.status ?? []).map((s) => s.literal) : []
}

export interface NewTask {
  projectId: string
  title: string
  /** A literal of the project's vocabulary. */
  status: string
  priority?: string
  owner?: Owner
  milestoneId?: string
  nextAction?: string
  ref?: string
  acceptance?: string[]
  dependsOn?: string[]
  estimateHours?: number
  approval?: ApprovalState
}

/** A task created in ELYUM: its id is generated, never typed; it has no dossier origin. */
export function createTask(data: ProjectsData, input: NewTask, ctx: Ctx): { data: ProjectsData; task: Task } {
  if (!data.projects.some((p) => p.id === input.projectId)) throw new OpError(`Proyecto desconocido: ${input.projectId}`)
  if (!input.title.trim()) throw new OpError('La tarea necesita un título.')
  if (!statusLiterals(data, input.projectId).includes(input.status)) throw new OpError(`Estado «${input.status}» fuera del vocabulario del proyecto.`)
  const id = newId(allIds(data), ctx.random)
  const task: Task = {
    id,
    ...(input.ref ? { ref: input.ref } : {}),
    projectId: input.projectId,
    ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
    title: input.title.trim(),
    status: input.status,
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    dependsOn: input.dependsOn ?? [],
    acceptance: input.acceptance ?? [],
    evidence: [],
    approval: { state: input.approval ?? 'no-requiere' },
    ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    ...(input.estimateHours !== undefined ? { estimateHours: input.estimateHours } : {}),
    atlasRefs: [],
    createdAt: ctx.now,
  }
  return {
    data: { ...data, tasks: [...data.tasks, task], history: log(data, ctx, { entity: 'task', id, field: 'created', to: task.title }) },
    task,
  }
}

/** Change the operational status, to another literal of the same vocabulary. Approval is untouched. */
export function setStatus(data: ProjectsData, taskId: string, status: string, ctx: Ctx): ProjectsData {
  const t = data.tasks.find((x) => x.id === taskId)
  if (t && !statusLiterals(data, t.projectId).includes(status)) throw new OpError(`Estado «${status}» fuera del vocabulario del proyecto.`)
  return withTask(data, taskId, ctx, 'status', (x) => ({ ...x, status }))
}

/** The task is executed and needs the person's eye. */
export function requestApproval(data: ProjectsData, taskId: string, ctx: Ctx): ProjectsData {
  return withTask(data, taskId, ctx, 'approval', (x) => ({ ...x, approval: { ...x.approval, state: 'pendiente' } }))
}

/** The person's decision. The dossier's original approval stays as it was. */
export function decideApproval(data: ProjectsData, taskId: string, decision: 'aprobada' | 'devuelta', ctx: Ctx, note?: string): ProjectsData {
  return withTask(
    data,
    taskId,
    ctx,
    'approval',
    (x) => ({ ...x, approval: { ...x.approval, state: decision, decidedAt: ctx.now, ...(note ? { note } : {}) } }),
    note,
  )
}

export function addEvidence(data: ProjectsData, taskId: string, evidence: Omit<Evidence, 'addedAt'>, ctx: Ctx): ProjectsData {
  return withTask(data, taskId, ctx, 'evidence', (x) => ({ ...x, evidence: [...x.evidence, { ...evidence, addedAt: ctx.now }] }))
}

export function setNextAction(data: ProjectsData, taskId: string, nextAction: string | undefined, ctx: Ctx): ProjectsData {
  return withTask(data, taskId, ctx, 'nextAction', (x) => {
    const { nextAction: _, ...rest } = x
    return nextAction?.trim() ? { ...rest, nextAction: nextAction.trim() } : rest
  })
}

export function setOwner(data: ProjectsData, taskId: string, owner: Owner | undefined, ctx: Ctx): ProjectsData {
  return withTask(data, taskId, ctx, 'owner', (x) => {
    const { owner: _, ...rest } = x
    return owner ? { ...rest, owner } : rest
  })
}

function withWeek(data: ProjectsData, weekStart: string, ctx: Ctx, field: string, update: (w: WeekPlan) => WeekPlan, to?: unknown): ProjectsData {
  if (weekStartOf(weekStart) !== weekStart) throw new OpError(`La semana empieza en lunes: ${weekStart}`)
  const current = data.weeks.find((w) => w.weekStart === weekStart) ?? { weekStart, commitments: [], notes: [], decisions: [] }
  const next = update(current)
  const weeks = data.weeks.some((w) => w.weekStart === weekStart) ? data.weeks.map((w) => (w.weekStart === weekStart ? next : w)) : [...data.weeks, next]
  return { ...data, weeks, history: log(data, ctx, { entity: 'week', id: weekStart, field, to }) }
}

/** The person takes on a task this week. Never automatic; warnings come from `weekLoad`. */
export function commit(data: ProjectsData, weekStart: string, taskId: string, ctx: Ctx, estimateHours?: number): ProjectsData {
  if (!data.tasks.some((t) => t.id === taskId)) throw new OpError(`Tarea desconocida: ${taskId}`)
  return withWeek(
    data,
    weekStart,
    ctx,
    'commit',
    (w) => (w.commitments.some((c) => c.taskId === taskId) ? w : { ...w, commitments: [...w.commitments, { taskId, ...(estimateHours !== undefined ? { estimateHours } : {}) }] }),
    taskId,
  )
}

export function uncommit(data: ProjectsData, weekStart: string, taskId: string, ctx: Ctx): ProjectsData {
  return withWeek(data, weekStart, ctx, 'uncommit', (w) => ({ ...w, commitments: w.commitments.filter((c) => c.taskId !== taskId) }), taskId)
}

export function setWeekLimits(data: ProjectsData, weekStart: string, limits: { humanCapacityHours?: number; wipLimit?: number }, ctx: Ctx): ProjectsData {
  return withWeek(data, weekStart, ctx, 'limits', (w) => ({ ...w, ...limits }), limits)
}

/** Propose or confirm that a routine tag serves a project. Only `confirmed` links give routine hours. */
export function setRoutineLink(data: ProjectsData, link: RoutineLink, ctx: Ctx): ProjectsData {
  const others = data.routineLinks.filter((l) => !(l.projectId === link.projectId && l.tag === link.tag))
  return {
    ...data,
    routineLinks: [...others, link],
    history: log(data, ctx, { entity: 'routine-link', id: `${link.projectId}:${link.tag}`, field: 'confirmed', to: link.confirmed }),
  }
}

export function removeRoutineLink(data: ProjectsData, projectId: string, tag: RoutineLink['tag'], ctx: Ctx): ProjectsData {
  return {
    ...data,
    routineLinks: data.routineLinks.filter((l) => !(l.projectId === projectId && l.tag === tag)),
    history: log(data, ctx, { entity: 'routine-link', id: `${projectId}:${tag}`, field: 'removed' }),
  }
}
