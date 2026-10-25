import { displayRef } from './ids'
import type { ProjectsData, Requirement, RequirementOption, Task, WeekPlan } from './types'
import { priorityRank, workClassOf } from './vocabulary'

/**
 * What the app reads from the data — never stored, always derived.
 *
 *   done             executed AND (no approval required OR approved)
 *   awaiting         executed, approval pending: technically finished, not done
 *   returned         approval returned: back to work, whatever its status says
 *   closed           done, or discarded
 *   blocked          waits for a task that is not done (in `dependsOn` or in a requirement)
 *   to verify        a requirement depends on a condition nobody has confirmed
 *   unclassified     its status literal has no class yet (`sin-decidir`)
 *
 * An unknown condition is never read as met: it keeps the task out of the
 * next-action candidates and is shown, with its source text.
 */

export const isDone = (data: ProjectsData, t: Task) =>
  workClassOf(data, t) === 'ejecutada' && (t.approval.state === 'no-requiere' || t.approval.state === 'aprobada')

/** Executed and waiting for the person: approval pending, or none declared (`sin-dato`, which never counts as approved). */
export const isAwaitingApproval = (data: ProjectsData, t: Task) => workClassOf(data, t) === 'ejecutada' && (t.approval.state === 'pendiente' || t.approval.state === 'sin-dato')

export const isUnclassified = (data: ProjectsData, t: Task) => workClassOf(data, t) === 'sin-decidir'

export const isReturned = (t: Task) => t.approval.state === 'devuelta'

export const isClosed = (data: ProjectsData, t: Task) => (isDone(data, t) && !isReturned(t)) || workClassOf(data, t) === 'descartada'

/**
 * P1.1 · M3. State of one requirement option and of a whole requirement:
 *   cumplido       met (a task done, or a condition the person confirmed)
 *   pendiente      waits for a task that is not done yet
 *   por-verificar  a condition nobody has checked, or a task id that does not exist
 *   no-cumplido    a condition marked as not met, or a discarded task
 */
export type RequirementState = 'cumplido' | 'pendiente' | 'por-verificar' | 'no-cumplido'

export interface RequirementStatus {
  requirement: Requirement
  state: RequirementState
  options: { option: RequirementOption; state: RequirementState; task?: Task }[]
}

function optionState(data: ProjectsData, o: RequirementOption, index: Map<string, Task>): { state: RequirementState; task?: Task } {
  if (o.kind === 'condicion') return { state: o.state === 'cumplida' ? 'cumplido' : o.state === 'no-cumplida' ? 'no-cumplido' : 'por-verificar' }
  const task = index.get(o.taskId)
  if (!task) return { state: 'por-verificar' }
  if (workClassOf(data, task) === 'descartada') return { state: 'no-cumplido', task }
  return { state: isDone(data, task) && !isReturned(task) ? 'cumplido' : 'pendiente', task }
}

export function requirementStatus(data: ProjectsData, r: Requirement, index = indexTasks(data)): RequirementStatus {
  const options = r.options.map((option) => ({ option, ...optionState(data, option, index) }))
  const states = options.map((o) => o.state)
  const has = (s: RequirementState) => states.includes(s)
  let state: RequirementState
  if (states.length === 0) state = 'por-verificar'
  else if (r.mode === 'todas') state = states.every((s) => s === 'cumplido') ? 'cumplido' : has('no-cumplido') ? 'no-cumplido' : has('pendiente') ? 'pendiente' : 'por-verificar'
  else state = has('cumplido') ? 'cumplido' : states.every((s) => s === 'no-cumplido') ? 'no-cumplido' : has('pendiente') ? 'pendiente' : 'por-verificar'
  return { requirement: r, state, options }
}

export interface Blockers {
  /** Dependencies that are not done yet (a discarded one does not block, but is listed apart). */
  waiting: Task[]
  /** Dependencies that were discarded: the person decides what that means for this task. */
  discarded: Task[]
  /** IDs written as dependencies that do not exist (kept, never dropped). */
  unknown: string[]
  /** P1.1 · M3: requirements not met, with their state. */
  requirements: RequirementStatus[]
}

export function blockersOf(data: ProjectsData, t: Task, index = indexTasks(data)): Blockers {
  const b: Blockers = { waiting: [], discarded: [], unknown: [], requirements: [] }
  for (const id of t.dependsOn) {
    const dep = index.get(id)
    if (!dep) b.unknown.push(id)
    else if (workClassOf(data, dep) === 'descartada') b.discarded.push(dep)
    else if (!isDone(data, dep) || isReturned(dep)) b.waiting.push(dep)
  }
  for (const r of t.requirements ?? []) {
    const st = requirementStatus(data, r, index)
    if (st.state !== 'cumplido') b.requirements.push(st)
  }
  return b
}

/** Waits for a task (in `dependsOn` or in a requirement), or a requirement is marked as not met. */
export const isBlocked = (data: ProjectsData, t: Task, index = indexTasks(data)) => {
  const b = blockersOf(data, t, index)
  return b.waiting.length > 0 || b.requirements.some((r) => r.state === 'pendiente' || r.state === 'no-cumplido')
}

/** A requirement depends on something nobody has checked yet. Not blocked, not ready either. */
export const needsVerification = (data: ProjectsData, t: Task, index = indexTasks(data)) => blockersOf(data, t, index).requirements.some((r) => r.state === 'por-verificar')

export type Readiness = 'por-clasificar' | 'bloqueada' | 'por-verificar' | 'lista'

/** Whether an open task could be executed now, and if not, why. */
export function readinessOf(data: ProjectsData, t: Task, index = indexTasks(data)): Readiness {
  if (isUnclassified(data, t)) return 'por-clasificar'
  if (isBlocked(data, t, index)) return 'bloqueada'
  if (needsVerification(data, t, index)) return 'por-verificar'
  return 'lista'
}

export const indexTasks = (data: ProjectsData) => new Map(data.tasks.map((t) => [t.id, t]))

/** Natural order of references: "PUB-2" before "PUB-10". */
const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

/**
 * Tasks of a project that could be the next action: open (pending, in progress
 * or returned), classified, not blocked, with no requirement left to verify,
 * not waiting for approval. Most urgent first; in
 * progress before pending; then by milestone date and reference.
 */
export function nextActionCandidates(data: ProjectsData, projectId: string, owner?: 'humano' | 'agente'): Task[] {
  const index = indexTasks(data)
  const due = new Map(data.milestones.map((m) => [m.id, m.due ?? '9999-12-31']))
  return data.tasks
    .filter((t) => t.projectId === projectId)
    .filter((t) => (owner ? (t.owner?.kind ?? 'humano') === owner : true))
    .filter((t) => {
      const c = workClassOf(data, t)
      return (c === 'pendiente' || c === 'en-curso' || (isReturned(t) && c !== 'sin-decidir')) && c !== 'descartada' && !isAwaitingApproval(data, t) && readinessOf(data, t, index) === 'lista'
    })
    .sort(
      (a, b) =>
        priorityRank(data, a) - priorityRank(data, b) ||
        Number(workClassOf(data, b) === 'en-curso') - Number(workClassOf(data, a) === 'en-curso') ||
        (due.get(a.milestoneId ?? '') ?? '9999-12-31').localeCompare(due.get(b.milestoneId ?? '') ?? '9999-12-31') ||
        natural.compare(displayRef(a) ?? a.title, displayRef(b) ?? b.title),
    )
}

export const weekPlanOf = (data: ProjectsData, weekStart: string): WeekPlan | undefined => data.weeks.find((w) => w.weekStart === weekStart)

/**
 * A project seen for one week, in the five distinct groups the Sunday review
 * works with. Nothing is activated automatically: commitments are only what
 * the person chose.
 */
export interface ProjectWeek {
  projectId: string
  /** 1 · every open task of the project (the whole backlog). */
  backlog: Task[]
  /** 2 · candidates for next action (human), not yet committed. */
  candidates: Task[]
  /** 3 · human commitments of this week. */
  commitments: Task[]
  /** 4 · active assignments of agents (Claude Code, Codex…). */
  agentActive: Task[]
  /** 5 · executed, waiting for human approval. */
  awaitingApproval: Task[]
  /** Open tasks whose status literal has no class yet (P1.1 · M1). */
  unclassified: Task[]
  /** Open tasks with a requirement nobody has verified (P1.1 · M3). */
  toVerify: Task[]
}

export function projectWeek(data: ProjectsData, projectId: string, weekStart: string): ProjectWeek {
  const plan = weekPlanOf(data, weekStart)
  const committed = new Set(plan?.commitments.map((c) => c.taskId))
  const tasks = data.tasks.filter((t) => t.projectId === projectId)
  return {
    projectId,
    backlog: tasks.filter((t) => !isClosed(data, t)),
    candidates: nextActionCandidates(data, projectId, 'humano').filter((t) => !committed.has(t.id)),
    commitments: tasks.filter((t) => committed.has(t.id)),
    agentActive: tasks.filter((t) => t.owner?.kind === 'agente' && (workClassOf(data, t) === 'en-curso' || workClassOf(data, t) === 'en-espera') && !isClosed(data, t)),
    awaitingApproval: tasks.filter((t) => isAwaitingApproval(data, t)),
    unclassified: tasks.filter((t) => isUnclassified(data, t)),
    toVerify: tasks.filter((t) => !isClosed(data, t) && !isUnclassified(data, t) && readinessOf(data, t) === 'por-verificar'),
  }
}

export type LoadWarning =
  | { kind: 'over-capacity'; committedHours: number; capacityHours: number }
  | { kind: 'over-wip'; commitments: number; wipLimit: number }
  | { kind: 'unestimated'; taskIds: string[] }
  | { kind: 'blocked-commitment'; taskIds: string[] }
  | { kind: 'closed-commitment'; taskIds: string[] }

export interface WeekLoad {
  commitments: number
  committedHours: number
  capacityHours?: number
  wipLimit?: number
  warnings: LoadWarning[]
}

/**
 * How much the person took on this week against what they said fits. Warns —
 * never refuses: the decision stays human. Agents' assignments are not human
 * load and are not counted here.
 */
export function weekLoad(data: ProjectsData, weekStart: string): WeekLoad {
  const plan = weekPlanOf(data, weekStart)
  const index = indexTasks(data)
  const commitments = plan?.commitments ?? []
  const estimateOf = (c: WeekPlan['commitments'][number]) => c.estimateHours ?? index.get(c.taskId)?.estimateHours
  const committedHours = commitments.reduce((sum, c) => sum + (estimateOf(c) ?? 0), 0)
  const warnings: LoadWarning[] = []
  if (plan?.humanCapacityHours !== undefined && committedHours > plan.humanCapacityHours)
    warnings.push({ kind: 'over-capacity', committedHours, capacityHours: plan.humanCapacityHours })
  if (plan?.wipLimit !== undefined && commitments.length > plan.wipLimit) warnings.push({ kind: 'over-wip', commitments: commitments.length, wipLimit: plan.wipLimit })
  const unestimated = commitments.filter((c) => estimateOf(c) === undefined).map((c) => c.taskId)
  if (unestimated.length) warnings.push({ kind: 'unestimated', taskIds: unestimated })
  const tasks = commitments.map((c) => index.get(c.taskId)).filter((t): t is Task => Boolean(t))
  const blocked = tasks.filter((t) => isBlocked(data, t, index)).map((t) => t.id)
  if (blocked.length) warnings.push({ kind: 'blocked-commitment', taskIds: blocked })
  const closed = tasks.filter((t) => isClosed(data, t)).map((t) => t.id)
  if (closed.length) warnings.push({ kind: 'closed-commitment', taskIds: closed })
  return { commitments: commitments.length, committedHours, capacityHours: plan?.humanCapacityHours, wipLimit: plan?.wipLimit, warnings }
}

/** Approvals waiting for the person, across every project — the Sunday list. */
export const awaitingApprovalAll = (data: ProjectsData) => data.tasks.filter((t) => isAwaitingApproval(data, t))

/** Every task a task points to: `dependsOn` and the tasks named in its requirements. */
export const linksOf = (t: Task | undefined): string[] =>
  t ? [...t.dependsOn, ...(t.requirements ?? []).flatMap((r) => r.options.flatMap((o) => (o.kind === 'tarea' ? [o.taskId] : [])))] : []

/** Dependency cycles, as lists of internal ids (each cycle once). */
export function dependencyCycles(data: ProjectsData): string[][] {
  const index = indexTasks(data)
  const cycles: string[][] = []
  const seen = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const walk = (id: string, path: string[]) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      const cycle = path.slice(path.indexOf(id))
      const key = [...cycle].sort().join('|')
      if (!seen.has(key)) {
        seen.add(key)
        cycles.push(cycle)
      }
      return
    }
    state.set(id, 'visiting')
    for (const dep of linksOf(index.get(id))) if (index.has(dep)) walk(dep, [...path, id])
    state.set(id, 'done')
  }
  for (const t of data.tasks) walk(t.id, [])
  return cycles
}
