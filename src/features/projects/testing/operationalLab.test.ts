import { describe, expect, it } from 'vitest'
import { LAB_KEY, LAB_PATH, openOperationalLab, type LabOptions, type LabStorage } from './operationalLab'
import { createStore, DATA_KEY, PREV_KEYS, type Locks } from '../store/store'
import { exportProjects } from '../store/export'
import { dismissJournal, inspectJournal, JOURNAL_KEY, journalAsCopy, performRestore, planRestore, readBackup, settleJournal } from '../store/restore'
import { loseProject, localChange } from '../ui/sandbox'
import { ProjectsSession } from '../store/session'

class Storage implements LabStorage {
  map = new Map<string, string>()
  fail?: (key: string, value: string) => boolean
  get length() { return this.map.size }
  key = (i: number) => [...this.map.keys()][i] ?? null
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => { if (this.fail?.(k, v)) throw new Error('interrupted'); this.map.set(k, v) }
  removeItem = (k: string) => { this.map.delete(k) }
  snapshot = () => JSON.stringify([...this.map].sort())
}
function locks(): Locks {
  const tails = new Map<string, Promise<void>>()
  const held = new Set<string>()
  return { async request(name, options, fn) {
    if (options.ifAvailable && held.has(name)) return fn(null)
    const prev = tails.get(name) ?? Promise.resolve()
    let release!: () => void
    tails.set(name, new Promise<void>((r) => { release = r }))
    await prev; held.add(name)
    try { return await fn({ name }) } finally { held.delete(name); release() }
  } }
}
let seq = 0
const now = () => '2026-11-02T18:00:00Z'
const options = (): LabOptions & { storage: Storage } => ({ dev: true, location: { hostname: '127.0.0.1', pathname: LAB_PATH }, storage: new Storage(), locks: locks(), now, random: () => `synthetic-${++seq}` })
const load = async (env: Parameters<typeof createStore>[0]) => {
  const l = await createStore(env).load(); if (l.kind !== 'ok') throw new Error(l.kind); return l
}
const backup = async (env: Parameters<typeof createStore>[0]) => {
  const r = await readBackup((await exportProjects(env.storage, now())).text); if (!r.ok) throw new Error(r.message); return r.backup
}

describe('operational-key lab: only a disposable synthetic origin', () => {
  for (const change of [
    (o: LabOptions) => { o.dev = false },
    (o: LabOptions) => { o.location.hostname = 'elyum.vercel.app' },
    (o: LabOptions) => { o.location.pathname = '/proyectos.html' },
    (o: LabOptions) => { o.locks = undefined },
  ]) it('refuses an unauthorized entry without writing', async () => {
    const o = options(); change(o); const before = o.storage.snapshot()
    await expect(openOperationalLab(o)).rejects.toThrow()
    expect(o.storage.snapshot()).toBe(before)
  })
  for (const key of [DATA_KEY, 'personal-os:day:synthetic-sentinel']) it('refuses any prepopulated origin without clearing it', async () => {
    const o = options(); o.storage.setItem(key, 'synthetic sentinel'); const before = o.storage.snapshot()
    await expect(openOperationalLab(o)).rejects.toThrow('no está vacío')
    expect(o.storage.snapshot()).toBe(before)
  })
  it('seeds exactly the operative data key and a lab marker; refuses copies from another run', async () => {
    const o = options(); const lab = await openOperationalLab(o); const env = lab.target.createEnv()
    expect([...o.storage.map.keys()].sort()).toEqual([DATA_KEY, LAB_KEY].sort())
    expect((await load(env)).data.projects).toHaveLength(6)
    expect(lab.target.accepts(await backup(env))).toBe(true)
    const foreign = await openOperationalLab(options())
    expect(lab.target.accepts(await backup(foreign.target.createEnv()))).toBe(false)
    const plain = await backup(env); delete (plain.data as unknown as Record<string, unknown>).syntheticRecoveryLab
    expect(lab.target.accepts(plain)).toBe(false)
    expect(() => env.storage.setItem('personal-os:day:sentinel', 'x')).toThrow()
    expect(() => env.storage.removeItem(DATA_KEY)).toThrow()
  })
  it('recovers and undoes using the same operative data+journal and refreshes a normal session', async () => {
    const o = options(); const lab = await openOperationalLab(o); const env = lab.target.createEnv()
    const first = await load(env); const copy = await backup(env)
    await createStore(env).save(loseProject(first.data, first.data.projects[0].id), first.generation)
    const damaged = await load(env)
    expect(await performRestore(env, planRestore(damaged.data, damaged.generation, copy), { mode: 'seleccion', units: [`proyecto:${first.data.projects[0].id}`] })).toMatchObject({ ok: true })
    const session = new ProjectsSession(createStore(env), now)
    expect(await session.open()).toMatchObject({ status: 'listo', generation: 3 })
    expect((await load(env)).data.projects).toHaveLength(6)
    const journal = await inspectJournal(env.storage); if (journal.kind !== 'cerrada') throw new Error(journal.kind)
    const undo = await readBackup((await journalAsCopy(journal.journal))!)
    if (!undo.ok) throw new Error(undo.message)
    expect(lab.target.accepts(undo.backup)).toBe(true)
    const current = await load(env)
    expect(await performRestore(env, planRestore(current.data, current.generation, undo.backup), { mode: 'todo' })).toMatchObject({ ok: true })
    expect((await load(env)).data.projects).toHaveLength(5)
    expect([...o.storage.map.keys()].every((k) => [DATA_KEY, JOURNAL_KEY, LAB_KEY, ...PREV_KEYS].includes(k))).toBe(true)
  })
  it('another tab sees the same run; stale recovery cannot overwrite its edit', async () => {
    const o = options(); const a = await openOperationalLab(o); const b = await openOperationalLab(o)
    expect(a.run).toBe(b.run)
    const env = a.target.createEnv(); const l = await load(env); const plan = planRestore(l.data, l.generation, await backup(env))
    await createStore(b.target.createEnv()).save(localChange(l.data, now), l.generation)
    const before = o.storage.snapshot()
    expect(await performRestore(env, plan, { mode: 'todo' })).toMatchObject({ ok: false, reason: 'conflicto' })
    expect(o.storage.snapshot()).toBe(before)
  })
  it('reopening after interruption blocks normal edits and resolves the operative journal', async () => {
    const o = options(); const a = await openOperationalLab(o); const env = a.target.createEnv(); const l = await load(env)
    const copy = await backup(env)
    let dead = false
    o.storage.fail = (key) => { if (dead) return true; if (key === JOURNAL_KEY) dead = true; return false }
    await performRestore(env, planRestore(l.data, l.generation, copy), { mode: 'todo' })
    o.storage.fail = undefined
    const b = await openOperationalLab(o); const store = createStore(b.target.createEnv())
    expect(await store.pending()).toMatch(/sin resolver/)
    const before = o.storage.snapshot()
    expect(await store.save(l.data, l.generation)).toMatchObject({ ok: false, reason: 'recuperacion-pendiente' })
    expect(o.storage.snapshot()).toBe(before)
    expect(await settleJournal(b.target.createEnv())).toMatchObject({ kind: 'cerrada', journal: { state: 'no-aplicada' } })
    expect(await store.pending()).toBeUndefined()
  })
  it('R13-01 still rejects stale closure on the operative journal with all keys unchanged', async () => {
    const o = options(); const lab = await openOperationalLab(o); const env = lab.target.createEnv(); const l = await load(env)
    await performRestore(env, planRestore(l.data, l.generation, await backup(env)), { mode: 'todo' })
    const j = JSON.parse(o.storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
    const a = JSON.stringify({ ...j, state: 'broken-A' }); const b = JSON.stringify({ ...j, state: 'broken-B' })
    o.storage.setItem(JOURNAL_KEY, b); const before = o.storage.snapshot()
    expect(await dismissJournal(env, { reviewed: a, savedDamaged: true })).toMatchObject({ ok: false, reason: 'diario-cambiado' })
    expect(o.storage.snapshot()).toBe(before)
    expect(await createStore(env).pending()).toMatch(/dañado/)
  })
})
