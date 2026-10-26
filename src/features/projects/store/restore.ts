import { normalizeProjectName } from '../domain/operations'
import { validateProjectsData, type Issue } from '../domain/schema'
import type { DossierReference, DossierSource, HistoryEntry, ImportRecord, Milestone, Project, ProjectsData, RoutineLink, Task, Vocabulary } from '../domain/types'
import { sha256Hex } from '../import/sha256'
import { EXPORT_FORMAT, verifyExport, type ExportFile } from './export'
import { createStore, DATA_KEY, LOCK_NAME, readEnvelope, type KeyValue, type Locks, type SaveFailure } from './store'

/**
 * P2-R1 · Recovering PROYECTOS from a copy exported by PROYECTOS (`export.ts`).
 * Only PROYECTOS' own keys; nothing of the CORE, APRENDER or the global P2-R.
 *
 *   1. `readBackup`      read the file without trusting it: format, version,
 *                        fingerprints, the data inside. Writes nothing.
 *   2. `planRestore`     compare the copy with what is stored, by unit: each
 *                        project (with its tasks, milestones, references,
 *                        sources and vocabulary) and the weekly plans. Writes
 *                        nothing. Nothing is selected: local data is kept by
 *                        default.
 *   3. `buildRestore`    the data a selection would leave, validated. A
 *                        selection that would not validate is refused.
 *   4. `performRestore`  the only write. Under its own lock (one recovery at a
 *                        time) and the store's lock (no write from another tab
 *                        in between), against the generation the preview saw.
 *                        Inside that same lock, before the data key, it saves
 *                        a journal with the stored text it replaces: if the
 *                        page dies half-way, `inspectJournal` says what
 *                        happened and the text before is still there. After
 *                        the write, a fresh store reads it back; only a match
 *                        counts as recovered.
 */

export const JOURNAL_KEY = 'elyum:projects:v1:antes-de-recuperar'
export const JOURNAL_FORMAT = 'elyum-projects-restore/1'
export const RESTORE_LOCK = `${LOCK_NAME}:recuperacion`
/** The separate store the test page recovers into: every key of PROYECTOS moved under this prefix. */
export const SANDBOX_PREFIX = 'elyum:prueba-p2r1:'
/** Far above what localStorage holds; a bigger file is not a copy of PROYECTOS. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

export function prefixedStorage(storage: KeyValue, prefix = SANDBOX_PREFIX): KeyValue {
  return {
    getItem: (k) => storage.getItem(prefix + k),
    setItem: (k, v) => storage.setItem(prefix + k, v),
    removeItem: (k) => storage.removeItem(prefix + k),
  }
}

const sha = (d: ProjectsData) => sha256Hex(JSON.stringify(d))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// ── 1 · Reading the copy ────────────────────────────────────────────────────

export interface Backup {
  file: ExportFile
  /** The data inside, validated. */
  data: ProjectsData
  generation: number
  savedAt: string
  /** SHA-256 of the stored text inside the copy (as in the file). */
  storedSha256: string
  warnings: string[]
}

export type BackupProblem = 'no-es-copia' | 'demasiado-grande' | 'version-futura' | 'alterada' | 'ilegible' | 'vacia'
export type BackupRead = { ok: true; backup: Backup } | { ok: false; problem: BackupProblem; message: string; details: string[] }

const refuse = (problem: BackupProblem, message: string, details: string[] = []): BackupRead => ({ ok: false, problem, message, details })

export async function readBackup(text: string): Promise<BackupRead> {
  if (text.length > MAX_BACKUP_BYTES) return refuse('demasiado-grande', 'El archivo es demasiado grande para ser una copia de PROYECTOS.')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return refuse('no-es-copia', 'El archivo no es JSON válido (¿está incompleto o es de otra app?).')
  }
  if (!isObject(parsed) || typeof parsed.format !== 'string') return refuse('no-es-copia', 'El archivo no es una copia exportada por PROYECTOS.')
  if (parsed.format !== EXPORT_FORMAT) {
    if (parsed.format.startsWith('elyum-projects-export/')) return refuse('version-futura', `La copia es de una versión más nueva (${parsed.format}). Esta versión no la recupera.`)
    return refuse('no-es-copia', `El archivo no es una copia de PROYECTOS (formato ${parsed.format}).`)
  }
  const file = parsed as unknown as ExportFile
  if (file.stored === null) return refuse('vacia', 'La copia se hizo cuando PROYECTOS no tenía datos: no hay nada que recuperar.')
  const loaded = await readEnvelope(typeof file.stored === 'string' ? file.stored : null)
  if (loaded.kind === 'version-futura') return refuse('version-futura', `Los datos de la copia son de una versión más nueva (${loaded.format}). Esta versión no los recupera.`)
  const v = await verifyExport(text)
  if (!v.ok) {
    const altered = v.problems.some((p) => /huella|resumen|alter/.test(p))
    return refuse(altered ? 'alterada' : 'ilegible', altered ? 'La copia se alteró o está incompleta: su huella no coincide.' : 'La copia no se puede leer.', v.problems)
  }
  if (loaded.kind !== 'ok') return refuse('ilegible', 'Los datos de la copia no se pueden leer con esta versión.', loaded.kind === 'ilegible' ? [loaded.reason] : [])
  return { ok: true, backup: { file, data: loaded.data, generation: loaded.generation, savedAt: loaded.savedAt, storedSha256: file.storedSha256!, warnings: loaded.warnings } }
}

// ── 2 · Comparing, by unit ──────────────────────────────────────────────────

/** Everything that belongs to one project. History is not part of it: it is merged, never replaced. */
interface ProjectUnit {
  project: Project
  milestones: Milestone[]
  tasks: Task[]
  references: DossierReference[]
  sources: DossierSource[]
  routineLinks: RoutineLink[]
  vocabulary?: Vocabulary
}

function unitOf(d: ProjectsData, projectId: string): ProjectUnit | undefined {
  const project = d.projects.find((p) => p.id === projectId)
  if (!project) return undefined
  const vocabulary = d.vocabularies[project.dossier]
  return {
    project,
    milestones: d.milestones.filter((m) => m.projectId === projectId),
    tasks: d.tasks.filter((t) => t.projectId === projectId),
    references: (d.references ?? []).filter((r) => r.projectId === projectId),
    sources: (d.sources ?? []).filter((s) => s.dossier === project.dossier),
    routineLinks: d.routineLinks.filter((l) => l.projectId === projectId),
    ...(vocabulary ? { vocabulary } : {}),
  }
}

export type UnitState = 'solo-en-copia' | 'solo-local' | 'igual' | 'distinta'

export interface RestoreUnit {
  /** `proyecto:<id>` or `semanas`. */
  key: string
  kind: 'proyecto' | 'semanas'
  label: string
  state: UnitState
  /** What choosing it would do, line by line. */
  changes: string[]
  /** Whether it can be chosen on its own; `why` says why not. */
  selectable: boolean
  why: string[]
  /** Local changes made after the copy was exported: choosing the unit drops them (they stay in the journal). */
  localNewer: number
  /**
   * P2-R1.1: the same project on the other side under another internal id
   * (same name, same dossier or shared task ids) — a copy from before the
   * store was reset, or from another store. Never recovered on its own.
   */
  twin?: string
}

export interface RestorePlan {
  backup: Backup
  /** The generation the plan was computed on: the restore refuses if the store moved. */
  baseGeneration: number
  local: ProjectsData
  units: RestoreUnit[]
  /** Cycle or other differences only a full replacement changes. */
  globalChanges: string[]
  /** P2-R1.1: what the person should know before choosing anything. */
  warnings: string[]
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function diffById<T extends { id: string }>(local: T[], copy: T[]) {
  const l = new Map(local.map((x) => [x.id, x]))
  const c = new Map(copy.map((x) => [x.id, x]))
  return {
    added: copy.filter((x) => !l.has(x.id)),
    removed: local.filter((x) => !c.has(x.id)),
    changed: copy.filter((x) => l.has(x.id) && !same(l.get(x.id), x)),
  }
}

const FIELD_NAMES: Record<string, string> = {
  name: 'nombre',
  objective: 'objetivo',
  title: 'título',
  status: 'estado',
  priority: 'prioridad',
  owner: 'responsable',
  nextAction: 'siguiente acción',
  evidence: 'evidencias',
  approval: 'aprobación',
  verification: 'verificación',
  requirements: 'requisitos',
  dependsOn: 'dependencias',
  estimateHours: 'horas',
  acceptance: 'criterios',
  milestoneId: 'hito',
  delegation: 'delegación',
  rules: 'reglas',
}
const changedFields = (a: object, b: object) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])).map((k) => FIELD_NAMES[k] ?? k)
const taskName = (t: Task) => `«${t.sourceId ? `${t.sourceId} ${t.title}` : t.title}»`

function projectChanges(local: ProjectUnit | undefined, copy: ProjectUnit): string[] {
  if (!local) return [`Añade el proyecto con ${n(copy.tasks.length, 'tarea', 'tareas')} y ${n(copy.milestones.length, 'hito', 'hitos')}.`]
  const out: string[] = []
  const pf = changedFields(local.project, copy.project)
  if (pf.length) out.push(`Proyecto: cambia ${pf.join(', ')}.`)
  const t = diffById(local.tasks, copy.tasks)
  for (const x of t.added) out.push(`Recupera la tarea ${taskName(x)}.`)
  for (const x of t.removed) out.push(`Quita la tarea ${taskName(x)} (no está en la copia).`)
  for (const x of t.changed) out.push(`Tarea ${taskName(x)}: vuelve ${changedFields(local.tasks.find((y) => y.id === x.id)!, x).join(', ')} a como estaba.`)
  const m = diffById(local.milestones, copy.milestones)
  if (m.added.length + m.removed.length + m.changed.length) out.push(`Hitos: ${m.added.length} recuperados, ${m.removed.length} quitados, ${m.changed.length} cambiados.`)
  const r = diffById(local.references, copy.references)
  if (r.added.length + r.removed.length + r.changed.length) out.push(`Referencias: ${r.added.length} recuperadas, ${r.removed.length} quitadas, ${r.changed.length} cambiadas.`)
  if (!same(local.sources, copy.sources)) out.push('Fuentes del dossier: vuelven a las de la copia.')
  if (!same(local.vocabulary, copy.vocabulary)) out.push('Vocabulario del dossier: vuelve al de la copia.')
  if (!same(local.routineLinks, copy.routineLinks)) out.push('Vínculos con la rutina: vuelven a los de la copia.')
  return out
}

const historyKey = (h: HistoryEntry) => JSON.stringify(h)

/** Local changes after `since` that touch the unit (by entity id). */
function localChangesAfter(local: ProjectsData, ids: Set<string>, since: string) {
  return local.history.filter((h) => ids.has(h.id) && h.at > since).length
}

export function planRestore(local: ProjectsData, baseGeneration: number, backup: Backup): RestorePlan {
  const copy = backup.data
  const units: RestoreUnit[] = []
  const since = backup.file.exportedAt
  const ids = new Set([...local.projects.map((p) => p.id), ...copy.projects.map((p) => p.id)])
  const order = [...copy.projects.map((p) => p.id), ...local.projects.map((p) => p.id).filter((id) => !copy.projects.some((p) => p.id === id))]
  for (const id of order) {
    if (!ids.has(id)) continue
    const l = unitOf(local, id)
    const c = unitOf(copy, id)
    const label = (c ?? l)!.project.name
    if (!c) {
      units.push({ key: `proyecto:${id}`, kind: 'proyecto', label, state: 'solo-local', changes: ['No está en la copia: se conserva tal cual.'], selectable: false, why: ['No hay nada que recuperar.'], localNewer: 0 })
      continue
    }
    const changes = projectChanges(l, c)
    const state: UnitState = !l ? 'solo-en-copia' : changes.length ? 'distinta' : 'igual'
    const touched = new Set([id, ...(l?.tasks ?? []).map((t) => t.id), ...(l?.milestones ?? []).map((m) => m.id)])
    units.push({ key: `proyecto:${id}`, kind: 'proyecto', label, state, changes: state === 'igual' ? ['Igual que en la copia.'] : changes, selectable: false, why: [], localNewer: l ? localChangesAfter(local, touched, since) : 0 })
  }
  const weeksSame = same(local.weeks, copy.weeks)
  const localWeeks = new Set(local.weeks.map((w) => w.weekStart))
  units.push({
    key: 'semanas',
    kind: 'semanas',
    label: 'Revisiones semanales',
    state: weeksSame ? 'igual' : copy.weeks.length === 0 ? 'solo-local' : local.weeks.length === 0 ? 'solo-en-copia' : 'distinta',
    changes: weeksSame
      ? ['Igual que en la copia.']
      : [`La copia tiene ${n(copy.weeks.length, 'semana', 'semanas')}; aquí hay ${local.weeks.length}. Elegirla sustituye todas las semanas (capacidad, compromisos y notas) por las de la copia.`, ...copy.weeks.filter((w) => !localWeeks.has(w.weekStart)).map((w) => `Recupera la semana del ${w.weekStart}.`)],
    selectable: false,
    why: [],
    localNewer: localChangesAfter(local, new Set(local.weeks.map((w) => w.weekStart)), since),
  })

  // P2-R1.1 · The same project under another id on each side: shown as such, never recovered alone.
  const localOnly = local.projects.filter((p) => !copy.projects.some((c) => c.id === p.id))
  const copyOnly = copy.projects.filter((c) => !local.projects.some((p) => p.id === c.id))
  const taskIds = (d: ProjectsData, id: string) => new Set(d.tasks.filter((t) => t.projectId === id).map((t) => t.id))
  let twins = 0
  for (const c of copyOnly) {
    const cTasks = taskIds(copy, c.id)
    const twin = localOnly.find(
      (p) =>
        normalizeProjectName(p.name) === normalizeProjectName(c.name) ||
        (p.dossier === c.dossier && !c.dossier.startsWith('elyum:')) ||
        [...taskIds(local, p.id)].some((t) => cTasks.has(t)),
    )
    if (!twin) continue
    twins++
    const cu = units.find((u) => u.key === `proyecto:${c.id}`)!
    const lu = units.find((u) => u.key === `proyecto:${twin.id}`)!
    cu.twin = twin.name
    lu.twin = c.name
    cu.changes = [`Aquí existe «${twin.name}» con otro identificador interno: recuperarlo suelto lo duplicaría.`]
    lu.changes = [`En la copia está como «${c.name}» con otro identificador. Aquí se conserva tal cual.`]
  }
  const warnings =
    twins > 0
      ? [
          `${twins === 1 ? 'Un proyecto existe' : `${twins} proyectos existen`} aquí y en la copia con otro identificador interno. La copia parece de antes de reiniciar el almacén o de otro almacén. Esos proyectos no se recuperan sueltos: puedes sustituir todo por la copia o no recuperar.`,
        ]
      : []
  const plan: RestorePlan = { backup, baseGeneration, local, units, globalChanges: [], warnings }
  if (!same(local.cycle, copy.cycle)) plan.globalChanges.push(`Ciclo: la copia es del ${copy.cycle.start} al ${copy.cycle.end}; aquí, del ${local.cycle.start} al ${local.cycle.end}.`)
  const atlas = diffById(local.atlas, copy.atlas)
  if (atlas.added.length + atlas.removed.length + atlas.changed.length) plan.globalChanges.push(`ATLAS: ${atlas.added.length} recuperadas, ${atlas.removed.length} quitadas, ${atlas.changed.length} cambiadas.`)

  // Each unit is selectable on its own only if the data it leaves validates and shares nothing it would break.
  for (const u of units) {
    if (u.state === 'igual' || u.state === 'solo-local') {
      if (!u.why.length) u.why.push(u.state === 'igual' ? 'Ya está igual que en la copia.' : 'No hay nada que recuperar.')
      continue
    }
    const r = buildRestore(plan, { mode: 'seleccion', units: [u.key] }, '1970-01-01T00:00:00Z')
    u.selectable = r.ok
    if (!r.ok) u.why.push(...r.problems)
  }
  return plan
}

// ── 3 · What a selection leaves ─────────────────────────────────────────────

export type Selection = { mode: 'todo' } | { mode: 'seleccion'; units: string[] }

export type Built = { ok: true; data: ProjectsData; summary: string } | { ok: false; problems: string[] }

/** Replace the items `belongs` picks with `incoming`, keeping their place in the list. */
function replaceIn<T>(list: T[], belongs: (x: T) => boolean, incoming: T[]): T[] {
  const at = list.findIndex(belongs)
  const kept = list.filter((x) => !belongs(x))
  if (at < 0) return [...kept, ...incoming]
  const before = list.slice(0, at).filter((x) => !belongs(x)).length
  return [...kept.slice(0, before), ...incoming, ...kept.slice(before)]
}

function unionById<T extends { id: string }>(local: T[], copy: T[]): T[] {
  const have = new Set(local.map((x) => x.id))
  return [...local, ...copy.filter((x) => !have.has(x.id))]
}

const issueText = (i: Issue) => (i.path ? `${i.path}: ${i.message}` : i.message)

export function buildRestore(plan: RestorePlan, sel: Selection, at: string): Built {
  const copy = plan.backup.data
  const label = `copia exportada el ${plan.backup.file.exportedAt} (generación ${plan.backup.generation})`
  let next: ProjectsData
  let summary: string

  if (sel.mode === 'todo') {
    next = clone(copy)
    summary = `Todo PROYECTOS, como en la ${label}.`
  } else {
    if (!sel.units.length) return { ok: false, problems: ['No has elegido nada que recuperar.'] }
    next = clone(plan.local)
    const projectIds: string[] = []
    for (const key of sel.units) {
      const u = plan.units.find((x) => x.key === key)
      if (!u) return { ok: false, problems: [`Unidad desconocida: ${key}`] }
      if (u.state === 'igual' || u.state === 'solo-local') return { ok: false, problems: [`«${u.label}»: no hay nada que recuperar.`] }
      if (u.twin) return { ok: false, problems: [`«${u.label}» ya existe aquí como «${u.twin}» con otro identificador: recuperarlo suelto lo duplicaría. Sustituye todo o no lo recuperes.`] }
      if (u.kind === 'semanas') {
        next.weeks = clone(copy.weeks)
        continue
      }
      const id = key.slice('proyecto:'.length)
      projectIds.push(id)
      const c = clone(unitOf(copy, id)!)
      const dossier = c.project.dossier
      // A dossier's vocabulary and sources are shared by every project of that dossier.
      const sharing = next.projects.filter((p) => p.id !== id && p.dossier === dossier && !sel.units.includes(`proyecto:${p.id}`))
      const vocabChanges = !same(next.vocabularies[dossier], c.vocabulary)
      const sourcesChange = !same((next.sources ?? []).filter((s) => s.dossier === dossier), c.sources)
      if (sharing.length && (vocabChanges || sourcesChange))
        return { ok: false, problems: [`«${c.project.name}» comparte su dossier con ${sharing.map((p) => `«${p.name}»`).join(', ')}: recuperarlo solo cambiaría también ese otro. Recupéralos juntos o recupera todo.`] }
      next.projects = replaceIn(next.projects, (p) => p.id === id, [c.project])
      next.milestones = replaceIn(next.milestones, (m) => m.projectId === id, c.milestones)
      next.tasks = replaceIn(next.tasks, (t) => t.projectId === id, c.tasks)
      next.references = replaceIn(next.references ?? [], (r) => r.projectId === id, c.references)
      next.sources = replaceIn(next.sources ?? [], (s) => s.dossier === dossier, c.sources)
      next.routineLinks = replaceIn(next.routineLinks, (l) => l.projectId === id, c.routineLinks)
      if (c.vocabulary) next.vocabularies = { ...next.vocabularies, [dossier]: c.vocabulary }
      else {
        const { [dossier]: _drop, ...rest } = next.vocabularies
        next.vocabularies = rest
      }
      next.imports = unionById<ImportRecord>(next.imports ?? [], (copy.imports ?? []).filter((r) => r.projectId === id))
    }
    // History is append-only: what the copy recorded is added, nothing local is lost.
    const have = new Set(next.history.map(historyKey))
    const touched = new Set(projectIds.flatMap((id) => [id, ...copy.tasks.filter((t) => t.projectId === id).map((t) => t.id), ...copy.milestones.filter((m) => m.projectId === id).map((m) => m.id)]))
    next.history = [...next.history, ...copy.history.filter((h) => touched.has(h.id) && !have.has(historyKey(h)))]
    const names = sel.units.map((k) => plan.units.find((u) => u.key === k)!.label)
    summary = `${names.map((x) => `«${x}»`).join(', ')}, como en la ${label}. Lo demás se conserva.`
  }

  next.history = [...next.history, { at, by: 'usuario', entity: 'import', id: plan.backup.storedSha256.slice(0, 16), field: 'recuperación', note: summary }]
  const v = validateProjectsData(next)
  if (!v.ok) return { ok: false, problems: v.errors.map(issueText) }
  return { ok: true, data: v.data, summary }
}

// ── 4 · Writing, with a journal ─────────────────────────────────────────────

export interface Journal {
  format: typeof JOURNAL_FORMAT
  state: 'en-curso' | 'completada' | 'fallida' | 'no-aplicada' | 'revisada'
  startedAt: string
  finishedAt?: string
  writer: string
  baseGeneration: number
  /** The stored text the recovery replaced, exactly (null: nothing was stored). */
  before: string | null
  beforeSha256: string | null
  /** SHA-256 of the data it writes. */
  targetSha256: string
  resultGeneration?: number
  source: { exportedAt: string; storedSha256: string; generation: number; name?: string; origin?: string }
  summary: string
  error?: string
}

export interface RestoreEnv {
  storage: KeyValue
  locks: Locks | undefined
  now: () => string
  writer: string
}

export type RestoreFailure = SaveFailure | 'otra-recuperacion' | 'recuperacion-interrumpida' | 'seleccion-no-valida'
export type RestoreResult =
  | { ok: true; generation: number; summary: string; verified: true }
  | { ok: false; reason: RestoreFailure; message: string; details?: string[]; written: boolean }

function readJournalRaw(storage: KeyValue): Journal | undefined | 'ilegible' {
  const raw = storage.getItem(JOURNAL_KEY)
  if (raw === null) return undefined
  try {
    const j = JSON.parse(raw) as Journal
    return isObject(j) && j.format === JOURNAL_FORMAT ? j : 'ilegible'
  } catch {
    return 'ilegible'
  }
}

const writeJournal = (storage: KeyValue, j: Journal) => storage.setItem(JOURNAL_KEY, JSON.stringify(j))

/** Run `fn` holding the recovery lock, or say at once that another recovery holds it. */
async function exclusively<T>(locks: Locks, busy: () => T, fn: () => Promise<T>): Promise<T> {
  return locks.request(RESTORE_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => (lock === null ? busy() : fn()))
}

export async function performRestore(env: RestoreEnv, plan: RestorePlan, sel: Selection, sourceName?: string): Promise<RestoreResult> {
  if (!env.locks) return { ok: false, reason: 'solo-lectura', message: 'Este navegador no ofrece Web Locks: no se puede recuperar sin arriesgar escrituras simultáneas.', written: false }
  const locks = env.locks
  return exclusively<RestoreResult>(
    locks,
    () => ({ ok: false, reason: 'otra-recuperacion', message: 'Otra pestaña o la app instalada está recuperando ahora. No se ha escrito nada.', written: false }),
    async () => {
      const j = readJournalRaw(env.storage)
      if (j === 'ilegible' || j?.state === 'en-curso')
        return { ok: false, reason: 'recuperacion-interrumpida', message: 'Hay una recuperación anterior sin cerrar. Revísala antes de empezar otra; no se ha escrito nada.', written: false }

      const at = env.now()
      const built = buildRestore(plan, sel, at)
      if (!built.ok) return { ok: false, reason: 'seleccion-no-valida', message: 'Lo elegido dejaría datos no válidos. No se ha escrito nada.', details: built.problems, written: false }
      const targetSha256 = await sha(built.data)
      const journal: Journal = {
        format: JOURNAL_FORMAT,
        state: 'en-curso',
        startedAt: at,
        writer: env.writer,
        baseGeneration: plan.baseGeneration,
        before: null,
        beforeSha256: null,
        targetSha256,
        source: {
          exportedAt: plan.backup.file.exportedAt,
          storedSha256: plan.backup.storedSha256,
          generation: plan.backup.generation,
          ...(sourceName ? { name: sourceName } : {}),
          ...(plan.backup.file.origin ? { origin: plan.backup.file.origin } : {}),
        },
        summary: built.summary,
      }
      let journaled = false
      const store = createStore(env)
      const r = await store.save(built.data, plan.baseGeneration, {
        beforeWrite: (raw) => {
          journal.before = raw
          // Synchronous hashing is not available: the text itself is kept, and its hash is added after.
          writeJournal(env.storage, journal)
          journaled = true
        },
      })
      if (!r.ok) {
        if (journaled) {
          try {
            writeJournal(env.storage, { ...journal, state: 'fallida', finishedAt: env.now(), error: `${r.reason}: ${r.message}` })
          } catch {
            /* the journal says «en-curso»; inspectJournal works out that nothing was written */
          }
        }
        const conflict = r.reason === 'conflicto'
        return { ok: false, reason: r.reason, message: conflict ? 'Los datos cambiaron después de la vista previa (otra pestaña o la app instalada). No se ha escrito nada; vuelve a cargar la copia.' : r.message, written: false }
      }

      // Read it back with a store that shares nothing with the one that wrote.
      const back = await createStore({ ...env, writer: `${env.writer}:relectura` }).load()
      const backSha = back.kind === 'ok' ? await sha(back.data) : undefined
      if (back.kind !== 'ok' || back.generation !== r.generation || backSha !== targetSha256)
        return {
          ok: false,
          reason: 'verificacion-fallida',
          message: 'Se escribió, pero al releerlo no coincide con lo esperado. No lo des por recuperado: revisa la recuperación interrumpida abajo.',
          written: true,
        }
      try {
        writeJournal(env.storage, { ...journal, beforeSha256: journal.before === null ? null : await sha256Hex(journal.before), state: 'completada', finishedAt: env.now(), resultGeneration: r.generation })
      } catch {
        /* the data is verified; the journal stays «en-curso» and inspectJournal will find the target */
      }
      return { ok: true, generation: r.generation, summary: built.summary, verified: true }
    },
  )
}

// ── After an interruption ───────────────────────────────────────────────────

export type JournalStatus =
  | { kind: 'ninguna' }
  | { kind: 'ilegible' }
  /** Closed: `completada`, `fallida` / `no-aplicada` (nothing written) or `revisada` (closed by the person). */
  | { kind: 'cerrada'; journal: Journal }
  /** Open, and the stored data is the recovery's: it was written but not closed. */
  | { kind: 'escrita-sin-cerrar'; journal: Journal }
  /** Open, and the stored data is still the one before: nothing was written. */
  | { kind: 'sin-escribir'; journal: Journal }
  /** Open, and the stored data is neither: something else wrote after. The text before is in the journal. */
  | { kind: 'desconocida'; journal: Journal }

export async function inspectJournal(storage: KeyValue): Promise<JournalStatus> {
  const j = readJournalRaw(storage)
  if (j === undefined) return { kind: 'ninguna' }
  if (j === 'ilegible') return { kind: 'ilegible' }
  if (j.state !== 'en-curso') return { kind: 'cerrada', journal: j }
  const raw = storage.getItem(DATA_KEY)
  const current = await readEnvelope(raw)
  if (current.kind === 'ok' && (await sha(current.data)) === j.targetSha256) return { kind: 'escrita-sin-cerrar', journal: j }
  if (raw === j.before || (current.kind === 'vacio' && j.baseGeneration === 0) || (current.kind === 'ok' && current.generation === j.baseGeneration)) return { kind: 'sin-escribir', journal: j }
  return { kind: 'desconocida', journal: j }
}

/**
 * Close an open journal once it is clear what happened. Writes only the
 * journal, and only while no recovery runs (one could be writing it now).
 * `desconocida` stays open: the person decides, with the text before at hand.
 */
export async function settleJournal(env: RestoreEnv): Promise<JournalStatus> {
  const status = await inspectJournal(env.storage)
  if (!env.locks || (status.kind !== 'escrita-sin-cerrar' && status.kind !== 'sin-escribir')) return status
  return exclusively<JournalStatus>(
    env.locks,
    () => status,
    async () => {
      const again = await inspectJournal(env.storage)
      if (again.kind === 'escrita-sin-cerrar') {
        const loaded = await readEnvelope(env.storage.getItem(DATA_KEY))
        const closed: Journal = { ...again.journal, state: 'completada', finishedAt: env.now(), ...(loaded.kind === 'ok' ? { resultGeneration: loaded.generation } : {}), error: 'Cerrada al volver a abrir: estaba escrita y se comprobó al releerla.' }
        writeJournal(env.storage, closed)
        return { kind: 'cerrada', journal: closed }
      }
      if (again.kind === 'sin-escribir') {
        const closed: Journal = { ...again.journal, state: 'no-aplicada', finishedAt: env.now(), error: 'Se interrumpió antes de escribir: los datos siguen como estaban.' }
        writeJournal(env.storage, closed)
        return { kind: 'cerrada', journal: closed }
      }
      return again
    },
  )
}

/** The text before a recovery, as an export file: it can be saved, and recovered through the same steps. */
export async function journalAsCopy(j: Journal): Promise<string | undefined> {
  if (j.before === null) return undefined
  const loaded = await readEnvelope(j.before)
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    exportedAt: j.startedAt,
    key: DATA_KEY,
    stored: j.before,
    storedSha256: await sha256Hex(j.before),
    readable: loaded.kind === 'ok',
    ...(loaded.kind === 'ok'
      ? {
          summary: {
            generation: loaded.generation,
            savedAt: loaded.savedAt,
            projects: loaded.data.projects.length,
            tasks: loaded.data.tasks.length,
            references: loaded.data.references?.length ?? 0,
            imports: loaded.data.imports?.length ?? 0,
            history: loaded.data.history.length,
          },
        }
      : {}),
  }
  return JSON.stringify(file, null, 2)
}

/**
 * The person closes an open `desconocida` journal after saving the text
 * before. Only the journal changes.
 */
export async function dismissJournal(env: RestoreEnv): Promise<boolean> {
  if (!env.locks) return false
  return exclusively(
    env.locks,
    () => false,
    async () => {
      const j = readJournalRaw(env.storage)
      if (!j || j === 'ilegible') {
        env.storage.removeItem(JOURNAL_KEY)
        return true
      }
      writeJournal(env.storage, { ...j, state: j.state === 'en-curso' ? 'revisada' : j.state, finishedAt: j.finishedAt ?? env.now(), error: j.error ?? 'Cerrada a mano tras revisarla.' })
      return true
    },
  )
}

