/**
 * ELYUM backup file, version 1.
 *
 * A copy of every piece of ELYUM data that lives on this device, as the
 * literal strings it is stored as — never re-interpreted, so a copy taken
 * today restores byte for byte, whatever shape a module gives its data later.
 *
 *   { schema: 'elyum.backup', version: 1, createdAt, device?,
 *     modules:   { core: { keys: { "<key>": "<stored value>" } }, learn: …, projects: … },
 *     counts:    { core: 41, learn: 0, projects: 0 },
 *     integrity: { algorithm: 'SHA-256', modules: { core: "<hex>", … }, total: "<hex>" } }
 *
 * Hashes are over the canonical JSON (sorted keys, no whitespace) of each
 * module's `keys` and of all `modules` together.
 */
export const BACKUP_SCHEMA = 'elyum.backup'
export const BACKUP_VERSION = 1

export const MODULE_IDS = ['core', 'learn', 'projects'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

export interface BackupModule {
  /** Storage key → stored value, literal. */
  keys: Record<string, string>
}

export interface BackupIntegrity {
  algorithm: 'SHA-256'
  modules: Record<ModuleId, string>
  total: string
}

export interface BackupFile {
  schema: typeof BACKUP_SCHEMA
  version: typeof BACKUP_VERSION
  /** Local time of the copy, with its offset: "2026-10-25T21:04:00-06:00". */
  createdAt: string
  /** Optional label of the device it was taken on. */
  device?: string
  modules: Record<ModuleId, BackupModule>
  counts: Record<ModuleId, number>
  integrity: BackupIntegrity
}

/** Human names of the modules, as SISTEMA shows them. */
export const MODULE_LABEL: Record<ModuleId, string> = {
  core: 'Días · HOY, FOCUS y entrada',
  learn: 'Aprender',
  projects: 'Proyectos',
}
