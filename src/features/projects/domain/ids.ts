import type { ProjectsData, Task } from './types'

/**
 * Identity. An imported record keeps its dossier ID literally (`sourceId`) and
 * gets an internal id derived from it (`src:<sourceId>`), so dependencies
 * written in the dossier resolve without translation. A task created in ELYUM
 * gets a generated internal id (`new:<uuid>`): the person never types an ID.
 * The two spaces cannot collide.
 */
export const importedId = (sourceId: string) => `src:${sourceId}`
export const isGeneratedId = (id: string) => id.startsWith('new:')

/** A fresh internal id. `random` is injectable for tests; by default the browser's UUID. */
export function newId(existing: ReadonlySet<string>, random: () => string = () => crypto.randomUUID()): string {
  for (let i = 0; i < 8; i++) {
    const id = `new:${random()}`
    if (!existing.has(id)) return id
  }
  throw new Error('No se pudo generar un identificador único.')
}

/** What a person sees as the task's reference: its dossier ID, or its optional readable ref. */
export const displayRef = (task: Pick<Task, 'sourceId' | 'ref'>): string | undefined => task.sourceId ?? task.ref

/** The letters an ID starts with: "PUB-03" → "PUB", "M1" → "M", "EDI.2.1" → "EDI". */
export function prefixOf(sourceId: string): string {
  return /^[A-Za-zÀ-ÿ]+/.exec(sourceId)?.[0] ?? ''
}

/** Prefixes found and how many IDs use each, for the import report. */
export function prefixReport(sourceIds: string[]): Record<string, number> {
  const report: Record<string, number> = {}
  for (const id of sourceIds) {
    const p = prefixOf(id) || '(sin prefijo)'
    report[p] = (report[p] ?? 0) + 1
  }
  return report
}

/** Every value that appears more than once. */
export function duplicates(values: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const v of values) {
    if (v === undefined) continue
    if (seen.has(v)) dup.add(v)
    seen.add(v)
  }
  return [...dup]
}

/** All internal ids in use, of any entity. */
export function allIds(data: ProjectsData): Set<string> {
  return new Set([...data.projects, ...data.milestones, ...data.tasks, ...data.atlas].map((x) => x.id))
}
