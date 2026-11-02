import { ROUTINE_TAGS } from './capacity'
import { cycleIssues, isDateKey } from './cycle'
import { dependencyCycles } from './derive'
import { duplicates } from './ids'
import { APPROVAL_STATES, CONDITION_STATES, ESTIMATE_PERIODS, OWNER_KINDS, REQUIREMENT_KINDS, VERIFICATION_STATES, type ProjectsData } from './types'
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
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const oneOf = (list: readonly string[], v: unknown) => isStr(v) && list.includes(v)
const isOwner = (o: unknown) => isObject(o) && oneOf(OWNER_KINDS, o.kind) && isStr(o.name)

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
  for (const k of ['sources', 'references', 'imports'] as const) if (input[k] !== undefined && !Array.isArray(input[k])) err(k, 'debe ser una lista')
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
    if (p.rules !== undefined) {
      if (!Array.isArray(p.rules)) err(at, 'reglas mal formadas')
      else
        p.rules.forEach((r, j) => {
          if (!isObject(r) || !isStr(r.literal)) return err(`${at}.rules[${j}]`, 'regla sin texto')
          if (r.kind !== undefined && r.kind !== 'wip') err(`${at}.rules[${j}]`, `tipo de regla desconocido: ${String(r.kind)}`)
          if (r.limit !== undefined && !(Number.isInteger(r.limit) && r.limit >= 0)) err(`${at}.rules[${j}]`, 'límite no válido')
        })
    }
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
    if (!isObject(t.approval) || !oneOf(APPROVAL_STATES, t.approval.state)) err(at, 'aprobación no válida')
    else if (t.approval.parts !== undefined && (!Array.isArray(t.approval.parts) || !t.approval.parts.every((x) => isObject(x) && isStr(x.scope) && oneOf(APPROVAL_STATES, x.state) && optStr(x.literal))))
      err(at, 'aprobaciones parciales mal formadas')
    if (t.owner !== undefined && !isOwner(t.owner)) err(at, 'responsable no válido')
    if (!isStrArray(t.dependsOn) || !isStrArray(t.acceptance) || !isStrArray(t.atlasRefs) || !Array.isArray(t.evidence)) return err(at, 'listas mal formadas')
    for (const dep of t.dependsOn) {
      if (dep === t.id) err(at, 'depende de sí misma')
      else if (!tasks.has(dep)) warn(at, `depende de un ID que no existe: ${dep} (se conserva)`)
    }
    if (t.estimateHours !== undefined && !(typeof t.estimateHours === 'number' && t.estimateHours >= 0)) err(at, 'estimación no válida')

    // P1.1
    if (t.verification !== undefined && (!isObject(t.verification) || !oneOf(VERIFICATION_STATES, t.verification.state) || !optStr(t.verification.literal)))
      err(at, 'verificación no válida')
    if (!optStr(t.area) || !optStr(t.deliverable)) err(at, 'área o entregable mal formados')
    if (t.estimate !== undefined) {
      const e = t.estimate as unknown as Record<string, unknown>
      if (!isObject(e) || !isStr(e.literal)) err(at, 'estimación literal mal formada')
      else {
        if ((e.minMinutes !== undefined && !(isNum(e.minMinutes) && e.minMinutes >= 0)) || (e.maxMinutes !== undefined && !(isNum(e.maxMinutes) && e.maxMinutes >= 0)))
          err(at, 'rango de estimación no válido')
        else if (isNum(e.minMinutes) && isNum(e.maxMinutes) && e.minMinutes > e.maxMinutes) err(at, 'rango de estimación invertido')
        if (e.per !== undefined && !oneOf(ESTIMATE_PERIODS, e.per)) err(at, `periodicidad desconocida: ${String(e.per)}`)
      }
    }
    if (t.delegation !== undefined && (!isObject(t.delegation) || !optStr(t.delegation.literal) || !Array.isArray(t.delegation.candidates) || !t.delegation.candidates.every(isOwner)))
      err(at, 'delegación mal formada')
    if (t.sourceRefs !== undefined && (!isObject(t.sourceRefs) || !isStr(t.sourceRefs.literal) || !isStrArray(t.sourceRefs.keys))) err(at, 'referencias de fuente mal formadas')
    if (t.requirements !== undefined) {
      if (!Array.isArray(t.requirements)) err(at, 'requisitos mal formados')
      else {
        for (const id of duplicates(t.requirements.map((r) => (isObject(r) ? (r.id as string) : undefined)))) err(at, `requisito repetido: ${id}`)
        t.requirements.forEach((r, j) => {
          const rat = `${at}.requirements[${j}]`
          if (!isObject(r) || !isStr(r.id) || !isStr(r.literal)) return err(rat, 'requisito sin id o sin texto de origen')
          if (!oneOf(REQUIREMENT_KINDS, r.kind)) err(rat, `tipo de requisito desconocido: ${String(r.kind)}`)
          if (r.mode !== 'todas' && r.mode !== 'alguna') err(rat, `modo desconocido: ${String(r.mode)}`)
          if (!Array.isArray(r.options) || r.options.length === 0) return err(rat, 'requisito sin opciones')
          r.options.forEach((o, k) => {
            if (isObject(o) && o.kind === 'tarea' && isStr(o.taskId)) {
              if (o.taskId === t.id) err(rat, 'requisito de sí misma')
              else if (!tasks.has(o.taskId)) warn(rat, `requisito con una tarea que no existe: ${o.taskId} (queda por verificar)`)
            } else if (isObject(o) && o.kind === 'condicion' && isStr(o.literal)) {
              if (!oneOf(CONDITION_STATES, o.state)) err(`${rat}.options[${k}]`, `estado de condición desconocido: ${String(o.state)}`)
            } else err(`${rat}.options[${k}]`, 'opción mal formada')
          })
        })
      }
    }
  })

  // P1.1 · M7
  const dossiers = new Set(d.projects.map((p) => p.dossier))
  ;(d.sources ?? []).forEach((s, i) => {
    if (!isObject(s) || !isStr(s.dossier) || !isStr(s.key) || !isStr(s.title)) return err(`sources[${i}]`, 'fuente sin dossier, clave o título')
    if (!dossiers.has(s.dossier)) warn(`sources[${i}]`, `fuente de un dossier sin proyecto: ${s.dossier}`)
  })
  for (const k of duplicates((d.sources ?? []).map((s) => (isObject(s) ? `${String(s.dossier)} · ${String(s.key)}` : undefined)))) err('sources', `clave de fuente repetida: ${k}`)
  ;(d.references ?? []).forEach((r, i) => {
    const at = `references[${i}]`
    if (!isObject(r) || !isStr(r.id) || !isStr(r.dossier) || !isStr(r.projectId) || !isStr(r.group) || !isStr(r.label)) return err(at, 'referencia incompleta')
    if (!projects.has(r.projectId)) err(at, `proyecto desconocido: ${r.projectId}`)
    if (!Array.isArray(r.cells) || !r.cells.every((c) => isObject(c) && isStr(c.column) && isStr(c.value))) err(at, 'celdas mal formadas')
  })
  const refIds = (d.references ?? []).map((r) => (isObject(r) ? (r.id as string) : undefined))
  for (const id of duplicates(refIds)) err('references', `identificador repetido: ${id}`)
  for (const id of refIds) if (id !== undefined && internal.includes(id)) err('references', `identificador ya usado por otra entidad: ${id}`)
  ;(d.imports ?? []).forEach((r, i) => {
    if (!isObject(r) || !isStr(r.id) || !isStr(r.at) || !isStr(r.projectId) || !isStr(r.dossier) || !isStr(r.dossierHash) || !isObject(r.counts) || !Array.isArray(r.resolutions))
      err(`imports[${i}]`, 'registro de importación incompleto')
  })
  // Sources a task cites must exist in its dossier's list, when the dossier has one.
  d.tasks.forEach((t, i) => {
    const p = projects.get(t.projectId)
    const listed = (d.sources ?? []).filter((s) => s.dossier === p?.dossier).map((s) => s.key)
    if (!t.sourceRefs || listed.length === 0) return
    for (const k of t.sourceRefs.keys) if (!listed.includes(k)) warn(`tasks[${i}]`, `cita una fuente que el dossier no lista: ${k}`)
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
