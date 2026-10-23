import { canonicalJson } from './canonical'
import { MODULE_IDS, type BackupIntegrity, type BackupModule, type ModuleId } from './format'

/** SHA-256 of a text (UTF-8), as lowercase hex. Web Crypto: the browser's own, no dependency. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hash of each module's keys and of all modules together. */
export async function computeIntegrity(modules: Record<ModuleId, BackupModule>): Promise<BackupIntegrity> {
  const perModule = {} as Record<ModuleId, string>
  for (const id of MODULE_IDS) perModule[id] = await sha256Hex(canonicalJson(modules[id].keys))
  return { algorithm: 'SHA-256', modules: perModule, total: await sha256Hex(canonicalJson(modules)) }
}

/** The first characters of a hash, to compare two copies by eye. */
export const shortHash = (hash: string) => hash.slice(0, 8)
