/**
 * P3 · The intermediate format between a dossier file and PROYECTOS.
 *
 * A reader turns ONE kind of dossier (Markdown tables, another layout later…)
 * into a `DossierBundle`; everything after it — preview, conflicts, import —
 * only knows bundles. The six dossiers do not need to share a layout: each
 * gets a reader, and all of them meet here.
 *
 * Everything a bundle holds is literal text from the file plus where it was.
 * A bundle decides nothing: no work class, no approval, no priority, no owner.
 */

export const BUNDLE_FORMAT = 'elyum-dossier/1'

/** Where a record was in the file, and its exact text. */
export interface Place {
  /** Heading path above it. */
  section: string
  /** 1-based line of the record. */
  line: number
  /** The record exactly as written (a table row, a list item…). */
  raw: string
}

export interface DraftTask {
  /** Original ID, literal. */
  sourceId: string
  title: string
  statusLiteral: string
  priorityLiteral?: string
  approvalLiteral?: string
  acceptance: string[]
  area?: string
  deliverable?: string
  estimateLiteral?: string
  delegationLiteral?: string
  sourceRefsLiteral?: string
  /** The dependency text as written; read into requirements by `readRequirements`. */
  dependencyLiteral?: string
  /** Every other field of the record, by its own name, literal and in order. */
  extra: Record<string, string>
  place: Place
}

export interface DraftSource {
  key: string
  title: string
  note?: string
  place: Place
}

/** A record that is not a task (an editorial piece, a file, a process step…). */
export interface DraftReference {
  group: string
  label: string
  cells: { column: string; value: string }[]
  place: Place
}

export interface BundleIssue {
  level: 'error' | 'aviso'
  message: string
  line?: number
}

export interface DossierBundle {
  format: typeof BUNDLE_FORMAT
  dossier: {
    /** File name as given. */
    name: string
    /** Date or version found in the name or the file, literal. */
    version?: string
    /** SHA-256 of the file's bytes. */
    sha256: string
    bytes: number
    /** Reader that produced the bundle, with its version. */
    reader: string
  }
  project: { name?: string; objective?: string; place?: Place }
  tasks: DraftTask[]
  sources: DraftSource[]
  references: DraftReference[]
  /** Errors stop the import; warnings are shown. */
  issues: BundleIssue[]
}

/** A bundle the importer can trust structurally (it may come from a file or another reader). */
export function bundleIssues(b: DossierBundle): string[] {
  const out: string[] = []
  if (b.format !== BUNDLE_FORMAT) out.push(`formato intermedio desconocido: ${String(b.format)}`)
  if (!/^[0-9a-f]{64}$/.test(b.dossier?.sha256 ?? '')) out.push('falta la huella del archivo')
  const seen = new Set<string>()
  for (const t of b.tasks) {
    if (!t.sourceId) out.push(`tarea sin ID en la línea ${t.place.line}`)
    else if (seen.has(t.sourceId)) out.push(`ID repetido en el dossier: ${t.sourceId} (no se renombra)`)
    seen.add(t.sourceId)
    if (!t.title.trim()) out.push(`${t.sourceId}: tarea sin título`)
    if (!t.statusLiteral.trim()) out.push(`${t.sourceId}: tarea sin estado`)
  }
  const keys = new Set<string>()
  for (const s of b.sources) {
    if (keys.has(s.key)) out.push(`clave de fuente repetida: ${s.key}`)
    keys.add(s.key)
  }
  return out
}
