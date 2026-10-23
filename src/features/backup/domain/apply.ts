import { StorageError, writeVerified, type StorageErrorKind, type StorageLike } from '../storage/storage'
import type { PlannedWrite } from './plan'

/** Where the values an import replaces are set aside, on this device, before it writes. */
export const PRE_IMPORT_KEY = 'elyum:system:v1:pre-import'

export interface ApplyReport {
  ok: boolean
  /** Keys written and verified (on failure: before the rollback). */
  written: number
  /** The values about to be replaced were also kept on this device (an extra net: the external copy is the real one). */
  localSafetyCopy: boolean
  /** `stale`: this device changed since the preview — nothing was written, the preview must be reviewed again. */
  failure?: { key?: string; kind: StorageErrorKind | 'stale'; message: string }
  /** For `stale`: the keys that changed since the preview. */
  changed?: string[]
  /** On failure, every key written by this import was returned to what it held before. */
  rolledBack?: boolean
  /** Keys whose previous value could not be put back (should be empty; shown if not). */
  rollbackFailures?: string[]
}

/**
 * Write an import, verifying each key by reading it back. localStorage has no
 * transactions: if any write fails, everything this import wrote is put back
 * as it was — a key it had added is removed again, a key it had replaced gets
 * its previous value — and the failure is reported. Nothing else is touched.
 */
export function applyWrites(storage: StorageLike, writes: PlannedWrite[], now: number): ApplyReport {
  // The preview is a promise: every key is written over exactly the value the person reviewed. If anything changed
  // since (another tab, the clock crossing midnight…), nothing is written and the preview must be reviewed again.
  const changed = changedSincePreview(storage, writes)
  if (changed.length)
    return {
      ok: false,
      written: 0,
      localSafetyCopy: false,
      changed,
      failure: { kind: 'stale', message: 'Los datos de este dispositivo cambiaron después de la vista previa. No se escribió nada.' },
    }

  let localSafetyCopy = false
  const replaced = Object.fromEntries(writes.filter((w) => w.previous !== null).map((w) => [w.key, w.previous]))
  try {
    writeVerified(storage, PRE_IMPORT_KEY, JSON.stringify({ at: now, replaced, added: writes.filter((w) => w.previous === null).map((w) => w.key) }))
    localSafetyCopy = true
  } catch {
    // The external copy (required before importing) is the real safety; this one is best effort.
  }

  const done: PlannedWrite[] = []
  for (const w of writes) {
    try {
      writeVerified(storage, w.key, w.value)
      done.push(w)
    } catch (error) {
      const e = error instanceof StorageError ? error : new StorageError('unavailable', String(error), w.key)
      const rollbackFailures = rollback(storage, [...done, w])
      return {
        ok: false,
        written: done.length,
        localSafetyCopy,
        failure: { key: w.key, kind: e.kind, message: e.message },
        rolledBack: rollbackFailures.length === 0,
        rollbackFailures,
      }
    }
  }
  return { ok: true, written: done.length, localSafetyCopy }
}

function rollback(storage: StorageLike, writes: PlannedWrite[]): string[] {
  const failures: string[] = []
  for (const w of [...writes].reverse()) {
    try {
      // Untouched (e.g. the write that failed never landed): nothing to put back.
      if (storage.getItem(w.key) === w.previous) continue
      if (w.previous === null) storage.removeItem(w.key)
      else storage.setItem(w.key, w.previous)
      if (storage.getItem(w.key) !== w.previous) failures.push(w.key)
    } catch {
      failures.push(w.key)
    }
  }
  return failures
}

/**
 * Two stored values mean the same for an import. Exact text, except the entry
 * memory's `lastActiveAt`: a heartbeat every open tab refreshes every 30 s
 * (merging, never overwriting the rest). It is not the person's data.
 */
export function sameStored(key: string, a: string | null, b: string | null): boolean {
  if (a === b) return true
  if (key !== 'personal-os:entry' || a === null || b === null) return false
  try {
    const strip = (v: string) => {
      const o = JSON.parse(v) as Record<string, unknown>
      delete o.lastActiveAt
      return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]))
    }
    return strip(a) === strip(b)
  } catch {
    return false
  }
}

/** Keys the import would write whose value here is no longer the one the preview showed. */
export function changedSincePreview(storage: StorageLike, writes: PlannedWrite[]): string[] {
  return writes.filter((w) => !sameStored(w.key, storage.getItem(w.key), w.previous)).map((w) => w.key)
}

/**
 * After the import, once things have settled: keys that no longer hold what
 * was written — something (a tab that missed the warning) wrote over them.
 * Reported to the person; never silently accepted.
 */
export function overwrittenAfterImport(storage: StorageLike, writes: PlannedWrite[]): string[] {
  return writes.filter((w) => !sameStored(w.key, storage.getItem(w.key), w.value)).map((w) => w.key)
}
