import { changeStatus } from '../domain/operations'
import { createTask, decideApproval, type Ctx } from '../domain/ops'
import { indexTasks, isClosed } from '../domain/derive'
import type { ProjectsData, Task } from '../domain/types'
import { explain, waitersOf } from '../ui/attention'

/**
 * PROTOTYPE · The 90-day plan, in memory only. Nothing here is stored by ELYUM
 * and nothing calls any service: the «AI» functions are deterministic
 * simulations over the synthetic data, so the screens can be walked end to end.
 * Every AI output is marked `from: 'ia'` and stays a proposal until the person
 * accepts it; an approved sprint records who approved and when.
 */

export type Month = 'dic' | 'ene' | 'feb'
export const MONTHS: { key: Month; label: string; short: string; start: string; end: string }[] = [
  { key: 'dic', label: 'Diciembre', short: 'Dic', start: '2026-12-01', end: '2026-12-31' },
  { key: 'ene', label: 'Enero', short: 'Ene', start: '2027-01-01', end: '2027-01-31' },
  { key: 'feb', label: 'Febrero', short: 'Feb', start: '2027-02-01', end: '2027-02-28' },
]
export const SPRINT = { start: '2026-12-01', end: '2027-02-28', label: '1 dic 2026 – 28 feb 2027' }

/** Who wrote a piece of the plan. An AI suggestion is never a decision until the person accepts it. */
export type Source = 'ia' | 'tuya'

export interface Pillar {
  id: string
  name: string
  from: Source
  projectIds: string[]
  /** What should be true at the end of each month. */
  results: Record<Month, string>
}

export interface PlanAction {
  id: string
  pillarId: string
  taskId: string
  month: Month
  from: Source
}

export interface Sprint {
  status: 'borrador' | 'aprobado'
  /** Wizard step to continue from (1…6). */
  step: number
  northStar: string
  northStarFrom: Source
  pillars: Pillar[]
  actions: PlanAction[]
  approvedAt?: string
}

export const emptySprint = (): Sprint => ({ status: 'borrador', step: 1, northStar: '', northStarFrom: 'tuya', pillars: [], actions: [] })

/** The month a date falls in, or the first month before the sprint starts (and the last after it ends). */
export function monthOf(today: string): { month: Month; before: boolean; after: boolean } {
  if (today < SPRINT.start) return { month: 'dic', before: true, after: false }
  if (today > SPRINT.end) return { month: 'feb', before: false, after: true }
  return { month: MONTHS.find((m) => today >= m.start && today <= m.end)!.key, before: false, after: false }
}

export const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

// ── Simulated AI ────────────────────────────────────────────────────────────

/** Open tasks of a project that are not blocked, ready first, then those more tasks wait for. */
export function candidateActions(data: ProjectsData, projectId: string, n = 4): Task[] {
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  return data.tasks
    .filter((t) => t.projectId === projectId && !isClosed(data, t))
    .map((t) => ({ t, ex: explain(data, t, index, waiters) }))
    .filter(({ ex }) => ex.stage !== 'bloqueada')
    .sort((a, b) => Number(b.ex.stage === 'lista') - Number(a.ex.stage === 'lista') || b.ex.waiters.length - a.ex.waiters.length)
    .slice(0, n)
    .map(({ t }) => t)
}

export function suggestNorthStars(data: ProjectsData): string[] {
  const named = data.projects.filter((p) => p.objective).map((p) => p.name.toLowerCase())
  return [
    `Tener ${named.slice(0, 2).join(' y ')} funcionando con personas reales antes de marzo.`,
    'Pasar de preparar a publicar: tres cosas visibles y usadas por otros al final del trimestre.',
    'Ordenar lo que ya existe y lanzar una sola cosa bien terminada.',
  ]
}

export function suggestPillars(data: ProjectsData): Pillar[] {
  const p = (name: string) => data.projects.find((x) => x.name === name)?.id
  const mk = (id: string, name: string, names: string[], r: [string, string, string]): Pillar => ({
    id,
    name,
    from: 'ia',
    projectIds: names.map(p).filter((x): x is string => Boolean(x)),
    results: { dic: r[0], ene: r[1], feb: r[2] },
  })
  return [
    mk('p1', 'Abrir el huerto con voluntarios', ['Huerto comunitario'], ['Turnos y normas decididos', 'Primeros bancales plantados', 'Doce voluntarios con turno fijo']),
    mk('p2', 'Probar el curso de cerámica', ['Taller de cerámica'], ['Programa cerrado y horno reservado', 'Sesión piloto con dos personas', 'Primer grupo inscrito']),
    mk('p3', 'Contarlo cada mes en el boletín', ['Boletín del barrio'], ['Plantilla y suscripción funcionando', 'Primer envío', 'Segundo envío con fotos de vecinos']),
    mk('p4', 'Ordenar el archivo de recetas', ['Archivo de recetas'], ['Inventario hecho', 'Etiquetas unificadas', 'Índice por temporada']),
    mk('p5', 'App de hábitos estable en el iPhone', ['App de hábitos'], ['Repositorio revisado', 'Registro y rachas', 'Versión estable instalada']),
  ]
}

/** Grok-like review: observations computed from the plan. Never changes anything. */
export interface Observation {
  tone: 'riesgo' | 'mejora' | 'seguimiento'
  text: string
}

export function reviewPlan(data: ProjectsData, s: Sprint): Observation[] {
  const out: Observation[] = []
  const index = indexTasks(data)
  const waiters = waitersOf(data, index)
  const per = Object.fromEntries(MONTHS.map((m) => [m.key, s.actions.filter((a) => a.month === m.key).length])) as Record<Month, number>
  const max = MONTHS.reduce((a, m) => (per[m.key] > per[a.key] ? m : a))
  if (per[max.key] > 5) out.push({ tone: 'riesgo', text: `${max.label} tiene ${per[max.key]} acciones. Es más de lo que suele caber en un mes junto con el día a día.` })
  for (const p of s.pillars) if (!s.actions.some((a) => a.pillarId === p.id)) out.push({ tone: 'riesgo', text: `«${p.name}» no tiene ninguna acción todavía.` })
  const stuck = s.actions.map((a) => index.get(a.taskId)).filter((t): t is Task => !!t && explain(data, t, index, waiters).stage !== 'lista' && !isClosed(data, t))
  if (stuck.length) out.push({ tone: 'seguimiento', text: `${stuck.length === 1 ? 'Una acción necesita' : `${stuck.length} acciones necesitan`} que aclares o compruebes algo antes de poder empezar. La primera: «${stuck[0].title}».` })
  const outside = data.projects.filter((p) => !s.pillars.some((x) => x.projectIds.includes(p.id)))
  if (outside.length) out.push({ tone: 'mejora', text: `${outside.map((p) => p.name).join(', ')} no ${outside.length === 1 ? 'participa' : 'participan'} este trimestre. Siguen disponibles en «Mis proyectos».` })
  return out
}

// ── Updates in plain language (simulated AI) ───────────────────────────────

export type ChangeKind = 'hecha' | 'descartada' | 'cambio' | 'nueva'
export interface Proposal {
  id: string
  kind: ChangeKind
  sentence: string
  taskId?: string
  projectId?: string
  title: string
  accepted: boolean
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const STOP = new Set('el la los las de del un una unos unas y o a en con para por que ya lo le se mi mis su sus al es esta este eso esto no voy hacer hice termine terminé he quiero anadir añadir incorporar cambio cambiar ahora'.split(' '))
const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w))

function kindOf(sentence: string): ChangeKind {
  const s = norm(sentence)
  if (/\b(ya no|no voy a|descart|olvid|abandon|no hace falta)/.test(s)) return 'descartada'
  if (/\b(termine|terminado|terminada|ya hice|hecho|hecha|listo|lista|complete|acabe)\b/.test(s)) return 'hecha'
  if (/\b(quiero (anadir|incorporar|agregar|sumar)|anadir|incorporar|agregar|nueva tarea|tambien quiero)\b/.test(s)) return 'nueva'
  return 'cambio'
}

/** Best task for a sentence by shared words with its title (and its project's name). */
function bestTask(data: ProjectsData, sentence: string): Task | undefined {
  const w = new Set(words(sentence))
  let best: { t: Task; score: number } | undefined
  for (const t of data.tasks) {
    if (isClosed(data, t)) continue
    const p = data.projects.find((x) => x.id === t.projectId)
    const score = words(t.title).filter((x) => w.has(x)).length * 2 + words(p?.name ?? '').filter((x) => w.has(x)).length
    if (score >= 3 && (!best || score > best.score)) best = { t, score }
  }
  return best?.t
}

function bestProject(data: ProjectsData, sentence: string): string | undefined {
  const w = new Set(words(sentence))
  return data.projects.map((p) => ({ p, n: words(p.name).filter((x) => w.has(x)).length })).sort((a, b) => b.n - a.n).find((x) => x.n > 0)?.p.id
}

export function proposeChanges(data: ProjectsData, text: string): Proposal[] {
  const sentences = text
    .split(/(?<=[.!?\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  return sentences.map((sentence, i) => {
    const kind = kindOf(sentence)
    if (kind === 'nueva') {
      const title = sentence.replace(/^.*?\b(?:añadir|anadir|incorporar|agregar|sumar)\b\s*/i, '').replace(/[.!?]$/, '')
      const projectId = bestProject(data, sentence)
      return { id: `c${i}`, kind, sentence, ...(projectId ? { projectId } : {}), title: title.charAt(0).toUpperCase() + title.slice(1), accepted: Boolean(projectId) }
    }
    const t = bestTask(data, sentence)
    return { id: `c${i}`, kind, sentence, ...(t ? { taskId: t.id, projectId: t.projectId } : {}), title: t?.title ?? 'Sin tarea relacionada', accepted: Boolean(t) }
  })
}

/** Applies the accepted proposals with the same operations ELYUM uses: history kept, nothing deleted. */
export function applyProposals(data: ProjectsData, proposals: Proposal[], ctx: () => Ctx): ProjectsData {
  let d = data
  for (const p of proposals.filter((x) => x.accepted)) {
    const t = p.taskId ? d.tasks.find((x) => x.id === p.taskId) : undefined
    if (p.kind === 'hecha' && t) {
      if (t.status !== 'Ejecutada') d = changeStatus(d, t.id, 'Ejecutada', ctx())
      d = decideApproval(d, t.id, 'aprobada', ctx(), `Actualización: «${p.sentence}»`)
    } else if (p.kind === 'descartada' && t) {
      if (t.status !== 'Descartada') d = changeStatus(d, t.id, 'Descartada', ctx())
    } else if (p.kind === 'cambio' && t) {
      d = { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, nextAction: p.sentence } : x)), history: [...d.history, { at: ctx().now, by: 'usuario', entity: 'task', id: t.id, field: 'nextAction', from: t.nextAction, to: p.sentence, note: 'actualización en lenguaje natural' }] }
    } else if (p.kind === 'nueva' && p.projectId) {
      const proj = d.projects.find((x) => x.id === p.projectId)!
      const voc = d.vocabularies[proj.dossier]
      if (voc && !voc.status.some((s) => s.literal === 'Pendiente')) d = { ...d, vocabularies: { ...d.vocabularies, [proj.dossier]: { ...voc, status: [...voc.status, { literal: 'Pendiente', workClass: 'pendiente' }] } } }
      d = createTask(d, { projectId: p.projectId, title: p.title, status: 'Pendiente' }, ctx()).data
    }
  }
  return d
}

/** An approved example sprint over the synthetic projects, for walking the «active» state. */
export function exampleSprint(data: ProjectsData, approvedAt: string): Sprint {
  const pillars = suggestPillars(data).slice(0, 3)
  const actions: PlanAction[] = []
  for (const p of pillars)
    candidateActions(data, p.projectIds[0], 6).forEach((t, i) => actions.push({ id: `${p.id}-${i}`, pillarId: p.id, taskId: t.id, month: MONTHS[Math.min(2, Math.floor(i / 2))].key, from: 'ia' }))
  return { status: 'aprobado', step: 6, northStar: suggestNorthStars(data)[1], northStarFrom: 'tuya', pillars: pillars.map((p) => ({ ...p, from: 'tuya' })), actions: actions.map((a) => ({ ...a, from: 'tuya' })), approvedAt }
}
