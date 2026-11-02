import { allIds, importedId, newId } from '../domain/ids'
import { parseEstimate, parseSourceRefs } from '../domain/literals'
import { validateProjectsData } from '../domain/schema'
import type { ApprovalState, DossierReference, DossierSource, HistoryEntry, ImportRecord, Origin, Project, ProjectRule, ProjectsData, Task, Vocabulary, WorkClass } from '../domain/types'
import { bundleIssues, type DossierBundle, type DraftTask } from './bundle'
import { readRequirements } from './requirements'

/**
 * P3 · From a bundle to a reviewed import. Two steps, both pure:
 *
 *   planImport   what WOULD change — new, unchanged, changed, conflicts, missing
 *   applyImport  the data after the person confirms (never before)
 *
 * Re-importing never destroys work done in ELYUM. For every field that comes
 * from the dossier, the import keeps what it derived last time
 * (`origin.snapshot`) and compares three values:
 *
 *   dossier changed, ELYUM did not  → «cambiada»: applied on confirmation
 *   ELYUM changed, dossier did not  → kept, nothing to decide
 *   both changed (differently)      → «conflicto»: kept as in ELYUM unless the person picks the dossier
 *
 * Fields the person owns (owner, approval decision, evidence, next action,
 * verification, delegation candidates, hours, commitments) are never touched.
 * A task missing from the new dossier is never deleted: it is listed.
 */

export const CONVERTER = 'p3-import/1'

export interface ImportDecisions {
  /** Import into an existing project, or create one with this name. */
  target: { projectId: string } | { create: { name: string } }
  /** Class of each status literal, decided by the person. Missing → `sin-decidir`. */
  statusClasses?: Record<string, WorkClass>
  /** Approval state of each approval literal. Missing → `sin-dato`. */
  approvalStates?: Record<string, ApprovalState>
  /** Rank of each priority literal. A literal without one is kept as text in `extra`. */
  priorityRanks?: Record<string, number>
  /** Project rules (M9), informative. Only when creating the project. */
  rules?: ProjectRule[]
}

/** The dossier-owned fields of a task. */
export const DOSSIER_FIELDS = ['title', 'status', 'acceptance', 'area', 'deliverable', 'estimate', 'delegation', 'sourceRefs', 'requirements', 'approvalOriginal', 'priority', 'extra'] as const
export type DossierField = (typeof DOSSIER_FIELDS)[number]

export interface FieldChange {
  field: DossierField
  /** Current value in ELYUM. */
  current: unknown
  /** Value in the new dossier. */
  incoming: unknown
  conflict: boolean
}

export interface PlanItem {
  sourceId: string
  taskId: string
  kind: 'nueva' | 'igual' | 'cambiada' | 'conflicto'
  changes: FieldChange[]
  /** Fields edited in ELYUM that the dossier did not change: kept, shown for information. */
  editedInElyum: DossierField[]
  /** How a dependency text was read, when it was not plain (abbreviations). */
  readings: string[]
  draft: DraftTask
}

export interface ImportPlan {
  ok: boolean
  errors: string[]
  warnings: string[]
  bundle: DossierBundle
  projectId: string
  creating: boolean
  /** Key of the project's vocabulary. */
  dossierKey: string
  items: PlanItem[]
  /** Tasks of this project from a dossier that the new file no longer has. Kept. */
  missing: { taskId: string; sourceId: string; title: string }[]
  /** Status literals not yet in the vocabulary, with the class they will get. */
  newStatusLiterals: { literal: string; workClass: WorkClass; tasks: string[] }[]
  /** This exact file was already imported into this project. */
  sameFile: boolean
  counts: ImportRecord['counts']
}

type Ctx = { now: string; random?: () => string }

const json = (v: unknown) => JSON.stringify(v ?? null)
const equal = (a: unknown, b: unknown) => json(a) === json(b)

/** What the dossier says for each field of a task, in the shape the task stores it. */
export function dossierValues(d: DraftTask, priorityRanks: Record<string, number> = {}): Record<DossierField, unknown> {
  const prioritized = d.priorityLiteral !== undefined && priorityRanks[d.priorityLiteral] !== undefined
  const extra = { ...d.extra, ...(d.priorityLiteral !== undefined && !prioritized ? { 'Prioridad (sin rango decidido)': d.priorityLiteral } : {}) }
  return {
    title: d.title,
    status: d.statusLiteral,
    acceptance: d.acceptance,
    area: d.area,
    deliverable: d.deliverable,
    estimate: d.estimateLiteral === undefined ? undefined : parseEstimate(d.estimateLiteral),
    delegation: d.delegationLiteral,
    sourceRefs: d.sourceRefsLiteral === undefined ? undefined : parseSourceRefs(d.sourceRefsLiteral),
    requirements: readRequirements(d.dependencyLiteral).map((r) => r.literal),
    approvalOriginal: d.approvalLiteral,
    priority: prioritized ? d.priorityLiteral : undefined,
    extra: Object.keys(extra).length ? extra : undefined,
  }
}

/** The same fields, read from a task as it is now. */
export function currentValues(t: Task): Record<DossierField, unknown> {
  return {
    title: t.title,
    status: t.status,
    acceptance: t.acceptance,
    area: t.area,
    deliverable: t.deliverable,
    estimate: t.estimate,
    delegation: t.delegation?.literal,
    sourceRefs: t.sourceRefs,
    requirements: (t.requirements ?? []).map((r) => r.literal),
    approvalOriginal: t.approval.original?.literal,
    priority: t.priority,
    extra: t.extra && Object.keys(t.extra).length ? t.extra : undefined,
  }
}

/** A condition the person already answered: replacing the requirement would lose it. */
const answeredConditions = (t: Task) => (t.requirements ?? []).some((r) => r.options.some((o) => o.kind === 'condicion' && (o.state !== 'por-verificar' || o.note)))

export function planImport(data: ProjectsData, bundle: DossierBundle, decisions: ImportDecisions, ctx: Ctx): ImportPlan {
  const errors = [...bundleIssues(bundle), ...bundle.issues.filter((i) => i.level === 'error').map((i) => (i.line ? `línea ${i.line}: ${i.message}` : i.message))]
  const warnings = bundle.issues.filter((i) => i.level === 'aviso').map((i) => (i.line ? `línea ${i.line}: ${i.message}` : i.message))

  const creating = 'create' in decisions.target
  let project: Project | undefined
  let projectId: string
  if ('projectId' in decisions.target) {
    projectId = decisions.target.projectId
    project = data.projects.find((p) => p.id === projectId)
    if (!project) errors.push(`proyecto desconocido: ${projectId}`)
  } else {
    if (!decisions.target.create.name.trim()) errors.push('el proyecto nuevo necesita un nombre')
    projectId = newId(allIds(data), ctx.random)
  }
  const dossierKey = project?.dossier ?? bundle.dossier.name
  if (creating && data.vocabularies[dossierKey]) errors.push(`ya hay un proyecto que usa el dossier «${dossierKey}»: importa en ese proyecto`)
  const vocab = data.vocabularies[dossierKey]

  const items: PlanItem[] = []
  const byId = new Map(data.tasks.map((t) => [t.id, t]))
  for (const d of bundle.tasks) {
    const taskId = importedId(d.sourceId)
    const existing = byId.get(taskId)
    const readings = readRequirements(d.dependencyLiteral).flatMap((r) => (r.reading ? [r.reading] : []))
    if (existing && existing.projectId !== projectId) {
      errors.push(`${d.sourceId}: ese ID original ya pertenece a otro proyecto (no se renombra; hay que resolverlo en el origen)`)
      continue
    }
    if (!existing) {
      items.push({ sourceId: d.sourceId, taskId, kind: 'nueva', changes: [], editedInElyum: [], readings, draft: d })
      continue
    }
    const incoming = dossierValues(d, decisions.priorityRanks)
    const current = currentValues(existing)
    const base = (existing.origin?.snapshot ?? currentValues(existing)) as Record<DossierField, unknown>
    const changes: FieldChange[] = []
    const edited: DossierField[] = []
    for (const f of DOSSIER_FIELDS) {
      const dossierChanged = !equal(incoming[f], base[f])
      const elyumChanged = !equal(current[f], base[f]) || (f === 'requirements' && answeredConditions(existing))
      if (dossierChanged && !equal(incoming[f], current[f])) changes.push({ field: f, current: current[f], incoming: incoming[f], conflict: elyumChanged })
      else if (!dossierChanged && elyumChanged && f !== 'requirements') edited.push(f)
    }
    const kind = changes.some((c) => c.conflict) ? 'conflicto' : changes.length ? 'cambiada' : 'igual'
    items.push({ sourceId: d.sourceId, taskId, kind, changes, editedInElyum: edited, readings, draft: d })
  }

  const inBundle = new Set(bundle.tasks.map((t) => importedId(t.sourceId)))
  const missing = data.tasks
    .filter((t) => t.projectId === projectId && t.origin && !inBundle.has(t.id))
    .map((t) => ({ taskId: t.id, sourceId: t.sourceId ?? t.id, title: t.title }))

  const known = new Set(vocab?.status.map((s) => s.literal))
  const newLiterals = new Map<string, string[]>()
  for (const d of bundle.tasks) if (!known.has(d.statusLiteral)) newLiterals.set(d.statusLiteral, [...(newLiterals.get(d.statusLiteral) ?? []), d.sourceId])
  const newStatusLiterals = [...newLiterals].map(([literal, tasks]) => ({ literal, workClass: decisions.statusClasses?.[literal] ?? ('sin-decidir' as WorkClass), tasks }))

  for (const d of bundle.tasks) if (d.priorityLiteral !== undefined && decisions.priorityRanks?.[d.priorityLiteral] === undefined) warnings.push(`${d.sourceId}: prioridad «${d.priorityLiteral}» sin rango decidido; se conserva como texto`)
  for (const [literal, rank] of Object.entries(decisions.priorityRanks ?? {})) if (!Number.isInteger(rank) || rank < 1) errors.push(`rango no válido para la prioridad «${literal}»`)

  const count = (k: PlanItem['kind']) => items.filter((i) => i.kind === k).length
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bundle,
    projectId,
    creating,
    dossierKey,
    items,
    missing,
    newStatusLiterals,
    sameFile: (data.imports ?? []).some((r) => r.projectId === projectId && r.dossierHash === bundle.dossier.sha256),
    counts: { new: count('nueva'), changed: count('cambiada'), unchanged: count('igual'), conflicts: count('conflicto'), missing: missing.length, references: bundle.references.length, sources: bundle.sources.length },
  }
}

export type Resolutions = Record<string, Partial<Record<DossierField, 'mantener-elyum' | 'usar-dossier'>>>

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/**
 * The data after the person confirms the plan. Conflicts default to keeping
 * ELYUM's value. The result is validated; invalid data is never returned.
 */
export function applyImport(data: ProjectsData, plan: ImportPlan, decisions: ImportDecisions, ctx: Ctx, resolutions: Resolutions = {}): ProjectsData {
  if (!plan.ok) throw new ImportError(`La importación tiene errores: ${plan.errors.join('; ')}`)
  const b = plan.bundle
  const history: HistoryEntry[] = []
  const log = (e: Omit<HistoryEntry, 'at' | 'by'>) => history.push({ at: ctx.now, by: 'importación', ...e })
  const origin = (place: { section: string; line: number; raw: string }, snapshot?: Record<string, unknown>): Origin => ({
    dossier: b.dossier.name,
    ...(b.dossier.version ? { dossierVersion: b.dossier.version } : {}),
    dossierHash: b.dossier.sha256,
    location: `${place.section} · línea ${place.line}`,
    raw: place.raw,
    converter: `${b.dossier.reader} · ${CONVERTER}`,
    importedAt: ctx.now,
    ...(snapshot ? { snapshot } : {}),
  })

  // Vocabulary: new literals are added, never renamed; classes as decided, else `sin-decidir`.
  const prev: Vocabulary = data.vocabularies[plan.dossierKey] ?? { status: [], priority: [], approval: [] }
  const vocab: Vocabulary = {
    status: [...prev.status, ...plan.newStatusLiterals.map(({ literal, workClass }) => ({ literal, workClass }))],
    priority: [...prev.priority, ...Object.entries(decisions.priorityRanks ?? {}).filter(([l]) => !prev.priority.some((p) => p.literal === l)).map(([literal, rank]) => ({ literal, rank }))],
    approval: [
      ...prev.approval,
      ...[...new Set(b.tasks.flatMap((t) => (t.approvalLiteral !== undefined ? [t.approvalLiteral] : [])))]
        .filter((l) => !prev.approval.some((a) => a.literal === l))
        .map((literal) => ({ literal, state: decisions.approvalStates?.[literal] ?? ('sin-dato' as ApprovalState) })),
    ],
  }
  for (const n of plan.newStatusLiterals) log({ entity: 'vocabulary', id: plan.dossierKey, field: `status:${n.literal}`, to: n.workClass })

  let projects = data.projects
  if (plan.creating) {
    const name = 'create' in decisions.target ? decisions.target.create.name.trim() : ''
    const project: Project = {
      id: plan.projectId,
      name,
      dossier: plan.dossierKey,
      ...(b.project.objective !== undefined ? { objective: b.project.objective } : {}),
      expectedResults: [],
      atlasRefs: [],
      ...(decisions.rules?.length ? { rules: decisions.rules } : {}),
      ...(b.project.place ? { origin: origin(b.project.place) } : {}),
    }
    projects = [...projects, project]
    log({ entity: 'project', id: project.id, field: 'created', to: name })
  }

  const byId = new Map(data.tasks.map((t) => [t.id, t]))
  const resolutionLog: ImportRecord['resolutions'] = []
  const replaced = new Map<string, Task>()
  const added: Task[] = []
  for (const item of plan.items) {
    const d = item.draft
    const values = dossierValues(d, decisions.priorityRanks)
    const snapshot = values as Record<string, unknown>
    if (item.kind === 'nueva') {
      const t: Task = {
        id: item.taskId,
        sourceId: d.sourceId,
        projectId: plan.projectId,
        title: d.title,
        status: d.statusLiteral,
        ...(values.priority !== undefined ? { priority: values.priority as string } : {}),
        dependsOn: [],
        acceptance: d.acceptance,
        evidence: [],
        approval:
          d.approvalLiteral !== undefined
            ? { state: decisions.approvalStates?.[d.approvalLiteral] ?? 'sin-dato', original: { literal: d.approvalLiteral } }
            : { state: 'sin-dato' },
        atlasRefs: [],
        ...(d.area !== undefined ? { area: d.area } : {}),
        ...(d.deliverable !== undefined ? { deliverable: d.deliverable } : {}),
        ...(values.estimate !== undefined ? { estimate: values.estimate as Task['estimate'] } : {}),
        ...(d.delegationLiteral !== undefined ? { delegation: { literal: d.delegationLiteral, candidates: [] } } : {}),
        ...(values.sourceRefs !== undefined ? { sourceRefs: values.sourceRefs as Task['sourceRefs'] } : {}),
        ...(d.dependencyLiteral !== undefined ? { requirements: readRequirements(d.dependencyLiteral) } : {}),
        origin: origin(d.place, snapshot),
        ...(values.extra !== undefined ? { extra: values.extra as Record<string, unknown> } : {}),
        createdAt: ctx.now,
      }
      added.push(t)
      log({ entity: 'task', id: t.id, field: 'created', to: t.title })
      continue
    }
    let t = { ...byId.get(item.taskId)! }
    for (const c of item.changes) {
      const choice = c.conflict ? (resolutions[item.taskId]?.[c.field] ?? 'mantener-elyum') : 'usar-dossier'
      if (c.conflict) resolutionLog.push({ taskId: item.taskId, field: c.field, choice })
      if (choice === 'mantener-elyum') {
        log({ entity: 'task', id: item.taskId, field: c.field, from: c.current, to: c.current, note: `conflicto: el dossier dice ${json(c.incoming)}; se mantiene ELYUM` })
        continue
      }
      t = setField(t, c.field, d, values)
      log({ entity: 'task', id: item.taskId, field: c.field, from: c.current, to: c.incoming, ...(c.conflict ? { note: 'conflicto: se usa el dossier' } : {}) })
    }
    t.origin = origin(d.place, snapshot)
    replaced.set(t.id, t)
  }

  const tasks = [...data.tasks.map((t) => replaced.get(t.id) ?? t), ...added]

  const sources: DossierSource[] = [
    ...(data.sources ?? []).filter((s) => s.dossier !== plan.dossierKey),
    ...b.sources.map((s) => ({ dossier: plan.dossierKey, key: s.key, title: s.title, ...(s.note !== undefined ? { note: s.note } : {}), origin: origin(s.place) })),
  ]
  const references: DossierReference[] = [
    ...(data.references ?? []).filter((r) => r.projectId !== plan.projectId),
    ...b.references.map((r, i) => ({ id: `ref:${plan.projectId}:${i + 1}`, dossier: plan.dossierKey, projectId: plan.projectId, group: r.group, label: r.label, cells: r.cells, origin: origin(r.place) })),
  ]

  const record: ImportRecord = {
    id: `import:${ctx.now}:${b.dossier.sha256.slice(0, 12)}`,
    at: ctx.now,
    projectId: plan.projectId,
    dossier: b.dossier.name,
    ...(b.dossier.version ? { dossierVersion: b.dossier.version } : {}),
    dossierHash: b.dossier.sha256,
    converter: `${b.dossier.reader} · ${CONVERTER}`,
    counts: plan.counts,
    resolutions: resolutionLog,
  }
  log({ entity: 'import', id: record.id, field: 'confirmed', to: record.counts })

  const next: ProjectsData = {
    ...data,
    vocabularies: { ...data.vocabularies, [plan.dossierKey]: vocab },
    projects,
    tasks,
    sources,
    references,
    imports: [...(data.imports ?? []), record],
    history: [...data.history, ...history],
  }
  const check = validateProjectsData(JSON.parse(JSON.stringify(next)))
  if (!check.ok) throw new ImportError(`El resultado no es válido; no se importa nada: ${check.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`)
  return next
}

function setField(t: Task, f: DossierField, d: DraftTask, v: Record<DossierField, unknown>): Task {
  const without = <K extends keyof Task>(k: K, value: Task[K] | undefined): Task => {
    const copy = { ...t }
    if (value === undefined) delete copy[k]
    else copy[k] = value
    return copy
  }
  switch (f) {
    case 'title':
      return { ...t, title: d.title }
    case 'status':
      return { ...t, status: d.statusLiteral }
    case 'acceptance':
      return { ...t, acceptance: d.acceptance }
    case 'area':
      return without('area', d.area)
    case 'deliverable':
      return without('deliverable', d.deliverable)
    case 'estimate':
      return without('estimate', v.estimate as Task['estimate'])
    case 'delegation':
      return without('delegation', d.delegationLiteral === undefined && !t.delegation?.candidates.length ? undefined : { ...(d.delegationLiteral !== undefined ? { literal: d.delegationLiteral } : {}), candidates: t.delegation?.candidates ?? [] })
    case 'sourceRefs':
      return without('sourceRefs', v.sourceRefs as Task['sourceRefs'])
    case 'requirements':
      return without('requirements', d.dependencyLiteral === undefined ? undefined : readRequirements(d.dependencyLiteral))
    case 'approvalOriginal':
      return { ...t, approval: { ...t.approval, ...(d.approvalLiteral !== undefined ? { original: { ...t.approval.original, literal: d.approvalLiteral } } : {}) } }
    case 'priority':
      return without('priority', v.priority as string | undefined)
    case 'extra':
      return without('extra', v.extra as Record<string, unknown> | undefined)
  }
}
