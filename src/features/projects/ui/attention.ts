import { blockersOf, indexTasks, isAwaitingApproval, isClosed, nextActionCandidates, type Blockers } from '../domain/derive'
import { displayRef } from '../domain/ids'
import { cycleWeeks } from '../domain/cycle'
import type { Cycle, Project, ProjectsData, Task } from '../domain/types'
import { plainText } from './inline'
import { byRef, stageOf, type Stage } from './view'

/**
 * E1 · Orientation: what needs the person, what can be done now, and why the
 * rest cannot move yet — in plain words, derived from the data and never
 * stored. Pure, like `view.ts`. Nothing here ranks projects or tasks by
 * importance: the only ordering it computes is «how many open tasks wait
 * directly for this one», a fact of the dependencies, shown as such.
 */

/** A task named in a sentence: its title as shown, with its ID after it when it has one. */
const named = (t: Task) => {
  const ref = displayRef(t)
  return `«${plainText(t.title)}»${ref ? ` (${ref})` : ''}`
}

/** Open tasks that wait directly for each task (in `dependsOn`, or as a pending task in a requirement). */
export function waitersOf(data: ProjectsData, index = indexTasks(data)): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  for (const t of data.tasks) {
    if (isClosed(data, t)) continue
    const b = blockersOf(data, t, index)
    const ids = new Set([
      ...b.waiting.map((w) => w.id),
      ...b.requirements.flatMap((r) => r.options.flatMap((o) => (o.option.kind === 'tarea' && o.state === 'pendiente' ? [o.option.taskId] : []))),
    ])
    for (const id of ids) out.set(id, [...(out.get(id) ?? []), t])
  }
  return out
}

/** One word of a dossier's status column that has no meaning in ELYUM yet, with the tasks of one project that use it. */
export interface WordToClarify {
  project: Project
  literal: string
  tasks: Task[]
  /** Open tasks that wait directly for any of these tasks. */
  waiting: number
}

/** One condition nobody has confirmed, as the dossier wrote it, with the tasks of one project that need it. */
export interface CheckToMake {
  project: Project
  literal: string
  tasks: Task[]
}

/**
 * One way out of an alternative requirement («alguna»): a task to finish, a
 * condition to confirm, or an ID the dossier names that does not exist here.
 */
export type Way = { kind: 'tarea'; task: Task } | { kind: 'condicion'; literal: string } | { kind: 'desconocida'; id: string }

/**
 * Why an open task cannot move yet, from its real cause. The logical structure
 * of each requirement is kept (F02): what is required in every case (`tasks`,
 * `literals`) is never mixed with the alternatives of an «alguna» requirement
 * (`groups`, each one enough on its own).
 */
export type Cause =
  | { kind: 'estado'; literal: string }
  | { kind: 'comprobar'; literals: string[]; groups: string[][] }
  | { kind: 'espera'; tasks: Task[]; groups: Way[][] }
  | { kind: 'no-cumplido'; literals: string[] }
  | { kind: 'descartada'; tasks: Task[] }
  | { kind: 'visto-bueno' }

export function causesOf(t: Task, stage: Stage, b: Blockers): Cause[] {
  if (stage === 'cerrada' || stage === 'lista') return []
  if (stage === 'en-aprobacion') return [{ kind: 'visto-bueno' }]
  const out: Cause[] = []
  if (stage === 'por-clasificar') out.push({ kind: 'estado', literal: t.status })
  // Required in every case: dependencies, every option of a «todas», and the only option left of an «alguna».
  const waiting = [...b.waiting]
  const check: string[] = []
  const notMet: string[] = []
  const discarded = [...b.discarded]
  // Alternatives still open, one group per «alguna» requirement.
  const taskGroups: Way[][] = []
  const checkGroups: string[][] = []
  const required = (o: Blockers['requirements'][number]['options'][number]) => {
    if (o.option.kind === 'condicion') (o.state === 'no-cumplido' ? notMet : check).push(o.option.literal)
    else if (!o.task) check.push(o.option.taskId.replace(/^src:/, ''))
    else if (o.state === 'no-cumplido') discarded.push(o.task)
    else if (!waiting.includes(o.task)) waiting.push(o.task)
  }
  for (const r of b.requirements) {
    const open = r.options.filter((o) => o.state !== 'cumplido')
    if (r.requirement.mode === 'todas') {
      open.forEach(required)
      continue
    }
    // «alguna»: options marked as not met are no longer a way out.
    const viable = open.filter((o) => o.state !== 'no-cumplido')
    if (viable.length === 0) open.forEach(required)
    else if (viable.length === 1) required(viable[0])
    else {
      const ways: Way[] = viable.map((o) => (o.option.kind === 'condicion' ? { kind: 'condicion', literal: o.option.literal } : o.task ? { kind: 'tarea', task: o.task } : { kind: 'desconocida', id: o.option.taskId.replace(/^src:/, '') }))
      if (ways.some((w) => w.kind === 'tarea')) taskGroups.push(ways)
      else checkGroups.push(ways.map((w) => (w.kind === 'condicion' ? w.literal : w.kind === 'desconocida' ? w.id : '')))
    }
  }
  if (waiting.length || taskGroups.length) out.push({ kind: 'espera', tasks: waiting, groups: taskGroups })
  if (notMet.length) out.push({ kind: 'no-cumplido', literals: notMet })
  if (discarded.length) out.push({ kind: 'descartada', tasks: discarded })
  if (check.length || checkGroups.length) out.push({ kind: 'comprobar', literals: [...new Set(check)], groups: checkGroups })
  return out
}

/** Every condition literal a cause asks to confirm, required or alternative. */
export const literalsToCheck = (c: Extract<Cause, { kind: 'comprobar' }>) => [...new Set([...c.literals, ...c.groups.flat()])]

const quote = (s: string) => `«${s}»`
const list = (xs: string[], joiner = ' y ') => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')}${joiner}${xs[xs.length - 1]}`)
const way = (w: Way) => (w.kind === 'tarea' ? named(w.task) : w.kind === 'condicion' ? `que se confirme ${quote(w.literal)}` : `${quote(w.id)}, que no existe en este proyecto`)

/** A cause in one plain sentence. Literals stay literal, between «». «Y» joins what is required; «o», the alternatives of one group. */
export function causeText(c: Cause): string {
  switch (c.kind) {
    case 'estado':
      return `Su estado en el dossier dice ${quote(c.literal)} y todavía no has aclarado qué significa.`
    case 'comprobar': {
      const parts = [...(c.literals.length ? [list(c.literals.map(quote))] : []), ...c.groups.map((g) => list(g.map(quote), ' o '))]
      return `Falta comprobar ${parts.join(' y, además, ')}: nadie lo ha confirmado todavía.`
    }
    case 'espera': {
      const required = c.tasks.length ? `a ${list(c.tasks.map(named))}` : ''
      const alternatives = c.groups.map((g) => `a ${list(g.map(way), ' o ')}`)
      if (!alternatives.length) return c.tasks.length === 1 ? `Espera a ${named(c.tasks[0])}, que aún no está terminada.` : `Espera ${required}, que aún no están terminadas.`
      if (!required && alternatives.length === 1) return `Espera a que se cumpla una de estas: ${list(c.groups[0].map(way), ' o ')}.`
      return `Espera ${[required, ...alternatives].filter(Boolean).join(' y, además, ')}.`
    }
    case 'no-cumplido':
      return `Marcaste que ${list(c.literals.map(quote))} no se cumple. Mientras siga así, no puede avanzar.`
    case 'descartada':
      return `Dependía de ${list(c.tasks.map(named))}, que se descartó. Decide si esta tarea sigue teniendo sentido.`
    case 'visto-bueno':
      return 'Está hecha y espera tu visto bueno.'
  }
}

/**
 * What keeps blocked tasks from moving (F03), so a summary never attributes to
 * other tasks a block that comes from a condition, or the other way round.
 * `tareas`: only other tasks. `condiciones`: only conditions or discarded work.
 * `varias`: tasks with different causes, or one task with several.
 */
export type BlockSummary = 'tareas' | 'condiciones' | 'varias'

export function blockSummary(causes: Cause[][]): BlockSummary | undefined {
  if (!causes.length) return undefined
  const kinds = new Set(causes.map((cs) => (cs.every((c) => c.kind === 'espera') ? 'tareas' : cs.some((c) => c.kind === 'espera') ? 'varias' : 'condiciones')))
  return kinds.size === 1 ? ([...kinds][0] as BlockSummary) : 'varias'
}

export const BLOCK_SUMMARY_TEXT: Record<BlockSummary, string> = {
  tareas: 'Esperan a otras tareas. Se liberan al terminar lo anterior.',
  condiciones: 'Piden algo que no se cumple o que se descartó. No dependen de otras tareas: ábrelas para decidir.',
  varias: 'No todas por la misma causa. Abre cada una para ver qué la frena.',
}

export interface Explanation {
  stage: Stage
  causes: Cause[]
  /** Open tasks that wait directly for this one. */
  waiters: Task[]
}

export function explain(data: ProjectsData, t: Task, index = indexTasks(data), waiters = waitersOf(data, index)): Explanation {
  const stage = stageOf(data, t, index)
  return { stage, causes: causesOf(t, stage, blockersOf(data, t, index)), waiters: waiters.get(t.id) ?? [] }
}

/** What the person can do something about, in one project. Each task appears once, in the first group that applies. */
export interface ProjectAttention {
  project: Project
  open: number
  closed: number
  total: number
  /** Words to clarify, most tasks first. */
  words: WordToClarify[]
  /** Conditions to confirm, most tasks first. */
  checks: CheckToMake[]
  /** Executed, waiting for the person's approval. */
  approvals: Task[]
  /** The person's tasks that can be done now (the P1 candidates). */
  ready: Task[]
  /** Open tasks that cannot move yet because of another task or a condition marked as not met. */
  cannotMove: number
  /** What keeps them from moving, from their real causes. */
  blockedBy?: BlockSummary
}

export function projectAttention(data: ProjectsData, project: Project, index = indexTasks(data), waiters = waitersOf(data, index)): ProjectAttention {
  const tasks = data.tasks.filter((t) => t.projectId === project.id).sort(byRef)
  const open = tasks.filter((t) => !isClosed(data, t))
  const words = new Map<string, Task[]>()
  const checks = new Map<string, Task[]>()
  let cannotMove = 0
  const blockedCauses: Cause[][] = []
  for (const t of open) {
    const st = stageOf(data, t, index)
    if (st === 'por-clasificar') words.set(t.status, [...(words.get(t.status) ?? []), t])
    else if (st === 'por-verificar') {
      for (const c of causesOf(t, st, blockersOf(data, t, index)))
        if (c.kind === 'comprobar') for (const l of literalsToCheck(c)) checks.set(l, [...(checks.get(l) ?? []), t])
    } else if (st === 'bloqueada') {
      cannotMove++
      blockedCauses.push(causesOf(t, st, blockersOf(data, t, index)))
    }
  }
  const waitingFor = (ts: Task[]) => new Set(ts.flatMap((t) => (waiters.get(t.id) ?? []).map((w) => w.id))).size
  return {
    project,
    open: open.length,
    closed: tasks.length - open.length,
    total: tasks.length,
    words: [...words].map(([literal, ts]) => ({ project, literal, tasks: ts, waiting: waitingFor(ts) })).sort((a, b) => b.tasks.length - a.tasks.length || b.waiting - a.waiting),
    checks: [...checks].map(([literal, ts]) => ({ project, literal, tasks: ts })).sort((a, b) => b.tasks.length - a.tasks.length),
    approvals: open.filter((t) => isAwaitingApproval(data, t)),
    ready: nextActionCandidates(data, project.id, 'humano'),
    cannotMove,
    blockedBy: blockSummary(blockedCauses),
  }
}

/** The project's situation in one sentence, from its stages only. */
export function situationText(a: ProjectAttention): string {
  if (a.total === 0) return 'Todavía no tiene tareas.'
  if (a.open === 0) return 'Todas sus tareas están cerradas.'
  if (a.approvals.length) return a.approvals.length === 1 ? 'Una tarea hecha espera tu visto bueno.' : `${a.approvals.length} tareas hechas esperan tu visto bueno.`
  if (a.ready.length) {
    const can = a.ready.length === 1 ? 'Puedes avanzar en 1 tarea' : `Puedes avanzar en ${a.ready.length} tareas`
    return a.words.length || a.checks.length ? `${can}; otras necesitan antes una decisión tuya.` : `${can}.`
  }
  if (a.words.length || a.checks.length) return 'Necesita una decisión o una comprobación tuya antes de avanzar.'
  if (a.blockedBy === 'tareas') return 'Ninguna tarea puede avanzar todavía: todas esperan a otras.'
  if (a.blockedBy === 'condiciones') return 'Ninguna tarea puede avanzar todavía: piden algo que no se cumple o que se descartó.'
  return 'Ninguna tarea puede avanzar todavía, por causas distintas. Al abrir el proyecto verás la de cada una.'
}

/** A task that, once done, would stop being in the way of several open tasks. Not a priority. */
export interface Unlocker {
  task: Task
  project: Project
  stage: Stage
  waiters: Task[]
}

export interface Attention {
  projects: ProjectAttention[]
  words: WordToClarify[]
  checks: CheckToMake[]
  approvals: Task[]
  ready: { task: Task; project: Project }[]
  /** Open tasks (all projects) by stage, for the plain summary. */
  counts: Record<Stage, number>
  /** Open tasks with the most open tasks waiting directly for them (at least `min`), most first. */
  unlockers: Unlocker[]
}

export function attention(data: ProjectsData, { unlockers = 3, min = 2 } = {}): Attention {
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const projects = data.projects.map((p) => projectAttention(data, p, index, waiters))
  const counts = { lista: 0, 'por-verificar': 0, bloqueada: 0, 'por-clasificar': 0, 'en-aprobacion': 0, cerrada: 0 } as Record<Stage, number>
  for (const t of data.tasks) counts[stageOf(data, t, index)]++
  const byProject = new Map(data.projects.map((p) => [p.id, p]))
  const top = data.tasks
    .filter((t) => !isClosed(data, t) && byProject.has(t.projectId) && (waiters.get(t.id)?.length ?? 0) >= min)
    .map((t) => ({ task: t, project: byProject.get(t.projectId)!, stage: stageOf(data, t, index), waiters: waiters.get(t.id)! }))
    .filter((u) => u.stage !== 'bloqueada')
    .sort((a, b) => b.waiters.length - a.waiters.length || data.projects.indexOf(a.project) - data.projects.indexOf(b.project) || byRef(a.task, b.task))
    .slice(0, unlockers)
  return {
    projects,
    words: projects.flatMap((p) => p.words),
    checks: projects.flatMap((p) => p.checks),
    approvals: projects.flatMap((p) => p.approvals),
    ready: projects.flatMap((p) => p.ready.map((task) => ({ task, project: p.project }))),
    counts,
    unlockers: top,
  }
}

/** The cycle week (SEMANA's Monday-to-Sunday weeks) that contains `today` (local «YYYY-MM-DD»), or undefined outside the cycle. */
export function cycleWeek(cycle: Cycle, today: string): { week: number; of: number } | undefined {
  const weeks = cycleWeeks(cycle)
  const w = weeks.find((x) => today >= x.start && today <= x.end)
  return w ? { week: w.n, of: weeks.length } : undefined
}
