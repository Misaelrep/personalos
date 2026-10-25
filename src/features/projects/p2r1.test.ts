import { describe, expect, it } from 'vitest'
import { setNextAction } from './domain/ops'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData } from './domain/types'
import { sha256Hex } from './import/sha256'
import { exportProjects } from './store/export'
import {
  buildRestore,
  dismissJournal,
  inspectJournal,
  JOURNAL_KEY,
  journalAsCopy,
  performRestore,
  planRestore,
  prefixedStorage,
  readBackup,
  RESTORE_LOCK,
  SANDBOX_PREFIX,
  settleJournal,
  type Backup,
  type RestoreEnv,
} from './store/restore'
import { createStore, DATA_KEY, PREV_KEYS, readEnvelope, type KeyValue, type Locks } from './store/store'
import { localChange, loseProject, syntheticSix } from './ui/sandbox'

/* P2-R1 · Recovering PROYECTOS from an exported copy. SYNTHETIC data only. */

let clock = 0
const now = () => `2026-10-25T13:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}-06:00`
let seq = 0
const random = () => `p2r1-${++seq}`

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  failOn?: (key: string, value: string) => Error | undefined
  /** Simulates a broken read-back: the value written is not the one read. */
  corruptOnRead?: (key: string) => boolean
  getItem = (k: string) => {
    const v = this.map.get(k) ?? null
    return v !== null && this.corruptOnRead?.(k) ? v.replace('"generation":', '"generation": ') : v
  }
  setItem = (k: string, v: string) => {
    const e = this.failOn?.(k, v)
    if (e) throw e
    this.map.set(k, v)
  }
  removeItem = (k: string) => void this.map.delete(k)
}

/** Exclusive locks by name, with `ifAvailable`, like navigator.locks. */
function memoryLocks(): Locks & { held: Set<string> } {
  const tails = new Map<string, Promise<void>>()
  const held = new Set<string>()
  return {
    held,
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
const env = (storage: KeyValue, locks: Locks | undefined, writer = 'tab'): RestoreEnv => ({ storage, locks, now, writer })

async function seeded(storage: KeyValue, locks: Locks, data?: ProjectsData) {
  const d = data ?? (await syntheticSix(now, random))
  const s = createStore({ storage, locks, now, writer: 'semilla' })
  const r = await s.save(d, ((await s.load()) as { generation: number }).generation)
  if (!r.ok) throw new Error(r.message)
  return { data: d, generation: r.generation }
}

async function exported(storage: KeyValue) {
  return (await exportProjects(storage, now())).text
}

async function backupOf(text: string): Promise<Backup> {
  const r = await readBackup(text)
  if (!r.ok) throw new Error(`${r.problem}: ${r.message}`)
  return r.backup
}

async function loaded(storage: KeyValue) {
  const l = await readEnvelope(storage.getItem(DATA_KEY))
  if (l.kind !== 'ok') throw new Error(l.kind)
  return l
}

/** A store with six projects, its exported copy, and the store after losing one project and changing another. */
async function scenario() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const { data } = await seeded(storage, locks)
  const text = await exported(storage)
  const huerto = data.projects[0]
  const taller = data.projects[1]
  let damaged = loseProject(data, huerto.id)
  damaged = setNextAction(damaged, damaged.tasks.find((t) => t.projectId === taller.id)!.id, 'cambio local', { now: now() })
  const s = createStore({ storage, locks, now, writer: 'daño' })
  const r = await s.save(damaged, ((await s.load()) as { generation: number }).generation)
  if (!r.ok) throw new Error(r.message)
  return { storage, locks, data, text, huerto, taller, damaged, generation: r.generation }
}

describe('P2-R1 · leer la copia', () => {
  it('reads a copy made by Exportar: data, generation, fingerprint', async () => {
    const storage = new MemoryStorage()
    const { data, generation } = await seeded(storage, memoryLocks())
    const b = await backupOf(await exported(storage))
    expect(b.data).toEqual(JSON.parse(JSON.stringify(data)))
    expect(b.generation).toBe(generation)
    expect(b.storedSha256).toBe(await sha256Hex(storage.getItem(DATA_KEY)!))
  })

  it('refuses, saying why: not JSON, cut short, another app, empty copy, too big', async () => {
    const storage = new MemoryStorage()
    await seeded(storage, memoryLocks())
    const text = await exported(storage)
    expect(await readBackup('hola')).toMatchObject({ ok: false, problem: 'no-es-copia' })
    expect(await readBackup(text.slice(0, text.length / 2))).toMatchObject({ ok: false, problem: 'no-es-copia' })
    expect(await readBackup(JSON.stringify({ format: 'personal-os-backup/1', data: {} }))).toMatchObject({ ok: false, problem: 'no-es-copia' })
    expect(await readBackup((await exportProjects(new MemoryStorage(), now())).text)).toMatchObject({ ok: false, problem: 'vacia' })
    expect(await readBackup(' '.repeat(20 * 1024 * 1024 + 1))).toMatchObject({ ok: false, problem: 'demasiado-grande' })
  })

  it('refuses an altered copy: stored text, its fingerprint, the summary, or the data inside', async () => {
    const storage = new MemoryStorage()
    await seeded(storage, memoryLocks())
    const f = JSON.parse(await exported(storage))
    const variants = [
      { ...f, stored: f.stored.replace('Huerto de prueba', 'Huerto alterado') },
      { ...f, storedSha256: 'f'.repeat(64) },
      { ...f, summary: { ...f.summary, tasks: 99 } },
    ]
    // Data altered and both fingerprints recomputed outside: the envelope's own fingerprint still catches it.
    const inner = f.stored.replace('Huerto de prueba', 'Huerto alterado')
    variants.push({ ...f, stored: inner, storedSha256: await sha256Hex(inner) })
    for (const v of variants) expect(await readBackup(JSON.stringify(v))).toMatchObject({ ok: false, problem: 'alterada' })
  })

  it('refuses copies from a newer version: file format, store format or data version', async () => {
    const storage = new MemoryStorage()
    await seeded(storage, memoryLocks())
    const f = JSON.parse(await exported(storage))
    expect(await readBackup(JSON.stringify({ ...f, format: 'elyum-projects-export/2' }))).toMatchObject({ ok: false, problem: 'version-futura' })
    const env2 = JSON.parse(f.stored)
    const store2 = JSON.stringify({ ...env2, format: 'elyum-projects-store/2' })
    expect(await readBackup(JSON.stringify({ ...f, stored: store2, storedSha256: await sha256Hex(store2) }))).toMatchObject({ ok: false, problem: 'version-futura' })
    const data2 = { ...env2.data, version: 2 }
    const v2 = JSON.stringify({ ...env2, data: data2, sha256: await sha256Hex(JSON.stringify(data2)) })
    expect(await readBackup(JSON.stringify({ ...f, stored: v2, storedSha256: await sha256Hex(v2) }))).toMatchObject({ ok: false, problem: 'version-futura' })
  })

  it('reading writes nothing', async () => {
    const { storage, text } = await scenario()
    const before = JSON.stringify([...storage.map])
    await readBackup(text)
    planRestore((await loaded(storage)).data, 0, await backupOf(text))
    expect(JSON.stringify([...storage.map])).toBe(before)
  })
})

describe('P2-R1 · comparar y elegir', () => {
  it('shows each project and the weeks: lost, changed, equal; nothing chosen by default', async () => {
    const { storage, text, huerto, taller } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const by = (id: string) => plan.units.find((u) => u.key === `proyecto:${id}`)!
    expect(by(huerto.id)).toMatchObject({ state: 'solo-en-copia', selectable: true })
    expect(by(taller.id)).toMatchObject({ state: 'distinta', selectable: true })
    expect(by(taller.id).changes.join(' ')).toMatch(/siguiente acción/)
    expect(plan.units.filter((u) => u.state === 'igual')).toHaveLength(4)
    expect(plan.units.filter((u) => u.state === 'igual').every((u) => !u.selectable)).toBe(true)
    // The lost project's committed task also left the week.
    expect(plan.units.find((u) => u.key === 'semanas')).toMatchObject({ state: 'distinta' })
  })

  it('recovering one lost project keeps everything else local, including later local changes', async () => {
    const { storage, text, huerto, taller, damaged } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const r = buildRestore(plan, { mode: 'seleccion', units: [`proyecto:${huerto.id}`] }, now())
    if (!r.ok) throw new Error(r.problems.join('; '))
    expect(r.data.projects.map((p) => p.id)).toEqual([...damaged.projects.map((p) => p.id), huerto.id])
    expect(r.data.tasks.filter((t) => t.projectId === huerto.id)).toHaveLength(6)
    // The Taller change made after the copy is still there.
    expect(r.data.tasks.find((t) => t.projectId === taller.id)!.nextAction).toBe('cambio local')
    // History: nothing local lost, the recovery itself recorded.
    for (const h of l.data.history) expect(r.data.history).toContainEqual(h)
    expect(r.data.history.at(-1)).toMatchObject({ field: 'recuperación', by: 'usuario' })
    expect(validateProjectsData(r.data).ok).toBe(true)
  })

  it('replacing a changed project brings it back as in the copy, and says what local work it drops', async () => {
    const { storage, text, taller, data } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    expect(plan.units.find((u) => u.key === `proyecto:${taller.id}`)!.localNewer).toBeGreaterThan(0)
    const r = buildRestore(plan, { mode: 'seleccion', units: [`proyecto:${taller.id}`] }, now())
    if (!r.ok) throw new Error(r.problems.join('; '))
    expect(r.data.tasks.filter((t) => t.projectId === taller.id)).toEqual(data.tasks.filter((t) => t.projectId === taller.id))
  })

  it('«todo» leaves exactly the copy (plus the line that records the recovery)', async () => {
    const { storage, text, data } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const r = buildRestore(plan, { mode: 'todo' }, now())
    if (!r.ok) throw new Error(r.problems.join('; '))
    expect({ ...r.data, history: r.data.history.slice(0, -1) }).toEqual(JSON.parse(JSON.stringify(data)))
  })

  it('refuses a selection whose result would not validate, and says why', async () => {
    // The copy's week commits a task of a project that is not being recovered and no longer exists here.
    const { storage, text, huerto } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const weeks = plan.units.find((u) => u.key === 'semanas')!
    expect(weeks.selectable).toBe(false)
    expect(weeks.why.join(' ')).toMatch(/compromiso con una tarea desconocida/)
    // Together with the project it needs, it is fine.
    expect(buildRestore(plan, { mode: 'seleccion', units: ['semanas', `proyecto:${huerto.id}`] }, now()).ok).toBe(true)
  })

  it('refuses one project alone when another local project shares its dossier vocabulary', async () => {
    const { storage, text, taller } = await scenario()
    const l = await loaded(storage)
    const backup = await backupOf(text)
    // Locally, a second project uses Taller's dossier and Taller's vocabulary changed.
    const twin = { ...taller, id: 'gemelo', name: 'Gemelo de prueba', sourceId: undefined }
    const local: ProjectsData = { ...l.data, projects: [...l.data.projects, twin] }
    const voc = local.vocabularies[taller.dossier]
    local.vocabularies = { ...local.vocabularies, [taller.dossier]: { ...voc, priority: [...voc.priority, { literal: 'Nueva', rank: 9 }] } }
    const plan = planRestore(local, l.generation, backup)
    const u = plan.units.find((x) => x.key === `proyecto:${taller.id}`)!
    expect(u.selectable).toBe(false)
    expect(u.why.join(' ')).toMatch(/comparte su dossier/)
  })

  it('refuses an empty selection', async () => {
    const { storage, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    expect(buildRestore(plan, { mode: 'seleccion', units: [] }, now())).toMatchObject({ ok: false })
  })
})

describe('P2-R1 · escribir', () => {
  it('recovers, reads it back, and keeps a journal with the text it replaced', async () => {
    const { storage, locks, text, huerto } = await scenario()
    const l = await loaded(storage)
    const beforeRaw = storage.getItem(DATA_KEY)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [`proyecto:${huerto.id}`] }, 'copia.json')
    expect(r).toMatchObject({ ok: true, verified: true, generation: l.generation + 1 })
    const after = await loaded(storage)
    expect(after.data.tasks.filter((t) => t.projectId === huerto.id)).toHaveLength(6)
    const j = JSON.parse(storage.getItem(JOURNAL_KEY)!)
    expect(j).toMatchObject({ state: 'completada', before: beforeRaw, baseGeneration: l.generation, resultGeneration: l.generation + 1, source: { name: 'copia.json' } })
    expect(j.beforeSha256).toBe(await sha256Hex(beforeRaw!))
    // The store's own previous version is there too.
    expect(storage.getItem(PREV_KEYS[0])).toBe(beforeRaw)
  })

  it('refuses if the store changed after the preview (another tab), writing nothing', async () => {
    const { storage, locks, text, huerto } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const other = createStore({ storage, locks, now, writer: 'otra' })
    await other.save(setNextAction(l.data, l.data.tasks[0].id, 'otra pestaña', { now: now() }), l.generation)
    const before = storage.getItem(DATA_KEY)
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [`proyecto:${huerto.id}`] })
    expect(r).toMatchObject({ ok: false, reason: 'conflicto', written: false })
    expect(storage.getItem(DATA_KEY)).toBe(before)
    // Refused before the journal: nothing at all was written.
    expect(storage.getItem(JOURNAL_KEY)).toBeNull()
  })

  it('refuses a second recovery while one runs (two tabs at once)', async () => {
    const { storage, locks, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    let second: unknown
    await locks.request(RESTORE_LOCK, { mode: 'exclusive' }, async () => {
      second = await performRestore(env(storage, locks, 'b'), plan, { mode: 'todo' })
    })
    expect(second).toMatchObject({ ok: false, reason: 'otra-recuperacion', written: false })
    expect((await loaded(storage)).generation).toBe(l.generation)
  })

  it('without Web Locks it does not recover', async () => {
    const { storage, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    expect(await performRestore(env(storage, undefined), plan, { mode: 'todo' })).toMatchObject({ ok: false, reason: 'solo-lectura', written: false })
  })

  it('a failed journal write (quota) stops everything before the data is touched', async () => {
    const { storage, locks, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const before = storage.getItem(DATA_KEY)
    storage.failOn = (k) => (k === JOURNAL_KEY ? quota() : undefined)
    const r = await performRestore(env(storage, locks), plan, { mode: 'todo' })
    expect(r).toMatchObject({ ok: false, reason: 'sin-espacio', written: false })
    expect(storage.getItem(DATA_KEY)).toBe(before)
    expect(storage.getItem(JOURNAL_KEY)).toBeNull()
  })

  it('a failed data write leaves the data as it was and the journal says so', async () => {
    const { storage, locks, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const before = storage.getItem(DATA_KEY)
    storage.failOn = (k) => (k === DATA_KEY ? new Error('escritura rechazada') : undefined)
    const r = await performRestore(env(storage, locks), plan, { mode: 'todo' })
    expect(r).toMatchObject({ ok: false, reason: 'error-de-escritura', written: false })
    expect(storage.getItem(DATA_KEY)).toBe(before)
    expect(JSON.parse(storage.getItem(JOURNAL_KEY)!).state).toBe('fallida')
  })

  it('a read-back that does not match is never reported as recovered', async () => {
    const { storage, locks, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const before = storage.getItem(DATA_KEY)
    // The storage returns something else than what was written.
    storage.corruptOnRead = (k) => k === DATA_KEY && JSON.parse(storage.map.get(JOURNAL_KEY) ?? '{}').state === 'en-curso'
    const r = await performRestore(env(storage, locks), plan, { mode: 'todo' })
    expect(r).toMatchObject({ ok: false, reason: 'verificacion-fallida' })
    storage.corruptOnRead = undefined
    // The store put back the text before.
    expect(storage.getItem(DATA_KEY)).toBe(before)
  })

  it('a selection that does not validate is refused before anything is written', async () => {
    const { storage, locks, text } = await scenario()
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, await backupOf(text))
    const before = storage.getItem(DATA_KEY)
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: ['semanas'] })
    expect(r).toMatchObject({ ok: false, reason: 'seleccion-no-valida', written: false })
    expect(storage.getItem(DATA_KEY)).toBe(before)
    expect(storage.getItem(JOURNAL_KEY)).toBeNull()
  })
})

describe('P2-R1 · si se interrumpe', () => {
  /** A recovery whose page dies at a given point: after the journal, or after the data. */
  async function interrupted(at: 'tras-diario' | 'tras-datos') {
    const s = await scenario()
    const l = await loaded(s.storage)
    const plan = planRestore(l.data, l.generation, await backupOf(s.text))
    const real = s.storage.setItem
    let dead = false
    s.storage.setItem = (k, v) => {
      if (dead) throw new Error('la página se cerró')
      real(k, v)
      if ((at === 'tras-diario' && k === JOURNAL_KEY) || (at === 'tras-datos' && k === DATA_KEY)) dead = true
    }
    await performRestore(env(s.storage, s.locks), plan, { mode: 'todo' })
    s.storage.setItem = real
    return { ...s, l }
  }

  it('died after the journal, before the data: nothing was written; reopening closes it as such', async () => {
    const { storage, locks, l } = await interrupted('tras-diario')
    expect((await loaded(storage)).generation).toBe(l.generation)
    expect((await inspectJournal(storage)).kind).toBe('sin-escribir')
    const settled = await settleJournal(env(storage, locks))
    expect(settled).toMatchObject({ kind: 'cerrada', journal: { state: 'no-aplicada' } })
  })

  it('died after the data, before closing: reopening finds it written and checked', async () => {
    const { storage, locks, l } = await interrupted('tras-datos')
    expect((await loaded(storage)).generation).toBe(l.generation + 1)
    expect((await inspectJournal(storage)).kind).toBe('escrita-sin-cerrar')
    expect(await settleJournal(env(storage, locks))).toMatchObject({ kind: 'cerrada', journal: { state: 'completada' } })
  })

  it('open journal and someone wrote after: «desconocida», kept open, the text before recoverable through the same steps', async () => {
    const { storage, locks, l } = await interrupted('tras-diario')
    const other = createStore({ storage, locks, now, writer: 'otra' })
    await other.save(setNextAction(l.data, l.data.tasks[0].id, 'después', { now: now() }), l.generation)
    expect((await inspectJournal(storage)).kind).toBe('desconocida')
    expect((await settleJournal(env(storage, locks))).kind).toBe('desconocida')
    // A new recovery is refused until the person looks at it.
    const j = (await inspectJournal(storage)) as { journal: Parameters<typeof journalAsCopy>[0] }
    const copy = await journalAsCopy(j.journal)
    const b = await backupOf(copy!)
    expect(b.data).toEqual(l.data)
    const cur = await loaded(storage)
    const plan = planRestore(cur.data, cur.generation, b)
    expect(await performRestore(env(storage, locks), plan, { mode: 'todo' })).toMatchObject({ ok: false, reason: 'recuperacion-interrumpida' })
    expect(await dismissJournal(env(storage, locks))).toBe(true)
    expect(await performRestore(env(storage, locks), plan, { mode: 'todo' })).toMatchObject({ ok: true })
    expect((await loaded(storage)).data.tasks[0].nextAction).toBe(l.data.tasks[0].nextAction)
  })

  it('settling never touches the journal while another recovery holds the lock', async () => {
    const { storage, locks } = await interrupted('tras-diario')
    const before = storage.getItem(JOURNAL_KEY)
    await locks.request(RESTORE_LOCK, { mode: 'exclusive' }, async () => {
      expect((await settleJournal(env(storage, locks))).kind).toBe('sin-escribir')
    })
    expect(storage.getItem(JOURNAL_KEY)).toBe(before)
  })

  it('undo: the journal’s text before can be recovered the same way, with preview', async () => {
    const { storage, locks, text, huerto, damaged } = await scenario()
    const l = await loaded(storage)
    await performRestore(env(storage, locks), planRestore(l.data, l.generation, await backupOf(text)), { mode: 'seleccion', units: [`proyecto:${huerto.id}`] })
    const st = await inspectJournal(storage)
    if (st.kind !== 'cerrada') throw new Error(st.kind)
    const b = await backupOf((await journalAsCopy(st.journal))!)
    const cur = await loaded(storage)
    const plan = planRestore(cur.data, cur.generation, b)
    expect(plan.units.find((u) => u.key === `proyecto:${huerto.id}`)!.state).toBe('solo-local')
    expect(await performRestore(env(storage, locks), plan, { mode: 'todo' })).toMatchObject({ ok: true })
    const back = await loaded(storage)
    expect({ ...back.data, history: back.data.history.slice(0, -1) }).toEqual(JSON.parse(JSON.stringify(damaged)))
  })
})

describe('P2-R1 · almacén de prueba separado', () => {
  it('recovering into the test store touches only its prefixed keys', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    // PROYECTOS itself, and an unrelated key of ELYUM.
    await seeded(storage, locks)
    storage.map.set('personal-os:day:2026-10-25', '{"hoy":true}')
    const text = await exported(storage)
    const untouched = [...storage.map].filter(([k]) => !k.startsWith(SANDBOX_PREFIX))
    const sandbox = prefixedStorage(storage)
    await seeded(sandbox, locks, localChange(await syntheticSix(now, random), now, random))
    const l = await loaded(sandbox)
    const r = await performRestore(env(sandbox, locks), planRestore(l.data, l.generation, await backupOf(text)), { mode: 'todo' })
    expect(r.ok).toBe(true)
    expect([...storage.map].filter(([k]) => !k.startsWith(SANDBOX_PREFIX))).toEqual(untouched)
    expect(storage.map.has(SANDBOX_PREFIX + JOURNAL_KEY)).toBe(true)
    expect(storage.map.has(JOURNAL_KEY)).toBe(false)
  })

  it('exports of the test store say so', async () => {
    const storage = prefixedStorage(new MemoryStorage())
    await seeded(storage, memoryLocks())
    const { file } = await exportProjects(storage, now(), 'prueba-p2r1')
    expect(file.origin).toBe('prueba-p2r1')
    expect((await backupOf(JSON.stringify(file))).file.origin).toBe('prueba-p2r1')
  })
})
