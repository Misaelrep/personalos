import type { ReadableStorage } from '../storage/storage'
import { MODULE_IDS, type BackupModule, type Excluded, type ModuleId } from './format'

/**
 * Which ELYUM data a storage key holds — or why it is left out.
 *
 *   core      personal-os:day:<fecha> · personal-os:entry   (names kept on purpose)
 *   learn     elyum:learn:…
 *   projects  elyum:projects:…
 *
 * Never part of a copy: simulations (`personal-os:sim:*`, any `…:sim:…`),
 * SISTEMA's own keys (`elyum:system:*`) and anything that is not ELYUM's.
 * A key in ELYUM's namespaces that none of these rules knows is not copied
 * either, but it is named in the copy and on screen: nothing goes missing silently.
 */
export type KeyPlace = { module: ModuleId } | { excluded: 'simulation' | 'system' | 'foreign' | 'unknownElyum' }

export function placeOf(key: string): KeyPlace {
  const elyum = key.startsWith('personal-os:') || key.startsWith('elyum:')
  if (elyum && (key.startsWith('personal-os:sim:') || key.includes(':sim:'))) return { excluded: 'simulation' }
  if (key === 'personal-os:entry' || key.startsWith('personal-os:day:')) return { module: 'core' }
  if (key.startsWith('elyum:learn:')) return { module: 'learn' }
  if (key.startsWith('elyum:projects:')) return { module: 'projects' }
  if (key.startsWith('elyum:system:')) return { excluded: 'system' }
  return elyum ? { excluded: 'unknownElyum' } : { excluded: 'foreign' }
}

export const moduleOf = (key: string): ModuleId | null => {
  const place = placeOf(key)
  return 'module' in place ? place.module : null
}

export interface Snapshot {
  modules: Record<ModuleId, BackupModule>
  excluded: Excluded
}

export const emptyModules = (): Record<ModuleId, BackupModule> =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, { keys: {} }])) as Record<ModuleId, BackupModule>

/**
 * Everything ELYUM keeps on this storage, as the literal stored text, read in
 * one synchronous pass: no other code of this page can write in between.
 * Reads only. Throws if the storage cannot be read (blocked, private mode…).
 */
export function readSnapshot(storage: ReadableStorage): Snapshot {
  const modules = emptyModules()
  const excluded: Excluded = { simulation: 0, system: 0, foreign: 0, unknownElyum: [] }
  const n = storage.length
  for (let i = 0; i < n; i++) {
    const key = storage.key(i)
    if (key === null) continue
    const place = placeOf(key)
    if ('excluded' in place) {
      if (place.excluded === 'unknownElyum') excluded.unknownElyum.push(key)
      else excluded[place.excluded]++
      continue
    }
    const value = storage.getItem(key)
    if (value !== null) modules[place.module].keys[key] = value
  }
  excluded.unknownElyum.sort()
  return { modules, excluded }
}
