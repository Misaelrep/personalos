import { describe, expect, it } from 'vitest'
import type { ProjectsData } from './domain/types'
import { exportProjects } from './store/export'
import { dismissJournal, inspectJournal, JOURNAL_KEY, performRestore, planRestore, readBackup, type Backup, type RestoreEnv } from './store/restore'
import { createStore, DATA_KEY, readEnvelope, type KeyValue, type Locks } from './store/store'
import { loseProject, syntheticSix } from './ui/sandbox'

/*
 * P2-R1.3.1 · R13-01 (audit of fe605ef): closing a damaged journal is bound to the
 * exact text the person exported and confirmed. A and B failed on fe605ef (log in
 * /mnt/project-files/proyectos/p2r1/p2r1-3-1-registros/). SYNTHETIC data only.
 */

let clock = 0
const now = () => `2026-11-02T18:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}Z`
let seq = 0
const random = () => `r1301-${++seq}`

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  failOn?: (key: string) => Error | undefined
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => {
    const e = this.failOn?.(k)
    if (e) throw e
    this.map.set(k, v)
  }
  removeItem = (k: string) => void this.map.delete(k)
  snapshot = () => JSON.stringify([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
function memoryLocks(): Locks {
  const tails = new Map<string, Promise<void>>()
  const held = new Set<string>()
  return {
    async request<T>(name: string, opts: { ifAvailable?: boolean }, cb: (lock?: unknown) => Promise<T>): Promise<T> {
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
const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
const env = (storage: KeyValue, locks: Locks, writer: string): RestoreEnv => ({ storage, locks, now, writer })
async function save(storage: KeyValue, locks: Locks, d: ProjectsData) {
  const s = createStore({ storage, locks, now, writer: 'semilla' })
  const cur = await s.load()
  const r = await s.save(d, (cur as { generation: number }).generation)
  if (!r.ok) throw new Error(r.message)
}
async function loaded(storage: KeyValue) {
  const l = await readEnvelope(storage.getItem(DATA_KEY))
  if (l.kind !== 'ok') throw new Error(l.kind)
  return l
}
async function backupOf(storage: KeyValue): Promise<Backup> {
  const r = await readBackup((await exportProjects(storage, now())).text)
  if (!r.ok) throw new Error(r.message)
  return r.backup
}
const pending = (storage: KeyValue, locks: Locks) => createStore({ storage, locks, now, writer: 'x' }).pending()

/** A completed recovery whose journal is then damaged («A»). Two clients share one origin: same storage, same locks. */
async function damagedA() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const six = await syntheticSix(now, random)
  await save(storage, locks, six)
  const old = await backupOf(storage)
  await save(storage, locks, loseProject(six, six.projects[0].id))
  const l = await loaded(storage)
  const r = await performRestore(env(storage, locks, 'cliente-b'), planRestore(l.data, l.generation, old), { mode: 'seleccion', units: [`proyecto:${six.projects[0].id}`] })
  if (!r.ok) throw new Error(r.message)
  const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
  const a = JSON.stringify({ ...j, state: 'terminada' })
  storage.setItem(JOURNAL_KEY, a)
  return { storage, locks, old, six, a, j }
}

describe('R13-01 · el cierre de un diario dañado va ligado al texto exacto confirmado', () => {
  it('A · diario sustituido: A exportado y confirmado, sustituido por B dañado → se rechaza, B intacto, nada cambia', async () => {
    const { storage, locks, a, j } = await damagedA()
    // Client A exported `a` and the person confirmed it (UI: damage.delivered === a, confirmed).
    const b = JSON.stringify({ ...j, state: 'otra-cosa', summary: 'diario B' })
    storage.setItem(JOURNAL_KEY, b) // another tab or the installed app; client A's screen still shows A
    expect((await inspectJournal(storage)).kind).toBe('ilegible')
    const before = storage.snapshot()
    const r = await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: a })
    expect(r).toMatchObject({ ok: false, reason: 'diario-cambiado' })
    expect(storage.snapshot()).toBe(before) // no key modified
    expect(storage.getItem(JOURNAL_KEY)).toBe(b) // B exactly
    expect(await pending(storage, locks)).toMatch(/dañado/) // writes still blocked
    // B is closed only with B's own text.
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: b })).toMatchObject({ ok: true })
    expect(await inspectJournal(storage)).toMatchObject({ kind: 'cerrada', journal: { state: 'revisada', damaged: b } })
  })

  it('A′ · el diario ya no existe: el cierre antiguo también se rechaza y no escribe nada', async () => {
    const { storage, locks, a } = await damagedA()
    storage.removeItem(JOURNAL_KEY)
    const before = storage.snapshot()
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: a })).toMatchObject({ ok: false, reason: 'diario-cambiado' })
    expect(storage.snapshot()).toBe(before)
    expect(storage.getItem(JOURNAL_KEY)).toBeNull()
  })

  it('B · recuperación nueva interrumpida: A confirmó, B lo cierra y empieza otra que se corta → el cierre antiguo de A se rechaza y el bloqueo sigue', async () => {
    const { storage, locks, a, old } = await damagedA()
    // Client B resolves the same journal A (it exported and confirmed it too).
    expect(await dismissJournal(env(storage, locks, 'cliente-b'), { savedDamaged: true, reviewed: a })).toMatchObject({ ok: true })
    // Client B starts a new recovery, interrupted after writing the new journal and before the data.
    const dataBefore = storage.getItem(DATA_KEY)
    let journalWrites = 0
    storage.failOn = (k) => (k === DATA_KEY ? new Error('interrumpida') : k === JOURNAL_KEY && ++journalWrites > 1 ? new Error('interrumpida') : undefined)
    const l = await loaded(storage)
    const r = await performRestore(env(storage, locks, 'cliente-b'), planRestore(l.data, l.generation, old), { mode: 'todo' })
    expect(r.ok).toBe(false)
    storage.failOn = undefined
    const fresh = storage.getItem(JOURNAL_KEY)!
    expect(JSON.parse(fresh)).toMatchObject({ state: 'en-curso', writer: 'cliente-b' })
    expect(storage.getItem(DATA_KEY)).toBe(dataBefore)
    expect(await pending(storage, locks)).toMatch(/sin resolver/)
    // Client A, with its old confirmation of A.
    const before = storage.snapshot()
    const stale = await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: a })
    expect(stale).toMatchObject({ ok: false, reason: 'diario-cambiado' })
    expect(storage.snapshot()).toBe(before)
    expect(storage.getItem(JOURNAL_KEY)).toBe(fresh) // the new journal, exactly
    expect(storage.getItem(DATA_KEY)).toBe(dataBefore) // no data lost
    expect(await pending(storage, locks)).toMatch(/sin resolver/) // write block intact
    expect((await inspectJournal(storage)).kind).toBe('sin-escribir') // to be reviewed before any close
  })

  it('C · cierre legítimo: A exportado y confirmado, sin cambios → se cierra con su texto exacto dentro', async () => {
    const { storage, locks, a, j } = await damagedA()
    const data = storage.getItem(DATA_KEY)
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: a })).toMatchObject({ ok: true })
    expect(await inspectJournal(storage)).toMatchObject({ kind: 'cerrada', journal: { state: 'revisada', damaged: a, before: j.before } })
    expect(storage.getItem(DATA_KEY)).toBe(data)
    expect(await pending(storage, locks)).toBeUndefined()
  })

  it('D · sin entrega confirmada (compartir cancelado) no se cierra, aunque el texto coincida', async () => {
    const { storage, locks, a } = await damagedA()
    const before = storage.snapshot()
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { reviewed: a })).toMatchObject({ ok: false, reason: 'sin-guardar' })
    expect(storage.snapshot()).toBe(before)
  })

  it('E · cuota: sin espacio, el diario queda idéntico, error devuelto y escrituras bloqueadas (sin cambios)', async () => {
    const { storage, locks, a } = await damagedA()
    storage.failOn = (k) => (k === JOURNAL_KEY ? quota() : undefined)
    const before = storage.snapshot()
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { savedDamaged: true, reviewed: a })).toMatchObject({ ok: false, reason: 'sin-espacio' })
    expect(storage.snapshot()).toBe(before)
    expect(await pending(storage, locks)).toMatch(/dañado/)
  })

  it('«desconocida» revisada en una pantalla antigua: si el diario cambió, tampoco se cierra', async () => {
    const { storage, locks, j } = await damagedA()
    // An open journal whose stored data is neither the text before nor the target, then replaced by another one.
    const legacy = { ...j, state: 'en-curso', finishedAt: undefined, resultGeneration: undefined, targetSha256: 'e'.repeat(64) }
    const seen = JSON.stringify(legacy)
    storage.setItem(JOURNAL_KEY, seen)
    expect((await inspectJournal(storage)).kind).toBe('desconocida')
    const other = JSON.stringify({ ...legacy, writer: 'otra-pestaña' })
    storage.setItem(JOURNAL_KEY, other)
    const before = storage.snapshot()
    expect(await dismissJournal(env(storage, locks, 'cliente-a'), { reviewed: seen })).toMatchObject({ ok: false, reason: 'diario-cambiado' })
    expect(storage.snapshot()).toBe(before)
  })
})
