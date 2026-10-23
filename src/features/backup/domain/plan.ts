import type { StorageLike } from '../storage/storage'
import { collectModules } from './collect'
import { MODULE_IDS, type BackupFile, type ModuleId } from './format'

/**
 * What importing a copy would do, key by key, before anything is written:
 *
 *   new         only in the copy            → added (if its module is selected)
 *   identical   in both, same text          → nothing (a duplicate)
 *   conflict    in both, different text     → this device's is kept, unless the copy's is chosen explicitly
 *   local-only  only on this device         → kept: an import never deletes
 *
 * One kind of conflict is different: a day that exists here but holds nothing
 * (no block recorded, no Focus, no moved meditation). Opening ELYUM creates
 * today like that, so on a new device the copy's real day would otherwise lose
 * to an empty one. It is marked `localEmpty` and comes pre-selected for the
 * copy — visibly, in the preview, and the empty value is still set aside.
 */
export type EntryKind = 'new' | 'identical' | 'conflict' | 'local-only'

export interface PlanEntry {
  key: string
  module: ModuleId
  kind: EntryKind
  backup?: string
  local?: string
  /** A conflict whose value here carries no information (an untouched day). */
  localEmpty?: boolean
}

export interface ModulePlan {
  module: ModuleId
  entries: PlanEntry[]
  counts: Record<EntryKind, number>
}

export interface ImportPlan {
  modules: Record<ModuleId, ModulePlan>
}

export interface ImportSelection {
  /** Modules whose data is restored. A module left out is not touched at all. */
  modules: ModuleId[]
  /** Conflicting keys for which the copy's value is chosen over this device's. */
  takeBackup: string[]
}

export interface PlannedWrite {
  key: string
  value: string
  /** What the key holds now (null: it does not exist). */
  previous: string | null
}

const zero = (): Record<EntryKind, number> => ({ new: 0, identical: 0, conflict: 0, 'local-only': 0 })

export function planImport(file: BackupFile, storage: StorageLike): ImportPlan {
  const local = collectModules(storage)
  const modules = {} as Record<ModuleId, ModulePlan>
  for (const id of MODULE_IDS) {
    const fromCopy = file.modules[id].keys
    const here = local[id].keys
    const entries: PlanEntry[] = []
    for (const key of Object.keys(fromCopy).sort()) {
      const backup = fromCopy[key]
      const mine = here[key]
      if (mine === undefined) entries.push({ key, module: id, kind: 'new', backup })
      else if (mine === backup) entries.push({ key, module: id, kind: 'identical', backup, local: mine })
      else entries.push({ key, module: id, kind: 'conflict', backup, local: mine, ...(isUntouchedDay(key, mine) ? { localEmpty: true } : {}) })
    }
    for (const key of Object.keys(here).sort())
      if (fromCopy[key] === undefined) entries.push({ key, module: id, kind: 'local-only', local: here[key] })
    const counts = zero()
    for (const e of entries) counts[e.kind]++
    modules[id] = { module: id, entries, counts }
  }
  return { modules }
}

/** A stored day with nothing in it: no record, no Focus, no moved meditation. */
export function isUntouchedDay(key: string, value: string): boolean {
  if (!key.startsWith('personal-os:day:')) return false
  try {
    const d = JSON.parse(value) as { records?: unknown; focus?: unknown; meditationMoved?: unknown }
    const records = d.records
    return (
      typeof records === 'object' && records !== null && !Array.isArray(records) && Object.keys(records).length === 0 && d.focus === undefined && !d.meditationMoved
    )
  } catch {
    return false
  }
}

/**
 * By default: every module with something new (or an untouched day to fill) is
 * restored; every conflict keeps this device's value, except an untouched day.
 */
export function defaultSelection(plan: ImportPlan): ImportSelection {
  const takeBackup = MODULE_IDS.flatMap((id) => plan.modules[id].entries.filter((e) => e.localEmpty).map((e) => e.key))
  return {
    modules: MODULE_IDS.filter((id) => plan.modules[id].counts.new > 0 || plan.modules[id].entries.some((e) => e.localEmpty)),
    takeBackup,
  }
}

/**
 * A person's choices, carried over to a new preview of the same copy (after
 * this device changed): the same modules; a chosen conflict stays chosen only
 * if it is still a conflict; untouched days are pre-selected as always.
 */
export function carrySelection(plan: ImportPlan, previous: ImportSelection): ImportSelection {
  const conflicts = new Set(MODULE_IDS.flatMap((id) => plan.modules[id].entries.filter((e) => e.kind === 'conflict').map((e) => e.key)))
  const base = defaultSelection(plan)
  return {
    modules: [...new Set([...previous.modules, ...base.modules])].filter((id) => MODULE_IDS.includes(id)),
    takeBackup: [...new Set([...previous.takeBackup.filter((k) => conflicts.has(k)), ...base.takeBackup])],
  }
}

/** The writes a selection means. Only new keys and explicitly chosen conflicts; never a deletion. */
export function plannedWrites(plan: ImportPlan, selection: ImportSelection): PlannedWrite[] {
  const chosen = new Set(selection.takeBackup)
  const writes: PlannedWrite[] = []
  for (const id of selection.modules) {
    for (const e of plan.modules[id].entries) {
      if (e.kind === 'new') writes.push({ key: e.key, value: e.backup!, previous: null })
      else if (e.kind === 'conflict' && chosen.has(e.key)) writes.push({ key: e.key, value: e.backup!, previous: e.local! })
    }
  }
  return writes
}

/** Totals of a plan, all modules together. */
export function planTotals(plan: ImportPlan): Record<EntryKind, number> {
  const totals = zero()
  for (const id of MODULE_IDS) for (const k of Object.keys(totals) as EntryKind[]) totals[k] += plan.modules[id].counts[k]
  return totals
}
