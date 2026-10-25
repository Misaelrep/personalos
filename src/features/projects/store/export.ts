import { validateProjectsData } from '../domain/schema'
import type { ProjectsData } from '../domain/types'
import { sha256Hex } from '../import/sha256'
import { DATA_KEY, readEnvelope, type KeyValue } from './store'

/**
 * P3 · A file copy of PROYECTOS that can be checked without trusting it.
 * Exporting reads only. Restoring from a file is in `restore.ts` (P2-R1).
 *
 * The file keeps the stored text byte for byte (`stored`), so even data this
 * version cannot read is exported whole; when it can be read, the file also
 * says what it holds, and `verifyExport` checks both.
 */

export const EXPORT_FORMAT = 'elyum-projects-export/1'

export interface ExportSummary {
  generation: number
  savedAt: string
  projects: number
  tasks: number
  references: number
  imports: number
  history: number
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  key: typeof DATA_KEY
  /** The stored value, exactly as it was (null when nothing was stored). */
  stored: string | null
  /** SHA-256 of `stored`. */
  storedSha256: string | null
  /** What the stored value holds, when this version could read it. */
  summary?: ExportSummary
  readable: boolean
  /** P2-R1: set when the copy comes from the separate test store, not from PROYECTOS itself. */
  origin?: 'prueba-p2r1'
}

const summarize = (generation: number, savedAt: string, d: ProjectsData): ExportSummary => ({
  generation,
  savedAt,
  projects: d.projects.length,
  tasks: d.tasks.length,
  references: d.references?.length ?? 0,
  imports: d.imports?.length ?? 0,
  history: d.history.length,
})

export async function exportProjects(storage: Pick<KeyValue, 'getItem'>, now: string, origin?: ExportFile['origin']): Promise<{ text: string; file: ExportFile }> {
  const stored = storage.getItem(DATA_KEY)
  const loaded = await readEnvelope(stored)
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    exportedAt: now,
    key: DATA_KEY,
    stored,
    storedSha256: stored === null ? null : await sha256Hex(stored),
    readable: loaded.kind === 'ok' || loaded.kind === 'vacio',
    ...(loaded.kind === 'ok' ? { summary: summarize(loaded.generation, loaded.savedAt, loaded.data) } : {}),
    ...(origin ? { origin } : {}),
  }
  return { text: JSON.stringify(file, null, 2), file }
}

export type Verification = { ok: true; summary?: ExportSummary; readable: boolean } | { ok: false; problems: string[] }

/** Check an exported file: its own shape, the fingerprint of the stored text, and the data inside. */
export async function verifyExport(text: string): Promise<Verification> {
  const problems: string[] = []
  let f: ExportFile
  try {
    f = JSON.parse(text) as ExportFile
  } catch {
    return { ok: false, problems: ['el archivo no es JSON válido'] }
  }
  if (typeof f !== 'object' || f === null || f.format !== EXPORT_FORMAT) return { ok: false, problems: ['no es una copia de PROYECTOS'] }
  if (f.key !== DATA_KEY) problems.push(`clave inesperada: ${String(f.key)}`)
  if (f.stored === null) {
    if (f.storedSha256 !== null) problems.push('huella sin datos')
    return problems.length ? { ok: false, problems } : { ok: true, readable: true }
  }
  if (typeof f.stored !== 'string') return { ok: false, problems: ['falta el texto guardado'] }
  if ((await sha256Hex(f.stored)) !== f.storedSha256) problems.push('la huella del texto guardado no coincide: el archivo se alteró')
  const loaded = await readEnvelope(f.stored)
  if (f.readable) {
    if (loaded.kind !== 'ok') problems.push(`los datos dentro de la copia no se pueden leer (${loaded.kind === 'ilegible' ? loaded.reason : loaded.kind})`)
    else {
      const s = summarize(loaded.generation, loaded.savedAt, loaded.data)
      if (JSON.stringify(s) !== JSON.stringify(f.summary)) problems.push('el resumen no coincide con los datos')
      if (!validateProjectsData(loaded.data).ok) problems.push('los datos no validan')
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, readable: f.readable, ...(f.summary ? { summary: f.summary } : {}) }
}
