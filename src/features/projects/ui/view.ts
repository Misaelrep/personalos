import { blockersOf, indexTasks, isAwaitingApproval, isClosed, isReturned, nextActionCandidates, readinessOf, type Blockers, type Readiness } from '../domain/derive'
import { displayRef } from '../domain/ids'
import type { ApprovalState, DossierSource, ImportRecord, Milestone, Project, ProjectsData, Task, VerificationState, WorkClass } from '../domain/types'
import { workClassOf } from '../domain/vocabulary'

/**
 * P4a · What the screens show, derived from the data and never stored. Pure,
 * so every count and state on screen has a unit test. Nothing here decides
 * for the person: an unknown stays unknown, and is shown as such.
 */

/** Where an open or closed task stands, in the order the screens group them. */
export type Stage = 'en-aprobacion' | Readiness | 'cerrada'
export const STAGES: Stage[] = ['lista', 'por-verificar', 'bloqueada', 'por-clasificar', 'en-aprobacion', 'cerrada']

export function stageOf(data: ProjectsData, t: Task, index = indexTasks(data)): Stage {
  if (isClosed(data, t)) return 'cerrada'
  if (isAwaitingApproval(data, t)) return 'en-aprobacion'
  return readinessOf(data, t, index)
}

const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
export const byRef = (a: Task, b: Task) => natural.compare(displayRef(a) ?? a.title, displayRef(b) ?? b.title)

export interface ProjectSummary {
  project: Project
  tasks: Task[]
  /** Tasks per stage. */
  stages: Record<Stage, number>
  open: number
  /** Next actions the person wrote on open tasks. */
  nextActions: Task[]
  /** The person's tasks that could be the next action (P1 rules). Never chosen automatically. */
  candidates: Task[]
  /** P4b · Open tasks given to an agent: listed apart from the person's own. */
  agents: Task[]
  blocked: { task: Task; blockers: Blockers }[]
  milestones: Milestone[]
  references: number
  sources: number
  lastImport?: ImportRecord
}

export function projectSummary(data: ProjectsData, projectId: string): ProjectSummary | undefined {
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return undefined
  const index = indexTasks(data)
  const tasks = data.tasks.filter((t) => t.projectId === projectId).sort(byRef)
  const stages = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
  for (const t of tasks) stages[stageOf(data, t, index)]++
  const openTasks = tasks.filter((t) => !isClosed(data, t))
  return {
    project,
    tasks,
    stages,
    open: openTasks.length,
    nextActions: openTasks.filter((t) => t.nextAction?.trim() && t.owner?.kind !== 'agente'),
    candidates: nextActionCandidates(data, projectId, 'humano'),
    agents: openTasks.filter((t) => t.owner?.kind === 'agente'),
    blocked: openTasks.filter((t) => stageOf(data, t, index) === 'bloqueada').map((task) => ({ task, blockers: blockersOf(data, task, index) })),
    milestones: data.milestones.filter((m) => m.projectId === projectId),
    references: (data.references ?? []).filter((r) => r.projectId === projectId).length,
    sources: (data.sources ?? []).filter((s) => s.dossier === project.dossier).length,
    lastImport: [...(data.imports ?? [])].reverse().find((r) => r.projectId === projectId),
  }
}

/**
 * The three things the screens never merge: the work was executed, someone
 * verified it, the person approved it. Each comes from its own field.
 */
export interface Track {
  executed: { state: 'si' | 'no' | 'sin-decidir'; workClass?: WorkClass; literal: string }
  verified: { state: VerificationState | 'sin-dato'; literal?: string }
  approved: { state: ApprovalState; literal?: string; returned: boolean; decidedAt?: string }
}

export function trackOf(data: ProjectsData, t: Task): Track {
  const c = workClassOf(data, t)
  return {
    executed: { state: c === 'ejecutada' ? 'si' : c === undefined || c === 'sin-decidir' ? 'sin-decidir' : 'no', ...(c ? { workClass: c } : {}), literal: t.status },
    verified: { state: t.verification?.state ?? 'sin-dato', ...(t.verification?.literal ? { literal: t.verification.literal } : {}) },
    approved: { state: t.approval.state, ...(t.approval.original?.literal ? { literal: t.approval.original.literal } : {}), returned: isReturned(t), ...(t.approval.decidedAt ? { decidedAt: t.approval.decidedAt } : {}) },
  }
}

export interface TaskDetail {
  task: Task
  project?: Project
  stage: Stage
  workClass?: WorkClass
  track: Track
  blockers: Blockers
  /** Tasks that wait for this one (in `dependsOn` or a requirement). */
  usedBy: Task[]
  /** The dossier sources the task cites, resolved; a key the dossier does not list stays as `undefined`. */
  sources: { key: string; source?: DossierSource }[]
}

export function taskDetail(data: ProjectsData, taskId: string): TaskDetail | undefined {
  const index = indexTasks(data)
  const task = index.get(taskId)
  if (!task) return undefined
  const project = data.projects.find((p) => p.id === task.projectId)
  const linksTo = (t: Task) => t.dependsOn.includes(taskId) || (t.requirements ?? []).some((r) => r.options.some((o) => o.kind === 'tarea' && o.taskId === taskId))
  const listed = (data.sources ?? []).filter((s) => s.dossier === project?.dossier)
  const workClass = workClassOf(data, task)
  return {
    task,
    ...(project ? { project } : {}),
    stage: stageOf(data, task, index),
    ...(workClass ? { workClass } : {}),
    track: trackOf(data, task),
    blockers: blockersOf(data, task, index),
    usedBy: data.tasks.filter((t) => t.id !== taskId && linksTo(t)).sort(byRef),
    sources: (task.sourceRefs?.keys ?? []).map((key) => ({ key, source: listed.find((s) => s.key === key) })),
  }
}

/** All projects, with totals for the overview. */
export function overview(data: ProjectsData): { summaries: ProjectSummary[]; totals: Record<Stage, number> & { open: number } } {
  const summaries = data.projects.map((p) => projectSummary(data, p.id)!).filter(Boolean)
  const totals = { ...(Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>), open: 0 }
  for (const s of summaries) {
    totals.open += s.open
    for (const st of STAGES) totals[st] += s.stages[st]
  }
  return { summaries, totals }
}
