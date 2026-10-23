import type { StorageLike } from '../storage/storage'
import { collectModules } from './collect'
import { BACKUP_SCHEMA, BACKUP_VERSION, MODULE_IDS, type BackupFile, type ModuleId } from './format'
import { computeIntegrity } from './integrity'

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

/** A copy of all ELYUM data on this storage, with its integrity. */
export async function createBackup(storage: StorageLike, now: Date, device?: string): Promise<BackupFile> {
  const modules = collectModules(storage)
  const counts = Object.fromEntries(MODULE_IDS.map((id) => [id, Object.keys(modules[id].keys).length])) as Record<ModuleId, number>
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: localIsoString(now),
    ...(device ? { device } : {}),
    modules,
    counts,
    integrity: await computeIntegrity(modules),
  }
}

/** The file as written: readable, two-space indented. Integrity does not depend on this layout. */
export const serializeBackup = (file: BackupFile) => `${JSON.stringify(file, null, 2)}\n`
