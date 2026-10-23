import { writeVerified, type StorageLike } from './storage'

/**
 * Coordination between tabs during a restore, without touching the core.
 *
 * The core keeps today's day in memory and saves all of it on its next change
 * (APRENDER does the same with its state). A tab opened before a restore would
 * therefore write its old day over the restored one. So the importing tab
 * announces the restore in a marker key; every other tab of ELYUM sees it
 * (`storage` event, or on coming back to the foreground), blocks any
 * interaction at once — no interaction, no stale save — and reloads from the
 * restored data when the restore ends.
 */
export const RESTORE_KEY = 'elyum:system:v1:restore'

/** A restore announced by a tab that has not finished it within this time is considered abandoned. */
export const RESTORE_STALE_MS = 15_000

export interface RestoreMarker {
  id: string
  phase: 'writing' | 'done' | 'failed'
  at: number
}

const isMarker = (v: unknown): v is RestoreMarker => {
  const m = v as RestoreMarker
  return typeof m === 'object' && m !== null && typeof m.id === 'string' && typeof m.at === 'number' && ['writing', 'done', 'failed'].includes(m.phase)
}

export function parseMarker(raw: string | null | undefined): RestoreMarker | undefined {
  if (!raw) return undefined
  try {
    const m: unknown = JSON.parse(raw)
    return isMarker(m) ? m : undefined
  } catch {
    return undefined
  }
}

export function readMarker(storage: StorageLike): RestoreMarker | undefined {
  try {
    return parseMarker(storage.getItem(RESTORE_KEY))
  } catch {
    return undefined
  }
}

/** Throws (StorageError) if the marker cannot be written: an import must not start without it. */
export function writeMarker(storage: StorageLike, marker: RestoreMarker): void {
  writeVerified(storage, RESTORE_KEY, JSON.stringify(marker))
}

/** Another tab is restoring right now: this one must not start an import. */
export function restoreInProgressElsewhere(storage: StorageLike, now: number, own: ReadonlySet<string>): boolean {
  const m = readMarker(storage)
  return Boolean(m && m.phase === 'writing' && !own.has(m.id) && now - m.at < RESTORE_STALE_MS)
}

/**
 * What a tab does about the marker, given the one it saw when it loaded:
 *   'none'    nothing new (or a restore made by this very tab)
 *   'block'   another tab is writing: stop all interaction now
 *   'reload'  another tab finished (or abandoned) a restore since this tab loaded: reload from storage
 */
export function guardAction(current: RestoreMarker | undefined, atLoad: RestoreMarker | undefined, own: ReadonlySet<string>, now: number): 'none' | 'block' | 'reload' {
  if (!current || own.has(current.id)) return 'none'
  // Another tab is writing right now: block, even if this tab opened in the middle of it (it may have read old data).
  if (current.phase === 'writing' && now - current.at < RESTORE_STALE_MS) return 'block'
  if (atLoad && atLoad.id === current.id && atLoad.phase === current.phase) return 'none'
  return 'reload'
}

/** Ids of the restores started by this tab (module memory: one per page load). */
export const ownRestores = new Set<string>()
