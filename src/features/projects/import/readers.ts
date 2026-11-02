import { BUNDLE_FORMAT, type BundleIssue, type DossierBundle, type DraftReference, type DraftSource, type DraftTask } from './bundle'
import { readMarkdown, sameHeader, type MdTable } from './markdown'
import { sha256Hex } from './sha256'

/**
 * P3 · Readers: each knows ONE layout of dossier and produces a bundle. The
 * importer picks the reader that recognizes the file; a file nobody
 * recognizes is refused, never half-read.
 *
 * Only `markdownTablesReader` exists today, configured for dossiers whose
 * backlog is a Markdown table with named columns (the layout of the
 * Comunicación Wellness dossier). Other dossiers get their own layout or
 * reader when they are validated — none is assumed to look the same.
 */

export interface DossierFile {
  name: string
  bytes: Uint8Array
}

export interface Reader {
  id: string
  /** Whether this reader understands the text. Cheap; no side effects. */
  recognizes(text: string): boolean
  read(text: string, file: { name: string; sha256: string; bytes: number }): DossierBundle
}

/** Column names of a Markdown-tables dossier. Every column not named here is kept in `extra`. */
export interface TableLayout {
  id: string
  task: {
    id: string
    title: string
    status: string
    acceptance?: string
    area?: string
    deliverable?: string
    estimate?: string
    delegation?: string
    sources?: string
    dependency?: string
    priority?: string
    approval?: string
  }
  /** The table listing the dossier's sources (F1, F2…), if it has one. */
  sources?: { key: string; title: string; note?: string }
  /** Label of a «**Label:** value» line that states the project's objective. */
  objectiveLabel?: string
}

/** Layout of the Comunicación Wellness dossier (column names only; no content). */
export const WELLNESS_LAYOUT: TableLayout = {
  id: 'tablas-md/wellness-1',
  task: {
    id: 'ID',
    title: 'Tarea concreta',
    status: 'Estado',
    acceptance: 'Hecho cuando…',
    area: 'Área',
    deliverable: 'Entregable',
    estimate: 'Tiempo humano',
    delegation: 'Agente posible',
    sources: 'Fuente',
    dependency: 'Dependencia',
  },
  sources: { key: 'Clave', title: 'Fuente', note: 'Evidencia específica' },
  objectiveLabel: 'Finalidad',
}

const col = (t: MdTable, name: string | undefined) => (name === undefined ? -1 : t.columns.findIndex((c) => sameHeader(c, name)))
const has = (t: MdTable, names: (string | undefined)[]) => names.every((n) => n !== undefined && col(t, n) >= 0)

export function markdownTablesReader(layout: TableLayout): Reader {
  const isTaskTable = (t: MdTable) => has(t, [layout.task.id, layout.task.title, layout.task.status])
  const isSourceTable = (t: MdTable) => !!layout.sources && has(t, [layout.sources.key, layout.sources.title])

  return {
    id: layout.id,
    recognizes: (text) => readMarkdown(text).tables.some(isTaskTable),
    read(text, file) {
      const doc = readMarkdown(text)
      const issues: BundleIssue[] = []
      const tasks: DraftTask[] = []
      const sources: DraftSource[] = []
      const references: DraftReference[] = []

      for (const table of doc.tables) {
        const wrongWidth = table.rows.filter((r) => r.cells.length !== table.columns.length)
        for (const r of wrongWidth) issues.push({ level: 'error', line: r.line, message: `la fila tiene ${r.cells.length} celdas y la tabla ${table.columns.length} columnas` })
        const rows = table.rows.filter((r) => r.cells.length === table.columns.length)

        if (isTaskTable(table)) {
          const named = Object.values(layout.task)
          for (const r of rows) {
            const get = (name: string | undefined) => {
              const i = col(table, name)
              return i < 0 ? undefined : r.cells[i]
            }
            const extra: Record<string, string> = {}
            table.columns.forEach((c, i) => {
              if (!named.some((n) => sameHeader(c, n))) extra[c] = r.cells[i]
            })
            const sourceId = get(layout.task.id) ?? ''
            if (!sourceId) issues.push({ level: 'error', line: r.line, message: 'tarea sin ID' })
            tasks.push({
              sourceId,
              title: get(layout.task.title) ?? '',
              statusLiteral: get(layout.task.status) ?? '',
              acceptance: get(layout.task.acceptance) !== undefined ? [get(layout.task.acceptance)!] : [],
              ...pick('priorityLiteral', get(layout.task.priority)),
              ...pick('approvalLiteral', get(layout.task.approval)),
              ...pick('area', get(layout.task.area)),
              ...pick('deliverable', get(layout.task.deliverable)),
              ...pick('estimateLiteral', get(layout.task.estimate)),
              ...pick('delegationLiteral', get(layout.task.delegation)),
              ...pick('sourceRefsLiteral', get(layout.task.sources)),
              ...pick('dependencyLiteral', get(layout.task.dependency)),
              extra,
              place: { section: table.section, line: r.line, raw: r.raw },
            })
          }
        } else if (isSourceTable(table)) {
          const s = layout.sources!
          for (const r of rows)
            sources.push({
              key: r.cells[col(table, s.key)],
              title: r.cells[col(table, s.title)],
              ...pick('note', s.note !== undefined && col(table, s.note) >= 0 ? r.cells[col(table, s.note)] : undefined),
              place: { section: table.section, line: r.line, raw: r.raw },
            })
        } else {
          for (const r of rows)
            references.push({
              group: table.section,
              label: r.cells[0],
              cells: table.columns.map((column, i) => ({ column, value: r.cells[i] })),
              place: { section: table.section, line: r.line, raw: r.raw },
            })
        }
      }

      let objective: string | undefined
      let objectiveLine: number | undefined
      if (layout.objectiveLabel) {
        const re = new RegExp(`^\\*\\*${escapeRe(layout.objectiveLabel)}:\\*\\*\\s*(.*?)\\s*$`)
        const i = doc.lines.findIndex((l) => re.test(l))
        if (i >= 0) {
          objective = re.exec(doc.lines[i])![1]
          objectiveLine = i + 1
        }
      }
      if (tasks.length === 0) issues.push({ level: 'error', message: 'no hay tabla de tareas reconocible' })

      return {
        format: BUNDLE_FORMAT,
        dossier: { name: file.name, ...pick('version', /\d{4}-\d{2}-\d{2}/.exec(file.name)?.[0]), sha256: file.sha256, bytes: file.bytes, reader: layout.id },
        project: {
          ...pick('name', doc.title),
          ...pick('objective', objective),
          ...(objectiveLine ? { place: { section: '', line: objectiveLine, raw: doc.lines[objectiveLine - 1] } } : {}),
        },
        tasks,
        sources,
        references,
        issues,
      }
    },
  }
}

function pick<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const READERS: Reader[] = [markdownTablesReader(WELLNESS_LAYOUT)]

export type ReadResult = { ok: true; bundle: DossierBundle } | { ok: false; error: string }

/**
 * Read a local file: strict UTF-8, fingerprint of its exact bytes, the first
 * reader that recognizes it. Nothing is stored here.
 */
export async function readDossierFile(file: DossierFile, readers: Reader[] = READERS): Promise<ReadResult> {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
  } catch {
    return { ok: false, error: 'El archivo no es texto UTF-8 válido.' }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const reader = readers.find((r) => r.recognizes(text))
  if (!reader) return { ok: false, error: 'Formato de dossier no reconocido: no se importa nada.' }
  const sha256 = await sha256Hex(file.bytes)
  return { ok: true, bundle: reader.read(text, { name: file.name, sha256, bytes: file.bytes.length }) }
}
