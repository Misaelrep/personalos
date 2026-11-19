import { indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { causeText, explain, projectAttention, waitersOf } from '../ui/attention'
import { stageOf, type Stage } from '../ui/view'
import { MONTHS, monthOf, projectsOfPillar, type Month, type Pillar, type PlanAction, type Sprint } from './plan'

/** PROTOTYPE · What each screen shows, from the data and the plan. Pure. */

export const approved = (s: Sprint | null): s is Sprint & { status: 'aprobado' } => s?.status === 'aprobado'

/** Pillars of an approved plan with at least one action from this project. */
export const pillarsOf = (data: ProjectsData, s: Sprint | null, projectId: string): Pillar[] => (approved(s) ? s.pillars.filter((p) => projectsOfPillar(data, s, p.id).includes(projectId)) : [])

export interface PlannedTask {
  action: PlanAction
  task: Task
  pillar: Pillar
  stage: Stage
}

export function planned(data: ProjectsData, s: Sprint, month?: Month): PlannedTask[] {
  const index = indexTasks(data)
  return s.actions
    .filter((a) => !month || a.month === month)
    .flatMap((a) => {
      const task = index.get(a.taskId)
      const pillar = s.pillars.find((p) => p.id === a.pillarId)
      return task && pillar ? [{ action: a, task, pillar, stage: stageOf(data, task, index) }] : []
    })
}

/**
 * Where to continue: the first open action of the plan, this month first, one
 * that can be done now before one that waits. Never a ranking of importance:
 * the order is the plan's own (the person put it there), then the month.
 */
export function continueHere(data: ProjectsData, s: Sprint, today: string): PlannedTask | undefined {
  const { month } = monthOf(today)
  const from = MONTHS.findIndex((m) => m.key === month)
  for (const m of MONTHS.slice(from)) {
    const open = planned(data, s, m.key).filter((p) => p.stage !== 'cerrada')
    const pick = open.find((p) => p.stage === 'lista' || p.stage === 'en-aprobacion') ?? open[0]
    if (pick) return pick
  }
  return undefined
}

/** One decision the person can take, in plain words, and the task where it is taken. */
export interface Decision {
  text: string
  task: Task
}

/**
 * Decisions that matter for progress in a project: those on the plan's
 * actions (or on what they wait for) first, then those that free most tasks.
 */
export function decisionsOf(data: ProjectsData, projectId: string, s: Sprint | null): Decision[] {
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return []
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const a = projectAttention(data, project, index, waiters)
  const inPlan = new Set(approved(s) ? s.actions.map((x) => x.taskId) : [])
  // What the plan's actions wait for, one step back, counts as part of the plan.
  for (const id of [...inPlan]) {
    const t = index.get(id)
    if (t) for (const c of explain(data, t, index, waiters).causes) if (c.kind === 'espera') c.tasks.forEach((w) => inPlan.add(w.id))
  }
  const out: (Decision & { weight: number })[] = [
    ...a.approvals.map((t) => ({ text: `Dar el visto bueno a «${t.title}»`, task: t, weight: 3 })),
    ...a.words.map((w) => ({
      text: w.tasks.length === 1 ? `Decir en qué punto está «${w.tasks[0].title}»` : `Decir en qué punto están ${w.tasks.length} tareas marcadas «${w.literal}»`,
      task: w.tasks.find((t) => inPlan.has(t.id)) ?? w.tasks[0],
      weight: w.tasks.some((t) => inPlan.has(t.id)) ? 2 : w.waiting > 0 ? 1 : 0,
    })),
    ...a.checks.map((c) => ({ text: `Confirmar si «${c.literal}» se cumple`, task: c.tasks.find((t) => inPlan.has(t.id)) ?? c.tasks[0], weight: c.tasks.some((t) => inPlan.has(t.id)) ? 2 : 0 })),
  ]
  return out.sort((x, y) => y.weight - x.weight).map(({ text, task }) => ({ text, task }))
}

/** The next action in a project: from the plan this month if there is one, otherwise a task that can be done now, otherwise the first that only needs a decision. */
export function nextInProject(data: ProjectsData, projectId: string, s: Sprint | null, today: string): Task | undefined {
  if (approved(s)) {
    const { month } = monthOf(today)
    const mine = planned(data, s).filter((p) => p.task.projectId === projectId && p.stage !== 'cerrada')
    const now = mine.filter((p) => p.action.month === month && p.stage !== 'bloqueada')
    const pick = now.find((p) => p.stage === 'lista') ?? mine.find((p) => p.stage === 'lista') ?? now[0]
    if (pick) return pick.task
  }
  const project = data.projects.find((p) => p.id === projectId)
  return project ? (projectAttention(data, project).ready[0] ?? data.tasks.find((t) => t.projectId === projectId && !['bloqueada', 'cerrada'].includes(stageOf(data, t)))) : undefined
}

/** What the person needs before starting, in one sentence (or none when nothing stops it). */
export function needs(data: ProjectsData, t: Task): string | undefined {
  const ex = explain(data, t)
  return ex.causes.length ? ex.causes.map(causeText).join(' ') : undefined
}

export const openCount = (data: ProjectsData, projectId: string) => data.tasks.filter((t) => t.projectId === projectId && !isClosed(data, t)).length
