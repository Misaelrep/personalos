import { canonicalJson } from './canonical'
import { MODULE_IDS, type BackupFile, type BackupIntegrity, type BackupModule, type ModuleId } from './format'
import { sha256Hex } from './sha256'

export { sha256Hex }

/** What `integrity.total` covers: the whole file, with the total itself left out. */
export const coveredByTotal = (file: Omit<BackupFile, 'integrity'> & { integrity: Omit<BackupIntegrity, 'total'> }) =>
  canonicalJson({ ...file, integrity: { algorithm: file.integrity.algorithm, modules: file.integrity.modules } })

export function moduleHashes(modules: Record<ModuleId, BackupModule>): Record<ModuleId, string> {
  const out = {} as Record<ModuleId, string>
  for (const id of MODULE_IDS) out[id] = sha256Hex(canonicalJson(modules[id].keys))
  return out
}

/** The first characters of a hash, to compare two copies by eye. */
export const shortHash = (hash: string) => hash.slice(0, 8)
