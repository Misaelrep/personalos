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

/**
 * «Continúa aquí»: one action or decision, chosen by explicit rules that can be checked against
 * the plan, never by an invented priority. The rule used is returned to be shown as it is.
 *  1. Before the sprint starts: a December decision that can be taken now (clarify a state,
 *     confirm a condition), in plan order. December's tasks are not presented as doable today.
 *  2. During the sprint, in the current month and in plan order: the first action that can be
 *     done now; else the first that waits for the person's approval; else the first that needs
 *     a decision; else the first blocked one, with what it waits for.
 */
export interface Focus {
  kind: 'hacer' | 'visto-bueno' | 'decidir' | 'preparar' | 'esperar' | 'empieza' | 'nada'
  item?: PlannedTask
  month: Month
  /** The rule that chose it, in plain words. */
  rule: string
}

const DECIDE = new Set<Stage>(['por-clasificar', 'por-verificar'])

export function focusNow(data: ProjectsData, s: Sprint, today: string): Focus {
  const { month, before, after } = monthOf(today)
  const label = MONTHS.find((m) => m.key === month)!.label.toLowerCase()
  const open = planned(data, s, month).filter((p) => p.stage !== 'cerrada')
  const noPriority = 'No hay una prioridad decidida entre tus acciones: sigo el orden del plan.'
  if (after) return { kind: 'nada', month, rule: 'El sprint terminó el 28 de febrero.' }
  if (before) {
    const prep = open.find((p) => DECIDE.has(p.stage))
    if (prep) return { kind: 'preparar', item: prep, month, rule: `Es la primera decisión pendiente de diciembre en el orden del plan. Puedes tomarla antes de empezar; las tareas de diciembre empiezan el 1 de diciembre. ${noPriority}` }
    if (open[0]) return { kind: 'empieza', item: open[0], month, rule: `Es la primera acción de diciembre en el orden del plan. Empieza el 1 de diciembre, no hoy. ${noPriority}` }
    return { kind: 'nada', month, rule: 'Diciembre no tiene acciones abiertas.' }
  }
  const pick = (kind: Focus['kind'], item: PlannedTask | undefined, rule: string): Focus | undefined => (item ? { kind, item, month, rule: `${rule} ${noPriority}` } : undefined)
  return (
    pick('hacer', open.find((p) => p.stage === 'lista'), `Es la primera acción de ${label} que se puede hacer ya.`) ??
    pick('visto-bueno', open.find((p) => p.stage === 'en-aprobacion'), `Ninguna acción de ${label} se puede hacer ya; esta solo espera tu visto bueno.`) ??
    pick('decidir', open.find((p) => DECIDE.has(p.stage)), `Ninguna acción de ${label} se puede hacer ya. Esta es la primera que necesita una decisión tuya.`) ??
    pick('esperar', open[0], `Todas las acciones de ${label} esperan a otras tareas. Esta es la primera; resuelve antes lo que espera.`) ?? { kind: 'nada', month, rule: `Todas las acciones de ${label} están terminadas.` }
  )
}
