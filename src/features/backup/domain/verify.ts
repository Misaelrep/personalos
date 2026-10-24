import type { Snapshot } from './collect'
import { moduleOf } from './collect'
import { BACKUP_SCHEMA, BACKUP_VERSION, KEY_STATUSES, MAX_BACKUP_BYTES, MAX_BACKUP_KEYS, MODULE_IDS, MODULE_LABEL, type BackupFile, type KeyStatus, type ModuleId } from './format'
import { coveredByTotal, moduleHashes, sha256Hex } from './integrity'
import { keyStatusOf } from './keyStatus'
import { parseStrictJson } from './strictJson'

/**
 * Verifying a backup file: reads it, never writes anything anywhere.
 * Every check must pass; the first that fails says why, in plain words.
 */
export type VerifyErrorKind =
  | 'too-large'
  | 'json'
  | 'duplicate-key'
  | 'schema'
  | 'version-old'
  | 'version-future'
  | 'shape'
  | 'foreign-key'
  | 'counts'
  | 'integrity'

export type VerifyResult =
  | {
      ok: true
      file: BackupFile
      bytes: number
      statusCounts: Record<KeyStatus, number>
      /** Keys whose status this version reads differently from what the file recorded (informative). */
      statusChanges: { key: string; recorded: KeyStatus; now: KeyStatus }[]
    }
  | { ok: false; kind: VerifyErrorKind; message: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const exactKeys = (o: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []) =>
  keys.every((k) => Object.hasOwn(o, k)) && Object.keys(o).every((k) => keys.includes(k) || optional.includes(k))
const fail = (kind: VerifyErrorKind, message: string): VerifyResult => ({ ok: false, kind, message })

const TOP = ['schema', 'version', 'meta', 'modules', 'keyStatus', 'counts', 'integrity']
const HEX64 = /^[0-9a-f]{64}$/

export function verifyBackupText(text: string): VerifyResult {
  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_BACKUP_BYTES) return fail('too-large', `El archivo ocupa ${(bytes / 1048576).toFixed(1)} MB; una copia de ELYUM no pasa de ${MAX_BACKUP_BYTES / 1048576} MB.`)

  const parsed = parseStrictJson(text)
  if (!parsed.ok) return fail(parsed.reason === 'duplicate-key' ? 'duplicate-key' : 'json', parsed.message)
  const f = parsed.value
  if (!isObject(f) || f.schema !== BACKUP_SCHEMA) return fail('schema', 'No es una copia de ELYUM.')
  if (typeof f.version !== 'number' || !Number.isInteger(f.version)) return fail('shape', 'La copia no indica una versión válida.')
  if (f.version < BACKUP_VERSION) return fail('version-old', `Es una copia de formato ${f.version}, de una versión de prueba anterior. Esta versión solo verifica el formato ${BACKUP_VERSION}.`)
  if (f.version > BACKUP_VERSION) return fail('version-future', `Es una copia de formato ${f.version}, de una versión más nueva de ELYUM. Esta solo conoce hasta el ${BACKUP_VERSION}.`)
  if (!exactKeys(f, TOP)) return fail('shape', 'La copia tiene campos de más o de menos.')

  const { meta, modules, keyStatus, counts, integrity } = f
  if (
    !isObject(meta) ||
    !exactKeys(meta, ['createdAt', 'app', 'storage', 'excluded'], ['device']) ||
    typeof meta.createdAt !== 'string' ||
    (meta.device !== undefined && typeof meta.device !== 'string') ||
    meta.app !== 'ELYUM' ||
    meta.storage !== 'localStorage' ||
    !isObject(meta.excluded) ||
    !exactKeys(meta.excluded, ['simulation', 'system', 'foreign', 'unknownElyum']) ||
    !['simulation', 'system', 'foreign'].every((k) => Number.isInteger((meta.excluded as Record<string, unknown>)[k])) ||
    !(Array.isArray(meta.excluded.unknownElyum) && meta.excluded.unknownElyum.every((k) => typeof k === 'string'))
  )
    return fail('shape', 'Los datos de la copia (fecha, origen) están mal formados.')
  if (!isObject(modules) || !exactKeys(modules, MODULE_IDS)) return fail('shape', 'La copia no tiene los módulos esperados.')
  if (!isObject(keyStatus) || !isObject(counts) || !exactKeys(counts, MODULE_IDS)) return fail('shape', 'La copia tiene el resumen mal formado.')

  let keyTotal = 0
  const seen = new Set<string>()
  for (const id of MODULE_IDS) {
    const m = modules[id]
    if (!isObject(m) || !exactKeys(m, ['keys']) || !isObject(m.keys)) return fail('shape', `El módulo «${MODULE_LABEL[id]}» está mal formado.`)
    const entries = Object.entries(m.keys)
    keyTotal += entries.length
    if (keyTotal > MAX_BACKUP_KEYS) return fail('too-large', `La copia tiene más de ${MAX_BACKUP_KEYS} claves.`)
    for (const [key, value] of entries) {
      if (typeof value !== 'string') return fail('shape', `El valor de ${key} no es texto.`)
      if (moduleOf(key) !== id) return fail('foreign-key', `La clave «${key.slice(0, 80)}» no pertenece al módulo «${MODULE_LABEL[id]}».`)
      if (seen.has(key)) return fail('shape', `La clave «${key.slice(0, 80)}» está en dos módulos.`)
      seen.add(key)
    }
    if (counts[id] !== entries.length) return fail('counts', `El módulo «${MODULE_LABEL[id]}» dice tener ${String(counts[id])} claves y tiene ${entries.length}.`)
  }
  const statusKeys = Object.keys(keyStatus)
  if (statusKeys.length !== seen.size || !statusKeys.every((k) => seen.has(k)) || !Object.values(keyStatus).every((s) => (KEY_STATUSES as readonly unknown[]).includes(s)))
    return fail('shape', 'El estado por clave no corresponde a las claves de la copia.')
  if (!isObject(integrity) || !exactKeys(integrity, ['algorithm', 'modules', 'total']) || integrity.algorithm !== 'SHA-256' || !isObject(integrity.modules) || !exactKeys(integrity.modules, MODULE_IDS) || typeof integrity.total !== 'string' || !HEX64.test(integrity.total) || !MODULE_IDS.every((id) => typeof (integrity.modules as Record<string, unknown>)[id] === 'string'))
    return fail('shape', 'La huella de la copia está mal formada.')

  const file = f as unknown as BackupFile
  const hashes: Record<ModuleId, string> = moduleHashes(file.modules)
  const total = sha256Hex(coveredByTotal(file))
  const broken = MODULE_IDS.filter((id) => hashes[id] !== file.integrity.modules[id])
  if (broken.length) return fail('integrity', `El contenido de ${broken.map((id) => `«${MODULE_LABEL[id]}»`).join(', ')} no coincide con su huella: el archivo cambió después de exportarse.`)
  if (total !== file.integrity.total) return fail('integrity', 'La huella total no coincide: el archivo cambió después de exportarse (también cuenta la fecha o el origen).')

  const statusCounts = Object.fromEntries(KEY_STATUSES.map((s) => [s, 0])) as Record<KeyStatus, number>
  const statusChanges: { key: string; recorded: KeyStatus; now: KeyStatus }[] = []
  for (const id of MODULE_IDS)
    for (const [key, value] of Object.entries(file.modules[id].keys)) {
      const now = keyStatusOf(id, key, value)
      statusCounts[file.keyStatus[key]]++
      if (now !== file.keyStatus[key]) statusChanges.push({ key, recorded: file.keyStatus[key], now })
    }
  return { ok: true, file, bytes, statusCounts, statusChanges }
}

/** A verified copy against what this device holds now. Reads only. */
export interface Comparison {
  same: number
  different: string[]
  onlyInFile: string[]
  onlyOnDevice: string[]
}

export function compareWithDevice(file: BackupFile, device: Snapshot): Comparison {
  const c: Comparison = { same: 0, different: [], onlyInFile: [], onlyOnDevice: [] }
  for (const id of MODULE_IDS) {
    const inFile = file.modules[id].keys
    const here = device.modules[id].keys
    for (const key of Object.keys(inFile)) {
      if (!Object.hasOwn(here, key)) c.onlyInFile.push(key)
      else if (here[key] === inFile[key]) c.same++
      else c.different.push(key)
    }
    for (const key of Object.keys(here)) if (!Object.hasOwn(inFile, key)) c.onlyOnDevice.push(key)
  }
  return c
}
