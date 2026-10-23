import { StorageError, writeVerified, type StorageErrorKind, type StorageLike } from './storage'

/**
 * SISTEMA's own memory on this device, under `elyum:system:v1:*` — never part
 * of a copy and never another module's key:
 *   health   the last write probe
 *   meta     when the last copy was exported / imported, and its hash
 */
export const SYSTEM_KEYS = {
  health: 'elyum:system:v1:health',
  meta: 'elyum:system:v1:meta',
} as const

export type StorageHealth = { ok: true } | { ok: false; kind: StorageErrorKind; message: string }

/**
 * Can this device still keep ELYUM's data? Write a probe and read it back.
 * The core saves its days silently (a failure there is invisible); this makes
 * the same failure visible without touching the core.
 */
export function checkStorage(storage: StorageLike | undefined, now: number): StorageHealth {
  if (!storage) return { ok: false, kind: 'unavailable', message: 'Este navegador no permite guardar datos: lo que hagas no se conservará.' }
  try {
    writeVerified(storage, SYSTEM_KEYS.health, String(now))
    return { ok: true }
  } catch (error) {
    const e = error instanceof StorageError ? error : new StorageError('unavailable', String(error))
    return {
      ok: false,
      kind: e.kind,
      message:
        e.kind === 'quota'
          ? 'El almacenamiento está lleno: los cambios nuevos pueden no guardarse. Exporta una copia.'
          : 'El almacenamiento no responde: los cambios pueden no guardarse. Exporta una copia.',
    }
  }
}

export interface SystemMeta {
  lastExport?: { at: number; hash: string }
  lastImport?: { at: number; hash: string; written: number }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function loadMeta(storage: StorageLike | undefined): SystemMeta {
  try {
    const raw = storage?.getItem(SYSTEM_KEYS.meta)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (!isObject(parsed)) return {}
    const meta: SystemMeta = {}
    const ex = parsed.lastExport
    if (isObject(ex) && typeof ex.at === 'number' && typeof ex.hash === 'string') meta.lastExport = { at: ex.at, hash: ex.hash }
    const im = parsed.lastImport
    if (isObject(im) && typeof im.at === 'number' && typeof im.hash === 'string' && typeof im.written === 'number')
      meta.lastImport = { at: im.at, hash: im.hash, written: im.written }
    return meta
  } catch {
    return {}
  }
}

/** Returns false if it could not be saved (the caller shows it). */
export function saveMeta(storage: StorageLike | undefined, patch: Partial<SystemMeta>): boolean {
  if (!storage) return false
  try {
    writeVerified(storage, SYSTEM_KEYS.meta, JSON.stringify({ ...loadMeta(storage), ...patch }))
    return true
  } catch {
    return false
  }
}

/** Whole days between two instants, in local calendar days. */
export function daysSince(at: number, now: number): number {
  const a = new Date(at)
  const b = new Date(now)
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(b) - start(a)) / 86_400_000)
}
