import { describe, expect, it } from 'vitest'
import { applyWrites, PRE_IMPORT_KEY } from './domain/apply'
import { canonicalJson } from './domain/canonical'
import { collectModules, moduleOf } from './domain/collect'
import { backupFileName, createBackup, localIsoString, serializeBackup } from './domain/create'
import { keyLabel, valueSummary } from './domain/describe'
import { BACKUP_VERSION, type BackupFile } from './domain/format'
import { sha256Hex } from './domain/integrity'
import { parseBackup } from './domain/parse'
import { defaultSelection, planImport, plannedWrites, planTotals } from './domain/plan'
import { checkStorage, daysSince, loadMeta, saveMeta, SYSTEM_KEYS } from './storage/system'
import { listKeys, type StorageLike } from './storage/storage'

/** In-memory storage that can be told to fail, like a full or blocked localStorage. */
class FakeStorage implements StorageLike {
  map = new Map<string, string>()
  writes: string[] = []
  removals: string[] = []
  /** Throw a quota error when writing this key (or after N successful writes). */
  failOn?: string
  failAfter?: number
  /** Store a different value than asked (a storage that corrupts writes). */
  corruptOn?: string
  unavailable = false

  constructor(entries: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v)
  }
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    if (this.unavailable) throw new Error('SecurityError')
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    if (this.unavailable) throw new Error('SecurityError')
    if (k === this.failOn || (this.failAfter !== undefined && this.writes.length >= this.failAfter)) {
      const e = new Error('quota') as Error & { code: number }
      e.name = 'QuotaExceededError'
      e.code = 22
      throw e
    }
    this.writes.push(k)
    this.map.set(k, k === this.corruptOn ? `${v}!` : v)
  }
  removeItem(k: string) {
    this.removals.push(k)
    this.map.delete(k)
  }
  snapshot() {
    return Object.fromEntries(this.map)
  }
}

const day = (date: string, records: Record<string, unknown>) => JSON.stringify({ date, records })

/** A device with data of every module, simulations and foreign keys mixed in. */
const device = () =>
  new FakeStorage({
    'personal-os:day:2026-10-20': day('2026-10-20', { 'tue-web-1000': { status: 'completado', outcome: 'si', objective: 'Probar el formulario' } }),
    'personal-os:day:2026-10-21': day('2026-10-21', { 'wed-wellness-1000': { status: 'parcial', outcome: 'parcial', pendingNote: 'Cerrar el texto' } }),
    'personal-os:entry': JSON.stringify({ dailyEntrySeenDate: '2026-10-21', lastActiveAt: 1_790_000_000_000 }),
    'elyum:learn:v1:state': JSON.stringify({ v: 1, data: { draft: 'ñandú · “comillas” · emoji 🌅' } }),
    'elyum:learn:v1:sim:state': JSON.stringify({ v: 1, data: { draft: 'simulado' } }),
    'personal-os:sim:day:2026-10-20': day('2026-10-20', { x: {} }),
    'personal-os:sim:entry': '{}',
    'elyum:system:v1:meta': '{}',
    'other-app:token': 'secret',
    // A value the core could not even parse: copied anyway, literally.
    'personal-os:day:2026-10-19': '{not json',
  })

const NOW = new Date(2026, 9, 25, 21, 4, 0)

describe('backup — what belongs to a copy', () => {
  it('classifies keys by module, leaving out simulations, SISTEMA and other apps', () => {
    expect(moduleOf('personal-os:day:2026-10-20')).toBe('core')
    expect(moduleOf('personal-os:entry')).toBe('core')
    expect(moduleOf('elyum:learn:v1:state')).toBe('learn')
    expect(moduleOf('elyum:projects:v1:data')).toBe('projects')
    for (const k of ['personal-os:sim:day:2026-10-20', 'personal-os:sim:entry', 'elyum:learn:v1:sim:state', 'elyum:projects:v1:sim:data', 'elyum:system:v1:meta', 'other-app:token', 'personal-os:dayx'])
      expect(moduleOf(k), k).toBeNull()
  })

  it('collects the literal stored strings, by module', () => {
    const m = collectModules(device())
    expect(Object.keys(m.core.keys).sort()).toEqual(['personal-os:day:2026-10-19', 'personal-os:day:2026-10-20', 'personal-os:day:2026-10-21', 'personal-os:entry'])
    expect(Object.keys(m.learn.keys)).toEqual(['elyum:learn:v1:state'])
    expect(m.projects.keys).toEqual({})
    expect(m.core.keys['personal-os:day:2026-10-19']).toBe('{not json')
  })
})

describe('backup — the file', () => {
  it('canonical JSON does not depend on key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 'x'], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, 'x'] }, b: 1 }))
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('SHA-256 is the standard one', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('is versioned, counted and signed; local time with offset; dated file name', async () => {
    const file = await createBackup(device(), NOW, 'iPhone')
    expect(file).toMatchObject({ schema: 'elyum.backup', version: BACKUP_VERSION, device: 'iPhone', counts: { core: 4, learn: 1, projects: 0 } })
    expect(file.createdAt).toBe(localIsoString(NOW))
    expect(file.createdAt.startsWith('2026-10-25T21:04:00')).toBe(true)
    expect(file.integrity.total).toMatch(/^[0-9a-f]{64}$/)
    expect(backupFileName(NOW)).toBe('elyum-copia-2026-10-25-2104.json')
  })

  it('the same data always gives the same hash', async () => {
    const a = await createBackup(device(), NOW)
    const b = await createBackup(device(), new Date(2027, 0, 1))
    expect(a.integrity).toEqual(b.integrity)
  })
})

describe('backup — reading a copy (any doubt: rejected, nothing written)', () => {
  const text = async () => serializeBackup(await createBackup(device(), NOW))

  it('reads back exactly what was written', async () => {
    const original = await createBackup(device(), NOW)
    const parsed = await parseBackup(serializeBackup(original))
    expect(parsed.ok && parsed.file).toEqual(original)
  })

  it('a single changed character is detected', async () => {
    const t = await text()
    const tampered = t.replace('Probar el formulario', 'Probar el formularia')
    expect(tampered).not.toBe(t)
    const r = await parseBackup(tampered)
    expect(r).toMatchObject({ ok: false, kind: 'integrity' })
    expect(!r.ok && r.message).toContain('Días')
  })

  it('a removed key is detected (counts), and so is a re-counted one (integrity)', async () => {
    const file = JSON.parse(await text()) as BackupFile
    delete file.modules.core.keys['personal-os:entry']
    expect(await parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, kind: 'counts' })
    file.counts.core = 3
    expect(await parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, kind: 'integrity' })
  })

  it('rejects other files, future versions, foreign keys and broken JSON', async () => {
    const file = JSON.parse(await text()) as BackupFile & Record<string, unknown>
    expect(await parseBackup('{"a":')).toMatchObject({ ok: false, kind: 'json' })
    expect(await parseBackup(JSON.stringify({ ...file, schema: 'otra.cosa' }))).toMatchObject({ ok: false, kind: 'schema' })
    expect(await parseBackup(JSON.stringify({ ...file, version: 2 }))).toMatchObject({ ok: false, kind: 'version-future' })
    expect(await parseBackup(JSON.stringify({ ...file, version: 0 }))).toMatchObject({ ok: false, kind: 'version' })
    const foreign = structuredClone(file)
    foreign.modules.core.keys['other-app:token'] = 'x'
    expect(await parseBackup(JSON.stringify(foreign))).toMatchObject({ ok: false, kind: 'foreign-key' })
    const sim = structuredClone(file)
    sim.modules.core.keys['personal-os:sim:day:2026-10-20'] = 'x'
    expect(await parseBackup(JSON.stringify(sim))).toMatchObject({ ok: false, kind: 'foreign-key' })
    const misplaced = structuredClone(file)
    misplaced.modules.learn.keys['personal-os:entry'] = 'x'
    expect(await parseBackup(JSON.stringify(misplaced))).toMatchObject({ ok: false, kind: 'foreign-key' })
    const nonString = structuredClone(file) as unknown as { modules: { core: { keys: Record<string, unknown> } } }
    nonString.modules.core.keys['personal-os:entry'] = { x: 1 }
    expect(await parseBackup(JSON.stringify(nonString))).toMatchObject({ ok: false, kind: 'shape' })
  })
})

describe('backup — import preview', () => {
  it('a copy into an empty device: everything new, nothing else', async () => {
    const file = await createBackup(device(), NOW)
    const plan = planImport(file, new FakeStorage())
    expect(planTotals(plan)).toEqual({ new: 5, identical: 0, conflict: 0, 'local-only': 0 })
    expect(defaultSelection(plan)).toEqual({ modules: ['core', 'learn'], takeBackup: [] })
  })

  it('distinguishes duplicates, conflicts and data only on this device', async () => {
    const file = await createBackup(device(), NOW)
    const here = new FakeStorage({
      'personal-os:day:2026-10-20': device().getItem('personal-os:day:2026-10-20')!, // identical
      'personal-os:day:2026-10-21': day('2026-10-21', { 'wed-wellness-1000': { status: 'completado' } }), // conflict
      'personal-os:day:2026-10-22': day('2026-10-22', {}), // only here
    })
    const plan = planImport(file, here)
    const kinds = Object.fromEntries(plan.modules.core.entries.map((e) => [e.key, e.kind]))
    expect(kinds).toEqual({
      'personal-os:day:2026-10-19': 'new',
      'personal-os:day:2026-10-20': 'identical',
      'personal-os:day:2026-10-21': 'conflict',
      'personal-os:entry': 'new',
      'personal-os:day:2026-10-22': 'local-only',
    })
  })

  it('by default a conflict keeps this device’s value; the copy wins only when chosen', async () => {
    const file = await createBackup(device(), NOW)
    const mine = day('2026-10-21', { 'wed-wellness-1000': { status: 'omitido' } })
    const here = new FakeStorage({ 'personal-os:day:2026-10-21': mine })
    const plan = planImport(file, here)
    const byDefault = plannedWrites(plan, defaultSelection(plan))
    expect(byDefault.map((w) => w.key)).not.toContain('personal-os:day:2026-10-21')
    const chosen = plannedWrites(plan, { modules: ['core'], takeBackup: ['personal-os:day:2026-10-21'] })
    expect(chosen.find((w) => w.key === 'personal-os:day:2026-10-21')).toMatchObject({ previous: mine })
  })

  it('an untouched day here (as ELYUM creates today on opening) is pre-selected for the copy, visibly', async () => {
    const file = await createBackup(device(), NOW)
    const here = new FakeStorage({
      'personal-os:day:2026-10-20': JSON.stringify({ date: '2026-10-20', records: {} }), // untouched → copy pre-selected
      'personal-os:day:2026-10-21': JSON.stringify({ date: '2026-10-21', records: {}, meditationMoved: true }), // something done → kept
    })
    const plan = planImport(file, here)
    const byKey = Object.fromEntries(plan.modules.core.entries.map((e) => [e.key, e]))
    expect(byKey['personal-os:day:2026-10-20']).toMatchObject({ kind: 'conflict', localEmpty: true })
    expect(byKey['personal-os:day:2026-10-21'].localEmpty).toBeUndefined()
    const sel = defaultSelection(plan)
    expect(sel.takeBackup).toEqual(['personal-os:day:2026-10-20'])
    const w = plannedWrites(plan, sel).find((x) => x.key === 'personal-os:day:2026-10-20')
    expect(w?.previous).toBe(JSON.stringify({ date: '2026-10-20', records: {} }))
  })

  it('a module left out is not touched, and a chosen conflict outside the selection is ignored', async () => {
    const file = await createBackup(device(), NOW)
    const plan = planImport(file, new FakeStorage({ 'elyum:learn:v1:state': 'mine' }))
    const writes = plannedWrites(plan, { modules: ['core'], takeBackup: ['elyum:learn:v1:state'] })
    expect(writes.every((w) => w.key.startsWith('personal-os:'))).toBe(true)
  })
})

describe('backup — applying an import', () => {
  it('restores byte for byte into an empty device: the re-export has the same hash', async () => {
    const original = await createBackup(device(), NOW)
    const target = new FakeStorage()
    const parsed = await parseBackup(serializeBackup(original))
    if (!parsed.ok) throw new Error(parsed.message)
    const plan = planImport(parsed.file, target)
    const report = applyWrites(target, plannedWrites(plan, { modules: ['core', 'learn', 'projects'], takeBackup: [] }), NOW.getTime())
    expect(report).toMatchObject({ ok: true, written: 5, localSafetyCopy: true })
    const again = await createBackup(target, NOW)
    expect(again.integrity).toEqual(original.integrity)
    for (const [k, v] of Object.entries(original.modules.core.keys)) expect(target.getItem(k)).toBe(v)
  })

  it('importing the same copy twice changes nothing the second time', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage()
    applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core', 'learn', 'projects'], takeBackup: [] }), 1)
    const plan = planImport(file, target)
    expect(planTotals(plan)).toEqual({ new: 0, identical: 5, conflict: 0, 'local-only': 0 })
    expect(plannedWrites(plan, defaultSelection(plan))).toEqual([])
  })

  it('never deletes or touches data that is only on this device, nor foreign or simulated keys', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage({ 'personal-os:day:2026-10-22': 'mine', 'personal-os:sim:entry': 'sim', 'other-app:token': 'x' })
    const before = target.snapshot()
    applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core', 'learn', 'projects'], takeBackup: [] }), 1)
    for (const [k, v] of Object.entries(before)) expect(target.getItem(k)).toBe(v)
    expect(target.removals).toEqual([])
    expect(target.writes.every((k) => k === PRE_IMPORT_KEY || k.startsWith('personal-os:day:') || k === 'personal-os:entry' || k.startsWith('elyum:learn:v1:'))).toBe(true)
  })

  it('keeps the replaced values aside on this device before writing', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage({ 'personal-os:entry': 'mine' })
    applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core'], takeBackup: ['personal-os:entry'] }), 42)
    const aside = JSON.parse(target.getItem(PRE_IMPORT_KEY)!)
    expect(aside).toMatchObject({ at: 42, replaced: { 'personal-os:entry': 'mine' } })
    expect(aside.added).toContain('personal-os:day:2026-10-20')
  })

  it('storage full halfway: everything this import wrote is put back, and the failure is reported', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage({ 'personal-os:entry': 'mine', 'personal-os:day:2026-10-22': 'only here' })
    const before = target.snapshot()
    target.failOn = 'personal-os:day:2026-10-21'
    const writes = plannedWrites(planImport(file, target), { modules: ['core', 'learn'], takeBackup: ['personal-os:entry'] })
    const report = applyWrites(target, writes, 1)
    expect(report).toMatchObject({ ok: false, rolledBack: true, rollbackFailures: [], failure: { kind: 'quota', key: 'personal-os:day:2026-10-21' } })
    const after = target.snapshot()
    delete after[PRE_IMPORT_KEY]
    expect(after).toEqual(before)
  })

  it('when the failing write would have replaced a value, that value is reported as intact (it never changed)', async () => {
    const file = await createBackup(device(), NOW)
    const mine = day('2026-10-20', { x: { status: 'omitido' } })
    const target = new FakeStorage({ 'personal-os:day:2026-10-20': mine })
    target.failOn = 'personal-os:day:2026-10-20'
    const report = applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core'], takeBackup: ['personal-os:day:2026-10-20'] }), 1)
    expect(report).toMatchObject({ ok: false, rolledBack: true, rollbackFailures: [] })
    expect(target.getItem('personal-os:day:2026-10-20')).toBe(mine)
  })

  it('a storage that does not keep what it is given is caught by reading back', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage()
    target.corruptOn = 'personal-os:entry'
    const report = applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core'], takeBackup: [] }), 1)
    expect(report).toMatchObject({ ok: false, failure: { kind: 'mismatch', key: 'personal-os:entry' }, rolledBack: true })
    expect(listKeys(target).filter((k) => k.startsWith('personal-os:'))).toEqual([])
  })

  it('if even the local safety copy cannot be written, the import still runs on the external copy', async () => {
    const file = await createBackup(device(), NOW)
    const target = new FakeStorage()
    target.failOn = PRE_IMPORT_KEY
    const report = applyWrites(target, plannedWrites(planImport(file, target), { modules: ['core'], takeBackup: [] }), 1)
    expect(report).toMatchObject({ ok: true, localSafetyCopy: false, written: 4 })
  })

  it('a year of days and a large projects store stay quick', async () => {
    const big = new FakeStorage()
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i)
      const key = `personal-os:day:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      big.setItem(key, day(key.slice(16), { a: { status: 'completado', objective: 'x'.repeat(100) }, b: { status: 'omitido' } }))
    }
    big.setItem('elyum:projects:v1:data', JSON.stringify({ tasks: Array.from({ length: 1000 }, (_, i) => ({ id: `T-${i}`, title: 'y'.repeat(120) })) }))
    const t0 = performance.now()
    const file = await createBackup(big, NOW)
    const parsed = await parseBackup(serializeBackup(file))
    const target = new FakeStorage()
    if (!parsed.ok) throw new Error(parsed.message)
    const report = applyWrites(target, plannedWrites(planImport(parsed.file, target), { modules: ['core', 'learn', 'projects'], takeBackup: [] }), 1)
    expect(report.ok && report.written).toBe(366)
    expect(performance.now() - t0).toBeLessThan(3000)
  })
})

describe('backup — storage health and SISTEMA memory', () => {
  it('a working storage is reported as such', () => {
    expect(checkStorage(new FakeStorage(), 1)).toEqual({ ok: true })
  })

  it('a full storage, a blocked one and a missing one are visible failures', () => {
    const full = new FakeStorage()
    full.failOn = SYSTEM_KEYS.health
    expect(checkStorage(full, 1)).toMatchObject({ ok: false, kind: 'quota' })
    const blocked = new FakeStorage()
    blocked.unavailable = true
    expect(checkStorage(blocked, 1)).toMatchObject({ ok: false, kind: 'unavailable' })
    expect(checkStorage(undefined, 1)).toMatchObject({ ok: false, kind: 'unavailable' })
  })

  it('remembers the last export and import; unreadable memory is simply empty', () => {
    const s = new FakeStorage()
    expect(saveMeta(s, { lastExport: { at: 10, hash: 'abc' } })).toBe(true)
    expect(saveMeta(s, { lastImport: { at: 20, hash: 'def', written: 3 } })).toBe(true)
    expect(loadMeta(s)).toEqual({ lastExport: { at: 10, hash: 'abc' }, lastImport: { at: 20, hash: 'def', written: 3 } })
    s.setItem(SYSTEM_KEYS.meta, '{broken')
    expect(loadMeta(s)).toEqual({})
    const full = new FakeStorage()
    full.failOn = SYSTEM_KEYS.meta
    expect(saveMeta(full, { lastExport: { at: 1, hash: 'x' } })).toBe(false)
  })

  it('counts local calendar days', () => {
    expect(daysSince(new Date(2026, 9, 25, 23, 50).getTime(), new Date(2026, 9, 26, 0, 10).getTime())).toBe(1)
    expect(daysSince(new Date(2026, 9, 25, 8).getTime(), new Date(2026, 9, 25, 22).getTime())).toBe(0)
  })
})

describe('backup — how the preview names things', () => {
  it('names days, the entry and APRENDER in words; summarizes days by their records', () => {
    expect(keyLabel('personal-os:day:2026-10-20')).toBe('Día 20/10/2026')
    expect(keyLabel('personal-os:entry')).toBe('Entrada diaria')
    expect(keyLabel('elyum:learn:v1:state')).toBe('Aprender · intención y borrador')
    expect(valueSummary('personal-os:day:2026-10-20', day('2026-10-20', { a: {}, b: {} }))).toMatch(/^2 bloques registrados · \d+ B$/)
    expect(valueSummary('personal-os:day:2026-10-19', '{not json')).toMatch(/^ilegible/)
  })
})

describe('backup — an import is never cut by an update reload', () => {
  it('no update is offered while SISTEMA prepares or writes an import', async () => {
    const { isUpdateMoment } = await import('../../pwa/moment')
    const rest = { phase: 'today' as const, focusOpen: false, entryActive: false, immersive: false }
    expect(isUpdateMoment(rest)).toBe(true)
    expect(isUpdateMoment({ ...rest, systemBusy: false })).toBe(true)
    expect(isUpdateMoment({ ...rest, systemBusy: true })).toBe(false)
  })
})
