import { displayRef } from './ids'
import type { ProjectsData, Task, WeekPlan } from './types'
import { priorityRank, workClassOf } from './vocabulary'

/**
 * What the app reads from the data — never stored, always derived.
 *
 *   done             executed AND (no approval required OR approved)
 *   awaiting         executed, approval pending: technically finished, not done
 *   returned         approval returned: back to work, whatever its status says
 *   closed           done, or discarded
 *   blocked          waits for a task that is not done
 */

export const isDone = (data: ProjectsData, t: Task) =>
  workClassOf(data, t) === 'ejecutada' && (t.approval.state === 'no-requiere' || t.approval.state === 'aprobada')

export const isAwaitingApproval = (data: ProjectsData, t: Task) => workClassOf(data, t) === 'ejecutada' && t.approval.state === 'pendiente'

export const isReturned = (t: Task) => t.approval.state === 'devuelta'

export const isClosed = (data: ProjectsData, t: Task) => (isDone(data, t) && !isReturned(t)) || workClassOf(data, t) === 'descartada'

export interface Blockers {
  /** Dependencies that are not done yet (a discarded one does not block, but is listed apart). */
  waiting: Task[]
  /** Dependencies that were discarded: the person decides what that means for this task. */
  discarded: Task[]
  /** IDs written as dependencies that do not exist (kept, never dropped). */
  unknown: string[]
}

export function blockersOf(data: ProjectsData, t: Task, index = indexTasks(data)): Blockers {
  const b: Blockers = { waiting: [], discarded: [], unknown: [] }
  for (const id of t.dependsOn) {
    const dep = index.get(id)
    if (!dep) b.unknown.push(id)
    else if (workClassOf(data, dep) === 'descartada') b.discarded.push(dep)
    else if (!isDone(data, dep) || isReturned(dep)) b.waiting.push(dep)
  }
  return b
}

export const isBlocked = (data: ProjectsData, t: Task, index = indexTasks(data)) => blockersOf(data, t, index).waiting.length > 0

export const indexTasks = (data: ProjectsData) => new Map(data.tasks.map((t) => [t.id, t]))

/** Natural order of references: "PUB-2" before "PUB-10". */
const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

/**
 * Tasks of a project that could be the next action: open (pending, in progress
 * or returned), not blocked, not waiting for approval. Most urgent first; in
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
      return (c === 'pendiente' || c === 'en-curso' || isReturned(t)) && c !== 'descartada' && !isAwaitingApproval(data, t) && !isBlocked(data, t, index)
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
    for (const dep of index.get(id)?.dependsOn ?? []) if (index.has(dep)) walk(dep, [...path, id])
    state.set(id, 'done')
  }
  for (const t of data.tasks) walk(t.id, [])
  return cycles
}
