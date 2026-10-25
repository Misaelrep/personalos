import { commit, createTask, setNextAction } from '../domain/ops'
import { createProject } from '../domain/operations'
import type { ProjectsData } from '../domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME, SYNTHETIC_TALLER, SYNTHETIC_TALLER_NAME } from '../import/fixtures'
import { applyImport, planImport, type ImportDecisions } from '../import/plan'
import { readDossierFile } from '../import/readers'
import { emptyProjectsData } from '../store/session'
import { SANDBOX_PREFIX } from '../store/restore'

/**
 * P2-R1 · The separate store the test page recovers into, and the synthetic
 * changes that make a recovery visible. Nothing here reads or writes the keys
 * of PROYECTOS itself, except «copiar» which only reads them.
 */

const enc = (s: string) => new TextEncoder().encode(s)
const classes = { Pendiente: 'pendiente', 'No iniciado': 'pendiente', Hecho: 'ejecutada' } as const

async function importInto(data: ProjectsData, name: string, text: string, projectName: string, ctx: { now: string; random?: () => string }) {
  const r = await readDossierFile({ name, bytes: enc(text) })
  if (!r.ok) throw new Error(r.error)
  const decisions: ImportDecisions = { target: { create: { name: projectName } }, statusClasses: { ...classes } }
  const plan = planImport(data, r.bundle, decisions, ctx)
  if (!plan.ok) throw new Error(plan.errors.join('; '))
  return applyImport(data, plan, decisions, ctx)
}

/** Six invented projects (two from the synthetic dossiers), one committed task. */
export async function syntheticSix(now: () => string, random?: () => string): Promise<ProjectsData> {
  const ctx = () => ({ now: now(), ...(random ? { random } : {}) })
  let d = await importInto(emptyProjectsData(), SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER, 'Huerto de prueba', ctx())
  d = await importInto(d, SYNTHETIC_TALLER_NAME, SYNTHETIC_TALLER, 'Taller de prueba', ctx())
  for (const name of ['Cocina de prueba', 'Biblioteca de prueba', 'Bicicleta de prueba', 'Acuario de prueba']) d = createProject(d, { name, objective: `Objetivo inventado de ${name}` }, ctx()).data
  const first = d.tasks[0]
  return commit(d, d.cycle.start, first.id, ctx(), 1)
}

/** Lose a project with everything it holds, as an accident would. */
export function loseProject(d: ProjectsData, projectId: string): ProjectsData {
  const p = d.projects.find((x) => x.id === projectId)
  if (!p) return d
  const taskIds = new Set(d.tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
  return {
    ...d,
    projects: d.projects.filter((x) => x.id !== projectId),
    milestones: d.milestones.filter((m) => m.projectId !== projectId),
    tasks: d.tasks.filter((t) => t.projectId !== projectId),
    references: (d.references ?? []).filter((r) => r.projectId !== projectId),
    routineLinks: d.routineLinks.filter((l) => l.projectId !== projectId),
    weeks: d.weeks.map((w) => ({ ...w, commitments: w.commitments.filter((c) => !taskIds.has(c.taskId)) })),
  }
}

/** A local change after the copy: a new next action, and a task created in ELYUM. */
export function localChange(d: ProjectsData, now: () => string, random?: () => string): ProjectsData {
  const ctx = () => ({ now: now(), ...(random ? { random } : {}) })
  const t = d.tasks[0]
  if (!t) return d
  const changed = setNextAction(d, t.id, `Cambio local de prueba (${now().slice(11, 16)})`, ctx())
  return createTask(changed, { projectId: t.projectId, title: 'Tarea creada después de la copia', status: d.vocabularies[d.projects.find((p) => p.id === t.projectId)!.dossier].status[0].literal }, ctx()).data
}

/** Remove every key of the test store, and only those. Returns how many. */
export function clearSandbox(storage: Storage): number {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k?.startsWith(SANDBOX_PREFIX)) keys.push(k)
  }
  for (const k of keys) storage.removeItem(k)
  return keys.length
}

