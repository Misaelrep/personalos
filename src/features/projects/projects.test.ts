import { describe, expect, it } from 'vitest'
import { routineForDate } from '../../data/routine'
import { WEEKLY_ROUTINE } from '../../data/routine'
import { correspondenceTable, routineCapacity, routineMinutesByTag, ROUTINE_TAGS } from './domain/capacity'
import { cycleDays, cycleIssues, cycleWeekOf, cycleWeeks, isDateKey, weekStartOf } from './domain/cycle'
import {
  awaitingApprovalAll,
  blockersOf,
  dependencyCycles,
  isAwaitingApproval,
  isBlocked,
  isClosed,
  isDone,
  nextActionCandidates,
  projectWeek,
  weekLoad,
} from './domain/derive'
import { displayRef, importedId, isGeneratedId, newId, prefixOf, prefixReport } from './domain/ids'
import { addEvidence, commit, createTask, decideApproval, OpError, requestApproval, setOwner, setRoutineLink, setStatus, setWeekLimits, uncommit } from './domain/ops'
import { validateProjectsData } from './domain/schema'
import type { Origin, ProjectsData, Task, Vocabulary } from './domain/types'
import { priorityRank, workClassOf } from './domain/vocabulary'

/*
 * SYNTHETIC data only. The IDs reproduce the SHAPE of the dossiers' identifiers
 * (PUB, EDI, SYS, COM, M…) to prove they are kept literally; no real content.
 */

const CYCLE = { start: '2026-10-26', end: '2027-01-23' }
const AT = '2026-10-25T21:00:00-06:00'

/** A dossier that speaks its own words: they are mapped, never renamed. */
const VOCAB: Vocabulary = {
  status: [
    { literal: 'Por iniciar', workClass: 'pendiente' },
    { literal: 'En proceso', workClass: 'en-curso' },
    { literal: 'Esperando insumo', workClass: 'en-espera' },
    { literal: 'Hecho', workClass: 'ejecutada' },
    { literal: 'Cancelado', workClass: 'descartada' },
  ],
  priority: [
    { literal: 'P1', rank: 1 },
    { literal: 'P2', rank: 2 },
    { literal: 'P3', rank: 3 },
  ],
  approval: [
    { literal: 'No aplica', state: 'no-requiere' },
    { literal: 'Pendiente de revisión', state: 'pendiente' },
    { literal: 'Validado', state: 'aprobada' },
  ],
}

const origin = (raw: string, location: string): Origin => ({
  dossier: 'dossier-sintetico.md',
  dossierVersion: '2026-10-20',
  dossierHash: 'f'.repeat(64),
  location,
  raw,
  converter: 'test',
  importedAt: AT,
})

function task(sourceId: string, fields: Partial<Task> = {}): Task {
  return {
    id: importedId(sourceId),
    sourceId,
    projectId: 'src:COM',
    title: `Tarea ${sourceId}`,
    status: 'Por iniciar',
    dependsOn: [],
    acceptance: [],
    evidence: [],
    approval: { state: 'no-requiere' },
    atlasRefs: [],
    origin: origin(`| ${sourceId} | Tarea ${sourceId} | Por iniciar |`, `Backlog > ${sourceId}`),
    createdAt: AT,
    ...fields,
  }
}

function fixture(): ProjectsData {
  return {
    version: 1,
    cycle: CYCLE,
    vocabularies: { 'dossier-sintetico.md': VOCAB },
    projects: [
      { id: 'src:COM', sourceId: 'COM', name: 'Proyecto de prueba A', dossier: 'dossier-sintetico.md', expectedResults: ['Resultado 1'], atlasRefs: ['src:ATLAS-1'] },
      { id: 'new:p-b', name: 'Proyecto de prueba B (sin rutina)', dossier: 'dossier-sintetico.md', expectedResults: [], atlasRefs: [] },
    ],
    milestones: [
      { id: 'src:M1', sourceId: 'M1', projectId: 'src:COM', title: 'Hito 1', due: '2026-11-15', dueLiteral: '15/11', acceptance: ['Criterio'] },
      { id: 'src:M2', sourceId: 'M2', projectId: 'src:COM', title: 'Hito 2', due: '2026-12-20', acceptance: [] },
    ],
    tasks: [
      task('PUB-01', { priority: 'P1', milestoneId: 'src:M1' }),
      task('PUB-02', { priority: 'P1', status: 'En proceso', milestoneId: 'src:M2' }),
      task('EDI-10', { priority: 'P2', dependsOn: [importedId('PUB-01')] }), // blocked by PUB-01
      task('EDI-2', { priority: 'P2' }),
      // executed by an agent, waiting for the person's approval
      task('SYS-07', {
        status: 'Hecho',
        owner: { kind: 'agente', name: 'Claude Code' },
        approval: { state: 'pendiente', original: { literal: 'Pendiente de revisión', by: 'Misael' } },
        acceptance: ['Pasa las pruebas', 'Revisado por Misael'],
        evidence: [{ label: 'PR de prueba', url: 'https://example.invalid/pr/1', kind: 'enlace', addedAt: AT }],
      }),
      task('SYS-08', { status: 'En proceso', owner: { kind: 'agente', name: 'Codex' } }),
      task('COM-1.4', { status: 'Hecho', approval: { state: 'aprobada', original: { literal: 'Validado' } } }),
      task('COM-005', { status: 'Cancelado' }),
      task('COM-6', { dependsOn: [importedId('SYS-07')] }), // waits for an executed-but-unapproved task
      task('COM-7', { dependsOn: ['src:NO-EXISTE'] }),
      task('M-01', { projectId: 'new:p-b', title: 'Tarea del proyecto B' }),
    ],
    atlas: [{ id: 'src:ATLAS-1', sourceId: 'ATLAS-1', title: 'Referencia transversal' }],
    routineLinks: [],
    weeks: [],
    history: [],
  }
}

const byRef = (data: ProjectsData, ref: string) => data.tasks.find((t) => t.sourceId === ref)!
const refs = (ts: Task[]) => ts.map((t) => displayRef(t))

describe('projects — identity', () => {
  it('keeps dossier IDs literally: case, leading zeros, dots, dashes', () => {
    const odd = ['PUB-01', 'pub-01', 'EDI-010', 'COM-1.4', 'SYS_07', 'M1', 'POS-0003', 'OBS.2.1', 'MKT-07a', 'NL 12']
    for (const s of odd) {
      const t = task(s)
      expect(t.sourceId).toBe(s)
      expect(t.id).toBe(`src:${s}`)
      expect(displayRef(t)).toBe(s)
    }
    expect(prefixReport(odd)).toEqual({ PUB: 1, pub: 1, EDI: 1, COM: 1, SYS: 1, M: 1, POS: 1, OBS: 1, MKT: 1, NL: 1 })
    expect(prefixOf('1234')).toBe('')
  })

  it('generates internal ids for new tasks, never colliding with imported ones nor with each other', () => {
    const existing = new Set(['new:a', 'src:a'])
    let n = 0
    const seq = () => ['a', 'a', 'b'][n++]
    expect(newId(existing, seq)).toBe('new:b')
    expect(isGeneratedId('new:b')).toBe(true)
    expect(isGeneratedId(importedId('new:b'))).toBe(false)
    expect(() => newId(new Set(['new:x']), () => 'x')).toThrow()
  })
})

describe('projects — validation (any doubt is an error, never a guess)', () => {
  it('accepts well-formed data, with warnings kept for unknown dependencies', () => {
    const r = validateProjectsData(fixture())
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.message)).toEqual(['depende de un ID que no existe: src:NO-EXISTE (se conserva)'])
  })

  it('a duplicated dossier ID stops everything (not renamed)', () => {
    const d = fixture()
    d.tasks.push({ ...task('PUB-01'), id: 'src:PUB-01-otra' })
    const r = validateProjectsData(d)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.map((e) => e.message)).toContain('ID original de tarea repetido: PUB-01 (no se renombra: hay que resolverlo en el origen)')
  })

  it('status, priority and original approval must be words of the dossier', () => {
    for (const [field, value] of [
      ['status', 'Terminado'],
      ['priority', 'Alta'],
    ] as const) {
      const d = fixture()
      d.tasks[0] = { ...d.tasks[0], [field]: value }
      const r = validateProjectsData(d)
      expect(r.ok, field).toBe(false)
    }
    const d = fixture()
    d.tasks[0] = { ...d.tasks[0], approval: { state: 'pendiente', original: { literal: 'OK jefe' } } }
    expect(validateProjectsData(d).ok).toBe(false)
  })

  it('rejects broken vocabularies, unknown projects, foreign milestones, invalid dates and cycles', () => {
    const v = fixture()
    v.vocabularies['dossier-sintetico.md'] = { ...VOCAB, status: [...VOCAB.status, { literal: 'Hecho', workClass: 'ejecutada' }] }
    expect(validateProjectsData(v).ok).toBe(false)
    const p = fixture()
    p.tasks[0] = { ...p.tasks[0], projectId: 'src:OTRO' }
    expect(validateProjectsData(p).ok).toBe(false)
    const m = fixture()
    m.tasks[10] = { ...m.tasks[10], milestoneId: 'src:M1' } // milestone of another project
    expect(validateProjectsData(m).ok).toBe(false)
    const due = fixture()
    due.milestones[0] = { ...due.milestones[0], due: '2026-02-31' }
    expect(validateProjectsData(due).ok).toBe(false)
    const c = fixture()
    c.cycle = { start: '2026-10-27', end: '2027-01-23' } // a Tuesday
    expect(validateProjectsData(c).ok).toBe(false)
    expect(validateProjectsData({ ...fixture(), version: 2 }).ok).toBe(false)
    expect(validateProjectsData(null).ok).toBe(false)
  })

  it('unknown fields from a dossier are preserved, not rejected', () => {
    const d = fixture()
    d.tasks[0] = { ...d.tasks[0], extra: { 'Canal': 'Instagram', 'Fecha objetivo (texto)': 'semana 3' } }
    const r = validateProjectsData(JSON.parse(JSON.stringify(d)))
    expect(r.ok && r.data.tasks[0].extra).toEqual({ Canal: 'Instagram', 'Fecha objetivo (texto)': 'semana 3' })
  })

  it('a dependency cycle is a warning (shown), not a silent loop', () => {
    const d = fixture()
    byRef(d, 'PUB-01').dependsOn = [importedId('EDI-10')]
    expect(dependencyCycles(d)).toEqual([[importedId('PUB-01'), importedId('EDI-10')]])
    const r = validateProjectsData(d)
    expect(r.warnings.some((w) => w.message.startsWith('ciclo de dependencias'))).toBe(true)
  })

  it('the routine tags known here are exactly those the routine uses (or could)', () => {
    const used = new Set(Object.values(WEEKLY_ROUTINE).flatMap((day) => day!.blocks.flatMap((b) => [b.project, b.secondaryOption?.project, ...(b.includes ?? []).map((i) => i.project)])).filter(Boolean))
    for (const tag of used) expect(ROUTINE_TAGS).toContain(tag)
  })
})

describe('projects — three separate dimensions: work, priority, approval', () => {
  it('normalizes the dossier’s words without replacing them', () => {
    const d = fixture()
    const t = byRef(d, 'SYS-07')
    expect(t.status).toBe('Hecho')
    expect(workClassOf(d, t)).toBe('ejecutada')
    expect(t.approval.original?.literal).toBe('Pendiente de revisión')
    expect(priorityRank(d, byRef(d, 'PUB-01'))).toBe(1)
    expect(priorityRank(d, byRef(d, 'COM-6'))).toBe(Number.POSITIVE_INFINITY)
  })

  it('executed + approval pending = awaiting, NOT done; it does not unblock what depends on it', () => {
    const d = fixture()
    const sys = byRef(d, 'SYS-07')
    expect(isAwaitingApproval(d, sys)).toBe(true)
    expect(isDone(d, sys)).toBe(false)
    expect(isClosed(d, sys)).toBe(false)
    expect(isBlocked(d, byRef(d, 'COM-6'))).toBe(true)
    expect(refs(awaitingApprovalAll(d))).toEqual(['SYS-07'])
  })

  it('approved → done and unblocks; returned → back to work', () => {
    let d = fixture()
    d = decideApproval(d, importedId('SYS-07'), 'aprobada', { now: AT }, 'Revisado')
    expect(isDone(d, byRef(d, 'SYS-07'))).toBe(true)
    expect(isBlocked(d, byRef(d, 'COM-6'))).toBe(false)
    d = decideApproval(d, importedId('SYS-07'), 'devuelta', { now: AT }, 'Falta un caso')
    const t = byRef(d, 'SYS-07')
    expect(isDone(d, t)).toBe(false)
    expect(t.approval).toMatchObject({ state: 'devuelta', note: 'Falta un caso', original: { literal: 'Pendiente de revisión', by: 'Misael' } })
  })

  it('a discarded dependency does not block but is reported; an unknown one is kept and reported', () => {
    const d = fixture()
    byRef(d, 'EDI-2').dependsOn = [importedId('COM-005')]
    const b = blockersOf(d, byRef(d, 'EDI-2'))
    expect(b.waiting).toEqual([])
    expect(refs(b.discarded)).toEqual(['COM-005'])
    expect(blockersOf(d, byRef(d, 'COM-7')).unknown).toEqual(['src:NO-EXISTE'])
    expect(isBlocked(d, byRef(d, 'COM-7'))).toBe(false)
  })
})

describe('projects — next action and the week', () => {
  it('candidates: open, unblocked, not awaiting approval; most urgent first, in progress first, natural order', () => {
    const d = fixture()
    expect(refs(nextActionCandidates(d, 'src:COM', 'humano'))).toEqual(['PUB-02', 'PUB-01', 'EDI-2', 'COM-7'])
    expect(refs(nextActionCandidates(d, 'src:COM', 'agente'))).toEqual(['SYS-08'])
  })

  it('a returned task becomes a candidate again', () => {
    let d = fixture()
    d = decideApproval(d, importedId('SYS-07'), 'devuelta', { now: AT })
    d = setOwner(d, importedId('SYS-07'), { kind: 'humano', name: 'Misael' }, { now: AT })
    expect(refs(nextActionCandidates(d, 'src:COM', 'humano'))).toContain('SYS-07')
  })

  it('the week in five groups; nothing is committed automatically', () => {
    const d = fixture()
    const w = projectWeek(d, 'src:COM', '2026-10-26')
    expect(w.commitments).toEqual([])
    expect(refs(w.backlog)).toEqual(['PUB-01', 'PUB-02', 'EDI-10', 'EDI-2', 'SYS-07', 'SYS-08', 'COM-6', 'COM-7'])
    expect(refs(w.candidates)).toEqual(['PUB-02', 'PUB-01', 'EDI-2', 'COM-7'])
    expect(refs(w.agentActive)).toEqual(['SYS-08'])
    expect(refs(w.awaitingApproval)).toEqual(['SYS-07'])
  })

  it('a commitment leaves the candidates; limits warn, never refuse', () => {
    let d = fixture()
    const ctx = { now: AT }
    d = setWeekLimits(d, '2026-10-26', { humanCapacityHours: 6, wipLimit: 2 }, ctx)
    d = commit(d, '2026-10-26', importedId('PUB-02'), ctx, 4)
    d = commit(d, '2026-10-26', importedId('PUB-01'), ctx, 3)
    d = commit(d, '2026-10-26', importedId('EDI-10'), ctx) // blocked and unestimated
    d = commit(d, '2026-10-26', importedId('EDI-10'), ctx) // twice: still once
    const w = projectWeek(d, 'src:COM', '2026-10-26')
    expect(refs(w.commitments)).toEqual(['PUB-01', 'PUB-02', 'EDI-10'])
    expect(refs(w.candidates)).toEqual(['EDI-2', 'COM-7'])
    const load = weekLoad(d, '2026-10-26')
    expect(load).toMatchObject({ commitments: 3, committedHours: 7, capacityHours: 6, wipLimit: 2 })
    expect(load.warnings.map((x) => x.kind)).toEqual(['over-capacity', 'over-wip', 'unestimated', 'blocked-commitment'])
    d = uncommit(d, '2026-10-26', importedId('EDI-10'), ctx)
    expect(weekLoad(d, '2026-10-26').warnings.map((x) => x.kind)).toEqual(['over-capacity']) // 7 h still above the 6 h declared
    expect(() => commit(d, '2026-10-27', importedId('PUB-01'), ctx)).toThrow(OpError)
  })
})

describe('projects — changes made in ELYUM', () => {
  const ctx = { now: AT, random: () => '0000-test' }

  it('a new task gets a generated id; the person types none', () => {
    const { data, task: t } = createTask(fixture(), { projectId: 'new:p-b', title: '  Escribir la guía  ', status: 'Por iniciar' }, ctx)
    expect(t.id).toBe('new:0000-test')
    expect(t.sourceId).toBeUndefined()
    expect(t.title).toBe('Escribir la guía')
    expect(t.approval.state).toBe('no-requiere')
    expect(validateProjectsData(data).ok).toBe(true)
    expect(data.history.at(-1)).toMatchObject({ by: 'usuario', entity: 'task', id: 'new:0000-test', field: 'created' })
    expect(() => createTask(fixture(), { projectId: 'new:p-b', title: 'x', status: 'Inventado' }, ctx)).toThrow(OpError)
  })

  it('changes never touch the dossier’s ID, origin or original approval; each leaves a line in the history', () => {
    let d = fixture()
    const before = byRef(d, 'SYS-07')
    d = setStatus(d, before.id, 'En proceso', ctx)
    d = requestApproval(d, before.id, ctx)
    d = addEvidence(d, before.id, { label: 'Captura', kind: 'nota' }, ctx)
    d = decideApproval(d, before.id, 'aprobada', ctx)
    const after = byRef(d, 'SYS-07')
    expect(after.sourceId).toBe(before.sourceId)
    expect(after.origin).toEqual(before.origin)
    expect(after.approval.original).toEqual(before.approval.original)
    expect(d.history.map((h) => h.field)).toEqual(['status', 'approval', 'evidence', 'approval'])
    expect(d.history[0]).toMatchObject({ from: 'Hecho', to: 'En proceso' })
    expect(() => setStatus(d, before.id, 'Terminado', ctx)).toThrow(OpError)
  })

  it('a FOCUS session is evidence: the status does not change', () => {
    const d = addEvidence(fixture(), importedId('PUB-02'), { label: 'Sesión de FOCUS', kind: 'focus', date: '2026-10-27', blockId: 'tue-web-1000' }, ctx)
    expect(byRef(d, 'PUB-02').status).toBe('En proceso')
    expect(byRef(d, 'PUB-02').evidence.at(-1)).toMatchObject({ kind: 'focus', date: '2026-10-27', blockId: 'tue-web-1000', addedAt: AT })
  })
})

describe('projects — the cycle and capacity', () => {
  it('26/10/2026 → 23/01/2027: 90 days, 13 weeks from Monday, the last ending on Saturday', () => {
    expect(cycleIssues(CYCLE)).toEqual([])
    expect(cycleDays(CYCLE)).toBe(90)
    const weeks = cycleWeeks(CYCLE)
    expect(weeks).toHaveLength(13)
    expect(weeks[0]).toEqual({ n: 1, start: '2026-10-26', end: '2026-11-01' })
    expect(weeks[12]).toEqual({ n: 13, start: '2027-01-18', end: '2027-01-23' })
    expect(cycleWeekOf(CYCLE, '2026-12-25')?.n).toBe(9)
    expect(cycleWeekOf(CYCLE, '2027-01-24')).toBeNull()
  })

  it('weeks start on a local Monday, across months and the year', () => {
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26') // Sunday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28') // Friday
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26')
    expect(isDateKey('2026-02-31')).toBe(false)
  })

  it('routine minutes per tag come from the real routine (same resolver as HOY)', () => {
    const minutes = routineMinutesByTag('2026-10-26', routineForDate)
    // Nueva Marca Wellness blocks of a week: Mon 120, Tue 120 + 110, Wed 120, Fri 100, Sat 120 + 120, Sun 120 + 90.
    expect(minutes.wellness).toBe(1020)
    expect(minutes.web).toBeGreaterThan(0)
  })

  it('without a CONFIRMED correspondence, the routine gives a project 0 hours (nothing is inferred)', () => {
    let d = fixture()
    expect(routineCapacity(d, '2026-10-26', routineForDate).every((c) => c.routineHours === 0)).toBe(true)
    expect(correspondenceTable(d).every((r) => r.state === 'sin-asignar')).toBe(true)
    d = setRoutineLink(d, { projectId: 'src:COM', tag: 'wellness', confirmed: false }, { now: AT })
    expect(routineCapacity(d, '2026-10-26', routineForDate)[0].routineHours).toBe(0)
    expect(correspondenceTable(d).find((r) => r.projectId === 'src:COM' && r.tag === 'wellness')?.state).toBe('propuesta')
    d = setRoutineLink(d, { projectId: 'src:COM', tag: 'wellness', confirmed: true }, { now: AT })
    expect(routineCapacity(d, '2026-10-26', routineForDate)[0]).toEqual({ projectId: 'src:COM', routineHours: 17, confirmedTags: ['wellness'] })
    expect(routineCapacity(d, '2026-10-26', routineForDate)[1].routineHours).toBe(0)
  })
})
