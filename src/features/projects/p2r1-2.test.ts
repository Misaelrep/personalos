import { describe, expect, it } from 'vitest'
import { createTask, setNextAction } from './domain/ops'
import { createProject } from './domain/operations'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData, Task } from './domain/types'
import { sha256Hex } from './import/sha256'
import { exportProjects } from './store/export'
import {
  buildRestore,
  diagnoseJournal,
  dismissJournal,
  inspectJournal,
  JOURNAL_KEY,
  performRestore,
  planRestore,
  readBackup,
  settleJournal,
  type Backup,
  type RestoreEnv,
  type RestorePlan,
} from './store/restore'
import { ProjectsSession, emptyProjectsData } from './store/session'
import { createStore, DATA_KEY, LOCK_NAME, readEnvelope, type KeyValue, type Locks } from './store/store'
import { loseProject, syntheticSix } from './ui/sandbox'

/*
 * P2-R1.2 · Corrections H01–H04 of the independent audit of 8c7ea4c.
 * Each test first reproduced the failure on 8c7ea4c (log in docs/proyectos/P2R1-2-correcciones.md)
 * and passes with the correction. SYNTHETIC data only.
 */

let clock = 0
const now = () => `2026-11-02T10:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}Z`
let seq = 0
const random = () => `p2r12-${++seq}`
const ctx = () => ({ now: now(), random })

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => void this.map.set(k, v)
  removeItem = (k: string) => void this.map.delete(k)
  /** Every key and value, to prove a refusal left local data byte for byte as it was. */
  snapshot = () => JSON.stringify([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

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

const env = (storage: KeyValue, locks: Locks | undefined, writer = 'tab'): RestoreEnv => ({ storage, locks, now, writer })

async function save(storage: KeyValue, locks: Locks, d: ProjectsData) {
  const s = createStore({ storage, locks, now, writer: 'semilla' })
  const cur = await s.load()
  const r = await s.save(d, (cur as { generation: number }).generation)
  if (!r.ok) throw new Error(r.message)
  return r.generation
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
async function planOn(storage: KeyValue, backup: Backup): Promise<RestorePlan> {
  const l = await loaded(storage)
  return planRestore(l.data, l.generation, backup)
}
const status = (d: ProjectsData, projectId: string) => d.vocabularies[d.projects.find((p) => p.id === projectId)!.dossier].status[0].literal
const addTask = (d: ProjectsData, projectId: string, title: string, extra: Partial<Parameters<typeof createTask>[1]> = {}) => createTask(d, { projectId, title, status: status(d, projectId), ...extra }, ctx())
const withRequirement = (d: ProjectsData, taskId: string, onTask: string): ProjectsData => ({
  ...d,
  tasks: d.tasks.map((t): Task => (t.id === taskId ? { ...t, requirements: [{ id: 'r1', literal: `Necesita ${onTask}`, kind: 'tarea', mode: 'todas', options: [{ kind: 'tarea', taskId: onTask }] }] } : t)),
})

/** Every dependency, task requirement, weekly commitment and weekly note that points to nothing. */
function brokenRefs(d: ProjectsData): string[] {
  const tasks = new Set(d.tasks.map((t) => t.id))
  const projects = new Set(d.projects.map((p) => p.id))
  return [
    ...d.tasks.flatMap((t) => t.dependsOn.filter((x) => !tasks.has(x)).map((x) => `dep ${t.id}→${x}`)),
    ...d.tasks.flatMap((t) => (t.requirements ?? []).flatMap((r) => r.options.flatMap((o) => (o.kind === 'tarea' && !tasks.has(o.taskId) ? [`req ${t.id}→${o.taskId}`] : [])))),
    ...d.weeks.flatMap((w) => w.commitments.filter((c) => !tasks.has(c.taskId)).map((c) => `commit ${w.weekStart}→${c.taskId}`)),
    ...d.weeks.flatMap((w) => w.notes.filter((x) => !projects.has(x.projectId)).map((x) => `note ${w.weekStart}→${x.projectId}`)),
  ]
}

/** Two ELYUM projects: B1 (in B) depends on A1 (in A). */
function linked() {
  let d = emptyProjectsData()
  const a = createProject(d, { name: 'Cocina sintética' }, ctx())
  d = a.data
  const b = createProject(d, { name: 'Biblioteca sintética' }, ctx())
  d = b.data
  const a1 = addTask(d, a.project.id, 'A1')
  d = a1.data
  const b1 = addTask(d, b.project.id, 'B1', { dependsOn: [a1.task.id] })
  d = b1.data
  return { d, a: a.project, b: b.project, a1: a1.task, b1: b1.task }
}

// ── H01 · Integridad de dependencias ─────────────────────────────────────────

describe('H01 · una recuperación nunca introduce referencias rotas', () => {
  it('copia antigua que elimina una tarea referenciada: «A» de la copia quitaría A2, de la que depende C1 → rechazada antes de escribir', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    let { d, a } = linked()
    await save(storage, locks, d)
    const old = await backupOf(storage) // A tiene solo A1
    // Después de la copia: A2 nueva en A; C1 (otro proyecto) depende de A2 y la requiere.
    const a2 = addTask(d, a.id, 'A2 creada después de la copia')
    d = a2.data
    const c = createProject(d, { name: 'Taller sintético' }, ctx())
    d = c.data
    const c1 = addTask(d, c.project.id, 'C1', { dependsOn: [a2.task.id] })
    d = withRequirement(c1.data, c1.task.id, a2.task.id)
    // …y A cambia localmente, para que haya algo que recuperar.
    d = setNextAction(d, d.tasks.find((t) => t.title === 'A1')!.id, 'cambio local', ctx())
    await save(storage, locks, d)
    const plan = await planOn(storage, old)
    const unitA = plan.units.find((u) => u.key === `proyecto:${a.id}`)!
    expect(unitA.state).toBe('distinta')
    expect(unitA.selectable).toBe(false)
    expect(unitA.why.join(' ')).toMatch(/C1/)
    expect(unitA.why.join(' ')).toMatch(/A2 creada después de la copia/)
    const built = buildRestore(plan, { mode: 'seleccion', units: [unitA.key] }, now())
    expect(built.ok).toBe(false)
    const before = storage.snapshot()
    const r = await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [unitA.key] })
    expect(r).toMatchObject({ ok: false, reason: 'seleccion-no-valida', written: false })
    expect(r.ok === false && r.details?.join(' ')).toMatch(/C1/)
    expect(storage.snapshot()).toBe(before)
  })

  it('dependencias entre proyectos: tras un reinicio, recuperar solo B (B1 depende de A1) se rechaza; B con A, sí, y sin nada roto', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    await save(storage, locks, linked().d)
    const old = await backupOf(storage)
    storage.map.clear()
    await save(storage, locks, linked().d) // mismos nombres, ids nuevos
    const plan = await planOn(storage, old)
    const b = plan.units.find((u) => u.label === 'Biblioteca sintética' && u.state === 'solo-en-copia')!
    const a = plan.units.find((u) => u.label === 'Cocina sintética' && u.state === 'solo-en-copia')!
    expect(b.selectable).toBe(false)
    expect(b.why.join(' ')).toMatch(/B1.*A1|A1.*B1/)
    expect(b.why.join(' ')).toMatch(/Cocina sintética/) // dice qué recuperar a la vez
    const before = storage.snapshot()
    expect(await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [b.key] })).toMatchObject({ ok: false, written: false })
    expect(storage.snapshot()).toBe(before)
    const both = buildRestore(plan, { mode: 'seleccion', units: [b.key, a.key] }, now())
    expect(both.ok).toBe(true)
    expect(both.ok && brokenRefs(both.data)).toEqual([])
    expect(await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [b.key, a.key] })).toMatchObject({ ok: true })
    expect(brokenRefs((await loaded(storage)).data)).toEqual([])
  })

  it('requisitos entre proyectos: recuperar solo el proyecto cuya tarea requiere una tarea ausente se rechaza', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const { d, a1, b1 } = linked()
    const req = withRequirement({ ...d, tasks: d.tasks.map((t) => (t.id === b1.id ? { ...t, dependsOn: [] } : t)) }, b1.id, a1.id)
    await save(storage, locks, req)
    const old = await backupOf(storage)
    storage.map.clear()
    await save(storage, locks, linked().d)
    const plan = await planOn(storage, old)
    const b = plan.units.find((u) => u.label === 'Biblioteca sintética' && u.state === 'solo-en-copia')!
    expect(b.selectable).toBe(false)
    expect(b.why.join(' ')).toMatch(/requisito/i)
  })

  it('revisiones semanales con notas de un proyecto ausente: solas no; junto con su proyecto, sí', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    const cocina = six.projects.find((p) => p.name === 'Cocina de prueba')!
    const withNote = { ...six, weeks: six.weeks.map((w) => ({ ...w, notes: [{ projectId: cocina.id, text: 'Nota sintética' }] })) }
    await save(storage, locks, withNote)
    const old = await backupOf(storage)
    await save(storage, locks, { ...loseProject(withNote, cocina.id), weeks: [] })
    const plan = await planOn(storage, old)
    const weeks = plan.units.find((u) => u.key === 'semanas')!
    expect(weeks.selectable).toBe(false)
    expect(weeks.why.join(' ')).toMatch(/Cocina de prueba/)
    const together = buildRestore(plan, { mode: 'seleccion', units: ['semanas', `proyecto:${cocina.id}`] }, now())
    expect(together.ok).toBe(true)
    expect(together.ok && brokenRefs(together.data)).toEqual([])
  })

  it('distingue lo histórico: una dependencia ya rota aquí no bloquea recuperar otro proyecto, y se avisa como preexistente', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const { d, b1 } = linked()
    const c = createProject(d, { name: 'Acuario sintético' }, ctx())
    let x = addTask(c.data, c.project.id, 'D1').data
    await save(storage, locks, x)
    const old = await backupOf(storage)
    // Aquí: B1 pasa a depender de una tarea que no existe (como un literal de dossier), y se pierde el Acuario.
    x = { ...x, tasks: x.tasks.map((t) => (t.id === b1.id ? { ...t, dependsOn: [...t.dependsOn, 'src:NO-EXISTE'] } : t)) }
    await save(storage, locks, loseProject(x, c.project.id))
    const plan = await planOn(storage, old)
    const unit = plan.units.find((u) => u.key === `proyecto:${c.project.id}`)!
    expect(unit.selectable).toBe(true)
    const built = buildRestore(plan, { mode: 'seleccion', units: [unit.key] }, now())
    expect(built.ok).toBe(true)
    expect(built.ok && (built as { warnings?: string[] }).warnings?.join(' ')).toMatch(/src:NO-EXISTE/)
    // Nada se repara ni se elimina para pasar la validación: la dependencia histórica sigue ahí.
    expect(built.ok && built.data.tasks.find((t) => t.id === b1.id)!.dependsOn).toContain('src:NO-EXISTE')
  })

  it('ninguna selección construible deja referencias rotas nuevas (todas las combinaciones del escenario del iPhone y de los proyectos enlazados)', async () => {
    for (const make of [linked, null]) {
      const storage = new MemoryStorage()
      const locks = memoryLocks()
      const first = make ? make().d : await syntheticSix(now, random)
      await save(storage, locks, first)
      const old = await backupOf(storage)
      storage.map.clear()
      await save(storage, locks, make ? make().d : await syntheticSix(now, random))
      const plan = await planOn(storage, old)
      const keys = plan.units.filter((u) => u.state === 'distinta' || u.state === 'solo-en-copia').map((u) => u.key)
      const subsets: string[][] = [[]]
      for (const k of keys) for (const s of [...subsets]) subsets.push([...s, k])
      const localBroken = new Set(brokenRefs(plan.local))
      for (const units of subsets.filter((s) => s.length)) {
        const r = buildRestore(plan, { mode: 'seleccion', units }, now())
        if (r.ok) for (const b of brokenRefs(r.data)) expect(localBroken.has(b) || brokenRefs(old.data).includes(b)).toBe(true)
      }
    }
  })
})

// ── H02 · Selecciones combinadas ─────────────────────────────────────────────

describe('H02 · combinaciones válidas en conjunto', () => {
  it('lo que no se puede recuperar solo sigue pudiéndose marcar, y la combinación válida se construye', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    await save(storage, locks, six)
    const old = await backupOf(storage)
    await save(storage, locks, loseProject(six, six.projects[0].id))
    const plan = await planOn(storage, old)
    const weeks = plan.units.find((u) => u.key === 'semanas')! as { selectable: boolean; choosable?: boolean }
    expect(weeks.selectable).toBe(false) // sola, no
    expect(weeks.choosable).toBe(true) // pero se puede marcar
    expect(buildRestore(plan, { mode: 'seleccion', units: ['semanas'] }, now()).ok).toBe(false)
    expect(buildRestore(plan, { mode: 'seleccion', units: ['semanas', `proyecto:${six.projects[0].id}`] }, now()).ok).toBe(true)
  })
})

// ── H03 · Diario de recuperación ─────────────────────────────────────────────

async function journaled() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const six = await syntheticSix(now, random)
  await save(storage, locks, six)
  const old = await backupOf(storage)
  await save(storage, locks, loseProject(six, six.projects[0].id))
  const plan = await planOn(storage, old)
  expect(await performRestore(env(storage, locks), plan, { mode: 'seleccion', units: [`proyecto:${six.projects[0].id}`] })).toMatchObject({ ok: true })
  const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
  return { storage, locks, six, old, j }
}

describe('H03 · el diario se valida entero', () => {
  const broken: [string, (j: Record<string, unknown>) => Record<string, unknown>][] = [
    ['«completada» sin generación resultante', (j) => ({ ...j, resultGeneration: undefined })],
    ['estado desconocido', (j) => ({ ...j, state: 'terminada' })],
    ['generación base no numérica', (j) => ({ ...j, baseGeneration: 'siete' })],
    ['texto anterior que no es texto', (j) => ({ ...j, before: { roto: true } })],
    ['huella de destino ausente', (j) => ({ ...j, targetSha256: undefined })],
    ['origen ausente', (j) => ({ ...j, source: undefined })],
    ['texto anterior alterado (su huella no coincide)', (j) => ({ ...j, before: String(j.before).replace('"generation":', '"generation": ') })],
  ]
  for (const [name, damage] of broken)
    it(`diario con formato correcto pero ${name}: no se da por cerrado, bloquea y se conserva`, async () => {
      const { storage, locks, old } = await journaled()
      const cur = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
      const bad = JSON.stringify(damage(cur))
      storage.setItem(JOURNAL_KEY, bad)
      const st = await inspectJournal(storage)
      expect(st.kind).toBe('ilegible')
      const before = storage.snapshot()
      const r = await performRestore(env(storage, locks), await planOn(storage, old), { mode: 'todo' })
      expect(r).toMatchObject({ ok: false, reason: 'recuperacion-interrumpida', written: false })
      expect(storage.snapshot()).toBe(before)
      expect(storage.getItem(JOURNAL_KEY)).toBe(bad)
    })

  it('diario cortado (JSON incompleto): cerrarlo sin haberlo guardado no lo borra ni lo sobrescribe', async () => {
    const { storage, locks } = await journaled()
    const cut = storage.getItem(JOURNAL_KEY)!.slice(0, 200)
    storage.setItem(JOURNAL_KEY, cut)
    expect((await inspectJournal(storage)).kind).toBe('ilegible')
    await dismissJournal(env(storage, locks))
    expect(storage.getItem(JOURNAL_KEY)).toBe(cut)
  })

  it('vía de diagnóstico y recuperación: se diagnostica, se guarda tal cual y solo entonces se cierra, conservando su texto y lo de antes', async () => {
    const { storage, locks, old } = await journaled()
    const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
    const bad = JSON.stringify({ ...j, state: 'terminada' })
    storage.setItem(JOURNAL_KEY, bad)
    const d = await diagnoseJournal(bad)
    expect(d.reason).toMatch(/estado desconocido/)
    expect(d.before).toBe(j.before) // still whole: it can be recovered through the same steps
    const data = storage.getItem(DATA_KEY)
    expect(await dismissJournal(env(storage, locks), { savedDamaged: true })).toMatchObject({ ok: true }) // P2-R1.3: result object instead of a boolean
    const closed = await inspectJournal(storage)
    expect(closed).toMatchObject({ kind: 'cerrada', journal: { state: 'revisada', damaged: bad, before: j.before } })
    expect(storage.getItem(DATA_KEY)).toBe(data)
    // Writes and recoveries are possible again.
    expect(await performRestore(env(storage, locks), await planOn(storage, old), { mode: 'todo' })).toMatchObject({ ok: true })
  })

  it('misma generación con otro contenido: «desconocida», nunca «sin escribir» (sonda H-gen)', async () => {
    const { storage, locks } = await journaled()
    const cur = await loaded(storage)
    const j = JSON.parse(storage.getItem(JOURNAL_KEY)!) as Record<string, unknown>
    storage.setItem(JOURNAL_KEY, JSON.stringify({ ...j, state: 'en-curso', finishedAt: undefined, resultGeneration: undefined, baseGeneration: cur.generation, targetSha256: 'f'.repeat(64) }))
    const other = JSON.parse(JSON.stringify({ ...cur.data, projects: cur.data.projects.map((p, i) => (i === 0 ? { ...p, name: 'OTRO CONTENIDO' } : p)) }))
    storage.setItem(DATA_KEY, JSON.stringify({ format: 'elyum-projects-store/1', generation: cur.generation, savedAt: now(), writer: 'otro', sha256: await sha256Hex(JSON.stringify(other)), data: other }))
    expect((await inspectJournal(storage)).kind).toBe('desconocida')
    expect((await settleJournal(env(storage, locks))).kind).toBe('desconocida')
  })
})

// ── H04 · Recuperación pendiente ─────────────────────────────────────────────

/** A recovery whose page died right after writing the journal: the journal says «en-curso». */
async function interrupted() {
  const storage = new MemoryStorage()
  const locks = memoryLocks()
  const six = await syntheticSix(now, random)
  await save(storage, locks, six)
  const old = await backupOf(storage)
  await save(storage, locks, loseProject(six, six.projects[0].id))
  const l = await loaded(storage)
  const plan = planRestore(l.data, l.generation, old)
  const real = storage.setItem
  let dead = false
  storage.setItem = (k, v) => {
    if (dead) throw new Error('la página se cerró')
    real(k, v)
    if (k === JOURNAL_KEY) dead = true
  }
  await performRestore(env(storage, locks), plan, { mode: 'todo' })
  storage.setItem = real
  return { storage, locks, l, six, plan }
}

describe('H04 · con una recuperación sin resolver no se escribe nada más', () => {
  it('interrupción seguida de una edición normal: la edición se rechaza y no altera nada', async () => {
    const { storage, locks, l } = await interrupted()
    expect(JSON.parse(storage.getItem(JOURNAL_KEY)!).state).toBe('en-curso')
    const before = storage.snapshot()
    const r = await createStore({ storage, locks, now, writer: 'edición' }).save(setNextAction(l.data, l.data.tasks[0].id, 'edición normal', ctx()), l.generation)
    expect(r).toMatchObject({ ok: false, reason: 'recuperacion-pendiente' })
    expect(storage.snapshot()).toBe(before)
  })

  it('al abrir PROYECTOS se detecta y la sesión lo dice; resolverla explícitamente vuelve a permitir escribir', async () => {
    const { storage, locks } = await interrupted()
    const session = new ProjectsSession(createStore({ storage, locks, now, writer: 'pestaña' }), now)
    const st = (await session.open()) as { status: string; pendingRecovery?: string }
    expect(st.status).toBe('listo')
    expect(st.pendingRecovery).toMatch(/recuperación/i)
    const before = storage.snapshot()
    const r = await session.change((d) => setNextAction(d, d.tasks[0].id, 'edición', ctx()))
    expect(r).toMatchObject({ ok: false, reason: 'recuperacion-pendiente' })
    expect(storage.snapshot()).toBe(before)
    // Resolved by the person (here: it never wrote, so it is closed as «no aplicada»).
    expect(await settleJournal(env(storage, locks))).toMatchObject({ kind: 'cerrada', journal: { state: 'no-aplicada' } })
    await session.open()
    expect(await session.change((d) => setNextAction(d, d.tasks[0].id, 'edición', ctx()))).toMatchObject({ ok: true })
  })

  it('conflicto entre pestañas: otra pestaña abierta antes de la interrupción tampoco puede escribir', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    await save(storage, locks, six)
    const old = await backupOf(storage)
    const other = new ProjectsSession(createStore({ storage, locks, now, writer: 'pestaña-b' }), now)
    await other.open()
    // Tab A starts a recovery and dies after the journal.
    const plan = await planOn(storage, old)
    const real = storage.setItem
    let dead = false
    storage.setItem = (k, v) => {
      if (dead) throw new Error('cerrada')
      real(k, v)
      if (k === JOURNAL_KEY) dead = true
    }
    await performRestore(env(storage, locks, 'pestaña-a'), plan, { mode: 'todo' })
    storage.setItem = real
    const before = storage.snapshot()
    // Tab B's generation is still current: without the guard it would write.
    expect(await other.change((d) => setNextAction(d, d.tasks[0].id, 'desde B', ctx()))).toMatchObject({ ok: false, reason: 'recuperacion-pendiente' })
    expect(storage.snapshot()).toBe(before)
  })

  it('cambios concurrentes durante la recuperación: el guardado que espera al bloqueo da conflicto y no pisa lo recuperado', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    await save(storage, locks, six)
    const old = await backupOf(storage)
    await save(storage, locks, loseProject(six, six.projects[0].id))
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, old)
    // Both start together; the recovery asks for the store lock first.
    const restoring = performRestore(env(storage, locks, 'recupera'), plan, { mode: 'seleccion', units: [`proyecto:${six.projects[0].id}`] })
    const editing = createStore({ storage, locks, now, writer: 'edita' }).save(setNextAction(l.data, l.data.tasks[0].id, 'concurrente', ctx()), l.generation)
    const [r, e] = await Promise.all([restoring, editing])
    expect(r.ok !== e.ok).toBe(true) // exactly one wins
    const after = await loaded(storage)
    expect(after.generation).toBe(l.generation + 1)
    if (r.ok) expect(e).toMatchObject({ ok: false, reason: 'conflicto' })
    else expect(r).toMatchObject({ ok: false, reason: 'conflicto', written: false })
  })

  it('otra pestaña que ya tenía el bloqueo guarda primero: la recuperación espera, da conflicto y no escribe ni el diario', async () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    const six = await syntheticSix(now, random)
    await save(storage, locks, six)
    const old = await backupOf(storage)
    await save(storage, locks, loseProject(six, six.projects[0].id))
    const l = await loaded(storage)
    const plan = planRestore(l.data, l.generation, old)
    const journalBefore = storage.getItem(JOURNAL_KEY)
    let pending!: ReturnType<typeof performRestore>
    await locks.request(LOCK_NAME, { mode: 'exclusive' }, async () => {
      pending = performRestore(env(storage, locks, 'recupera'), plan, { mode: 'todo' })
      await new Promise((res) => setTimeout(res, 5)) // the recovery is now waiting for this lock
      // Another tab's save, inside its lock: a new generation.
      const next = JSON.parse(JSON.stringify(setNextAction(l.data, l.data.tasks[0].id, 'otra pestaña', ctx())))
      storage.setItem(DATA_KEY, JSON.stringify({ format: 'elyum-projects-store/1', generation: l.generation + 1, savedAt: now(), writer: 'otra', sha256: await sha256Hex(JSON.stringify(next)), data: next }))
    })
    const after = storage.snapshot()
    expect(await pending).toMatchObject({ ok: false, reason: 'conflicto', written: false })
    expect(storage.snapshot()).toBe(after)
    expect(storage.getItem(JOURNAL_KEY)).toBe(journalBefore)
  })
})

describe('P2-R1.2 · el resultado sigue pasando el validador', () => {
  it('cada resultado escrito valida', async () => {
    const { storage } = await journaled()
    expect(validateProjectsData((await loaded(storage)).data).ok).toBe(true)
  })
})
