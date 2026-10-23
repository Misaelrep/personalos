import { moduleOf } from './collect'
import { BACKUP_SCHEMA, BACKUP_VERSION, MODULE_IDS, MODULE_LABEL, type BackupFile, type BackupModule, type ModuleId } from './format'
import { computeIntegrity } from './integrity'

export type ParseErrorKind = 'json' | 'schema' | 'version-future' | 'version' | 'shape' | 'foreign-key' | 'counts' | 'integrity'

export type ParseResult = { ok: true; file: BackupFile } | { ok: false; kind: ParseErrorKind; message: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const fail = (kind: ParseErrorKind, message: string): ParseResult => ({ ok: false, kind, message })

/**
 * Read a copy and verify it completely before anything is shown or written:
 * format, version, that every key belongs to its module, counts, and the
 * SHA-256 of each module and of the whole. Any doubt → rejected, nothing written.
 */
export async function parseBackup(text: string): Promise<ParseResult> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('json', 'El archivo no es un JSON válido.')
  }
  if (!isObject(data) || data.schema !== BACKUP_SCHEMA) return fail('schema', 'El archivo no es una copia de ELYUM.')
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1)
    return fail('version', 'La versión de la copia no es válida.')
  if (data.version > BACKUP_VERSION)
    return fail('version-future', `La copia es de una versión más reciente (v${data.version}). Actualiza ELYUM antes de importarla.`)
  if (typeof data.createdAt !== 'string') return fail('shape', 'Falta la fecha de la copia.')
  if (data.device !== undefined && typeof data.device !== 'string') return fail('shape', 'La etiqueta del dispositivo no es válida.')

  const rawModules = data.modules
  if (!isObject(rawModules)) return fail('shape', 'Faltan los módulos de la copia.')
  const modules = {} as Record<ModuleId, BackupModule>
  for (const id of MODULE_IDS) {
    const m = rawModules[id]
    if (!isObject(m) || !isObject(m.keys)) return fail('shape', `Falta el módulo «${MODULE_LABEL[id]}».`)
    for (const [key, value] of Object.entries(m.keys)) {
      if (typeof value !== 'string') return fail('shape', `El valor de ${key} no es texto.`)
      if (moduleOf(key) !== id) return fail('foreign-key', `La clave ${key} no pertenece a «${MODULE_LABEL[id]}».`)
    }
    modules[id] = { keys: m.keys as Record<string, string> }
  }
  const unknownModules = Object.keys(rawModules).filter((k) => !(MODULE_IDS as readonly string[]).includes(k))
  if (unknownModules.length) return fail('shape', `Módulos desconocidos: ${unknownModules.join(', ')}.`)

  const counts = data.counts
  if (!isObject(counts)) return fail('shape', 'Faltan los conteos de la copia.')
  for (const id of MODULE_IDS)
    if (counts[id] !== Object.keys(modules[id].keys).length)
      return fail('counts', `El conteo de «${MODULE_LABEL[id]}» no coincide con su contenido.`)

  const integrity = data.integrity
  if (!isObject(integrity) || integrity.algorithm !== 'SHA-256' || !isObject(integrity.modules) || typeof integrity.total !== 'string')
    return fail('shape', 'Falta la verificación de integridad.')
  const expected = await computeIntegrity(modules)
  for (const id of MODULE_IDS)
    if (integrity.modules[id] !== expected.modules[id])
      return fail('integrity', `La integridad de «${MODULE_LABEL[id]}» no coincide: la copia está alterada o incompleta.`)
  if (integrity.total !== expected.total) return fail('integrity', 'La integridad total no coincide: la copia está alterada o incompleta.')

  return {
    ok: true,
    file: {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      createdAt: data.createdAt,
      ...(typeof data.device === 'string' ? { device: data.device } : {}),
      modules,
      counts: Object.fromEntries(MODULE_IDS.map((id) => [id, Object.keys(modules[id].keys).length])) as Record<ModuleId, number>,
      integrity: expected,
    },
  }
}
