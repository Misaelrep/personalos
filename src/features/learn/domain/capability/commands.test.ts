import { describe, expect, it } from 'vitest'
import {
  activateObjective,
  addSkill,
  archiveSkill,
  attemptInProgress,
  confirmAttempt,
  correctEvidence,
  createObjective,
  discardAttempt,
  effectiveEvidence,
  saveAttemptRecord,
  setObjectiveStatus,
  startAttempt,
  updateObjective,
  updateSkill,
} from './commands'
import { activeObjective, attempt, HOUR, must, OBJECTIVE, SKILLS, T0 } from './fixtures'
import { EMPTY_CAPABILITY, OBJECTIVE_STATUSES } from './model'
import { isObservableAction, templateIssues } from './validate'

describe('an intention is not a capability', () => {
  it('«quiero aprender inglés» stays a draft with only what was written: nothing is filled in from it, and it cannot be activated', () => {
    const d = must(createObjective(EMPTY_CAPABILITY, { id: 'o1', rawIntent: 'quiero aprender inglés', now: T0 }))
    const o = d.objectives[0]
    expect(o).toMatchObject({ status: 'DRAFT', rawIntent: 'quiero aprender inglés', action: '', result: '', context: '', criterion: '' })
    const r = activateObjective(d, 'o1', T0)
    expect(r.ok).toBe(false)
  })

  it('learning, studying, knowing or understanding are not observable actions — even written as the action', () => {
    for (const a of ['aprender inglés', 'Quiero aprender inglés', 'Entender estadística', 'saber Python', 'Dominar el piano', 'ser capaz de comprender contratos', 'Repasar SQL'])
      expect(isObservableAction(a), a).toBe(false)
    for (const a of ['Presentar en inglés una propuesta', 'Escribir una consulta SQL', 'Tocar una pieza al piano', 'Quiero poder redactar un contrato'])
      expect(isObservableAction(a), a).toBe(true)
    const d = must(updateObjective(must(createObjective(EMPTY_CAPABILITY, { id: 'o1', rawIntent: 'x', now: T0 })), 'o1', { ...OBJECTIVE, action: 'aprender inglés' }, T0))
    expect(templateIssues(d.objectives[0])).toContain('NOT_OBSERVABLE')
  })

  it('without an observable result it cannot be activated', () => {
    let d = activeObjective()
    d = must(createObjective(d, { id: 'o2', rawIntent: 'x', now: T0 }))
    d = must(updateObjective(d, 'o2', { ...OBJECTIVE, result: '' }, T0))
    SKILLS.forEach((s, i) => (d = must(addSkill(d, { ...s, id: `o2s${i}`, objectiveId: 'o2', now: T0 }))))
    const r = activateObjective(d, 'o2', T0)
    expect(r).toEqual({ ok: false, error: { code: 'INVALID', issues: ['MISSING_RESULT'] } })
  })

  it('without a criterion it cannot be activated', () => {
    let d = must(createObjective(EMPTY_CAPABILITY, { id: 'o1', rawIntent: 'x', now: T0 }))
    d = must(updateObjective(d, 'o1', { ...OBJECTIVE, criterion: '  ' }, T0))
    SKILLS.forEach((s, i) => (d = must(addSkill(d, { ...s, id: `s${i}`, objectiveId: 'o1', now: T0 }))))
    expect(activateObjective(d, 'o1', T0)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['MISSING_CRITERION'] } })
  })

  it('there is no COMPLETED status to mark by hand', () => {
    expect(OBJECTIVE_STATUSES).not.toContain('COMPLETED')
    // @ts-expect-error — only PAUSED and ARCHIVED can be set
    expect(setObjectiveStatus(activeObjective(), 'o1', 'COMPLETED', T0).ok).toBe(false)
  })
})

describe('activation: limits and skills', () => {
  it('at most 3 ACTIVE objectives; drafts, paused and archived do not count', () => {
    let d = activeObjective(undefined, 'o1')
    d = activeObjective(d, 'o2')
    d = activeObjective(d, 'o3')
    d = must(createObjective(d, { id: 'draft', rawIntent: 'x', now: T0 }))
    const fourth = activeObjective.bind(null, d, 'o4')
    expect(fourth).toThrow(/ACTIVE_LIMIT/)
    d = must(setObjectiveStatus(d, 'o2', 'PAUSED', T0))
    expect(() => activeObjective(d, 'o4')).not.toThrow()
    // …and a paused one cannot come back while three are active again
    const full = activeObjective(d, 'o4')
    expect(activateObjective(full, 'o2', T0)).toEqual({ ok: false, error: { code: 'ACTIVE_LIMIT' } })
  })

  it('fewer than 3 or more than 7 skills: explicitly refused', () => {
    let d = must(createObjective(EMPTY_CAPABILITY, { id: 'o1', rawIntent: 'x', now: T0 }))
    d = must(updateObjective(d, 'o1', OBJECTIVE, T0))
    d = must(addSkill(d, { ...SKILLS[0], id: 's1', objectiveId: 'o1', now: T0 }))
    d = must(addSkill(d, { ...SKILLS[1], id: 's2', objectiveId: 'o1', now: T0 }))
    expect(activateObjective(d, 'o1', T0)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['TOO_FEW_SKILLS'] } })
    for (let i = 3; i <= 7; i++) d = must(addSkill(d, { ...SKILLS[0], action: `Hacer la parte ${i}`, id: `s${i}`, objectiveId: 'o1', now: T0 }))
    expect(addSkill(d, { ...SKILLS[0], action: 'Hacer la parte 8', id: 's8', objectiveId: 'o1', now: T0 })).toEqual({ ok: false, error: { code: 'INVALID', issues: ['TOO_MANY_SKILLS'] } })
    expect(activateObjective(d, 'o1', T0).ok).toBe(true)
  })

  it('a duplicate skill (same template once normalized: case, accents, spaces, punctuation) is refused — on adding and on editing', () => {
    let d = activeObjective()
    d = must(setObjectiveStatus(d, 'o1', 'PAUSED', T0))
    const dup = { ...SKILLS[0], action: '  EXPLICAR la arquitectura en ingles. ', id: 'sx', objectiveId: 'o1', now: T0 }
    expect(addSkill(d, dup)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['DUPLICATE_SKILL'] } })
    expect(updateSkill(d, 's2', SKILLS[0], T0)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['DUPLICATE_SKILL'] } })
  })

  it('an ACTIVE objective cannot drop below 3 skills', () => {
    expect(archiveSkill(activeObjective(), 's1', T0)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['TOO_FEW_SKILLS'] } })
  })

  it('the decomposition can be edited until the first evidence, and not after', () => {
    let d = activeObjective()
    d = must(updateSkill(d, 's1', { criterion: 'sin pausas de más de 3 segundos' }, T0))
    d = must(updateObjective(d, 'o1', { context: 'una reunión real' }, T0))
    d = attempt(d, 's1', T0 + HOUR, 'NOT_MET')
    expect(updateSkill(d, 's1', { criterion: 'otro' }, T0).ok).toBe(false)
    expect(updateObjective(d, 'o1', { criterion: 'otro' }, T0)).toEqual({ ok: false, error: { code: 'LOCKED_BY_EVIDENCE' } })
    expect(addSkill(d, { ...SKILLS[0], action: 'Otra cosa', id: 'sx', objectiveId: 'o1', now: T0 })).toEqual({ ok: false, error: { code: 'LOCKED_BY_EVIDENCE' } })
  })
})

describe('attempts and evidence', () => {
  it('an attempt only on an ACTIVE objective, and one at a time', () => {
    let d = must(createObjective(EMPTY_CAPABILITY, { id: 'o9', rawIntent: 'x', now: T0 }))
    d = must(updateObjective(d, 'o9', OBJECTIVE, T0))
    SKILLS.forEach((s, i) => (d = must(addSkill(d, { ...s, id: `q${i}`, objectiveId: 'o9', now: T0 }))))
    expect(startAttempt(d, { id: 'a', skillId: 'q0', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 })).toEqual({ ok: false, error: { code: 'NOT_ACTIVE' } })
    let a = activeObjective()
    a = must(startAttempt(a, { id: 'a1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    expect(startAttempt(a, { id: 'a2', skillId: 's2', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 })).toEqual({ ok: false, error: { code: 'ATTEMPT_IN_PROGRESS' } })
  })

  it('a record without what happened, the verdict, the help or the context cannot be confirmed', () => {
    let d = activeObjective()
    d = must(startAttempt(d, { id: 'a1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    d = must(saveAttemptRecord(d, 'a1', { outcomeDescription: 'Me quedé en blanco', criterionVerdict: 'NOT_MET', assistance: 'AUTONOMOUS' }))
    expect(confirmAttempt(d, 'a1', 'e1', T0)).toEqual({ ok: false, error: { code: 'INCOMPLETE_RECORD' } })
  })

  it('a failed attempt is valid evidence: NOT_MET creates its record, as immutable as any other', () => {
    const d = attempt(activeObjective(), 's1', T0 + HOUR, 'NOT_MET')
    expect(d.evidence).toHaveLength(1)
    expect(d.evidence[0]).toMatchObject({ criterionVerdict: 'NOT_MET', provenance: 'SELF_REPORTED', capture: 'LIVE', skillId: 's1', objectiveId: 'o1' })
    expect(d.attempts[0].completedAt).toBe(T0 + HOUR)
    expect(saveAttemptRecord(d, d.attempts[0].id, { outcomeDescription: 'otra cosa' })).toEqual({ ok: false, error: { code: 'ATTEMPT_CLOSED' } })
    expect(discardAttempt(d, d.attempts[0].id)).toEqual({ ok: false, error: { code: 'ATTEMPT_CLOSED' } })
  })

  it('a NOT_MET never removes earlier evidence', () => {
    let d = attempt(activeObjective(), 's1', T0 + HOUR, 'MET')
    const before = d.evidence[0]
    d = attempt(d, 's1', T0 + 20 * HOUR, 'NOT_MET')
    expect(d.evidence).toHaveLength(2)
    expect(d.evidence[0]).toEqual(before)
  })

  it('confirmed evidence is never overwritten: a correction is a new record that supersedes it, with its reason', () => {
    let d = attempt(activeObjective(), 's1', T0 + HOUR, 'MET', 'GUIDED')
    const original = d.evidence[0]
    expect(correctEvidence(d, original.id, { newId: 'c1', reason: '', now: T0 + 2 * HOUR, observedResult: 'x', criterionVerdict: 'PARTIAL', assistance: 'GUIDED', contextRelation: 'SAME' })).toEqual({ ok: false, error: { code: 'MISSING_REASON' } })
    d = must(correctEvidence(d, original.id, { newId: 'c1', reason: 'Marqué «sí» por error', now: T0 + 2 * HOUR, observedResult: 'Lo hice a medias', criterionVerdict: 'PARTIAL', assistance: 'GUIDED', contextRelation: 'SAME' }))
    expect(d.evidence).toHaveLength(2)
    expect(d.evidence[0]).toEqual(original)
    expect(d.evidence[1]).toMatchObject({ supersedes: original.id, criterionVerdict: 'PARTIAL', occurredAt: original.occurredAt, recordedAt: T0 + 2 * HOUR, correctionReason: 'Marqué «sí» por error' })
    expect(effectiveEvidence(d).map((e) => e.id)).toEqual(['c1'])
    expect(correctEvidence(d, original.id, { newId: 'c2', reason: 'r', now: T0, observedResult: 'x', criterionVerdict: 'MET', assistance: 'GUIDED', contextRelation: 'SAME' })).toEqual({ ok: false, error: { code: 'ALREADY_SUPERSEDED' } })
  })

  it('an attempt in progress can be discarded (it leaves nothing) — and is otherwise what comes back after a reload', () => {
    let d = activeObjective()
    d = must(startAttempt(d, { id: 'a1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    d = must(saveAttemptRecord(d, 'a1', { outcomeDescription: 'a medias' }))
    expect(attemptInProgress(d)).toMatchObject({ id: 'a1', outcomeDescription: 'a medias' })
    expect(attemptInProgress(must(discardAttempt(d, 'a1')))).toBeUndefined()
  })

  it('pausing an objective with an attempt in progress is refused (the attempt would be orphaned)', () => {
    const d = must(startAttempt(activeObjective(), { id: 'a1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    expect(setObjectiveStatus(d, 'o1', 'PAUSED', T0)).toEqual({ ok: false, error: { code: 'ATTEMPT_IN_PROGRESS' } })
  })
})
