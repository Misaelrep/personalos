import { describe, expect, it } from 'vitest'
import { applyWrites, changedSincePreview, overwrittenAfterImport, PRE_IMPORT_KEY } from './domain/apply'
import { createBackup } from './domain/create'
import { carrySelection, defaultSelection, planImport, plannedWrites, type ImportSelection } from './domain/plan'
import { guardAction, readMarker, restoreInProgressElsewhere, RESTORE_KEY, RESTORE_STALE_MS, writeMarker, type RestoreMarker } from './storage/restore'
import type { StorageLike } from './storage/storage'

/*
 * Two (or more) tabs of ELYUM on the same device share one localStorage. A
 * write in one tab reaches the others as a `storage` event — later, as a task.
 * `Origin` reproduces that: writes are immediate, events wait in a queue until
 * `deliver()`, and the tab that wrote never receives its own event.
 */
class Origin {
  map = new Map<string, string>()
  private queue: { key: string; from: Tab }[] = []
  tabs: Tab[] = []
  set(key: string, value: string, from: Tab) {
    this.map.set(key, value)
    this.queue.push({ key, from })
  }
  remove(key: string, from: Tab) {
    this.map.delete(key)
    this.queue.push({ key, from })
  }
  deliver() {
    const q = this.queue
    this.queue = []
    for (const e of q) for (const t of this.tabs) if (t !== e.from) t.onStorageEvent(e.key)
  }
}

abstract class Tab {
  storage: StorageLike
  constructor(readonly origin: Origin) {
    origin.tabs.push(this)
    const self = this
    this.storage = {
      get length() {
        return origin.map.size
      },
      key: (i) => [...origin.map.keys()][i] ?? null,
      getItem: (k) => origin.map.get(k) ?? null,
      setItem: (k, v) => origin.set(k, v, self),
      removeItem: (k) => origin.remove(k, self),
    }
  }
  abstract onStorageEvent(key: string): void
}

const DAY = 'personal-os:day:2026-10-27'
const day = (records: Record<string, unknown>) => JSON.stringify({ date: '2026-10-27', records })
const RESTORED = { 'tue-web-1000': { status: 'completado', objective: 'Restaurado de la copia' }, 'tue-wellness-1400': { status: 'parcial', pendingNote: 'Nota' } }

/**
 * A tab showing HOY, like the core: it reads the day once when it loads, keeps
 * it in memory and saves ALL of it on every change (DayProvider + dayReducer).
 * With `guarded`, it runs the same rule as <RestoreGuard>: blocked while
 * another tab writes (no interaction, so no save), reloaded when it ends.
 */
class DayTab extends Tab {
  state: { date: string; records: Record<string, unknown> }
  atLoad?: RestoreMarker
  blocked = false
  reloads = 0
  refused = 0
  constructor(origin: Origin, readonly guarded: boolean, readonly now: () => number) {
    super(origin)
    this.state = this.load()
  }
  load() {
    this.atLoad = readMarker(this.storage)
    const raw = this.storage.getItem(DAY)
    return raw ? JSON.parse(raw) : { date: '2026-10-27', records: {} }
  }
  /** A tap on HOY (e.g. completing a block). */
  dispatch(blockId: string, record: Record<string, unknown>): boolean {
    if (this.blocked) {
      this.refused++
      return false
    }
    this.state = { ...this.state, records: { ...this.state.records, [blockId]: record } }
    this.storage.setItem(DAY, JSON.stringify(this.state))
    return true
  }
  check() {
    if (!this.guarded) return
    const action = guardAction(readMarker(this.storage), this.atLoad, new Set(), this.now())
    if (action === 'none') {
      if (this.blocked) this.reload()
      return
    }
    this.blocked = true
    if (action === 'reload') this.reload()
  }
  reload() {
    this.reloads++
    this.blocked = false
    this.state = this.load()
  }
  onStorageEvent(key: string) {
    if (key === RESTORE_KEY) this.check()
  }
}

/** The tab where SISTEMA imports, doing what Copias.onApply does (marker → wait → write → marker). */
class ImportTab extends Tab {
  onStorageEvent() {}
}

const ALL: ImportSelection = { modules: ['core', 'learn', 'projects'], takeBackup: [DAY] }

/** A copy holding the restored day, made on another "device". */
async function copyWithRestoredDay() {
  const other = new Origin()
  const t = new ImportTab(other)
  t.storage.setItem(DAY, day(RESTORED))
  return createBackup(t.storage, new Date(2026, 9, 27, 21, 0))
}

let clock = 1_800_000_000_000
const now = () => clock

describe('two tabs — the hazard (what happens without a guard)', () => {
  it('a tab opened before the restore saves its old day over the restored one on its next tap', async () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, false, now)
    hoy.dispatch('tue-gym-1600', { status: 'completado' }) // the old day: one block
    const sistema = new ImportTab(origin)
    const file = await copyWithRestoredDay()
    const plan = planImport(file, sistema.storage)
    applyWrites(sistema.storage, plannedWrites(plan, ALL), clock)
    origin.deliver()
    expect(JSON.parse(origin.map.get(DAY)!).records).toEqual(RESTORED)
    hoy.dispatch('tue-meal-1220', { status: 'omitido' })
    // The restored records are gone: the stale tab wrote its whole old day back.
    expect(JSON.parse(origin.map.get(DAY)!).records).toEqual({ 'tue-gym-1600': { status: 'completado' }, 'tue-meal-1220': { status: 'omitido' } })
  })
})

describe('two tabs — with the guard', () => {
  async function restore(origin: Origin, sistema: ImportTab, between?: () => void) {
    const file = await copyWithRestoredDay()
    const plan = planImport(file, sistema.storage)
    const writes = plannedWrites(plan, ALL)
    writeMarker(sistema.storage, { id: 'r1', phase: 'writing', at: clock })
    origin.deliver() // other tabs hear the announcement (Copias waits 400 ms for this)
    between?.()
    expect(changedSincePreview(sistema.storage, writes)).toEqual([])
    const report = applyWrites(sistema.storage, writes, clock)
    writeMarker(sistema.storage, { id: 'r1', phase: 'done', at: clock })
    return { report, writes }
  }

  it('the other tab stops as soon as the restore is announced, and reloads the restored day when it ends', async () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, true, now)
    hoy.dispatch('tue-gym-1600', { status: 'completado' })
    const sistema = new ImportTab(origin)
    const { report, writes } = await restore(origin, sistema, () => {
      expect(hoy.blocked).toBe(true)
      // A tap during the restore is refused: the veil takes it, nothing is saved.
      expect(hoy.dispatch('tue-meal-1220', { status: 'omitido' })).toBe(false)
    })
    expect(report.ok).toBe(true)
    origin.deliver()
    expect(hoy.reloads).toBe(1)
    expect(hoy.blocked).toBe(false)
    expect(hoy.state.records).toEqual(RESTORED)
    // Once settled, everything still holds what was written.
    expect(overwrittenAfterImport(sistema.storage, writes)).toEqual([])
    // After reloading, a tap keeps the restored day and adds to it.
    hoy.dispatch('tue-meal-1220', { status: 'omitido' })
    expect(JSON.parse(origin.map.get(DAY)!).records).toEqual({ ...RESTORED, 'tue-meal-1220': { status: 'omitido' } })
  })

  it('a tab that missed the events (in the background) reloads when it comes back, before any tap', async () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, true, now)
    hoy.dispatch('tue-gym-1600', { status: 'completado' })
    const sistema = new ImportTab(origin)
    await restore(origin, sistema)
    // No deliver(): the events never reached it. Coming back to the foreground runs the same check.
    hoy.check()
    expect(hoy.reloads).toBe(1)
    expect(hoy.state.records).toEqual(RESTORED)
  })

  it('several tabs: every one of them stops and reloads', async () => {
    const origin = new Origin()
    const tabs = [new DayTab(origin, true, now), new DayTab(origin, true, now), new DayTab(origin, true, now)]
    const sistema = new ImportTab(origin)
    await restore(origin, sistema, () => expect(tabs.every((t) => t.blocked)).toBe(true))
    origin.deliver()
    expect(tabs.map((t) => t.reloads)).toEqual([1, 1, 1])
    expect(tabs.every((t) => JSON.stringify(t.state.records) === JSON.stringify(RESTORED))).toBe(true)
  })

  it('a restore that never ends (tab closed while writing) frees the others after a while: they reload', () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, true, now)
    const sistema = new ImportTab(origin)
    writeMarker(sistema.storage, { id: 'r9', phase: 'writing', at: clock })
    origin.deliver()
    expect(hoy.blocked).toBe(true)
    clock += RESTORE_STALE_MS + 1
    hoy.check()
    expect(hoy.reloads).toBe(1)
    expect(hoy.blocked).toBe(false)
  })

  it('a tab that opens after a restore is not disturbed by the old marker; a failed restore also reloads the others', () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    writeMarker(sistema.storage, { id: 'old', phase: 'done', at: clock - 86_400_000 })
    const late = new DayTab(origin, true, now)
    late.check()
    expect(late.reloads).toBe(0)
    expect(late.blocked).toBe(false)
    writeMarker(sistema.storage, { id: 'r2', phase: 'failed', at: clock })
    origin.deliver()
    expect(late.reloads).toBe(1)
  })

  it('a tab that opens in the middle of a restore is blocked too, and reloads when it ends', () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    writeMarker(sistema.storage, { id: 'r3', phase: 'writing', at: clock })
    const opened = new DayTab(origin, true, now) // loaded while the restore was being written
    opened.check()
    expect(opened.blocked).toBe(true)
    expect(opened.dispatch('x', {})).toBe(false)
    writeMarker(sistema.storage, { id: 'r3', phase: 'done', at: clock })
    origin.deliver()
    expect(opened.reloads).toBe(1)
    expect(opened.blocked).toBe(false)
  })

  it('a tab that opened during a restore that is then abandoned is freed (reloads), never left blocked', () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    writeMarker(sistema.storage, { id: 'r4', phase: 'writing', at: clock })
    const opened = new DayTab(origin, true, now)
    opened.check()
    expect(opened.blocked).toBe(true)
    clock += RESTORE_STALE_MS + 1
    opened.check()
    expect(opened.blocked).toBe(false)
    expect(opened.reloads).toBe(1)
    opened.check()
    expect(opened.reloads).toBe(1) // and it does not keep reloading
  })

  it('the importing tab ignores its own restore', () => {
    const marker: RestoreMarker = { id: 'mine', phase: 'writing', at: clock }
    expect(guardAction(marker, undefined, new Set(['mine']), clock)).toBe('none')
    expect(guardAction(marker, undefined, new Set(), clock)).toBe('block')
  })

  it('two imports cannot run at once: a tab sees the other restoring', () => {
    const origin = new Origin()
    const a = new ImportTab(origin)
    writeMarker(a.storage, { id: 'a1', phase: 'writing', at: clock })
    expect(restoreInProgressElsewhere(a.storage, clock, new Set(['a1']))).toBe(false)
    expect(restoreInProgressElsewhere(a.storage, clock, new Set())).toBe(true)
    expect(restoreInProgressElsewhere(a.storage, clock + RESTORE_STALE_MS + 1, new Set())).toBe(false)
    writeMarker(a.storage, { id: 'a1', phase: 'done', at: clock })
    expect(restoreInProgressElsewhere(a.storage, clock, new Set())).toBe(false)
  })

  it('if a write still slips over the restored data, it is detected and reported, never accepted silently', async () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    const { writes } = await restore(origin, sistema)
    const rogue = new DayTab(origin, false, now) // e.g. a tab of an old version, without the guard
    rogue.state = { date: '2026-10-27', records: {} }
    rogue.dispatch('x', {})
    expect(overwrittenAfterImport(sistema.storage, writes)).toEqual([DAY])
  })
})

describe('import — the device changed after the preview', () => {
  it('nothing is written (not even the safety copy) and the changed keys are reported', async () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, false, now)
    const sistema = new ImportTab(origin)
    const file = await copyWithRestoredDay()
    const plan = planImport(file, sistema.storage) // preview: the day is new here
    const writes = plannedWrites(plan, ALL)
    hoy.dispatch('tue-gym-1600', { status: 'completado' }) // …then HOY records something
    const before = new Map(origin.map)
    const report = applyWrites(sistema.storage, writes, clock)
    expect(report).toMatchObject({ ok: false, written: 0, changed: [DAY], failure: { kind: 'stale' } })
    expect(origin.map).toEqual(before)
    expect(origin.map.has(PRE_IMPORT_KEY)).toBe(false)
  })

  it('a chosen conflict whose value here changed since the preview is not overwritten', async () => {
    const origin = new Origin()
    const hoy = new DayTab(origin, false, now)
    hoy.dispatch('tue-gym-1600', { status: 'completado' })
    const sistema = new ImportTab(origin)
    const file = await copyWithRestoredDay()
    const plan = planImport(file, sistema.storage) // conflict, copy chosen
    hoy.dispatch('tue-meal-1220', { status: 'omitido' }) // newer data
    const report = applyWrites(sistema.storage, plannedWrites(plan, ALL), clock)
    expect(report.ok).toBe(false)
    expect(JSON.parse(origin.map.get(DAY)!).records).toHaveProperty('tue-meal-1220')
  })

  it('the entry heartbeat (lastActiveAt, every 30 s in every tab) is not a change; any other field is', async () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    sistema.storage.setItem('personal-os:entry', JSON.stringify({ dailyEntrySeenDate: '2026-10-26', lastActiveAt: 1 }))
    const other = new Origin()
    const src = new ImportTab(other)
    src.storage.setItem('personal-os:entry', JSON.stringify({ dailyEntrySeenDate: '2026-10-20', lastActiveAt: 9 }))
    const file = await createBackup(src.storage, new Date())
    const plan = planImport(file, sistema.storage)
    const writes = plannedWrites(plan, { modules: ['core'], takeBackup: ['personal-os:entry'] })
    sistema.storage.setItem('personal-os:entry', JSON.stringify({ lastActiveAt: 2, dailyEntrySeenDate: '2026-10-26' }))
    expect(changedSincePreview(sistema.storage, writes)).toEqual([])
    sistema.storage.setItem('personal-os:entry', JSON.stringify({ dailyEntrySeenDate: '2026-10-27', lastActiveAt: 3 }))
    expect(changedSincePreview(sistema.storage, writes)).toEqual(['personal-os:entry'])
  })

  it('the new preview keeps the person’s choices where they still apply', async () => {
    const origin = new Origin()
    const sistema = new ImportTab(origin)
    const file = await copyWithRestoredDay()
    sistema.storage.setItem(DAY, day({ a: {} }))
    const plan = planImport(file, sistema.storage)
    expect(carrySelection(plan, { modules: ['core'], takeBackup: [DAY, 'personal-os:day:1999-01-01'] })).toEqual({ modules: ['core'], takeBackup: [DAY] })
    const now = planImport(file, new ImportTab(new Origin()).storage) // the day is no longer a conflict
    expect(carrySelection(now, { modules: ['core'], takeBackup: [DAY] }).takeBackup).toEqual([])
    expect(defaultSelection(now).modules).toEqual(['core'])
  })
})
