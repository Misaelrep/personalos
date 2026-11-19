import { changeStatus } from '../domain/operations'
import { createTask, type Ctx } from '../domain/ops'
import { indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { explain, waitersOf } from '../ui/attention'
import { stageOf, type Stage } from '../ui/view'
import { areaInSentence, areasOf, norm } from './areas'

/**
 * PROTOTYPE · The 90-day plan, in memory only. Nothing here is stored by ELYUM
 * and nothing calls any service. Two kinds of help, never mixed:
 *  - LOCAL CALCULATIONS (`checkPlan`, hours, dependencies): facts of the data.
 *  - SIMULATED AI (`proposeStrategy`, `proposeChanges`, `grokReview`): fixed
 *    rules standing in for a real model. Every output is marked `from: 'ia'`
 *    and stays a proposal until the person approves it.
 */

export type Month = 'dic' | 'ene' | 'feb'
export const MONTHS: { key: Month; label: string; short: string; start: string; end: string }[] = [
  { key: 'dic', label: 'Diciembre', short: 'Dic', start: '2026-12-01', end: '2026-12-31' },
  { key: 'ene', label: 'Enero', short: 'Ene', start: '2027-01-01', end: '2027-01-31' },
  { key: 'feb', label: 'Febrero', short: 'Feb', start: '2027-02-01', end: '2027-02-28' },
]
export const SPRINT = { start: '2026-12-01', end: '2027-02-28', label: '1 dic 2026 – 28 feb 2027' }
const WEEKS_PER_MONTH = 4.3

/** Who wrote a piece of the plan. An AI suggestion is never a decision until the person approves the plan. */
export type Source = 'ia' | 'tuya'

export interface Pillar {
  id: string
  name: string
  from: Source
  /** What should be true at the end of each month. */
  results: Record<Month, string>
}

export interface PlanAction {
  id: string
  pillarId: string
  taskId: string
  month: Month
  from: Source
  /** Why it was proposed (simulated AI). */
  reason?: string
}

export interface Sprint {
  status: 'borrador' | 'aprobado'
  /** Moment of the simplified flow to continue from (1…3). */
  step: number
  northStar: string
  northStarFrom: Source
  pillars: Pillar[]
  actions: PlanAction[]
  /** Hours a week the person has for these projects. */
  hoursPerWeek: number
  approvedAt?: string
}

export const emptySprint = (): Sprint => ({ status: 'borrador', step: 1, northStar: '', northStarFrom: 'tuya', pillars: [], actions: [], hoursPerWeek: 6 })

/** The month a date falls in, or the first month before the sprint starts (and the last after it ends). */
export function monthOf(today: string): { month: Month; before: boolean; after: boolean } {
  if (today < SPRINT.start) return { month: 'dic', before: true, after: false }
  if (today > SPRINT.end) return { month: 'feb', before: false, after: true }
  return { month: MONTHS.find((m) => today >= m.start && today <= m.end)!.key, before: false, after: false }
}

export const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** Minutes a task takes: the dossier's upper estimate, or 2 h when it has none (said so on screen). */
export const DEFAULT_MINUTES = 120
export const minutesOf = (t: Task) => t.estimate?.maxMinutes ?? (t.estimateHours ? t.estimateHours * 60 : DEFAULT_MINUTES)
export const hours = (min: number) => `${Math.round((min / 60) * 10) / 10} h`.replace('.', ',')

/** The projects a pillar draws from, from its actions. A pillar is never tied to one project. */
export function projectsOfPillar(data: ProjectsData, s: Sprint, pillarId: string): string[] {
  const index = indexTasks(data)
  return [...new Set(s.actions.filter((a) => a.pillarId === pillarId).map((a) => index.get(a.taskId)?.projectId).filter((x): x is string => !!x))]
}

/** What a planned action is right now, in the four kinds the person asked to tell apart. */
export type ActionKind = 'ejecutable' | 'decision' | 'bloqueada' | 'revision' | 'terminada'
export const kindOf = (stage: Stage): ActionKind =>
  stage === 'lista' ? 'ejecutable' : stage === 'en-aprobacion' ? 'revision' : stage === 'bloqueada' ? 'bloqueada' : stage === 'cerrada' ? 'terminada' : 'decision'
export const KIND_LABEL: Record<ActionKind, string> = {
  ejecutable: 'Puedes hacerla',
  decision: 'Necesita tu decisión',
  bloqueada: 'Bloqueada',
  revision: 'Por revisar',
  terminada: 'Terminada',
}

// ── Simulated AI: a complete proposal ────────────────────────────────────────

export function suggestNorthStars(data: ProjectsData): string[] {
  const named = data.projects.filter((p) => p.objective).map((p) => p.name.toLowerCase())
  return [
    'Que el barrio vea y use tres cosas nuestras: el huerto abierto, el curso probado y el boletín llegando cada mes.',
    `Tener ${named.slice(0, 2).join(' y ')} funcionando con personas reales antes de marzo.`,
    'Ordenar lo que ya existe y lanzar una sola cosa bien terminada.',
  ]
}

interface PillarDraft {
  id: string
  name: string
  results: [string, string, string]
  /** Projects it draws from: all their tasks, or only those whose title has one of the words. */
  from: { project: string; words?: string[] }[]
  /** Words that say a task moves this pillar forward. */
  focus: string[]
}

const DRAFTS: PillarDraft[] = [
  {
    id: 'p1',
    name: 'Abrir el huerto con los vecinos',
    results: ['Agua, turnos y normas decididos', 'Primeros bancales plantados', 'Doce voluntarios con turno fijo'],
    from: [{ project: 'Huerto comunitario' }, { project: 'Boletín del barrio', words: ['vecinos'] }],
    focus: ['riego', 'agua', 'voluntario', 'normas', 'parcela', 'bancal', 'reunion'],
  },
  {
    id: 'p2',
    name: 'Probar el curso de cerámica',
    results: ['Programa, materiales y horno cerrados', 'Sesión piloto con dos personas', 'Primer grupo inscrito'],
    from: [{ project: 'Taller de cerámica' }],
    focus: ['programa', 'sesion', 'horno', 'materiales', 'inscripcion', 'precio', 'probar'],
  },
  {
    id: 'p3',
    name: 'Contarlo cada mes en el boletín',
    results: ['Suscripción funcionando y fecha fija', 'Primer envío con noticias del huerto y del taller', 'Segundo envío con fotos de vecinos'],
    from: [{ project: 'Boletín del barrio' }, { project: 'Taller de cerámica', words: ['anuncio', 'fotografiar'] }, { project: 'Huerto comunitario', words: ['cartel'] }],
    focus: ['suscripcion', 'plantilla', 'cuenta', 'noticias', 'envio', 'anuncio', 'fecha'],
  },
]

const FOLLOW_UP = /^(revisar|documentar|cerrar)\b/i

/**
 * A complete plan to edit, not to build: north star, three pillars that draw
 * from several projects, actions and their month. Actions are scored by what
 * they contribute (the pillar's words, how many tasks they free), whether they
 * can start, and their dependencies; months are filled up to the person's
 * hours. Follow-up tasks («Revisar…», «Documentar…») go after the work itself.
 */
export function proposeStrategy(data: ProjectsData, hoursPerWeek: number): Sprint {
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const byName = (n: string) => data.projects.find((p) => p.name === n)?.id
  const perPillarMonth = (hoursPerWeek * 60 * WEEKS_PER_MONTH) / DRAFTS.length
  const taken = new Set<string>()
  const actions: PlanAction[] = []
  for (const d of DRAFTS) {
    const pool = d.from.flatMap(({ project, words }) =>
      data.tasks.filter((t) => t.projectId === byName(project) && !isClosed(data, t) && !taken.has(t.id) && (!words || words.some((w) => norm(t.title).includes(w)))),
    )
    const scored = pool
      .map((t) => {
        const ex = explain(data, t, index, waiters)
        // A blocked task enters only when what it waits for can itself start: one step away.
        const near = ex.stage !== 'bloqueada' || ex.causes.every((c) => c.kind === 'espera' && c.tasks.every((w) => stageOf(data, w, index) !== 'bloqueada'))
        const focus = d.focus.filter((w) => norm(t.title).includes(w)).length
        const score = (ex.stage === 'lista' ? 4 : ex.stage === 'en-aprobacion' ? 3 : ex.stage === 'bloqueada' ? 0 : 1.5) + ex.waiters.length * 1.5 + focus * 2 - (FOLLOW_UP.test(t.title) ? 3 : 0)
        const reason =
          ex.stage === 'lista'
            ? `Puede empezar ya${ex.waiters.length ? ` y libera ${ex.waiters.length === 1 ? '1 tarea' : `${ex.waiters.length} tareas`}` : ''}.`
            : ex.stage === 'bloqueada'
              ? 'Aporta al pilar, pero espera a otra tarea.'
              : ex.stage === 'en-aprobacion'
                ? 'Está hecha: falta tu visto bueno.'
                : `Aporta al pilar${ex.waiters.length ? ` y libera ${ex.waiters.length === 1 ? '1 tarea' : `${ex.waiters.length} tareas`}` : ''}; antes necesita una decisión tuya.`
        return { t, ex, near, score, reason }
      })
      .filter((x) => x.near)
      .sort((a, b) => b.score - a.score)
    // As many actions as the person's hours allow (3 h → 4, 6 h → 7, 10 h → 9), within the pillar's share of time.
    const max = Math.min(9, Math.max(3, Math.round(hoursPerWeek * 1.1) + (hoursPerWeek <= 3 ? 1 : 0)))
    let budget = perPillarMonth * 3
    const chosen: typeof scored = []
    for (const x of scored) {
      if (chosen.length >= max) break
      const m = minutesOf(x.t)
      if (m > budget && chosen.length >= 3) continue
      chosen.push(x)
      budget -= m
    }
    // Dependencies first, then by score: what another chosen task waits for goes before it.
    const ids = new Set(chosen.map((x) => x.t.id))
    const ordered: typeof chosen = []
    const visit = (x: (typeof chosen)[number]) => {
      if (ordered.includes(x)) return
      for (const c of x.ex.causes) if (c.kind === 'espera') for (const w of c.tasks) if (ids.has(w.id)) visit(chosen.find((y) => y.t.id === w.id)!)
      ordered.push(x)
    }
    chosen.forEach(visit)
    // Spread over the three months in dependency order (what others wait for, first), then move
    // forward whatever does not fit in a month's hours. A task never lands before what it waits for.
    const used = [0, 0, 0]
    ordered.forEach((x, i) => {
      let month = Math.min(2, Math.floor((i * 3) / ordered.length))
      const m = minutesOf(x.t)
      while (month < 2 && used[month] + m > perPillarMonth && used[month] > 0) month++
      used[month] += m
      taken.add(x.t.id)
      actions.push({ id: `${d.id}-${x.t.id}`, pillarId: d.id, taskId: x.t.id, month: MONTHS[month].key, from: 'ia', reason: x.reason })
    })
  }
  return {
    status: 'borrador',
    step: 2,
    northStar: suggestNorthStars(data)[0],
    northStarFrom: 'ia',
    pillars: DRAFTS.map((d) => ({ id: d.id, name: d.name, from: 'ia', results: { dic: d.results[0], ene: d.results[1], feb: d.results[2] } })),
    actions,
    hoursPerWeek,
  }
}

/** Open tasks a pillar could add, best first, from any project. */
export function candidatesFor(data: ProjectsData, s: Sprint, pillarId: string, n = 8): Task[] {
  const d = DRAFTS.find((x) => x.id === pillarId)
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const inPlan = new Set(s.actions.map((a) => a.taskId))
  return data.tasks
    .filter((t) => !isClosed(data, t) && !inPlan.has(t.id))
    .map((t) => {
      const ex = explain(data, t, index, waiters)
      const focus = d ? d.focus.filter((w) => norm(t.title).includes(w)).length : 0
      return { t, score: focus * 2 + (ex.stage === 'lista' ? 3 : ex.stage === 'bloqueada' ? -2 : 1) + ex.waiters.length - (FOLLOW_UP.test(t.title) ? 3 : 0) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.t)
}

// ── Local calculation: is the plan coherent? ─────────────────────────────────

export interface PlannedItem {
  action: PlanAction
  task: Task
  kind: ActionKind
}

export interface ResultCheck {
  pillarId: string
  result: string
  items: PlannedItem[]
  /** Why the result may not be reached, or undefined when it has work it can do. */
  note?: string
}

export interface MonthCheck {
  month: Month
  capacity: number
  load: number
  /** Planned actions without an estimate (counted as 2 h). */
  unestimated: number
  results: ResultCheck[]
}

/** A task outside the plan that a planned action waits for. Proposed, never added without confirmation. */
export interface Prerequisite {
  task: Task
  forTask: Task
  month: Month
}

export interface PlanCheck {
  months: MonthCheck[]
  prerequisites: Prerequisite[]
}

export function checkPlan(data: ProjectsData, s: Sprint): PlanCheck {
  const index = indexTasks(data)
  const capacity = Math.round(s.hoursPerWeek * 60 * WEEKS_PER_MONTH)
  const inPlan = new Set(s.actions.map((a) => a.taskId))
  const months = MONTHS.map((m): MonthCheck => {
    const acts = s.actions.filter((a) => a.month === m.key)
    const tasks = acts.map((a) => index.get(a.taskId)).filter((t): t is Task => !!t)
    const results = s.pillars.map((p): ResultCheck => {
      const items = acts
        .filter((a) => a.pillarId === p.id)
        .flatMap((action) => {
          const task = index.get(action.taskId)
          return task ? [{ action, task, kind: kindOf(stageOf(data, task, index)) }] : []
        })
      const open = items.filter((i) => i.kind !== 'terminada')
      const note = !items.length
        ? 'Falta planificarlo: no hay ninguna acción para este resultado.'
        : open.length && open.every((i) => i.kind === 'bloqueada')
          ? 'Todas sus acciones están bloqueadas: no se alcanzará sin resolver antes lo que esperan.'
          : open.length && !open.some((i) => i.kind === 'ejecutable' || i.kind === 'revision')
            ? `Necesita antes ${open.length === 1 ? 'una decisión tuya' : `${open.length} decisiones tuyas`}.`
            : undefined
      return { pillarId: p.id, result: p.results[m.key], items, ...(note ? { note } : {}) }
    })
    return { month: m.key, capacity, load: tasks.filter((t) => !isClosed(data, t)).reduce((a, t) => a + minutesOf(t), 0), unestimated: tasks.filter((t) => !t.estimate && !t.estimateHours).length, results }
  })
  const prerequisites: Prerequisite[] = []
  for (const a of s.actions) {
    const t = index.get(a.taskId)
    if (!t) continue
    for (const c of explain(data, t, index).causes)
      if (c.kind === 'espera') for (const w of c.tasks) if (!inPlan.has(w.id) && !isClosed(data, w) && !prerequisites.some((p) => p.task.id === w.id)) prerequisites.push({ task: w, forTask: t, month: a.month })
  }
  return { months, prerequisites }
}

// ── Simulated AI: Grok as an optional adviser ───────────────────────────────

export interface Observation {
  tone: 'riesgo' | 'desviacion' | 'sobrecarga' | 'incoherencia'
  text: string
}
export const TONE_LABEL: Record<Observation['tone'], string> = { riesgo: 'Riesgo', desviacion: 'Desviación', sobrecarga: 'Sobrecarga', incoherencia: 'Incoherencia' }

/** Grok-like review. It observes and never changes anything: no observation becomes a decision. */
export function grokReview(data: ProjectsData, s: Sprint, today: string): Observation[] {
  const out: Observation[] = []
  const check = checkPlan(data, s)
  for (const m of check.months) {
    const label = MONTHS.find((x) => x.key === m.month)!.label
    if (m.load > m.capacity) out.push({ tone: 'sobrecarga', text: `${label} pide unas ${hours(m.load)} y tienes unas ${hours(m.capacity)}. Mueve algo a otro mes o quita una acción.` })
    for (const r of m.results) if (r.note && !r.items.length) out.push({ tone: 'incoherencia', text: `«${r.result}» (${label.toLowerCase()}) no tiene acciones. O falta planificarlo, o ese resultado depende de algo que no está en el plan.` })
  }
  const decisions = check.months[0].results.flatMap((r) => r.items).filter((i) => i.kind === 'decision').length
  if (decisions >= 3) out.push({ tone: 'riesgo', text: `${decisions} acciones de diciembre necesitan antes una decisión tuya. Si no las resuelves la primera semana, diciembre se queda corto.` })
  const { month, before } = monthOf(today)
  const now = MONTHS.findIndex((m) => m.key === month)
  if (!before && s.status === 'aprobado' && now > 0) {
    const late = check.months.slice(0, now).flatMap((m) => m.results.flatMap((r) => r.items)).filter((i) => i.kind !== 'terminada')
    if (late.length) out.push({ tone: 'desviacion', text: `De los meses anteriores ${late.length === 1 ? 'queda 1 acción' : `quedan ${late.length} acciones`} sin terminar. Decide si pasan a este mes o salen del plan.` })
  }
  const per = new Map<string, number>()
  const index = indexTasks(data)
  for (const a of s.actions) {
    const p = index.get(a.taskId)?.projectId
    if (p) per.set(p, (per.get(p) ?? 0) + 1)
  }
  const top = [...per].sort((a, b) => b[1] - a[1])[0]
  if (top && s.actions.length && top[1] / s.actions.length > 0.5) out.push({ tone: 'riesgo', text: `Más de la mitad de las acciones son de «${data.projects.find((p) => p.id === top[0])?.name}». Si ese proyecto se atasca, se atasca el trimestre.` })
  return out
}

// ── Updates in plain language (simulated AI) ───────────────────────────────

export type ChangeKind = 'hecha' | 'descartada' | 'cambio' | 'nueva'
export interface Proposal {
  id: string
  kind: ChangeKind
  sentence: string
  /** Every task the sentence seems to talk about. */
  matched: string[]
  /** The ones that will change (the person can remove any). */
  taskIds: string[]
  projectId?: string
  /** For a new task: its title. */
  title: string
  /** Why these tasks: the words they share with the sentence, or the area named. */
  why: string
  accepted: boolean
}

const STOP = new Set('el la los las de del un una unos unas y o a en con para por que ya lo le se mi mis su sus al es esta este eso esto no voy hacer hice termine terminado terminada he quiero anadir incorporar cambio cambiar ahora todo toda todas todos area tambien'.split(' '))
const words = (s: string) =>
  norm(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w))

function changeKindOf(sentence: string): ChangeKind {
  const s = norm(sentence)
  if (/\b(ya no|no voy a|descart|olvid|abandon|no hace falta)/.test(s)) return 'descartada'
  if (/\b(termine|terminado|terminada|terminamos|ya hice|hecho|hecha|listo|lista|complete|acabe|acabamos)\b/.test(s)) return 'hecha'
  if (/\b(quiero (anadir|incorporar|agregar|sumar)|anadir|incorporar|agregar|nueva tarea)\b/.test(s)) return 'nueva'
  return 'cambio'
}

/** Tasks a sentence talks about: an area it names, or the tasks that share most words with it. */
function matchTasks(data: ProjectsData, sentence: string, scope: { projectId?: string; areaId?: string; taskIds?: string[] }): { ids: string[]; why: string } {
  const open = (t: Task) => !isClosed(data, t)
  const named = areaInSentence(data, sentence, scope.projectId)
  if (named) return { ids: named.area.tasks.filter(open).map((t) => t.id), why: `Hablas de «${named.area.name}»: son sus tareas abiertas.` }
  let pool = data.tasks.filter(open)
  // Updating one task from the map: a sentence about it is about it.
  if (scope.taskIds?.length === 1) return { ids: pool.filter((t) => t.id === scope.taskIds![0]).map((t) => t.id), why: 'Lo cuentas desde esta tarea en el mapa.' }
  if (scope.taskIds) pool = pool.filter((t) => scope.taskIds!.includes(t.id))
  if (scope.projectId) pool = pool.filter((t) => t.projectId === scope.projectId)
  if (scope.areaId && scope.projectId) {
    const a = areasOf(data, scope.projectId).find((x) => x.id === scope.areaId)
    if (a) pool = pool.filter((t) => a.tasks.includes(t))
  }
  const w = new Set(words(sentence))
  const scored = pool.map((t) => ({ t, hits: words(t.title).filter((x) => w.has(x)) }))
  const best = Math.max(0, ...scored.map((x) => x.hits.length))
  // One shared word is enough inside an area; across all projects it takes two.
  if (best < (scope.areaId || scope.taskIds ? 1 : 2)) return { ids: [], why: 'No encontré tareas con esas palabras.' }
  const hits = scored.filter((x) => x.hits.length === best)
  return { ids: hits.map((x) => x.t.id), why: `Coinciden con ${[...new Set(hits.flatMap((x) => x.hits))].map((x) => `«${x}»`).join(', ')}.` }
}

function bestProject(data: ProjectsData, sentence: string): string | undefined {
  const w = new Set(words(sentence))
  return data.projects
    .map((p) => ({ p, n: words(p.name).filter((x) => w.has(x)).length }))
    .sort((a, b) => b.n - a.n)
    .find((x) => x.n > 0)?.p.id
}

export function proposeChanges(data: ProjectsData, text: string, scope: { projectId?: string; areaId?: string; taskIds?: string[] } = {}): Proposal[] {
  const sentences = text
    .split(/(?<=[.!?\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  return sentences.map((sentence, i) => {
    const kind = changeKindOf(sentence)
    if (kind === 'nueva') {
      const title = sentence.replace(/^.*?\b(?:añadir|anadir|incorporar|agregar|sumar)\b\s*/i, '').replace(/[.!?]$/, '')
      const projectId = scope.projectId ?? bestProject(data, sentence)
      return { id: `c${i}`, kind, sentence, matched: [], taskIds: [], ...(projectId ? { projectId } : {}), title: title.charAt(0).toUpperCase() + title.slice(1), why: projectId ? 'Nombras el proyecto o estás dentro de él.' : 'Elige a qué proyecto va.', accepted: Boolean(projectId) }
    }
    const m = matchTasks(data, sentence, scope)
    const projectId = m.ids.length ? data.tasks.find((t) => t.id === m.ids[0])?.projectId : scope.projectId
    return { id: `c${i}`, kind, sentence, matched: m.ids, taskIds: m.ids, ...(projectId ? { projectId } : {}), title: '', why: m.why, accepted: m.ids.length > 0 }
  })
}

/**
 * Applies the accepted proposals with the same operations ELYUM uses: history
 * kept, nothing deleted. «Terminé» records the work as executed; the approval
 * stays a separate decision of the person (it shows as «Por revisar»).
 */
export function applyProposals(data: ProjectsData, proposals: Proposal[], ctx: () => Ctx): ProjectsData {
  let d = data
  for (const p of proposals.filter((x) => x.accepted)) {
    if (p.kind === 'nueva') {
      if (!p.projectId) continue
      const proj = d.projects.find((x) => x.id === p.projectId)!
      const voc = d.vocabularies[proj.dossier]
      if (voc && !voc.status.some((s) => s.literal === 'Pendiente')) d = { ...d, vocabularies: { ...d.vocabularies, [proj.dossier]: { ...voc, status: [...voc.status, { literal: 'Pendiente', workClass: 'pendiente' }] } } }
      d = createTask(d, { projectId: p.projectId, title: p.title, status: 'Pendiente' }, ctx()).data
      continue
    }
    for (const id of p.taskIds) {
      const t = d.tasks.find((x) => x.id === id)
      if (!t) continue
      if (p.kind === 'hecha' && t.status !== 'Ejecutada') d = changeStatus(d, t.id, 'Ejecutada', ctx())
      else if (p.kind === 'descartada' && t.status !== 'Descartada') d = changeStatus(d, t.id, 'Descartada', ctx())
      else if (p.kind === 'cambio') {
        const c = ctx()
        d = { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, nextAction: p.sentence } : x)), history: [...d.history, { at: c.now, by: 'usuario', entity: 'task', id: t.id, field: 'nextAction', from: t.nextAction, to: p.sentence, note: 'actualización en lenguaje natural' }] }
      }
    }
  }
  return d
}

/** An approved example over the synthetic projects, for walking the «active» state. */
export function exampleSprint(data: ProjectsData, approvedAt: string): Sprint {
  const s = proposeStrategy(data, 6)
  return { ...s, status: 'aprobado', step: 3, northStarFrom: 'tuya', pillars: s.pillars.map((p) => ({ ...p, from: 'tuya' })), actions: s.actions.map((a) => ({ ...a, from: 'tuya' })), approvedAt }
}

/** The person approves: from now on every part is theirs, not a suggestion. */
export const approve = (s: Sprint, at: string): Sprint => ({ ...s, status: 'aprobado', step: 3, northStarFrom: 'tuya', pillars: s.pillars.map((p) => ({ ...p, from: 'tuya' })), actions: s.actions.map((a) => ({ ...a, from: 'tuya' })), approvedAt: at })
