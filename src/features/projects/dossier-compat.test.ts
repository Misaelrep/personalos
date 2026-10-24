import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blockersOf, nextActionCandidates } from './domain/derive'
import { importedId, prefixReport } from './domain/ids'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData, Task, Vocabulary } from './domain/types'

/*
 * P1 · compatibility with a real dossier's backlog table.
 *
 * This file holds NO dossier content. The real dossier stays outside the
 * repository (the repo is public) and is passed by path:
 *
 *   PROYECTOS_DOSSIER=/ruta/privada/dossier.md PROYECTOS_REPORT=/ruta/privada/informe.json npx vitest run dossier-compat
 *
 * Without PROYECTOS_DOSSIER only the synthetic block runs. The table reader
 * below is a test harness to check the model, not the P3 importer: it maps
 * columns literally and decides nothing (no status class, no approval, no
 * dependency that is not a plain, existing ID).
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const AT = '2026-10-24T00:00:00-06:00'
const CYCLE = { start: '2026-10-26', end: '2027-01-23' }

interface Row {
  line: number
  raw: string
  cells: string[]
}
interface Table {
  heading: string
  columns: string[]
  rows: Row[]
}

const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** Every pipe table in a Markdown text, with the heading path above it. */
function readTables(text: string): Table[] {
  const lines = text.split('\n')
  const tables: Table[] = []
  const path: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (h) {
      path.length = h[1].length - 1
      path[h[1].length - 1] = h[2].trim()
      continue
    }
    if (lines[i].trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const table: Table = { heading: path.filter(Boolean).join(' > '), columns: splitRow(lines[i]), rows: [] }
      let j = i + 2
      for (; j < lines.length && lines[j].trim().startsWith('|'); j++) table.rows.push({ line: j + 1, raw: lines[j], cells: splitRow(lines[j]) })
      tables.push(table)
      i = j - 1
    }
  }
  return tables
}

/** Columns the model has a field for; every other column goes to `extra`, in order. */
const MAPPED = { id: 'ID', title: 'Tarea concreta', status: 'Estado', done: 'Hecho cuando…' }

const isBacklog = (t: Table) => Object.values(MAPPED).every((c) => t.columns.includes(c))

function rowToTask(row: Row, columns: string[], projectId: string, dossier: { name: string; version: string; hash: string }, heading: string): Task {
  const cell = (c: string) => row.cells[columns.indexOf(c)]
  const extra: Record<string, unknown> = {}
  for (const c of columns) if (!Object.values(MAPPED).includes(c)) extra[c] = cell(c)
  const sourceId = cell(MAPPED.id)
  return {
    id: importedId(sourceId),
    sourceId,
    projectId,
    title: cell(MAPPED.title),
    status: cell(MAPPED.status),
    dependsOn: [],
    acceptance: [cell(MAPPED.done)],
    evidence: [],
    // The dossier has no approval column: the state here is a placeholder the person must decide (see report).
    approval: { state: 'pendiente' },
    atlasRefs: [],
    origin: { dossier: dossier.name, dossierVersion: dossier.version, dossierHash: dossier.hash, location: `${heading} · línea ${row.line}`, raw: row.raw, converter: 'p1-compat-test', importedAt: AT },
    extra,
    createdAt: AT,
  }
}

/** The row rebuilt from the task's fields only (not from `origin.raw`). */
function taskToCells(t: Task, columns: string[]): string[] {
  return columns.map((c) =>
    c === MAPPED.id ? t.sourceId! : c === MAPPED.title ? t.title : c === MAPPED.status ? t.status : c === MAPPED.done ? t.acceptance[0] : String(t.extra![c]),
  )
}

type DepKind = 'ninguna' | 'ids' | 'abreviada' | 'rango' | 'alternativa' | 'externa' | 'mixta'

/** How a dependency cell reads. Only `ids` becomes `dependsOn`; the rest needs a human decision. */
function classifyDependency(literal: string, known: Set<string>): { kind: DepKind; ids: string[] } {
  const s = literal.trim()
  if (!s || s === '—' || s === '-') return { kind: 'ninguna', ids: [] }
  if (/\.\./.test(s)) return { kind: 'rango', ids: [] }
  if (/\so\s/.test(s)) return { kind: 'alternativa', ids: [] }
  const parts = s.split(/\s*[,;]\s*|\s+\+\s+/).filter(Boolean)
  if (parts.every((p) => known.has(p))) return { kind: 'ids', ids: parts }
  if (known.has(parts[0]) && parts.slice(1).every((p) => /^\d+$/.test(p))) return { kind: 'abreviada', ids: [] }
  if (parts.some((p) => known.has(p))) return { kind: 'mixta', ids: [] }
  return { kind: 'externa', ids: [] }
}

/** A minimal ProjectsData holding one dossier's backlog. */
function buildData(text: string, dossierName: string, vocabulary: Vocabulary) {
  const hash = createHash('sha256').update(text).digest('hex')
  const version = /(\d{4}-\d{2}-\d{2})/.exec(dossierName)?.[1] ?? ''
  const tables = readTables(text)
  const backlog = tables.filter(isBacklog)
  const projectId = 'new:proyecto-prueba'
  const tasks = backlog.flatMap((t) => t.rows.map((r) => rowToTask(r, t.columns, projectId, { name: dossierName, version, hash }, t.heading)))
  const known = new Set(tasks.map((t) => t.sourceId!))
  const deps = new Map<string, { literal: string; kind: DepKind }>()
  for (const t of tasks) {
    const literal = String(t.extra!['Dependencia'] ?? '')
    const c = classifyDependency(literal, known)
    deps.set(t.sourceId!, { literal, kind: c.kind })
    t.dependsOn = c.ids.map(importedId)
  }
  const data: ProjectsData = {
    version: 1,
    cycle: CYCLE,
    vocabularies: { [dossierName]: vocabulary },
    projects: [{ id: projectId, name: 'Proyecto de prueba', dossier: dossierName, expectedResults: [], atlasRefs: [] }],
    milestones: [],
    tasks,
    atlas: [],
    routineLinks: [],
    weeks: [],
    history: [],
  }
  return { data, tables, backlog, deps, hash }
}

const statusLiterals = (tasks: Task[]) => [...new Set(tasks.map((t) => t.status))]
const EMPTY: Vocabulary = { status: [], priority: [], approval: [] }

/** Checks every dossier must pass, whatever its content. */
function checkInvariants(text: string, name: string) {
  const first = buildData(text, name, EMPTY)
  const { tasks } = first.data
  expect(first.backlog.length).toBeGreaterThan(0)
  expect(tasks.length).toBeGreaterThan(0)

  // 1. IDs kept literally and unique.
  for (const t of tasks) expect(t.id).toBe(`src:${t.sourceId}`)
  expect(new Set(tasks.map((t) => t.sourceId)).size).toBe(tasks.length)

  // 2. Without a vocabulary, nothing is guessed: the only errors are the unmapped status literals.
  const unmapped = validateProjectsData(JSON.parse(JSON.stringify(first.data)))
  expect(unmapped.ok).toBe(false)
  if (!unmapped.ok) for (const e of unmapped.errors) expect(e.message).toMatch(/^estado «.+» no está en el vocabulario/)

  // 3. With every literal declared (classes are placeholders, not decisions), the data validates…
  const placeholder: Vocabulary = { status: statusLiterals(tasks).map((literal) => ({ literal, workClass: 'pendiente' })), priority: [], approval: [] }
  const { data } = buildData(text, name, placeholder)
  const stored = JSON.parse(JSON.stringify(data)) as unknown
  const read = validateProjectsData(stored)
  expect(read.ok).toBe(true)
  if (!read.ok) return { first, data, warnings: [] }

  // 4. …and survives storage unchanged.
  expect(read.data).toEqual(data)

  // 5. Round trip: each row rebuilt from the task's fields equals the original row, cell by cell and byte by byte.
  for (const table of first.backlog)
    for (const row of table.rows) {
      const t = read.data.tasks.find((x) => x.origin?.raw === row.raw)!
      expect(t).toBeDefined()
      expect(taskToCells(t, table.columns)).toEqual(row.cells)
      expect(`| ${taskToCells(t, table.columns).join(' | ')} |`).toBe(row.raw.trim())
    }
  return { first, data: read.data, warnings: read.warnings }
}

describe('P1 · compatibilidad con dossier (sintético)', () => {
  const SYNTH = [
    '# Dossier sintético',
    '## 8. Backlog',
    '| ID | Área | Tarea concreta | Estado | Dependencia | Tiempo humano | Hecho cuando… |',
    '|---|---|---|---|---|---|---|',
    '| AAA-01 | Uno | Tarea *uno* | Pendiente | Acceso externo | 20–35 min | Criterio uno |',
    '| AAA-02 | Dos | Tarea dos | Bloqueado | AAA-01 | 10 min | Criterio dos |',
    '| BBB-01 | Tres | Tarea tres | No consta | AAA-01..02 según pieza | 15 min/sem | Criterio tres |',
    '| BBB-02 | Cuatro | Tarea cuatro | Borrador existente | BBB-01 o investigación | — | Criterio cuatro |',
    '| BBB-03 | Cinco | Tarea cinco | Pendiente | BBB-01,02 | 1 h | Criterio cinco |',
    '',
  ].join('\n')

  it('keeps every row literally and guesses nothing', () => {
    const { data } = checkInvariants(SYNTH, 'DOSSIER_SINTETICO_2026-10-20.md')
    const t = (id: string) => data.tasks.find((x) => x.sourceId === id)!
    expect(t('AAA-01').title).toBe('Tarea *uno*')
    expect(t('AAA-01').extra).toEqual({ Área: 'Uno', Dependencia: 'Acceso externo', 'Tiempo humano': '20–35 min' })
    expect(t('AAA-01').estimateHours).toBeUndefined()
    expect(t('AAA-02').dependsOn).toEqual(['src:AAA-01'])
    for (const id of ['AAA-01', 'BBB-01', 'BBB-02', 'BBB-03']) expect(t(id).dependsOn).toEqual([])
    expect(t('BBB-01').owner).toBeUndefined()
  })

  it('classifies dependency cells without resolving the ambiguous ones', () => {
    const { deps } = buildData(SYNTH, 'x.md', EMPTY)
    expect(Object.fromEntries([...deps].map(([k, v]) => [k, v.kind]))).toEqual({ 'AAA-01': 'externa', 'AAA-02': 'ids', 'BBB-01': 'rango', 'BBB-02': 'alternativa', 'BBB-03': 'abreviada' })
  })

  it('a task with a plain dependency is blocked; one with only an external condition is not', () => {
    const vocab: Vocabulary = { status: ['Pendiente', 'Bloqueado', 'No consta', 'Borrador existente'].map((literal) => ({ literal, workClass: 'pendiente' as const })), priority: [], approval: [] }
    const { data } = buildData(SYNTH, 'x.md', vocab)
    const t = (id: string) => data.tasks.find((x) => x.sourceId === id)!
    expect(blockersOf(data, t('AAA-02')).waiting.map((x) => x.sourceId)).toEqual(['AAA-01'])
    expect(nextActionCandidates(data, 'new:proyecto-prueba').map((x) => x.sourceId)).toContain('AAA-01')
  })
})

describe.skipIf(!env.PROYECTOS_DOSSIER)('P1 · compatibilidad con dossier real (privado, fuera del repositorio)', () => {
  it('represents the real backlog without loss', () => {
    const path = env.PROYECTOS_DOSSIER!
    const text = readFileSync(path, 'utf8')
    const name = path.split('/').pop()!
    const { first, data, warnings } = checkInvariants(text, name)
    if (env.PROYECTOS_REPORT) {
      const tasks = data.tasks
      const report = {
        dossier: name,
        sha256: first.hash,
        tables: first.tables.map((t) => ({ heading: t.heading, columns: t.columns, rows: t.rows.length, backlog: isBacklog(t) })),
        tasks: tasks.length,
        prefixes: prefixReport(tasks.map((t) => t.sourceId!)),
        unmappedColumns: Object.keys(tasks[0].extra ?? {}),
        statusLiterals: Object.fromEntries(statusLiterals(tasks).map((s) => [s, tasks.filter((t) => t.status === s).map((t) => t.sourceId)])),
        dependencies: Object.fromEntries([...first.deps].map(([id, d]) => [id, d])),
        estimates: Object.fromEntries(tasks.map((t) => [t.sourceId, t.extra!['Tiempo humano']])),
        agents: Object.fromEntries(tasks.map((t) => [t.sourceId, t.extra!['Agente posible']])),
        warnings,
      }
      writeFileSync(env.PROYECTOS_REPORT, JSON.stringify(report, null, 2))
    }
  })
})
