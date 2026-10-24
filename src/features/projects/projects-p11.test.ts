import { describe, expect, it } from 'vitest'
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
  readinessOf,
  requirementStatus,
} from './domain/derive'
import { importedId } from './domain/ids'
import { parseEstimate, parseSourceRefs } from './domain/literals'
import { classifyStatus, decideApproval, OpError, setApprovalPart, setCondition, setDelegationCandidates, setOwner, setStatus, setVerification } from './domain/ops'
import { validateProjectsData } from './domain/schema'
import type { ProjectsData, Requirement, Task, Vocabulary } from './domain/types'

/*
 * P1.1 · SYNTHETIC data only. IDs imitate the shape of real ones (AAA-01…);
 * nothing here comes from a dossier.
 */

const AT = '2026-10-25T21:00:00-06:00'
const ctx = { now: AT }
const DOSSIER = 'dossier-sintetico.md'

const VOCAB: Vocabulary = {
  status: [
    { literal: 'Pendiente', workClass: 'pendiente' },
    { literal: 'En proceso', workClass: 'en-curso' },
    { literal: 'Hecho', workClass: 'ejecutada' },
    { literal: 'Cancelado', workClass: 'descartada' },
    // Literals nobody has classified yet: kept, valid, never guessed.
    { literal: 'Borrador existente', workClass: 'sin-decidir' },
    { literal: 'No consta', workClass: 'sin-decidir' },
  ],
  priority: [],
  approval: [],
}

const cond = (literal: string, state: 'por-verificar' | 'cumplida' | 'no-cumplida' = 'por-verificar') => ({ kind: 'condicion' as const, literal, state })
const tarea = (sourceId: string) => ({ kind: 'tarea' as const, taskId: importedId(sourceId) })
const req = (id: string, literal: string, kind: Requirement['kind'], mode: Requirement['mode'], options: Requirement['options'], reading?: string): Requirement => ({
  id,
  literal,
  kind,
  mode,
  options,
  ...(reading ? { reading } : {}),
})

function task(sourceId: string, fields: Partial<Task> = {}): Task {
  return {
    id: importedId(sourceId),
    sourceId,
    projectId: 'p',
    title: `Tarea ${sourceId}`,
    status: 'Pendiente',
    dependsOn: [],
    acceptance: [],
    evidence: [],
    approval: { state: 'sin-dato' },
    atlasRefs: [],
    createdAt: AT,
    ...fields,
  }
}

function fixture(): ProjectsData {
  return {
    version: 1,
    cycle: { start: '2026-10-26', end: '2027-01-23' },
    vocabularies: { [DOSSIER]: VOCAB },
    projects: [{ id: 'p', name: 'Proyecto sintético', dossier: DOSSIER, expectedResults: [], atlasRefs: [], rules: [{ literal: 'Máximo dos cosas a la vez', kind: 'wip', limit: 2, scope: 'cosas' }] }],
    milestones: [],
    tasks: [
      task('AAA-01'),
      task('AAA-02', { requirements: [req('r1', 'AAA-01', 'tarea', 'todas', [tarea('AAA-01')])] }),
      task('AAA-03', { requirements: [req('r1', 'Acceso externo', 'externo', 'todas', [cond('Acceso externo')])] }),
      task('AAA-04', { requirements: [req('r1', 'AAA-01 o material propio', 'alternativa', 'alguna', [tarea('AAA-01'), cond('material propio')])] }),
      task('AAA-05', { requirements: [req('r1', 'AAA-01..03 según pieza', 'condicional', 'todas', [cond('AAA-01..03 según pieza')])] }),
      task('AAA-06', { requirements: [req('r1', 'AAA-01,02', 'tarea', 'todas', [tarea('AAA-01'), tarea('AAA-02')], 'AAA-01,02 → AAA-01, AAA-02')] }),
      task('AAA-07', { requirements: [req('r1', 'AAA-01 + recurso', 'mixto', 'todas', [tarea('AAA-01'), cond('recurso')])] }),
      task('AAA-08', { requirements: [req('r1', 'ZZZ-99', 'tarea', 'todas', [tarea('ZZZ-99')])] }),
      task('BBB-01', { status: 'Borrador existente' }),
      task('BBB-02', { status: 'No consta' }),
      task('BBB-03', { status: 'Hecho' }),
      task('BBB-04', { requirements: [req('r1', 'BBB-03', 'tarea', 'todas', [tarea('BBB-03')])] }),
    ],
    atlas: [],
    sources: [{ dossier: DOSSIER, key: 'F1', title: 'Fuente uno' }],
    references: [{ id: 'ref:1', dossier: DOSSIER, projectId: 'p', group: 'Piezas', label: 'Pieza uno', cells: [{ column: 'Pieza', value: 'Pieza uno' }, { column: 'Aprob.', value: '**Sí**' }] }],
    routineLinks: [],
    weeks: [],
    history: [],
  }
}

const by = (d: ProjectsData, id: string) => d.tasks.find((t) => t.sourceId === id)!
const ids = (ts: Task[]) => ts.map((t) => t.sourceId)

describe('P1.1 · validation', () => {
  it('accepts the new fields; an unknown task in a requirement is a warning, not an error', () => {
    const r = validateProjectsData(JSON.parse(JSON.stringify(fixture())))
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.message)).toEqual(['requisito con una tarea que no existe: src:ZZZ-99 (queda por verificar)'])
  })

  it('rejects malformed requirements, estimates, verification, delegation, rules, parts and references', () => {
    const d = fixture()
    const bad = (mutate: (d: ProjectsData) => void) => {
      const x = JSON.parse(JSON.stringify(d)) as ProjectsData
      mutate(x)
      return validateProjectsData(x).ok
    }
    expect(bad((x) => (x.tasks[1].requirements![0].mode = 'cualquiera' as never))).toBe(false)
    expect(bad((x) => (x.tasks[1].requirements![0].options = []))).toBe(false)
    expect(bad((x) => (x.tasks[1].requirements![0].literal = undefined as never))).toBe(false)
    expect(bad((x) => (x.tasks[1].requirements![0].kind = 'otro' as never))).toBe(false)
    expect(bad((x) => (x.tasks[2].requirements![0].options[0] = { kind: 'condicion', literal: 'x', state: 'quizá' as never }))).toBe(false)
    expect(bad((x) => x.tasks[1].requirements!.push({ ...x.tasks[1].requirements![0] }))).toBe(false) // repeated id
    expect(bad((x) => (x.tasks[1].requirements = [req('r1', 'yo', 'tarea', 'todas', [tarea('AAA-02')])]))).toBe(false) // itself
    expect(bad((x) => (x.tasks[0].estimate = { literal: '5–3 min', minMinutes: 5, maxMinutes: 3 }))).toBe(false)
    expect(bad((x) => (x.tasks[0].estimate = { literal: 'x', per: 'mes' as never }))).toBe(false)
    expect(bad((x) => (x.tasks[0].verification = { state: 'creo' as never }))).toBe(false)
    expect(bad((x) => (x.tasks[0].delegation = { literal: 'IA', candidates: [{ kind: 'robot' as never, name: 'X' }] }))).toBe(false)
    expect(bad((x) => (x.projects[0].rules = [{ literal: 'x', limit: -1 }]))).toBe(false)
    expect(bad((x) => (x.tasks[0].approval = { state: 'sin-dato', parts: [{ scope: '', state: 'tal vez' as never }] }))).toBe(false)
    expect(bad((x) => x.references!.push({ ...x.references![0] }))).toBe(false)
    expect(bad((x) => (x.references![0].id = importedId('AAA-01')))).toBe(false)
    expect(bad((x) => (x.references![0].projectId = 'otro'))).toBe(false)
    expect(bad((x) => x.sources!.push({ dossier: DOSSIER, key: 'F1', title: 'otra' }))).toBe(false)
  })

  it('a cited source the dossier does not list is shown as a warning', () => {
    const d = fixture()
    d.tasks[0].sourceRefs = parseSourceRefs('F1 §2; F9')
    const r = validateProjectsData(d)
    expect(r.ok && r.warnings.map((w) => w.message)).toContain('cita una fuente que el dossier no lista: F9')
  })

  it('data written before P1.1 (no sources, references or new fields) still reads', () => {
    const d = fixture()
    delete d.sources
    delete d.references
    d.tasks = d.tasks.map((t) => ({ ...t, requirements: undefined, approval: { state: 'no-requiere' as const } }))
    expect(validateProjectsData(JSON.parse(JSON.stringify(d))).ok).toBe(true)
  })
})

describe('P1.1 · M1 sin decidir', () => {
  it('an unclassified task is valid, «por clasificar», never a candidate nor done', () => {
    const d = fixture()
    const t = by(d, 'BBB-01')
    expect(readinessOf(d, t)).toBe('por-clasificar')
    expect(isDone(d, t) || isClosed(d, t)).toBe(false)
    expect(ids(nextActionCandidates(d, 'p'))).not.toContain('BBB-01')
    expect(ids(projectWeek(d, 'p', '2026-10-26').unclassified)).toEqual(['BBB-01', 'BBB-02'])
  })

  it('a task depending on an unclassified one stays blocked', () => {
    const d = fixture()
    d.tasks.push(task('CCC-01', { requirements: [req('r1', 'BBB-01', 'tarea', 'todas', [tarea('BBB-01')])] }))
    expect(isBlocked(d, by(d, 'CCC-01'))).toBe(true)
  })

  it('a returned task with an unclassified status is still not a candidate', () => {
    let d = fixture()
    d = decideApproval(d, importedId('BBB-01'), 'devuelta', ctx)
    expect(ids(nextActionCandidates(d, 'p'))).not.toContain('BBB-01')
  })

  it('classifying a literal changes only its class, for every task, and leaves a line in the history', () => {
    const d = classifyStatus(fixture(), DOSSIER, 'Borrador existente', 'en-curso', ctx)
    expect(by(d, 'BBB-01').status).toBe('Borrador existente')
    expect(readinessOf(d, by(d, 'BBB-01'))).toBe('lista')
    expect(d.history.at(-1)).toMatchObject({ entity: 'vocabulary', field: 'status:Borrador existente', from: 'sin-decidir', to: 'en-curso' })
    expect(() => classifyStatus(d, DOSSIER, 'Inventado', 'pendiente', ctx)).toThrow(OpError)
  })
})

describe('P1.1 · M11 aprobación sin dato', () => {
  it('executed + sin dato = waits for the person; not done; does not unblock', () => {
    const d = fixture()
    const t = by(d, 'BBB-03')
    expect(isDone(d, t)).toBe(false)
    expect(isAwaitingApproval(d, t)).toBe(true)
    expect(ids(awaitingApprovalAll(d))).toEqual(['BBB-03'])
    expect(isBlocked(d, by(d, 'BBB-04'))).toBe(true)
  })

  it('approving it unblocks its dependants', () => {
    const d = decideApproval(fixture(), importedId('BBB-03'), 'aprobada', ctx)
    expect(isDone(d, by(d, 'BBB-03'))).toBe(true)
    expect(isBlocked(d, by(d, 'BBB-04'))).toBe(false)
  })
})

describe('P1.1 · M3 requisitos', () => {
  it('a plain task requirement blocks until that task is done AND approved', () => {
    let d = fixture()
    expect(readinessOf(d, by(d, 'AAA-02'))).toBe('bloqueada')
    d = setStatus(d, importedId('AAA-01'), 'Hecho', ctx)
    expect(readinessOf(d, by(d, 'AAA-02'))).toBe('bloqueada') // executed, approval sin dato
    d = decideApproval(d, importedId('AAA-01'), 'aprobada', ctx)
    expect(readinessOf(d, by(d, 'AAA-02'))).toBe('lista')
  })

  it('an external condition is «por verificar»: not blocked, not ready, not a candidate, listed apart', () => {
    const d = fixture()
    const t = by(d, 'AAA-03')
    expect(isBlocked(d, t)).toBe(false)
    expect(readinessOf(d, t)).toBe('por-verificar')
    expect(ids(nextActionCandidates(d, 'p'))).not.toContain('AAA-03')
    expect(ids(projectWeek(d, 'p', '2026-10-26').toVerify)).toContain('AAA-03')
  })

  it('confirming the condition makes it ready; marking it not met blocks it; the literal never changes', () => {
    let d = setCondition(fixture(), importedId('AAA-03'), 'r1', 0, 'cumplida', ctx, 'Comprobado')
    expect(readinessOf(d, by(d, 'AAA-03'))).toBe('lista')
    expect(by(d, 'AAA-03').requirements![0]).toMatchObject({ literal: 'Acceso externo', options: [{ literal: 'Acceso externo', state: 'cumplida', note: 'Comprobado' }] })
    d = setCondition(d, importedId('AAA-03'), 'r1', 0, 'no-cumplida', ctx)
    expect(readinessOf(d, by(d, 'AAA-03'))).toBe('bloqueada')
    expect(d.history.filter((h) => h.field === 'requirements')).toHaveLength(2)
  })

  it('alternative: one valid option is enough; while none is, it is not ready', () => {
    let d = fixture()
    expect(requirementStatus(d, by(d, 'AAA-04').requirements![0]).state).toBe('pendiente')
    d = setCondition(d, importedId('AAA-04'), 'r1', 1, 'cumplida', ctx)
    expect(readinessOf(d, by(d, 'AAA-04'))).toBe('lista')
  })

  it('alternative: all options failed → not met; a discarded task is never a valid option', () => {
    let d = setStatus(fixture(), importedId('AAA-01'), 'Cancelado', ctx)
    d = setCondition(d, importedId('AAA-04'), 'r1', 1, 'no-cumplida', ctx)
    expect(requirementStatus(d, by(d, 'AAA-04').requirements![0]).state).toBe('no-cumplido')
    expect(readinessOf(d, by(d, 'AAA-04'))).toBe('bloqueada')
  })

  it('cumulative: every option is needed (task done and condition confirmed)', () => {
    let d = fixture()
    d = setCondition(d, importedId('AAA-07'), 'r1', 1, 'cumplida', ctx)
    expect(readinessOf(d, by(d, 'AAA-07'))).toBe('bloqueada')
    d = setStatus(d, importedId('AAA-01'), 'Hecho', ctx)
    d = decideApproval(d, importedId('AAA-01'), 'aprobada', ctx)
    expect(readinessOf(d, by(d, 'AAA-07'))).toBe('lista')
    expect(readinessOf(d, by(d, 'AAA-06'))).toBe('bloqueada') // still waits for AAA-02
  })

  it('a conditional range stays «por verificar»; it is never expanded nor met by itself', () => {
    let d = fixture()
    for (const id of ['AAA-01', 'AAA-02', 'AAA-03']) {
      d = setStatus(d, importedId(id), 'Hecho', ctx)
      d = decideApproval(d, importedId(id), 'aprobada', ctx)
    }
    expect(readinessOf(d, by(d, 'AAA-05'))).toBe('por-verificar')
  })

  it('an unknown task id is «por verificar», never met', () => {
    const d = fixture()
    expect(requirementStatus(d, by(d, 'AAA-08').requirements![0]).state).toBe('por-verificar')
    expect(readinessOf(d, by(d, 'AAA-08'))).toBe('por-verificar')
  })

  it('a task option cannot be ticked by hand; unknown requirement is an error', () => {
    expect(() => setCondition(fixture(), importedId('AAA-02'), 'r1', 0, 'cumplida', ctx)).toThrow(OpError)
    expect(() => setCondition(fixture(), importedId('AAA-02'), 'r9', 0, 'cumplida', ctx)).toThrow(OpError)
  })

  it('candidates are only the ready ones', () => {
    const d = fixture()
    expect(ids(nextActionCandidates(d, 'p'))).toEqual(['AAA-01'])
  })

  it('cycles through requirements are reported', () => {
    const d = fixture()
    by(d, 'AAA-01').requirements = [req('r1', 'AAA-02', 'tarea', 'todas', [tarea('AAA-02')])]
    expect(dependencyCycles(d)).toHaveLength(1)
  })

  it('blockersOf lists the requirements not met, with each option', () => {
    const d = fixture()
    const b = blockersOf(d, by(d, 'AAA-07'))
    expect(b.requirements[0].options.map((o) => o.state)).toEqual(['pendiente', 'por-verificar'])
  })
})

describe('P1.1 · M2 verificación, M6 delegación, M10 aprobación parcial', () => {
  it('verification is its own dimension: it never makes a task done nor ready', () => {
    let d = setVerification(fixture(), importedId('BBB-02'), { state: 'verificada', note: 'visto' }, ctx)
    expect(by(d, 'BBB-02').verification).toEqual({ state: 'verificada', note: 'visto', at: AT })
    expect(readinessOf(d, by(d, 'BBB-02'))).toBe('por-clasificar')
    d = setVerification(d, importedId('BBB-02'), undefined, ctx)
    expect(by(d, 'BBB-02').verification).toBeUndefined()
  })

  it('a dossier verification literal survives the person’s change', () => {
    const d0 = fixture()
    by(d0, 'AAA-01').verification = { state: 'no-consta', literal: 'No consta' }
    const d = setVerification(d0, importedId('AAA-01'), { state: 'verificada' }, ctx)
    expect(by(d, 'AAA-01').verification).toMatchObject({ state: 'verificada', literal: 'No consta' })
  })

  it('delegation candidates are not the owner, and keep the dossier literal', () => {
    const d0 = fixture()
    by(d0, 'AAA-01').delegation = { literal: 'IA prepara; humano revisa', candidates: [] }
    let d = setDelegationCandidates(d0, importedId('AAA-01'), [{ kind: 'agente', name: 'Claude Code' }], ctx)
    expect(by(d, 'AAA-01').owner).toBeUndefined()
    expect(by(d, 'AAA-01').delegation).toEqual({ literal: 'IA prepara; humano revisa', candidates: [{ kind: 'agente', name: 'Claude Code' }] })
    d = setOwner(d, importedId('AAA-01'), { kind: 'agente', name: 'Claude Code' }, ctx)
    expect(projectWeek(d, 'p', '2026-10-26').agentActive).toEqual([]) // pendiente: not an active assignment yet
  })

  it('a partial approval is shown but never makes the task done', () => {
    let d = setApprovalPart(fixture(), importedId('BBB-03'), { scope: 'arte', state: 'aprobada', literal: 'Sí, usuario' }, ctx)
    d = setApprovalPart(d, importedId('BBB-03'), { scope: 'arte', state: 'devuelta' }, ctx)
    expect(by(d, 'BBB-03').approval.parts).toEqual([{ scope: 'arte', state: 'devuelta' }])
    d = setApprovalPart(d, importedId('BBB-03'), { scope: 'publicación', state: 'aprobada' }, ctx)
    expect(isDone(d, by(d, 'BBB-03'))).toBe(false)
    expect(() => setApprovalPart(d, importedId('BBB-03'), { scope: ' ', state: 'aprobada' }, ctx)).toThrow(OpError)
  })
})

describe('P1.1 · M5 estimaciones y M7 fuentes (lecturas literales)', () => {
  it('reads plain ranges and periods; keeps the literal; leaves the rest undefined', () => {
    expect(parseEstimate('20–35 min')).toEqual({ literal: '20–35 min', minMinutes: 20, maxMinutes: 35 })
    expect(parseEstimate('15–25 min/sem')).toEqual({ literal: '15–25 min/sem', minMinutes: 15, maxMinutes: 25, per: 'semana' })
    expect(parseEstimate('15–25 min/revisión')).toMatchObject({ per: 'revision' })
    expect(parseEstimate('30–60 min sesión')).toMatchObject({ minMinutes: 30, maxMinutes: 60, per: 'sesion' })
    expect(parseEstimate('1 h')).toEqual({ literal: '1 h', minMinutes: 60, maxMinutes: 60 })
    expect(parseEstimate('1,5–2 h')).toMatchObject({ minMinutes: 90, maxMinutes: 120 })
    expect(parseEstimate('Un rato')).toEqual({ literal: 'Un rato' })
    expect(parseEstimate('—')).toEqual({ literal: '—' })
    expect(parseEstimate('9–3 min')).toEqual({ literal: '9–3 min' })
  })

  it('an estimate never becomes the hours of a commitment', () => {
    const d = fixture()
    by(d, 'AAA-01').estimate = parseEstimate('20–35 min')
    expect(by(d, 'AAA-01').estimateHours).toBeUndefined()
  })

  it('source keys come from the literal, once each, in order', () => {
    expect(parseSourceRefs('F2 §9.14; F4; F2')).toEqual({ literal: 'F2 §9.14; F4; F2', keys: ['F2', 'F4'] })
    expect(parseSourceRefs('F11 documento 1')).toEqual({ literal: 'F11 documento 1', keys: ['F11'] })
    expect(parseSourceRefs('memoria histórica').keys).toEqual([])
  })
})
