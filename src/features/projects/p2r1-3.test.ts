import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTask, setNextAction } from './domain/ops'
import type { ProjectsData, Task } from './domain/types'
import { sha256Hex } from './import/sha256'
import { exportProjects } from './store/export'
import { dismissJournal, inspectJournal, JOURNAL_KEY, performRestore, planRestore, readBackup, settleJournal, type Backup, type RestoreEnv } from './store/restore'
import { createStore, DATA_KEY, readEnvelope, type KeyValue, type Locks } from './store/store'
import { saveJsonFile } from './ui/files'
import { loseProject, syntheticSix } from './ui/sandbox'

/*
 * P2-R1.3 · Corrections F01–F04 of the second audit (98f99cf). Each test reproduced the
 * failure on 98f99cf first (log in /mnt/project-files/proyectos/p2r1/p2r1-3-registros/) and
 * passes with the correction. SYNTHETIC data only.
 */

let clock = 0
const now = () => `2026-11-02T16:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}Z`
let seq = 0
const random = () => `p2r13-${++seq}`
const ctx = () => ({ now: now(), random })

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  failOn?: (key: string) => Error | undefined
  failRead?: (key: string) => Error | undefined
  getItem = (k: string) => {
    const e = this.failRead?.(k)
    if (e) throw e
    return this.map.get(k) ?? null
  }
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
const env = (storage: KeyValue, locks: Locks, writer = 'tab'): RestoreEnv => ({ storage, locks, now, writer })
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
const tasksIds = (d: ProjectsData) => new Set(d.tasks.map((t) => t.id))
/** Dependencies and task requirements that resolve in `before` and not in `after` (the same holder task on both sides). */
function newlyBroken(before: ProjectsData, after: ProjectsData) {
  const b = tasksIds(before)
  const a = tasksIds(after)
  return after.tasks.flatMap((t) => {
    const refs = [...t.dependsOn, ...(t.requirements ?? []).flatMap((r) => r.options.flatMap((o) => (o.kind === 'tarea' ? [o.taskId] : [])))]
    return refs.filter((x) => b.has(x) && !a.has(x) && before.tasks.some((y) => y.id === t.id)).map((x) => `${t.id}→${x}`)
  })
}

// ── F01 ──────────────────────────────────────────────────────────────────────

/**
 * Codex's reproduction: in the copy, a task of Taller depends on (and requires) `new:resolved`,
 * which does not exist there. Here, `new:resolved` exists in Huerto: the relation resolves.
 * Recovering only Huerto from the copy would remove it, while Taller's task is kept from here.
 */
async function resolvedHere() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const six = await syntheticSix(now, random)
  const huerto = six.projects[0]
  const taller = six.projects[1]
  const holder = six.tasks.find((t) => t.projectId === taller.id)!
  const withRef = (d: ProjectsData): ProjectsData => ({
    ...d,
    tasks: d.tasks.map((t): Task => (t.id === holder.id ? { ...t, dependsOn: ['new:resolved'], requirements: [{ id: 'r-f01', literal: 'Necesita la tarea resuelta', kind: 'tarea', mode: 'todas', options: [{ kind: 'tarea', taskId: 'new:resolved' }] }] } : t)),
  })
  const copyData = withRef(six)
  await save(storage, locks, copyData)
  const old = await backupOf(storage)
  const added = createTask(copyData, { projectId: huerto.id, title: 'Tarea resuelta después', status: six.vocabularies[huerto.dossier].status[0].literal }, ctx())
  const local = { ...added.data, tasks: added.data.tasks.map((t) => (t.id === added.task.id ? { ...t, id: 'new:resolved' } : t)) }
  await save(storage, locks, local)
  const l = await loaded(storage)
  return { storage, locks, old, l, huerto, taller, holder, plan: planRestore(l.data, l.generation, old) }
}

describe('F01 · la excepción histórica mira el lado del que viene cada registro', () => {
  it('reproducción de Codex: recuperar solo Huerto rompería la dependencia y el requisito de Taller, resueltos aquí → rechazado sin escribir', async () => {
    const { storage, locks, plan, huerto, holder } = await resolvedHere()
    expect(newlyBroken(plan.local, plan.local)).toEqual([])
    const unit = plan.units.find((u) => u.key === `proyecto:${huerto.id}`)!
    expect(unit.selectable).toBe(false)
    const why = unit.why.join(' ')
    expect(why).toMatch(/depende de «new:resolved»|depende de .*Tarea resuelta después/)
    expect(why).toMatch(/requisito/)
    expect(why).toContain(holder.title)
    const before = storage.snapshot()
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [unit.key] })
    expect(r).toMatchObject({ ok: false, written: false })
    expect(storage.snapshot()).toBe(before)
  })

  it('tampoco «todo»: sustituir todo rompería una relación que aquí estaba resuelta', async () => {
    const { storage, locks, plan } = await resolvedHere()
    const before = storage.snapshot()
    expect(await performRestore(env(storage, locks), plan, { mode: 'todo' })).toMatchObject({ ok: false, written: false })
    expect(storage.snapshot()).toBe(before)
  })

  it('una inconsistencia histórica legítima de la copia (tarea que aquí no existe) se conserva y se avisa', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    const cocina = six.projects.find((p) => p.name === 'Cocina de prueba')!
    const t = createTask(six, { projectId: cocina.id, title: 'Con dependencia literal', status: six.vocabularies[cocina.dossier].status[0].literal, dependsOn: ['src:NO-EXISTE'] }, ctx())
    await save(storage, locks, t.data)
    const old = await backupOf(storage)
    await save(storage, locks, loseProject(t.data, cocina.id))
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, old)
    const unit = plan.units.find((u) => u.key === `proyecto:${cocina.id}`)!
    expect(unit.selectable).toBe(true)
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [unit.key] })
    expect(r.ok).toBe(true)
    expect((await loaded(storage)).data.tasks.find((x) => x.id === t.task.id)!.dependsOn).toEqual(['src:NO-EXISTE'])
  })
})

// ── F02 ──────────────────────────────────────────────────────────────────────

async function completed() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const six = await syntheticSix(now, random)
  await save(storage, locks, six)
  const old = await backupOf(storage)
  await save(storage, locks, loseProject(six, six.projects[0].id))
  const l = await loaded(storage)
  const r = await performRestore(env(storage, locks), planRestore(l.data, l.generation, old), { mode: 'seleccion', units: [`proyecto:${six.projects[0].id}`] })
  if (!r.ok) throw new Error(r.message)
  return { storage, locks, old, six }
}

describe('F02 · una sola validación del diario para toda escritura', () => {
  const damages: [string, (j: Record<string, unknown>) => Record<string, unknown>][] = [
    ['cerrado con el texto anterior alterado (huella que no coincide) — reproducción de Codex', (j) => ({ ...j, before: String(j.before).replace('"generation":', '"generation": ') })],
    ['cerrado con un texto anterior que no es un sobre legible', (j) => ({ ...j, before: '{"no":"sobre"}', beforeSha256: null })],
  ]
  for (const [name, damage] of damages)
    it(`diario ${name}: Recuperar lo ve dañado y un guardado normal tampoco escribe`, async () => {
      const { storage, locks } = await completed()
      const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
      const bad = damage(j)
      if (name.includes('sobre legible')) bad.beforeSha256 = await sha256Hex(String(bad.before))
      storage.setItem(JOURNAL_KEY, JSON.stringify(bad))
      expect((await inspectJournal(storage)).kind).toBe('ilegible')
      const s = createStore({ storage, locks, now, writer: 'edición' })
      expect(await s.pending()).toMatch(/dañado/)
      const l = await loaded(storage)
      const before = storage.snapshot()
      expect(await s.save(setNextAction(l.data, l.data.tasks[0].id, 'edición', ctx()), l.generation)).toMatchObject({ ok: false, reason: 'recuperacion-pendiente' })
      expect(storage.snapshot()).toBe(before)
    })

  it('un error al leer el diario no se toma como «no hay diario»: no se escribe', async () => {
    const { storage, locks } = await completed()
    const l = await loaded(storage)
    storage.failRead = (k) => (k === JOURNAL_KEY ? Object.assign(new Error('denied'), { name: 'SecurityError' }) : undefined)
    const before = storage.snapshot()
    const r = await createStore({ storage, locks, now, writer: 'edición' }).save(setNextAction(l.data, l.data.tasks[0].id, 'edición', ctx()), l.generation)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('recuperacion-pendiente')
    storage.failRead = undefined
    expect(storage.snapshot()).toBe(before)
  })
})

// ── F03 ──────────────────────────────────────────────────────────────────────

/** An open journal as 8c7ea4c wrote it: `beforeSha256: null` while «en-curso». */
async function legacyOpen(written: boolean) {
  const { storage, locks } = await completed()
  const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
  const cur = await loaded(storage)
  const legacy = { ...j, state: 'en-curso', beforeSha256: null, finishedAt: undefined, resultGeneration: undefined, error: undefined, ...(written ? {} : { before: storage.getItem(DATA_KEY), targetSha256: 'e'.repeat(64), baseGeneration: cur.generation }) }
  const raw = JSON.stringify(legacy)
  storage.setItem(JOURNAL_KEY, raw)
  return { storage, locks, raw, legacy }
}

describe('F03 · cerrar un diario abierto de 8c7ea4c deja un diario válido', () => {
  for (const written of [true, false])
    it(`interrumpido ${written ? 'después' : 'antes'} de escribir: «cerrada» y, al releerlo, sigue cerrada y válida, con la huella calculada y el texto de antes intacto`, async () => {
      const { storage, locks, legacy } = await legacyOpen(written)
      expect((await inspectJournal(storage)).kind).toBe(written ? 'escrita-sin-cerrar' : 'sin-escribir')
      expect((await settleJournal(env(storage, locks))).kind).toBe('cerrada')
      const again = await inspectJournal(storage)
      expect(again.kind).toBe('cerrada')
      const j = again.kind === 'cerrada' ? again.journal : undefined
      expect(j?.before).toBe(legacy.before)
      expect(j?.beforeSha256).toBe(await sha256Hex(String(legacy.before)))
      expect(await createStore({ storage, locks, now, writer: 'x' }).pending()).toBeUndefined()
    })

  it('cerrar a mano un diario antiguo «desconocido» también deja un diario válido', async () => {
    const { storage, locks, legacy } = await legacyOpen(true)
    // Something outside the store wrote after: neither the target nor the text before.
    const l = await loaded(storage)
    const other = JSON.parse(JSON.stringify(setNextAction(l.data, l.data.tasks[0].id, 'fuera', ctx())))
    storage.setItem(DATA_KEY, JSON.stringify({ format: 'elyum-projects-store/1', generation: l.generation + 1, savedAt: now(), writer: 'fuera', sha256: await sha256Hex(JSON.stringify(other)), data: other }))
    expect((await inspectJournal(storage)).kind).toBe('desconocida')
    expect(await dismissJournal(env(storage, locks), { reviewed: storage.getItem(JOURNAL_KEY)! })).toMatchObject({ ok: true }) // P2-R1.3.1: exact text reviewed
    const again = await inspectJournal(storage)
    expect(again).toMatchObject({ kind: 'cerrada', journal: { state: 'revisada', before: legacy.before } })
  })
})

// ── F04 ──────────────────────────────────────────────────────────────────────

describe('F04 · cancelar compartir no es guardar', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stubShare = (share: () => Promise<void>) => vi.stubGlobal('navigator', { canShare: () => true, share })
  const stubDownload = () => {
    const clicked: string[] = []
    vi.stubGlobal('document', { createElement: () => ({ click() { clicked.push('click') } }) })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    return clicked
  }

  it('la hoja de compartir cancelada devuelve «cancelado» (no habilita nada)', async () => {
    stubShare(() => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' })))
    expect(await saveJsonFile('x.json', '{}')).toMatchObject({ status: 'cancelado' })
  })
  it('compartir completado devuelve «entregado» por compartir: la app no sabe si quedó en Archivos', async () => {
    stubShare(() => Promise.resolve())
    expect(await saveJsonFile('x.json', '{}')).toMatchObject({ status: 'entregado', via: 'compartir' })
  })
  it('si compartir falla por otro motivo se pide una descarga, y se dice así', async () => {
    stubShare(() => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })))
    const clicked = stubDownload()
    expect(await saveJsonFile('x.json', '{}')).toMatchObject({ status: 'entregado', via: 'descarga' })
    expect(clicked).toEqual(['click'])
  })
})

// ── Cuota al cerrar un diario dañado ─────────────────────────────────────────

describe('cuota al cerrar un diario dañado', () => {
  it('sin espacio: el diario queda intacto, el error se devuelve y las escrituras siguen bloqueadas', async () => {
    const { storage, locks } = await completed()
    const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
    const bad = JSON.stringify({ ...j, state: 'terminada' })
    storage.setItem(JOURNAL_KEY, bad)
    storage.failOn = (k) => (k === JOURNAL_KEY ? quota() : undefined)
    const before = storage.snapshot()
    const r = await dismissJournal(env(storage, locks), { savedDamaged: true, reviewed: bad }) // P2-R1.3.1: exact text reviewed
    expect(r).toMatchObject({ ok: false, reason: 'sin-espacio' })
    expect(storage.snapshot()).toBe(before)
    expect(storage.getItem(JOURNAL_KEY)).toBe(bad)
    expect(await createStore({ storage, locks, now, writer: 'x' }).pending()).toMatch(/dañado/)
  })
})
