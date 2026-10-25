import { weekdayOf } from '../../../domain/routine'
import { cycleWeeks, weekStartOf, type CycleWeek } from '../domain/cycle'
import { indexTasks, isAwaitingApproval, isClosed, projectWeek, weekLoad, weekPlanOf, type WeekLoad } from '../domain/derive'
import type { Project, ProjectsData, Task, WeekPlan } from '../domain/types'
import { workClassOf } from '../domain/vocabulary'
import { byRef, stageOf } from './view'

/**
 * P4b · The Sunday review, derived. It shows every project, but proposes
 * nothing on its own: candidates are only what P1 calls ready, and a
 * commitment exists only when the person makes it. Agents' work is listed
 * apart and never counts as the person's load.
 */

export interface ProjectReview {
  project: Project
  /** Human candidates not committed yet (P1 rules: classified, nothing pending or to verify). */
  candidates: Task[]
  /** The person's commitments of this week in this project. */
  commitments: Task[]
  blocked: number
  unclassified: number
  toVerify: number
  open: number
}

export interface WeeklyReview {
  week: CycleWeek
  plan?: WeekPlan
  load: WeekLoad
  projects: ProjectReview[]
  /** Every commitment of the week, in order. */
  commitments: { task: Task; estimateHours?: number }[]
  /** Open tasks assigned to an agent, every project. */
  agents: Task[]
  /** Executed, waiting for the person's decision, every project. */
  awaiting: Task[]
  /** Hours left before the declared capacity, when there is one. */
  hoursLeft?: number
  /** Commitments left before the declared limit, when there is one. */
  slotsLeft?: number
}

/** The week a review on this date plans: on Sunday, the coming week; otherwise this one. Kept inside the cycle. */
export function reviewWeekFor(data: ProjectsData, today: string): CycleWeek {
  const weeks = cycleWeeks(data.cycle)
  const isSunday = weekdayOf(today) === 0
  const target = isSunday ? weeks.find((w) => w.start > today) : weeks.find((w) => today >= w.start && today <= w.end)
  if (target) return target
  return today < data.cycle.start ? weeks[0] : weeks[weeks.length - 1]
}

export function weeklyReview(data: ProjectsData, week: CycleWeek): WeeklyReview {
  const weekStart = weekStartOf(week.start)
  const plan = weekPlanOf(data, weekStart)
  const index = indexTasks(data)
  const load = weekLoad(data, weekStart)
  const projects = data.projects.map((project): ProjectReview => {
    const pw = projectWeek(data, project.id, weekStart)
    const open = pw.backlog
    return {
      project,
      candidates: pw.candidates,
      commitments: pw.commitments,
      blocked: open.filter((t) => stageOf(data, t, index) === 'bloqueada').length,
      unclassified: pw.unclassified.length,
      toVerify: pw.toVerify.length,
      open: open.length,
    }
  })
  const commitments = (plan?.commitments ?? []).flatMap((c) => {
    const task = index.get(c.taskId)
    return task ? [{ task, ...(c.estimateHours !== undefined ? { estimateHours: c.estimateHours } : {}) }] : []
  })
  const agents = data.tasks
    .filter((t) => t.owner?.kind === 'agente' && !isClosed(data, t) && workClassOf(data, t) !== 'descartada')
    .sort(byRef)
  return {
    week,
    ...(plan ? { plan } : {}),
    load,
    projects,
    commitments,
    agents,
    awaiting: data.tasks.filter((t) => isAwaitingApproval(data, t)).sort(byRef),
    ...(load.capacityHours !== undefined ? { hoursLeft: load.capacityHours - load.committedHours } : {}),
    ...(load.wipLimit !== undefined ? { slotsLeft: load.wipLimit - load.commitments } : {}),
  }
}

/** Monday of the week a task is committed in, if any (to show «esta semana» on the task). */
export function committedWeeks(data: ProjectsData, taskId: string): string[] {
  return data.weeks.filter((w) => w.commitments.some((c) => c.taskId === taskId)).map((w) => w.weekStart)
}
