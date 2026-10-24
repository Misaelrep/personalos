import { canonicalJson } from './canonical'
import type { Snapshot } from './collect'
import { BACKUP_SCHEMA, BACKUP_VERSION, MAX_BACKUP_BYTES, MAX_BACKUP_KEYS, MODULE_IDS, type BackupFile, type KeyStatus, type ModuleId } from './format'
import { coveredByTotal, moduleHashes, sha256Hex } from './integrity'
import { keyStatusOf } from './keyStatus'
import { verifyBackupText } from './verify'

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-25T21:04:00-06:00": local time with its offset (never UTC's `toISOString`). */
export function localIsoString(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** "elyum-copia-2026-10-25-2104.json" */
export function backupFileName(d: Date): string {
  return `elyum-copia-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

/** The file as written: readable, two-space indented. Integrity does not depend on this layout. */
export const serializeBackup = (file: BackupFile) => `${JSON.stringify(file, null, 2)}\n`

export type CreateError = { kind: 'too-large'; message: string } | { kind: 'self-check'; message: string }

export interface CreatedBackup {
  file: BackupFile
  text: string
  /** What was read from the storage. */
  snapshot: Snapshot
  bytes: number
}

/**
 * A copy of a snapshot, verified before anyone gets it: the serialized text is
 * read back with the same strict verification a saved file goes through, and
 * its modules must equal what was read from the storage. Otherwise, no copy.
 * Synchronous on purpose: read, sign, check and hand over happen in one tap,
 * so nothing can be saved in between and iOS still opens the share sheet.
 */
export function createBackup(snapshot: Snapshot, now: Date, device?: string): { ok: true; backup: CreatedBackup } | { ok: false; error: CreateError } {
  const keyCount = MODULE_IDS.reduce((n, id) => n + Object.keys(snapshot.modules[id].keys).length, 0)
  if (keyCount > MAX_BACKUP_KEYS) return { ok: false, error: { kind: 'too-large', message: `Hay ${keyCount} claves; el máximo de una copia es ${MAX_BACKUP_KEYS}.` } }

  const keyStatus: Record<string, KeyStatus> = {}
  for (const id of MODULE_IDS) for (const [key, value] of Object.entries(snapshot.modules[id].keys)) keyStatus[key] = keyStatusOf(id, key, value)
  const counts = Object.fromEntries(MODULE_IDS.map((id) => [id, Object.keys(snapshot.modules[id].keys).length])) as Record<ModuleId, number>

  const base: Omit<BackupFile, 'integrity'> = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    meta: { createdAt: localIsoString(now), ...(device ? { device } : {}), app: 'ELYUM', storage: 'localStorage', excluded: snapshot.excluded },
    modules: snapshot.modules,
    keyStatus,
    counts,
  }
  const integrity = { algorithm: 'SHA-256' as const, modules: moduleHashes(snapshot.modules) }
  const file: BackupFile = { ...base, integrity: { ...integrity, total: sha256Hex(coveredByTotal({ ...base, integrity })) } }

  const text = serializeBackup(file)
  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_BACKUP_BYTES) return { ok: false, error: { kind: 'too-large', message: `La copia ocuparía ${(bytes / 1048576).toFixed(1)} MB; el máximo es ${MAX_BACKUP_BYTES / 1048576} MB.` } }

  const check = verifyBackupText(text)
  if (!check.ok || canonicalJson(check.file.modules) !== canonicalJson(snapshot.modules))
    return { ok: false, error: { kind: 'self-check', message: 'La copia no superó su propia verificación y no se entrega.' } }

  return { ok: true, backup: { file, text, snapshot, bytes } }
}
