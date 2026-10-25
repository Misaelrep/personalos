import { describe, expect, it } from 'vitest'
import { awaitingApprovalAll, isClosed, readinessOf } from './domain/derive'
import { addEvidence, classifyStatus, commit, decideApproval, OpError, setCondition, setNextAction, setOwner, setVerification, setWeekLimits, uncommit } from './domain/ops'
import { changeStatus, closeWeekReview, createProject, ELYUM_STATUSES, elyumDossierKey, similarProjects, statusChoices } from './domain/operations'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData } from './domain/types'
import { SYNTHETIC_DOSSIER, SYNTHETIC_DOSSIER_NAME, SYNTHETIC_TALLER, SYNTHETIC_TALLER_NAME } from './import/fixtures'
import { applyImport, planImport, type ImportDecisions } from './import/plan'
import { readDossierFile } from './import/readers'
import { emptyProjectsData, ProjectsSession } from './store/session'
import { createStore, DATA_KEY, type KeyValue, type Locks } from './store/store'
import { reviewWeekFor, weeklyReview } from './ui/review'
import { projectSummary, stageOf, trackOf } from './ui/view'

/* P4b · Operations and the weekly review. SYNTHETIC data only (see import/fixtures.ts). */

const enc = (s: string) => new TextEncoder().encode(s)
let clock = 0
const now = () => `2026-10-25T12:${String(Math.floor(clock / 60) % 60).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}-06:00`
let seq = 0
const random = () => `p4b-${++seq}`
const ctx = () => ({ now: now(), random })
const classes = { Pendiente: 'pendiente', 'No iniciado': 'pendiente', Hecho: 'ejecutada' } as const
const WEEK = '2026-10-26'

async function importInto(data: ProjectsData, name: string, text: string, projectName: string) {
  const r = await readDossierFile({ name, bytes: enc(text) })
  if (!r.ok) throw new Error(r.error)
  const decisions: ImportDecisions = { target: { create: { name: projectName } }, statusClasses: { ...classes } }
  const plan = planImport(data, r.bundle, decisions, ctx())
  if (!plan.ok) throw new Error(plan.errors.join('; '))
  return applyImport(data, plan, decisions, ctx())
}

/** Six projects: HUERTO and TALLER imported, four created in ELYUM. */
async function six(): Promise<ProjectsData> {
  let d = await importInto(emptyProjectsData(), SYNTHETIC_DOSSIER_NAME, SYNTHETIC_DOSSIER, 'Huerto de prueba')
  d = await importInto(d, SYNTHETIC_TALLER_NAME, SYNTHETIC_TALLER, 'Taller de prueba')
  for (const name of ['Cocina de prueba', 'Biblioteca de prueba', 'Bicicleta de prueba', 'Acuario de prueba']) d = createProject(d, { name, objective: `Objetivo inventado de ${name}` }, ctx()).data
  return d
}
const task = (d: ProjectsData, sourceId: string) => d.tasks.find((t) => t.sourceId === sourceId)!
const valid = (d: ProjectsData) => expect(validateProjectsData(JSON.parse(JSON.stringify(d))).ok).toBe(true)

describe('P4b · crear proyecto', () => {
  it('generates the id, gives ELYUM’s status words and validates', () => {
    const { data, project } = createProject(emptyProjectsData(), { name: '  Cocina de prueba ', objective: ' Ordenar ' }, ctx())
    expect(project.id).toMatch(/^new:/)
    expect(project).toMatchObject({ name: 'Cocina de prueba', objective: 'Ordenar', dossier: elyumDossierKey(project.id) })
    expect(data.vocabularies[project.dossier].status).toEqual(ELYUM_STATUSES)
    expect(data.history.at(-1)).toMatchObject({ entity: 'project', field: 'created', to: 'Cocina de prueba' })
    valid(data)
  })

  it('refuses an empty name', () => {
    expect(() => createProject(emptyProjectsData(), { name: '   ' }, ctx())).toThrow(OpError)
  })

  it('finds similar names (accents, case, generic prefix, shared words) and not unrelated ones', async () => {
    const d = await six()
    expect(similarProjects(d, 'huerto de PRUEBA').map((p) => p.name)).toEqual(['Huerto de prueba'])
    expect(similarProjects(d, 'Dossier operativo — Taller de prueba').map((p) => p.name)).toEqual(['Taller de prueba'])
    expect(similarProjects(d, 'Cocína').map((p) => p.name)).toEqual(['Cocina de prueba'])
    expect(similarProjects(d, 'Observatorio')).toEqual([])
  })

  it('a later dossier for a created project imports into it when the person links it', async () => {
    let d = createProject(emptyProjectsData(), { name: 'Huerto de prueba' }, ctx()).data
    const projectId = d.projects[0].id
    const r = await readDossierFile({ name: SYNTHETIC_DOSSIER_NAME, bytes: enc(SYNTHETIC_DOSSIER) })
    if (!r.ok) throw new Error(r.error)
    const decisions: ImportDecisions = { target: { projectId }, statusClasses: { 'No iniciado': 'pendiente' } }
    const plan = planImport(d, r.bundle, decisions, ctx())
    expect(plan.ok).toBe(true)
    d = applyImport(d, plan, decisions, ctx())
    expect(d.projects).toHaveLength(1)
    expect(d.tasks.every((t) => t.projectId === projectId)).toBe(true)
    // «Pendiente» was already an ELYUM word of this project: it keeps its class.
    expect(stageOf(d, task(d, 'HUE-01'))).toBe('por-verificar')
    valid(d)
  })
})

describe('P4b · estados explícitos', () => {
  it('offers the dossier’s words first, then ELYUM’s missing ones', async () => {
    const d = await six()
    const c = statusChoices(d, task(d, 'HUE-01').projectId)
    expect(c.filter((x) => !x.fromElyum).map((x) => x.literal)).toEqual(['Pendiente', 'Borrador existente', 'No consta', 'No iniciado'])
    expect(c.filter((x) => x.fromElyum).map((x) => x.literal)).toEqual(['En curso', 'En espera', 'Ejecutada', 'Descartada'])
  })

  it('choosing an ELYUM word adds it to the vocabulary and keeps the dossier literal in history and origin', async () => {
    let d = await six()
    const t = task(d, 'HUE-01')
    d = changeStatus(d, t.id, 'Ejecutada', ctx())
    const after = task(d, 'HUE-01')
    expect(after.status).toBe('Ejecutada')
    expect(after.origin?.raw).toContain('| Pendiente |')
    expect(d.history.slice(-2).map((h) => [h.entity, h.field, h.from, h.to])).toEqual([
      ['vocabulary', 'status:Ejecutada', undefined, 'ejecutada'],
      ['task', 'status', 'Pendiente', 'Ejecutada'],
    ])
    valid(d)
  })

  it('refuses an unknown word and the same status', async () => {
    const d = await six()
    expect(() => changeStatus(d, task(d, 'HUE-01').id, 'Inventado', ctx())).toThrow(/fuera del vocabulario/)
    expect(() => changeStatus(d, task(d, 'HUE-01').id, 'Pendiente', ctx())).toThrow(/ya tiene ese estado/)
  })

  it('classifying a dossier word changes every task that uses it, and only its class', async () => {
    let d = await six()
    const hue03 = task(d, 'HUE-03')
    d = classifyStatus(d, SYNTHETIC_DOSSIER_NAME, 'Borrador existente', 'en-curso', ctx())
    expect(task(d, 'HUE-03').status).toBe(hue03.status)
    expect(stageOf(d, task(d, 'HUE-03'))).not.toBe('por-clasificar')
  })
})

describe('P4b · requisitos, encargos, evidencias y aprobaciones', () => {
  it('marking a condition met makes the task a candidate; marking it not met blocks it', async () => {
    let d = await six()
    const t = task(d, 'HUE-01')
    d = setCondition(d, t.id, t.requirements![0].id, 0, 'cumplida', ctx())
    expect(readinessOf(d, task(d, 'HUE-01'))).toBe('lista')
    d = setCondition(d, t.id, t.requirements![0].id, 0, 'no-cumplida', ctx())
    expect(readinessOf(d, task(d, 'HUE-01'))).toBe('bloqueada')
  })

  it('an agent assignment is listed apart and never counts as the person’s candidate', async () => {
    let d = await six()
    const t = task(d, 'TAL-03')
    expect(projectSummary(d, t.projectId)!.candidates.map((x) => x.sourceId)).toContain('TAL-03')
    d = setOwner(d, t.id, { kind: 'agente', name: 'Claude Code' }, ctx())
    d = setNextAction(d, t.id, 'Redactar el inventario a partir de inventario_ficticio.md', ctx())
    const s = projectSummary(d, t.projectId)!
    expect(s.candidates.map((x) => x.sourceId)).not.toContain('TAL-03')
    expect(s.agents.map((x) => x.sourceId)).toEqual(['TAL-03'])
    expect(s.nextActions).toEqual([])
    const r = weeklyReview(d, reviewWeekFor(d, WEEK))
    expect(r.agents.map((x) => [x.sourceId, x.owner?.name])).toEqual([['TAL-03', 'Claude Code']])
  })

  it('executed waits for approval; returning reopens with the reason; approving closes; verification stays separate', async () => {
    let d = await six()
    const id = task(d, 'TAL-03').id
    d = changeStatus(d, id, 'Ejecutada', ctx())
    expect(stageOf(d, task(d, 'TAL-03'))).toBe('en-aprobacion')
    expect(awaitingApprovalAll(d).map((t) => t.sourceId)).toContain('TAL-03')
    d = addEvidence(d, id, { kind: 'enlace', label: 'Inventario v1', url: 'https://example.invalid/inventario' }, ctx())
    d = decideApproval(d, id, 'devuelta', ctx(), 'Faltan las brocas')
    expect(isClosed(d, task(d, 'TAL-03'))).toBe(false)
    expect(trackOf(d, task(d, 'TAL-03')).approved).toMatchObject({ state: 'devuelta', returned: true })
    expect(task(d, 'TAL-03').approval.note).toBe('Faltan las brocas')
    d = addEvidence(d, id, { kind: 'nota', label: 'Brocas añadidas' }, ctx())
    d = decideApproval(d, id, 'aprobada', ctx())
    expect(isClosed(d, task(d, 'TAL-03'))).toBe(true)
    expect(trackOf(d, task(d, 'TAL-03')).verified.state).toBe('sin-dato')
    d = setVerification(d, id, { state: 'verificada' }, ctx())
    expect(task(d, 'TAL-03').evidence.map((e) => e.label)).toEqual(['Inventario v1', 'Brocas añadidas'])
    valid(d)
  })

  it('an imported executed task with no approval data is never closed on its own', async () => {
    const d = await six()
    const t = task(d, 'TAL-04')
    expect(t.status).toBe('Hecho')
    expect(t.approval.state).toBe('sin-dato')
    expect(stageOf(d, t)).toBe('en-aprobacion')
  })
})

describe('P4b · revisión semanal', () => {
  it('on Sunday it plans the coming week; before the cycle, the first week', async () => {
    const d = await six()
    expect(reviewWeekFor(d, '2026-11-01').start).toBe('2026-11-02')
    expect(reviewWeekFor(d, '2026-11-04').start).toBe('2026-11-02')
    expect(reviewWeekFor(d, '2026-10-24').start).toBe('2026-10-26')
  })

  it('shows all six projects, proposes nothing and commits only what the person chooses', async () => {
    let d = await six()
    const week = reviewWeekFor(d, WEEK)
    let r = weeklyReview(d, week)
    expect(r.projects).toHaveLength(6)
    expect(r.commitments).toEqual([])
    expect(r.projects.map((p) => [p.project.name, p.candidates.map((t) => t.sourceId)])).toEqual([
      ['Huerto de prueba', []],
      ['Taller de prueba', ['TAL-01', 'TAL-03']],
      ['Cocina de prueba', []],
      ['Biblioteca de prueba', []],
      ['Bicicleta de prueba', []],
      ['Acuario de prueba', []],
    ])
    expect(r.awaiting.map((t) => t.sourceId)).toEqual(['TAL-04'])
    d = setWeekLimits(d, WEEK, { humanCapacityHours: 2, wipLimit: 1 }, ctx())
    d = commit(d, WEEK, task(d, 'TAL-01').id, ctx(), 0.5)
    d = commit(d, WEEK, task(d, 'TAL-03').id, ctx())
    r = weeklyReview(d, week)
    expect(r.commitments.map((c) => [c.task.sourceId, c.estimateHours])).toEqual([
      ['TAL-01', 0.5],
      ['TAL-03', undefined],
    ])
    expect(r.hoursLeft).toBe(1.5)
    expect(r.slotsLeft).toBe(-1)
    expect(r.load.warnings.map((w) => w.kind)).toEqual(['over-wip', 'unestimated'])
    // Committed tasks leave the candidate list; nothing else changed on the tasks.
    expect(r.projects[1].candidates).toEqual([])
    expect(task(d, 'TAL-01').status).toBe('Pendiente')
    d = uncommit(d, WEEK, task(d, 'TAL-03').id, ctx())
    d = closeWeekReview(d, WEEK, ctx())
    r = weeklyReview(d, week)
    expect(r.commitments).toHaveLength(1)
    expect(r.plan?.closedAt).toBeDefined()
    expect(r.load.warnings).toEqual([])
    valid(d)
  })

  it('refuses a week that does not start on Monday', async () => {
    const d = await six()
    expect(() => closeWeekReview(d, '2026-10-27', ctx())).toThrow(/lunes/)
  })
})

describe('P4b · persistencia y conflictos de cada escritura', () => {
  class MemoryStorage implements KeyValue {
    map = new Map<string, string>()
    getItem = (k: string) => this.map.get(k) ?? null
    setItem = (k: string, v: string) => void this.map.set(k, v)
    removeItem = (k: string) => void this.map.delete(k)
  }
  const locks = (): Locks => {
    let tail = Promise.resolve()
    return {
      request<T>(_n: string, _o: unknown, cb: () => Promise<T>) {
        const prev = tail
        let release!: () => void
        tail = new Promise<void>((r) => (release = r))
        return prev.then(cb).finally(release)
      },
    }
  }

  it('every operation saves, re-reads identical from a new session, and a stale session is refused', async () => {
    const storage = new MemoryStorage()
    const l = locks()
    const open = async (w: string) => {
      const s = new ProjectsSession(createStore({ storage, locks: l, now, writer: w }), now, random)
      await s.open()
      return s
    }
    const a = await open('a')
    const base = await six()
    expect((await a.change(() => base)).ok).toBe(true)
    const t = (sid: string) => task(base, sid).id
    const ops: [string, (d: ProjectsData) => ProjectsData][] = [
      ['createProject', (d) => createProject(d, { name: 'Jardín vertical de prueba' }, ctx()).data],
      ['changeStatus', (d) => changeStatus(d, t('TAL-03'), 'En curso', ctx())],
      ['setCondition', (d) => setCondition(d, t('HUE-01'), task(d, 'HUE-01').requirements![0].id, 0, 'cumplida', ctx())],
      ['setOwner', (d) => setOwner(d, t('TAL-02'), { kind: 'agente', name: 'Codex' }, ctx())],
      ['setNextAction', (d) => setNextAction(d, t('TAL-01'), 'Retirar las cajas', ctx())],
      ['addEvidence', (d) => addEvidence(d, t('TAL-04'), { kind: 'nota', label: 'Pedido confirmado' }, ctx())],
      ['setVerification', (d) => setVerification(d, t('TAL-04'), { state: 'verificada' }, ctx())],
      ['decideApproval', (d) => decideApproval(d, t('TAL-04'), 'aprobada', ctx())],
      ['setWeekLimits', (d) => setWeekLimits(d, WEEK, { humanCapacityHours: 6, wipLimit: 3 }, ctx())],
      ['commit', (d) => commit(d, WEEK, t('TAL-01'), ctx(), 1)],
      ['closeWeekReview', (d) => closeWeekReview(d, WEEK, ctx())],
    ]
    for (const [name, op] of ops) {
      const stale = await open(`stale-${name}`)
      const r = await a.change(op)
      expect(r.ok, name).toBe(true)
      const fresh = await open(`fresh-${name}`)
      expect(fresh.state?.status === 'listo' && JSON.stringify(fresh.state.data), name).toBe(a.state?.status === 'listo' && JSON.stringify(a.state.data))
      const before = storage.getItem(DATA_KEY)
      expect(await stale.change((d) => setNextAction(d, t('TAL-02'), `desde una pestaña vieja (${name})`, ctx())), name).toMatchObject({ ok: false, reason: 'conflicto' })
      expect(storage.getItem(DATA_KEY), name).toBe(before)
    }
  })

  it('without Web Locks nothing is written', async () => {
    const storage = new MemoryStorage()
    const s = new ProjectsSession(createStore({ storage, locks: undefined, now, writer: 'ro' }), now)
    await s.open()
    expect(await s.change((d) => createProject(d, { name: 'No se guarda' }, ctx()).data)).toMatchObject({ ok: false, reason: 'solo-lectura' })
    expect(storage.getItem(DATA_KEY)).toBeNull()
  })
})
