import { listKeys, type StorageLike } from '../storage/storage'
import { MODULE_IDS, type BackupModule, type ModuleId } from './format'

/**
 * Which ELYUM data a storage key holds — or none.
 *
 *   core      personal-os:day:<fecha> · personal-os:entry   (names kept on purpose, see README)
 *   learn     elyum:learn:…
 *   projects  elyum:projects:…
 *
 * Never part of a copy: simulations (`personal-os:sim:*`, any `…:sim:…`),
 * SISTEMA's own keys (`elyum:system:*`) and anything that is not ELYUM's.
 */
export function moduleOf(key: string): ModuleId | null {
  if (key.startsWith('personal-os:sim:') || key.includes(':sim:')) return null
  if (key === 'personal-os:entry' || key.startsWith('personal-os:day:')) return 'core'
  if (key.startsWith('elyum:learn:')) return 'learn'
  if (key.startsWith('elyum:projects:')) return 'projects'
  return null
}

export const emptyModules = (): Record<ModuleId, BackupModule> =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, { keys: {} }])) as Record<ModuleId, BackupModule>

/** All ELYUM data on this storage, by module, as the literal stored strings. */
export function collectModules(storage: StorageLike): Record<ModuleId, BackupModule> {
  const modules = emptyModules()
  for (const key of listKeys(storage)) {
    const id = moduleOf(key)
    if (!id) continue
    const value = storage.getItem(key)
    if (value !== null) modules[id].keys[key] = value
  }
  return modules
}
