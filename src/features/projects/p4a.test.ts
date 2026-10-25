import { describe, expect, it } from 'vitest'
import { classifyStatus, decideApproval, setCondition, setVerification } from './domain/ops'
import type { ProjectsData } from './domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER_V2, SYNTHETIC_DOSSIER_V2_NAME } from './import/fixtures'
import { applyImport, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile } from './import/readers'
import { emptyProjectsData, ProjectsSession } from './store/session'
import { createStore, DATA_KEY, type KeyValue, type Locks } from './store/store'
import { inlineSegments, plainText } from './ui/inline'
import { fieldText } from './ui/labels'
import { clearCheck, DIAG_LOG_KEY, DIAG_PREFIX, reportText, runLocksCheck, type Env } from './ui/locksCheck'
import { parseRoute } from './ui/ProjectsApp'
import { blockerText } from './ui/ProjectView'
import { overview, projectSummary, stageOf, taskDetail, trackOf } from './ui/view'

/* P4a · Screens' logic. SYNTHETIC data only (see import/fixtures.ts). */

const enc = (s: string) => new TextEncoder().encode(s)
let clock = 0
const now = () => `2026-10-25T11:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}-06:00`
let seq = 0
const random = () => `p4a-${++seq}`
const ctx = () => ({ now: now(), random })
const CREATE: ImportDecisions = { target: { create: { name: 'Huerto de prueba' } }, statusClasses: { Pendiente: 'pendiente', 'No iniciado': 'pendiente' } }

async function imported(): Promise<{ data: ProjectsData; projectId: string }> {
  const r = await readDossierFile({ name: SYNTHETIC_DOSSIER_NAME, bytes: enc(SYNTHETIC_DOSSIER) })
  if (!r.ok) throw new Error(r.error)
  const plan = planImport(emptyProjectsData(), r.bundle, CREATE, ctx())
  return { data: applyImport(emptyProjectsData(), plan, CREATE, ctx()), projectId: plan.projectId }
}
const id = (sourceId: string) => `src:${sourceId}`

class MemoryStorage implements KeyValue {
  map = new Map<string, string>()
  getItem = (k: string) => this.map.get(k) ?? null
  setItem = (k: string, v: string) => void this.map.set(k, v)
  removeItem = (k: string) => void this.map.delete(k)
  key = (i: number) => [...this.map.keys()][i] ?? null
  get length() {
    return this.map.size
  }
}

/** Exclusive lock in memory, like navigator.locks for one origin. */
function memoryLocks(): Locks {
  let tail = Promise.resolve()
  return {
    request<T>(_n: string, _o: unknown, cb: () => Promise<T>): Promise<T> {
      const prev = tail
      let release!: () => void
      tail = new Promise<void>((r) => (release = r))
      return prev.then(cb).finally(release)
    },
  }
}

describe('P4a · PROYECTOS y PROYECTO', () => {
  it('groups the imported synthetic tasks by stage without inventing anything', async () => {
    const { data, projectId } = await imported()
    const s = projectSummary(data, projectId)!
    expect(s.stages).toEqual({ lista: 0, 'por-verificar': 1, bloqueada: 3, 'por-clasificar': 2, 'en-aprobacion': 0, cerrada: 0 })
    expect(s.open).toBe(6)
    // Nothing is ready: no candidate, no next action written.
    expect(s.candidates).toEqual([])
    expect(s.nextActions).toEqual([])
    expect(s.milestones).toEqual([])
    expect(s.blocked.map((b) => b.task.sourceId)).toEqual(['HUE-02', 'HUE-05', 'HUE-06'])
    expect(s.blocked.map((b) => blockerText(b.blockers))).toEqual(['espera HUE-01', 'espera HUE-02, HUE-03', 'espera HUE-04 · «báscula» por verificar'])
    expect(s.sources).toBe(2)
    expect(s.references).toBe(2)
    expect(s.lastImport?.dossier).toBe(SYNTHETIC_DOSSIER_NAME)
    const o = overview(data)
    expect(o.summaries).toHaveLength(1)
    expect(o.totals.open).toBe(6)
  })

  it('a task becomes a candidate only when the person confirms its condition', async () => {
    const { data, projectId } = await imported()
    const t = data.tasks.find((x) => x.id === id('HUE-01'))!
    expect(stageOf(data, t)).toBe('por-verificar')
    const next = setCondition(data, t.id, t.requirements![0].id, 0, 'cumplida', ctx())
    expect(stageOf(next, next.tasks.find((x) => x.id === t.id)!)).toBe('lista')
    expect(projectSummary(next, projectId)!.candidates.map((c) => c.sourceId)).toEqual(['HUE-01'])
  })

  it('a project that does not exist gives nothing', async () => {
    const { data } = await imported()
    expect(projectSummary(data, 'no-existe')).toBeUndefined()
    expect(taskDetail(data, 'src:NO-01')).toBeUndefined()
  })
})

describe('P4a · TAREA', () => {
  it('keeps executed, verified and approved apart', async () => {
    const { data } = await imported()
    let d = classifyStatus(data, SYNTHETIC_DOSSIER_NAME, 'No consta', 'ejecutada', ctx())
    const t = () => d.tasks.find((x) => x.id === id('HUE-04'))!
    expect(stageOf(d, t())).toBe('en-aprobacion')
    expect(trackOf(d, t())).toMatchObject({ executed: { state: 'si', literal: 'No consta' }, verified: { state: 'sin-dato' }, approved: { state: 'sin-dato', returned: false } })
    d = decideApproval(d, t().id, 'aprobada', ctx())
    // Approved and closed, but nobody verified it: still «sin dato».
    expect(stageOf(d, t())).toBe('cerrada')
    expect(trackOf(d, t())).toMatchObject({ executed: { state: 'si' }, verified: { state: 'sin-dato' }, approved: { state: 'aprobada' } })
    d = setVerification(d, t().id, { state: 'verificada' }, ctx())
    expect(trackOf(d, t()).verified.state).toBe('verificada')
  })

  it('an unclassified status reads as «sin decidir», never as not executed', async () => {
    const { data } = await imported()
    const t = data.tasks.find((x) => x.id === id('HUE-03'))!
    expect(trackOf(data, t).executed).toEqual({ state: 'sin-decidir', workClass: 'sin-decidir', literal: 'Borrador existente' })
  })

  it('shows who waits for the task and resolves the sources it cites (an unknown key stays unknown)', async () => {
    const { data } = await imported()
    const d1 = taskDetail(data, id('HUE-01'))!
    // HUE-04 says «HUE-01..03 según parcela»: a condition to verify, not a link (P1.1 · M3).
    expect(d1.usedBy.map((t) => t.sourceId)).toEqual(['HUE-02'])
    expect(d1.sources.map((s) => [s.key, s.source?.title])).toEqual([
      ['F1', '`manual_inventado.md`'],
      ['F2', 'Conversación ficticia'],
    ])
    const d5 = taskDetail(data, id('HUE-05'))!
    expect(d5.sources.map((s) => [s.key, s.source?.title])).toEqual([
      ['F1', '`manual_inventado.md`'],
      ['F9', undefined],
    ])
    expect(d5.task.owner).toBeUndefined()
    expect(d5.task.priority).toBeUndefined()
    expect(d5.task.delegation).toEqual({ literal: 'IA agrega', candidates: [] })
    expect(d5.task.origin?.raw).toContain('HUE-05')
  })
})

describe('P4a · IMPORTAR con la sesión', () => {
  const session = () => {
    const storage = new MemoryStorage()
    const locks = memoryLocks()
    return { storage, locks, s: new ProjectsSession(createStore({ storage, locks, now, writer: 'a' }), now, random) }
  }
  const v1 = { name: SYNTHETIC_DOSSIER_NAME, bytes: enc(SYNTHETIC_DOSSIER) }
  const v2 = { name: SYNTHETIC_DOSSIER_V2_NAME, bytes: enc(SYNTHETIC_DOSSIER_V2) }

  it('the preview writes nothing; cancelling leaves the store empty', async () => {
    const { storage, s } = session()
    await s.open()
    const r = await s.previewImport(v1, CREATE)
    expect(r.ok).toBe(true)
    expect(storage.getItem(DATA_KEY)).toBeNull()
  })

  it('the v2 dossier re-imports as changed, new and no-longer-there; nothing is deleted', async () => {
    const { s } = session()
    await s.open()
    const p1 = await s.previewImport(v1, CREATE)
    if (!p1.ok) throw new Error(p1.error)
    expect((await s.confirmImport(p1.preview)).ok).toBe(true)
    const projectId = p1.preview.plan.projectId
    const p2 = await s.previewImport(v2, { target: { projectId } })
    if (!p2.ok) throw new Error(p2.error)
    const plan = p2.preview.plan
    expect(plan.ok).toBe(true)
    expect(plan.counts).toMatchObject({ new: 1, changed: 2, conflicts: 0, unchanged: 3, missing: 1 })
    expect(plan.newStatusLiterals.map((l) => [l.literal, l.workClass])).toEqual([['En curso', 'sin-decidir']])
    expect(plan.missing.map((m) => m.sourceId)).toEqual(['HUE-06'])
    expect((await s.confirmImport(p2.preview)).ok).toBe(true)
    const d = s.state!.status === 'listo' ? s.state!.data : undefined
    expect(d!.tasks.map((t) => t.sourceId).sort()).toEqual(['HUE-01', 'HUE-02', 'HUE-03', 'HUE-04', 'HUE-05', 'HUE-06', 'HUE-07'])
  })

  it('a second tab that saved after the preview makes the confirmation fail visibly', async () => {
    const { storage, locks, s } = session()
    await s.open()
    const p = await s.previewImport(v1, CREATE)
    if (!p.ok) throw new Error(p.error)
    const other = new ProjectsSession(createStore({ storage, locks, now, writer: 'b' }), now, random)
    await other.open()
    const o = await other.previewImport(v1, { ...CREATE, target: { create: { name: 'Otro' } } })
    if (!o.ok) throw new Error(o.error)
    expect((await other.confirmImport(o.preview)).ok).toBe(true)
    const r = await s.confirmImport(p.preview)
    expect(r).toMatchObject({ ok: false, reason: 'conflicto' })
  })

  it('creating a project whose dossier file is already used is refused, not duplicated', async () => {
    const { s } = session()
    await s.open()
    const p = await s.previewImport(v1, CREATE)
    if (!p.ok) throw new Error(p.error)
    await s.confirmImport(p.preview)
    const again = await s.previewImport(v1, CREATE)
    if (!again.ok) throw new Error(again.error)
    expect(again.preview.plan.ok).toBe(false)
    expect(again.preview.plan.errors.join(' ')).toMatch(/ya hay un proyecto que usa el dossier/)
  })
})

describe('P4a · prueba de Web Locks', () => {
  const env = (storage: MemoryStorage, locks: Locks | undefined, where: 'app' | 'navegador' = 'navegador'): Env => ({ storage, locks, now, where, userAgent: 'prueba', secure: true })

  it('with locks: every step passes, on its own keys only', async () => {
    const storage = new MemoryStorage()
    const r = await runLocksCheck(env(storage, memoryLocks()))
    expect(r.steps.map((s) => [s.id, s.result])).toEqual([
      ['api', 'ok'],
      ['bloqueo', 'ok'],
      ['escritura', 'ok'],
      ['conflicto', 'ok'],
      ['persistencia', 'aviso'],
      ['sin-bloqueo', 'ok'],
    ])
    expect(storage.getItem(DATA_KEY)).toBeNull()
    expect([...storage.map.keys()].every((k) => k.startsWith(DIAG_PREFIX))).toBe(true)
    expect(reportText(r)).toContain('Web Locks funciona en este navegador con datos sintéticos.')
  })

  it('a second run finds what the first one left; a change in between is caught', async () => {
    const storage = new MemoryStorage()
    await runLocksCheck(env(storage, memoryLocks()))
    const second = await runLocksCheck(env(storage, memoryLocks()))
    expect(second.steps.find((s) => s.id === 'persistencia')?.result).toBe('ok')
    storage.setItem(DIAG_PREFIX + DATA_KEY, '{"alterado":true}')
    const third = await runLocksCheck(env(storage, memoryLocks()))
    expect(third.steps.find((s) => s.id === 'persistencia')?.result).toBe('falla')
  })

  it('without locks: says so, stays read-only and writes no data', async () => {
    const storage = new MemoryStorage()
    const r = await runLocksCheck(env(storage, undefined))
    expect(r.locks).toBe(false)
    expect(r.steps.map((s) => [s.id, s.result])).toEqual([
      ['api', 'falla'],
      ['persistencia', 'aviso'],
      ['sin-bloqueo', 'ok'],
    ])
    expect(storage.getItem(DIAG_PREFIX + DATA_KEY)).toBeNull()
    expect(r.verdict).toMatch(/solo lectura/)
  })

  it('clearing removes only the check’s keys', async () => {
    const storage = new MemoryStorage()
    storage.setItem(DATA_KEY, 'datos de PROYECTOS')
    await runLocksCheck(env(storage, memoryLocks()))
    expect(storage.getItem(DIAG_LOG_KEY)).not.toBeNull()
    expect(clearCheck(storage)).toBeGreaterThan(0)
    expect([...storage.map.keys()]).toEqual([DATA_KEY])
  })
})

describe('P4a · navegación y textos', () => {
  it('reads the hash routes', () => {
    expect(parseRoute('')).toEqual({ kind: 'inicio' })
    expect(parseRoute('#/proyecto/new%3Aabc')).toEqual({ kind: 'proyecto', id: 'new:abc' })
    expect(parseRoute('#/tarea/src%3AHUE-01')).toEqual({ kind: 'tarea', id: 'src:HUE-01' })
    expect(parseRoute('#/importar')).toEqual({ kind: 'importar' })
    expect(parseRoute('#/prueba-iphone')).toEqual({ kind: 'prueba' })
    expect(parseRoute('#/otra')).toEqual({ kind: 'inicio' })
  })

  it('prints plan values literally', () => {
    expect(fieldText(undefined)).toBe('—')
    expect(fieldText({ literal: '20–35 min' })).toBe('20–35 min')
    expect(fieldText(['a', 'b'])).toBe('a · b')
  })
})

describe('P4a · presentación de literales (sin tocar lo guardado)', () => {
  it('shows escaped pipes and Markdown emphasis as text', () => {
    expect(plainText('Anotar el riego \\| diario')).toBe('Anotar el riego | diario')
    expect(inlineSegments('Comprobar la llave de *paso*')).toEqual([{ text: 'Comprobar la llave de ' }, { text: 'paso', em: true }])
    expect(inlineSegments('**Sí, usuario**')).toEqual([{ text: 'Sí, usuario', strong: true }])
    expect(inlineSegments('`manual_inventado.md`')).toEqual([{ text: 'manual_inventado.md', code: true }])
  })

  it('leaves alone what is not Markdown', () => {
    expect(plainText('HUE-02 o semillas del vecino')).toBe('HUE-02 o semillas del vecino')
    expect(plainText('archivo_de_riego_v2')).toBe('archivo_de_riego_v2')
    expect(plainText('2 * 3 = 6')).toBe('2 * 3 = 6')
    expect(plainText('un *solo asterisco')).toBe('un *solo asterisco')
    expect(plainText('<b>no es HTML</b>')).toBe('<b>no es HTML</b>')
  })

  it('the stored literal and the original row keep the escape', async () => {
    const { data } = await imported()
    const t = data.tasks.find((x) => x.id === id('HUE-05'))!
    expect(t.title).toBe('Anotar el riego \\| diario')
    expect(t.origin?.raw).toContain('\\|')
  })
})
