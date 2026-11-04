import { describe, expect, it, vi } from 'vitest'
import type { ProjectsData } from './domain/types'
import { exportProjects } from './store/export'
import { dismissJournal, inspectJournal, JOURNAL_KEY, journalAsCopy, performRestore, planRestore, readBackup, SANDBOX_PREFIX, settleJournal, type Backup } from './store/restore'
import { createStore, DATA_KEY, readEnvelope, type KeyValue, type Locks } from './store/store'
import { currentCopyGate, isJournalBefore, OPERATIONAL_KEYS, OPERATIONAL_LOCKS, operationalTarget, testCopyReason } from './ui/restoreTarget'
import { sandboxTarget } from './ui/testTargets'
import { loseProject, syntheticSix } from './ui/sandbox'
import { sha256Hex } from './import/sha256'

/*
 * P2-R1.4 · Recuperar on PROYECTOS' own store. The engine is the one already
 * validated (store/restore.ts, journal.ts, store.ts, export.ts, unchanged);
 * these tests fix the new parts: ONE destination for data, versions, journal
 * and locks; the rule for test copies (D3, precisión 2); and the copy of the
 * current data bound to its text and generation (D2, precisión 1).
 * SYNTHETIC data only.
 */

let clock = 0
const now = () => `2026-11-04T02:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}Z`
let seq = 0
const random = () => `p2r14-${++seq}`

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => void this.map.set(k, v)
  removeItem = (k: string) => void this.map.delete(k)
}
/** Locks that also record every lock name requested. */
function memoryLocks(seen: string[] = []): Locks {
  const tails = new Map<string, Promise<void>>()
  const held = new Set<string>()
  return {
    async request<T>(name: string, opts: { ifAvailable?: boolean }, cb: (lock?: unknown) => Promise<T>): Promise<T> {
      seen.push(name)
      if (opts.ifAvailable && held.has(name)) return cb(null)
      const prev = tails.get(name) ?? Promise.resolve()
      let release!: () => void
      tails.set(name, new Promise<void>((r) => (release = r)))
      await prev
      held.add(name)
      try {
        return await cb({ name })
      } finally {
        held.delete(name)
        release()
      }
    },
  }
}
/** Storage that records every key written or removed. */
function spy(inner: KeyValue, written: Set<string>): KeyValue {
  return {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      written.add(k)
      inner.setItem(k, v)
    },
    removeItem: (k) => {
      written.add(k)
      inner.removeItem(k)
    },
  }
}
async function seed(storage: KeyValue, locks: Locks, d: ProjectsData) {
  const s = createStore({ storage, locks, now, writer: 'semilla' })
  const cur = await s.load()
  const r = await s.save(d, cur.kind === 'ok' || cur.kind === 'vacio' ? cur.generation : -1)
  if (!r.ok) throw new Error(r.message)
}
async function current(storage: KeyValue) {
  const l = await readEnvelope(storage.getItem(DATA_KEY))
  if (l.kind !== 'ok') throw new Error(l.kind)
  return l
}
async function backupOf(text: string): Promise<Backup> {
  const r = await readBackup(text)
  if (!r.ok) throw new Error(r.message)
  return r.backup
}

// Keys of the rest of ELYUM and of the test store, with invented values.
const FOREIGN: Record<string, string> = {
  'personal-os:day:2026-11-04': '{"inventado":"HOY"}',
  'personal-os:entry': '{"inventado":"entrada"}',
  'elyum:learn:v1:state': '{"inventado":"APRENDER"}',
  [`${SANDBOX_PREFIX}${DATA_KEY}`]: '{"inventado":"almacén de prueba"}',
}

describe('P2-R1.4 · destino operativo: un solo almacén para datos, versiones, diario y bloqueos', () => {
  it('recuperar, cerrar, revertir y cerrar a mano solo tocan las cinco claves de PROYECTOS y sus dos bloqueos', async () => {
    const base = new MemoryStorage()
    for (const [k, v] of Object.entries(FOREIGN)) base.setItem(k, v)
    const lockNames: string[] = []
    const locks = memoryLocks(lockNames)
    await seed(base, locks, await syntheticSix(now, random))
    const copy = (await exportProjects(base, now())).text

    const written = new Set<string>()
    const storage = spy(base, written)
    let refreshed = 0
    const target = operationalTarget({ storage, locks, where: 'en este navegador', onRefresh: () => refreshed++, writer: 'prueba-p2r14' })
    expect(target.kind).toBe('operativo')
    expect(target.requireCurrentCopy).toBe(true)
    const env = target.createEnv()
    expect(env.storage).toBe(storage) // without prefix: the same storage PROYECTOS reads
    expect(env.locks).toBe(locks)

    // A loss, then a recovery of only what was lost.
    const before = await current(base)
    await seed(storage, locks, loseProject(before.data, before.data.projects[0].id))
    const lost = await current(base)
    const b = await backupOf(copy)
    expect(target.accepts(b)).toBe(true)
    const plan = planRestore(lost.data, lost.generation, b)
    const unit = plan.units.find((u) => u.state === 'solo-en-copia')!
    const r = await performRestore(env, plan, { mode: 'seleccion', units: [unit.key] }, 'copia.json')
    expect(r.ok).toBe(true)
    expect((await current(base)).data.projects).toHaveLength(6)
    target.onRefresh?.()
    expect(refreshed).toBe(1)

    // Back to what was before, from this store's own journal.
    const j = await inspectJournal(base)
    expect(j.kind).toBe('cerrada')
    const undoText = await journalAsCopy((j as Extract<typeof j, { kind: 'cerrada' }>).journal)
    const undo = await backupOf(undoText!)
    expect(await isJournalBefore(storage, undo.storedSha256)).toBe(true)
    const now2 = await current(base)
    const r2 = await performRestore(env, planRestore(now2.data, now2.generation, undo), { mode: 'todo' }, 'lo de antes')
    expect(r2.ok).toBe(true)
    expect((await current(base)).data.projects).toHaveLength(5)

    // An interrupted one, found and closed: still only the journal key.
    const open = JSON.parse(base.getItem(JOURNAL_KEY)!)
    base.setItem(JOURNAL_KEY, JSON.stringify({ ...open, state: 'en-curso', finishedAt: undefined, resultGeneration: undefined }))
    expect((await inspectJournal(base)).kind).toBe('escrita-sin-cerrar')
    expect((await settleJournal(env)).kind).toBe('cerrada')
    // And a damaged one, closed by hand after «saving» it.
    base.setItem(JOURNAL_KEY, '{"cortado"')
    expect((await dismissJournal(env, { reviewed: '{"cortado"', savedDamaged: true })).ok).toBe(true)

    for (const k of written) expect(OPERATIONAL_KEYS).toContain(k)
    for (const [k, v] of Object.entries(FOREIGN)) expect(base.getItem(k)).toBe(v)
    for (const name of lockNames) expect(OPERATIONAL_LOCKS).toContain(name)
  })

  it('el destino de prueba escribe solo bajo elyum:prueba-p2r1:*', async () => {
    const real = new MemoryStorage()
    vi.stubGlobal('window', { localStorage: real })
    real.setItem(DATA_KEY, 'intocable')
    const t = sandboxTarget()
    expect(t.kind).toBe('prueba')
    const env = { ...t.createEnv(), locks: memoryLocks() }
    await seed(env.storage, env.locks, await syntheticSix(now, random))
    expect(real.getItem(DATA_KEY)).toBe('intocable')
    expect(real.getItem(SANDBOX_PREFIX + DATA_KEY)).not.toBeNull()
    for (const k of real.map.keys()) expect(k === DATA_KEY || k.startsWith(SANDBOX_PREFIX)).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('P2-R1.4 · D3 · copias marcadas de prueba', () => {
  it('rechaza la copia del almacén de prueba y la del laboratorio; acepta la de Exportar', async () => {
    const locks = memoryLocks()
    const data = await syntheticSix(now, random)
    const s1 = new MemoryStorage()
    await seed(s1, locks, data)
    const normal = await backupOf((await exportProjects(s1, now())).text)
    const sandbox = await backupOf((await exportProjects(s1, now(), 'prueba-p2r1')).text)
    const s2 = new MemoryStorage()
    await seed(s2, locks, { ...data, syntheticRecoveryLab: 'sesion' } as ProjectsData)
    const lab = await backupOf((await exportProjects(s2, now())).text)

    const t = operationalTarget({ storage: new MemoryStorage(), locks, where: 'aquí' })
    expect(testCopyReason(normal)).toBeUndefined()
    expect(t.accepts(normal)).toBe(true)
    expect(t.accepts(sandbox)).toBe(false)
    expect(t.refusal!(sandbox)).toMatch(/almacén de prueba/)
    expect(t.accepts(lab)).toBe(false)
    expect(t.refusal!(lab)).toMatch(/laboratorio/)
  })

  it('precisión 2 · lo de antes del diario de este almacén vale para revertir; otro texto o sin diario, no', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    await seed(storage, locks, await syntheticSix(now, random))
    const copy = await backupOf((await exportProjects(storage, now())).text)
    expect(await isJournalBefore(storage, copy.storedSha256)).toBe(false) // no journal yet
    const l = await current(storage)
    await seed(storage, locks, loseProject(l.data, l.data.projects[0].id))
    const l2 = await current(storage)
    const env = { storage, locks, now, writer: 'w' }
    expect((await performRestore(env, planRestore(l2.data, l2.generation, copy), { mode: 'todo' })).ok).toBe(true)
    const j = await inspectJournal(storage)
    const undo = await backupOf((await journalAsCopy((j as Extract<typeof j, { kind: 'cerrada' }>).journal))!)
    expect(testCopyReason(undo)).toBeUndefined()
    expect(await isJournalBefore(storage, undo.storedSha256)).toBe(true)
    expect(await isJournalBefore(storage, copy.storedSha256)).toBe(false)
    storage.setItem(JOURNAL_KEY, '{"dañado"')
    expect(await isJournalBefore(storage, undo.storedSha256)).toBe(false)
  })
})

describe('P2-R1.4 · D2 · copia de lo actual ligada a su texto y su generación', () => {
  it('sin datos no hace falta; sin copia, sin confirmar, o con datos cambiados no se confirma', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    expect(await currentCopyGate(undefined, null, 0)).toEqual({ ok: true })

    await seed(storage, locks, await syntheticSix(now, random))
    const made = (await exportProjects(storage, now())).file
    const raw = storage.getItem(DATA_KEY)
    const gen = made.summary!.generation
    expect((await currentCopyGate(undefined, raw, gen)).ok).toBe(false)
    const copy = { generation: gen, storedSha256: made.storedSha256!, confirmed: false }
    expect(await currentCopyGate(copy, raw, gen)).toEqual({ ok: false, why: expect.stringMatching(/comprobado/) })
    expect(await currentCopyGate({ ...copy, confirmed: true }, raw, gen)).toEqual({ ok: true })
    expect(made.storedSha256).toBe(await sha256Hex(raw!))

    // The plan saw another generation: the copy does not count for it.
    expect((await currentCopyGate({ ...copy, confirmed: true }, raw, gen + 1)).ok).toBe(false)
    // The data changed after the copy: it does not count any more.
    const l = await current(storage)
    await seed(storage, locks, loseProject(l.data, l.data.projects[0].id))
    const g = await currentCopyGate({ ...copy, confirmed: true }, storage.getItem(DATA_KEY), gen)
    expect(g).toEqual({ ok: false, why: expect.stringMatching(/cambiaron/) })
    // Same generation but other text (written outside the store's rules): it does not count either.
    expect((await currentCopyGate({ ...copy, confirmed: true }, raw + ' ', gen)).ok).toBe(false)
  })
})
