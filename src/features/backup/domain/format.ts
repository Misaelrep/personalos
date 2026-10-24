/**
 * The ELYUM backup file, format 2 (P2-E: export and verification only).
 *
 *   {
 *     schema: 'elyum.backup', version: 2,
 *     meta:      when, where from, what was left out
 *     modules:   { core, learn, projects } → { keys: { <storage key>: <stored text> } }
 *     keyStatus: { <storage key>: 'valido' | 'no-reconocido' | 'ilegible' | 'sin-validador' }
 *     counts:    keys per module
 *     integrity: SHA-256 per module, and `total` over everything else in the file
 *   }
 *
 * Values are the stored text, byte for byte: a copy never reinterprets data.
 * `keyStatus` says what this version of ELYUM could read in each value, but a
 * value is exported whatever its status — an unreadable day is kept, not dropped.
 * `total` covers the whole file except itself (metadata included).
 */
export const BACKUP_SCHEMA = 'elyum.backup'
export const BACKUP_VERSION = 2

export const MODULE_IDS = ['core', 'learn', 'projects'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

export const MODULE_LABEL: Record<ModuleId, string> = {
  core: 'Días · HOY, FOCUS y entrada',
  learn: 'Aprender',
  projects: 'Proyectos',
}

/**
 *   valido         this version reads it as the app does
 *   no-reconocido  it is JSON, but not in a shape this version knows: the app may not be able to use it
 *   ilegible       not JSON at all
 *   sin-validador  this version has no validator for that data: copied, not checked
 */
export const KEY_STATUSES = ['valido', 'no-reconocido', 'ilegible', 'sin-validador'] as const
export type KeyStatus = (typeof KEY_STATUSES)[number]

/** [one, many] */
export const KEY_STATUS_LABEL: Record<KeyStatus, [string, string]> = {
  valido: ['válida', 'válidas'],
  'no-reconocido': ['no reconocida', 'no reconocidas'],
  ilegible: ['ilegible', 'ilegibles'],
  'sin-validador': ['sin validar', 'sin validar'],
}

export interface BackupModule {
  keys: Record<string, string>
}

/** Keys found in the storage and deliberately left out of the copy, counted (never their values). */
export interface Excluded {
  /** `?date=` / `?t=` simulations. */
  simulation: number
  /** SISTEMA's own keys (`elyum:system:*`). */
  system: number
  /** Keys that are not ELYUM's (another app on the same origin). */
  foreign: number
  /** Keys in ELYUM's namespaces that this version does not know: named, so nothing goes missing silently. */
  unknownElyum: string[]
}

export interface BackupMeta {
  /** Local time with its offset. */
  createdAt: string
  /** "iPhone · app instalada"… Never sent anywhere. */
  device?: string
  app: 'ELYUM'
  storage: 'localStorage'
  excluded: Excluded
}

export interface BackupIntegrity {
  algorithm: 'SHA-256'
  modules: Record<ModuleId, string>
  /** Over the canonical JSON of the whole file, with `integrity.total` left out. */
  total: string
}

export interface BackupFile {
  schema: typeof BACKUP_SCHEMA
  version: typeof BACKUP_VERSION
  meta: BackupMeta
  modules: Record<ModuleId, BackupModule>
  keyStatus: Record<string, KeyStatus>
  counts: Record<ModuleId, number>
  integrity: BackupIntegrity
}

/**
 * Limits. A device's localStorage holds a few MB; a copy far beyond that is
 * not one of ours, and reading it could freeze the phone.
 */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024
export const MAX_BACKUP_KEYS = 50_000
