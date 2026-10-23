import { ROUTINE_TAGS } from './capacity'
import { cycleIssues, isDateKey } from './cycle'
import { dependencyCycles } from './derive'
import { duplicates } from './ids'
import { APPROVAL_STATES, OWNER_KINDS, type ProjectsData } from './types'
import { vocabularyIssues } from './vocabulary'

/**
 * Reading PROYECTOS data that came from outside (storage, an import, a copy):
 * shape first, then meaning. `errors` stop it from being used; `warnings` are
 * kept and shown (a dependency to an unknown ID, a dependency cycle…).
 * Unknown fields are not an error: they are preserved as they are.
 */
export interface Issue {
  path: string
  message: string
}

export type ValidationResult = { ok: true; data: ProjectsData; warnings: Issue[] } | { ok: false; errors: Issue[]; warnings: Issue[] }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const optStr = (v: unknown) => v === undefined || isStr(v)

export function validateProjectsData(input: unknown): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  const warn = (path: string, message: string) => warnings.push({ path, message })

  if (!isObject(input)) return { ok: false, errors: [{ path: '', message: 'no es un objeto' }], warnings }
  if (input.version !== 1) err('version', `versión no admitida: ${String(input.version)}`)
  if (!isObject(input.cycle) || !isStr(input.cycle.start) || !isStr(input.cycle.end)) err('cycle', 'falta el ciclo')
  else for (const m of cycleIssues({ start: input.cycle.start, end: input.cycle.end })) err('cycle', m)

  const lists = ['projects', 'milestones', 'tasks', 'atlas', 'routineLinks', 'weeks', 'history'] as const
  for (const k of lists) if (!Array.isArray(input[k])) err(k, 'debe ser una lista')
  if (!isObject(input.vocabularies)) err('vocabularies', 'faltan los vocabularios')
  if (errors.length) return { ok: false, errors, warnings }

  const d = input as unknown as ProjectsData

  // Vocabularies
  for (const [name, v] of Object.entries(d.vocabularies)) {
    if (!isObject(v) || !Array.isArray(v.status) || !Array.isArray(v.priority) || !Array.isArray(v.approval)) {
      err(`vocabularies.${name}`, 'vocabulario incompleto')
      continue
    }
    for (const m of vocabularyIssues(name, v)) err(`vocabularies.${name}`, m)
  }

  // Identity: internal ids unique across entities; dossier IDs unique within each kind of record.
  const internal = [...d.projects, ...d.milestones, ...d.tasks, ...d.atlas].map((x) => (isObject(x) ? x.id : undefined))
  for (const id of duplicates(internal as string[])) err('id', `identificador interno repetido: ${id}`)
  for (const [kind, list] of [['proyecto', d.projects], ['hito', d.milestones], ['tarea', d.tasks], ['referencia ATLAS', d.atlas]] as const)
    for (const id of duplicates(list.map((x) => (x as { sourceId?: string }).sourceId))) err('sourceId', `ID original de ${kind} repetido: ${id} (no se renombra: hay que resolverlo en el origen)`)

  const projects = new Map(d.projects.map((p) => [p.id, p]))
  const milestones = new Map(d.milestones.map((m) => [m.id, m]))
  const tasks = new Set(d.tasks.map((t) => t.id))

  d.projects.forEach((p, i) => {
    const at = `projects[${i}]`
    if (!isStr(p.id) || !isStr(p.name) || !isStr(p.dossier)) return err(at, 'falta id, nombre o dossier')
    if (!d.vocabularies[p.dossier]) err(at, `el dossier «${p.dossier}» no tiene vocabulario`)
    if (!isStrArray(p.expectedResults) || !isStrArray(p.atlasRefs)) err(at, 'resultados esperados o referencias ATLAS mal formados')
    if (!optStr(p.sourceId) || !optStr(p.objective) || !optStr(p.statusLiteral)) err(at, 'campos de texto mal formados')
  })

  d.milestones.forEach((m, i) => {
    const at = `milestones[${i}]`
    if (!isStr(m.id) || !isStr(m.title) || !isStr(m.projectId)) return err(at, 'falta id, título o proyecto')
    if (!projects.has(m.projectId)) err(at, `proyecto desconocido: ${m.projectId}`)
    if (m.due !== undefined && !isDateKey(m.due)) err(at, `fecha no válida: ${String(m.due)}`)
    if (!isStrArray(m.acceptance)) err(at, 'criterios de aceptación mal formados')
  })

  d.tasks.forEach((t, i) => {
    const at = `tasks[${i}]${isStr(t.sourceId) ? ` (${t.sourceId})` : ''}`
    if (!isStr(t.id) || !isStr(t.title) || !isStr(t.projectId) || !isStr(t.status) || !isStr(t.createdAt)) return err(at, 'falta id, título, proyecto, estado o fecha de creación')
    const project = projects.get(t.projectId)
    if (!project) return err(at, `proyecto desconocido: ${t.projectId}`)
    const vocab = d.vocabularies[project.dossier]
    if (vocab) {
      if (!vocab.status.some((s) => s.literal === t.status)) err(at, `estado «${t.status}» no está en el vocabulario de ${project.dossier}`)
      if (t.priority !== undefined && !vocab.priority.some((p) => p.literal === t.priority)) err(at, `prioridad «${t.priority}» no está en el vocabulario de ${project.dossier}`)
      if (t.approval?.original && !vocab.approval.some((a) => a.literal === t.approval.original!.literal))
        err(at, `aprobación original «${t.approval.original.literal}» no está en el vocabulario de ${project.dossier}`)
    }
    if (t.milestoneId !== undefined) {
      const m = milestones.get(t.milestoneId)
      if (!m) err(at, `hito desconocido: ${t.milestoneId}`)
      else if (m.projectId !== t.projectId) err(at, `el hito ${t.milestoneId} es de otro proyecto`)
    }
    if (!isObject(t.approval) || !(APPROVAL_STATES as readonly unknown[]).includes(t.approval.state)) err(at, 'aprobación no válida')
    if (t.owner !== undefined && (!isObject(t.owner) || !(OWNER_KINDS as readonly unknown[]).includes(t.owner.kind) || !isStr(t.owner.name))) err(at, 'responsable no válido')
    if (!isStrArray(t.dependsOn) || !isStrArray(t.acceptance) || !isStrArray(t.atlasRefs) || !Array.isArray(t.evidence)) return err(at, 'listas mal formadas')
    for (const dep of t.dependsOn) {
      if (dep === t.id) err(at, 'depende de sí misma')
      else if (!tasks.has(dep)) warn(at, `depende de un ID que no existe: ${dep} (se conserva)`)
    }
    if (t.estimateHours !== undefined && !(typeof t.estimateHours === 'number' && t.estimateHours >= 0)) err(at, 'estimación no válida')
  })

  d.routineLinks.forEach((l, i) => {
    if (!projects.has(l.projectId)) err(`routineLinks[${i}]`, `proyecto desconocido: ${l.projectId}`)
    if (!(ROUTINE_TAGS as readonly string[]).includes(l.tag)) err(`routineLinks[${i}]`, `etiqueta de rutina desconocida: ${String(l.tag)}`)
  })

  d.weeks.forEach((w, i) => {
    if (!isDateKey(w.weekStart)) err(`weeks[${i}]`, 'semana sin fecha válida')
    for (const c of w.commitments ?? []) if (!tasks.has(c.taskId)) err(`weeks[${i}]`, `compromiso con una tarea desconocida: ${c.taskId}`)
  })
  for (const s of duplicates(d.weeks.map((w) => w.weekStart))) err('weeks', `semana repetida: ${s}`)

  if (errors.length === 0) for (const cycle of dependencyCycles(d)) warn('tasks', `ciclo de dependencias: ${cycle.join(' → ')}`)

  return errors.length ? { ok: false, errors, warnings } : { ok: true, data: d, warnings }
}
