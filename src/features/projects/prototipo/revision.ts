import { blockersOf, indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { causeText, explain, waitersOf, type Cause } from '../ui/attention'
import type { Stage } from '../ui/view'
import { MONTHS, checkPlan, type Month, type PlanCheck, type Sprint } from './plan'

/**
 * PROTOTYPE · What deserves a look before starting the sprint, grouped by kind of problem
 * (not repeated month by month). Pure reading of the data and the draft: it never changes a
 * state, never adds a task to the sprint and never marks a requirement as met.
 *
 * Three weights, kept apart:
 *  - informativa: a reserve the person can accept (e.g. availability not confirmed).
 *  - decision: a pending decision that affects execution (a condition to confirm, an unclear state).
 *  - corregir: an inconsistency; as it stands the plan does not reach that result.
 */

export type Severity = 'informativa' | 'decision' | 'corregir'
export const SEVERITY_LABEL: Record<Severity, string> = {
  informativa: 'Reserva que puedes aceptar',
  decision: 'Decisión pendiente',
  corregir: 'Corrige el plan',
}

const minutesKnown = (t: Task): number | undefined => t.estimate?.maxMinutes ?? (t.estimateHours ? t.estimateHours * 60 : undefined)

export interface MonthLoad {
  month: Month
  /** Minutes of the open planned tasks that have an estimate. Tasks without one are counted apart, never invented. */
  known: number
  unestimated: number
  capacity: number
}

/** A planned action, where it is, and what it needs (in the engine's own words). */
export interface PlannedNeed {
  task: Task
  month: Month
  pillarId: string
  stage: Stage
  causes: Cause[]
}

/** A task outside the sprint that a planned action needs. `alguna`: one of the alternatives is enough. */
export interface OutsideDep {
  key: string
  mode: 'todas' | 'alguna'
  tasks: Task[]
  forTask: Task
  month: Month
  pillarId: string
  /** The person chose to keep it outside: still listed, as an accepted reserve. */
  kept: boolean
}

export interface PlanGap {
  month: Month
  pillarId?: string
  kind: 'sobrecarga' | 'sin-acciones' | 'todo-bloqueado'
}

export interface Review {
  check: PlanCheck
  loads: MonthLoad[]
  hoursConfirmed: boolean
  gaps: PlanGap[]
  /** Actions with a condition to confirm, a condition marked as not met, a discarded dependency or a pending approval. */
  decisions: PlannedNeed[]
  /** Actions whose state in the dossier is not clear yet. */
  unclear: PlannedNeed[]
  outside: OutsideDep[]
}

const DECISION_CAUSES = new Set<Cause['kind']>(['comprobar', 'no-cumplido', 'descartada', 'visto-bueno'])

export function reviewPlan(data: ProjectsData, sp: Sprint, opts: { hoursOk: boolean; kept: string[] }): Review {
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const check = checkPlan(data, sp)
  const inPlan = new Set(sp.actions.map((a) => a.taskId))
  const capacity = check.months[0]?.capacity ?? 0

  const loads: MonthLoad[] = MONTHS.map((m) => {
    const tasks = sp.actions.filter((a) => a.month === m.key).map((a) => index.get(a.taskId)).filter((t): t is Task => !!t && !isClosed(data, t))
    return { month: m.key, known: tasks.reduce((a, t) => a + (minutesKnown(t) ?? 0), 0), unestimated: tasks.filter((t) => minutesKnown(t) === undefined).length, capacity }
  })

  const gaps: PlanGap[] = []
  for (const l of loads) if (l.known > l.capacity) gaps.push({ month: l.month, kind: 'sobrecarga' })
  for (const m of check.months)
    for (const r of m.results) {
      if (!r.items.length) gaps.push({ month: m.month, pillarId: r.pillarId, kind: 'sin-acciones' })
      else if (/^Todas sus acciones están bloqueadas/.test(r.note ?? '')) gaps.push({ month: m.month, pillarId: r.pillarId, kind: 'todo-bloqueado' })
    }

  const decisions: PlannedNeed[] = []
  const unclear: PlannedNeed[] = []
  const outside: OutsideDep[] = []
  for (const m of MONTHS)
    for (const a of sp.actions.filter((x) => x.month === m.key)) {
      const t = index.get(a.taskId)
      if (!t || isClosed(data, t)) continue
      const ex = explain(data, t, index, waiters)
      const base = { task: t, month: a.month, pillarId: a.pillarId, stage: ex.stage }
      const dec = ex.causes.filter((c) => DECISION_CAUSES.has(c.kind))
      if (dec.length) decisions.push({ ...base, causes: dec })
      const est = ex.causes.filter((c) => c.kind === 'estado')
      if (est.length) unclear.push({ ...base, causes: est })

      // Dependencies outside the sprint, read from the requirements themselves so that
      // a mandatory one and a set of alternatives are never confused.
      const b = blockersOf(data, t, index)
      const add = (mode: OutsideDep['mode'], tasks: Task[]) => {
        const key = `${t.id}>${tasks.map((x) => x.id).join('|')}`
        if (!outside.some((o) => o.key === key)) outside.push({ key, mode, tasks, forTask: t, month: a.month, pillarId: a.pillarId, kept: opts.kept.includes(key) })
      }
      for (const w of b.waiting) if (!inPlan.has(w.id) && !isClosed(data, w)) add('todas', [w])
      for (const r of b.requirements) {
        const open = r.options.filter((o) => o.state !== 'cumplido' && o.state !== 'no-cumplido' && o.task).map((o) => o.task!)
        if (r.requirement.mode === 'alguna' && r.options.length > 1) {
          // One alternative in the sprint (or already done) covers it: nothing to flag.
          if (open.some((x) => inPlan.has(x.id)) || r.state === 'cumplido') continue
          const out = open.filter((x) => !isClosed(data, x))
          if (out.length) add('alguna', out)
        } else for (const x of open) if (!inPlan.has(x.id) && !isClosed(data, x) && !b.waiting.includes(x)) add('todas', [x])
      }
    }

  return { check, loads, hoursConfirmed: opts.hoursOk, gaps, decisions, unclear, outside }
}

/** One category of «Qué conviene revisar», only when it applies to the current data. */
export interface Category {
  id: 'horas' | 'plan' | 'decisiones' | 'fuera' | 'estados'
  title: string
  severity: Severity
  count: number
}

export function categoriesOf(r: Review): Category[] {
  const out: Category[] = []
  if (r.gaps.length) out.push({ id: 'plan', title: 'El plan no llega a algún resultado', severity: 'corregir', count: r.gaps.length })
  const pending = r.outside.filter((o) => !o.kept).length
  if (r.outside.length) out.push({ id: 'fuera', title: 'Dependencias indispensables fuera del sprint', severity: pending ? 'corregir' : 'informativa', count: r.outside.length })
  if (r.decisions.length) out.push({ id: 'decisiones', title: 'Decisiones o condiciones pendientes', severity: 'decision', count: r.decisions.length })
  if (r.unclear.length) out.push({ id: 'estados', title: 'Información cuyo estado no está aclarado', severity: 'decision', count: r.unclear.length })
  if (!r.hoursConfirmed) out.push({ id: 'horas', title: 'Disponibilidad todavía sin confirmar', severity: 'informativa', count: 1 })
  return out
}

/** The specific reasons of a planned action, in the engine's words. */
export const needText = (n: PlannedNeed) => n.causes.map(causeText).join(' ')

/** One short orientation for a month: what needs attention, summed up once instead of under every result. */
export function monthOrientation(r: Review, month: Month, pillars: number): string {
  const parts: string[] = []
  const gaps = r.gaps.filter((g) => g.month === month)
  if (gaps.some((g) => g.kind === 'sobrecarga')) parts.push('Hay más trabajo estimado que horas disponibles.')
  const empty = gaps.filter((g) => g.kind === 'sin-acciones').length
  if (empty) parts.push(empty === 1 ? 'Un resultado no tiene ninguna acción.' : `${empty} resultados no tienen ninguna acción.`)
  const blocked = gaps.filter((g) => g.kind === 'todo-bloqueado').length
  if (blocked) parts.push(blocked === 1 ? 'Un resultado tiene todas sus acciones bloqueadas.' : `${blocked} resultados tienen todas sus acciones bloqueadas.`)
  const mc = r.check.months.find((m) => m.month === month)!
  const waiting = mc.results.filter((x) => /^Necesita antes/.test(x.note ?? '')).length
  if (waiting) parts.push(`${waiting === pillars ? `Los ${pillars}` : `${waiting} de ${pillars}`} ${waiting === 1 ? 'resultado necesita' : 'resultados necesitan'} antes alguna decisión tuya.`)
  const out = r.outside.filter((o) => o.month === month && !o.kept).length
  if (out) parts.push(out === 1 ? 'Una acción espera una tarea que no está en el sprint.' : `${out} acciones esperan tareas que no están en el sprint.`)
  if (!parts.length) return 'Cada resultado tiene al menos una acción que puedes hacer o revisar.'
  return `${parts.join(' ')} Abre un resultado para ver qué le falta.`
}
