import { describe, expect, it } from 'vitest'
import { confirmAttempt, correctEvidence, effectiveEvidence, saveAttemptRecord, startAttempt, updateObjective, updateSkill } from './commands'
import * as dimensionsModule from './dimensions'
import { skillDimensions } from './dimensions'
import { activeObjective, attempt, HOUR, must, T0 } from './fixtures'
import * as model from './model'
import { EVIDENCE_PROVENANCES, INDEPENDENT_PROVENANCES, type CapabilityData } from './model'
import * as nextTestModule from './nextTest'
import { skillPicture } from './nextTest'
import { evidenceStrength } from './strength'
import { activeSkillsOf } from './validate'

/** B1.1 — the four corrections of inference and data, as adversarial cases. */

const DAY = 24 * HOUR
const skill = (d: CapabilityData, id: string) => d.skills.find((s) => s.id === id)!
const dims = (d: CapabilityData, id = 's1') => skillDimensions(skill(d, id), effectiveEvidence(d))

describe('B1.1 · 1 — evidence strength: a self-report stops at MODERATE', () => {
  it('(1) a URL on SELF_REPORTED evidence does not make it STRONG', () => {
    for (const reference of ['https://example.com/grabacion', 'http://drive.example.org/x.mp4', 'https://youtu.be/abc']) {
      const d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { reference })
      expect(d.evidence[0].reference).toBe(reference)
      expect(evidenceStrength(d.evidence[0])).toBe('MODERATE')
    }
  })

  it('(2) no evidence B1 can produce goes beyond MODERATE — whatever its verdict, help, context, link or company', () => {
    expect(EVIDENCE_PROVENANCES).toEqual(['SELF_REPORTED'])
    expect(INDEPENDENT_PROVENANCES).toEqual([])
    let d = activeObjective()
    let t = T0
    for (const verdict of ['MET', 'PARTIAL', 'NOT_MET'] as const)
      for (const help of ['GUIDED', 'SUPPORTED', 'AUTONOMOUS'] as const)
        for (const rel of ['SAME', 'VARIED', 'NOVEL'] as const) d = attempt(d, 's1', (t += HOUR), verdict, help, rel, { reference: 'https://example.com/r', explanation: 'porque sí' })
    d = attempt(d, 's2', (t += HOUR), 'MET', 'AUTONOMOUS', 'SAME', { capture: 'RETROSPECTIVE' })
    for (const e of d.evidence) expect(['WEAK', 'MODERATE']).toContain(evidenceStrength(e))
  })

  it('(3) another attempt never changes the strength of an earlier record (strength reads one record only)', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    const first = d.evidence[0]
    const before = evidenceStrength(first)
    for (let i = 1; i <= 5; i++) d = attempt(d, 's1', T0 + i * DAY, 'MET')
    expect(evidenceStrength(d.evidence[0])).toBe(before)
    expect(evidenceStrength.length).toBe(1)
    expect(d.evidence[0]).toEqual(first)
  })
})

describe('B1.1 · 2 — no false temporal precision', () => {
  it('(4) there is no 8-hour rule: neither a constant nor a behavior', () => {
    expect(Object.keys(model)).not.toContain('SEPARATE_OCCASION_MS')
    expect(Object.keys(dimensionsModule)).not.toContain('occasions')
    // two successes a minute apart demonstrate execution; consistency does not depend on the gap either
    let a = attempt(activeObjective(), 's1', T0, 'MET')
    a = attempt(a, 's1', T0 + 60_000, 'MET')
    let b = attempt(activeObjective(), 's1', T0, 'MET')
    b = attempt(b, 's1', T0 + 30 * DAY, 'MET')
    const statuses = (d: CapabilityData) => Object.fromEntries(Object.entries(dims(d)).map(([k, v]) => [k, [v.status, v.note]]))
    expect(statuses(a)).toEqual(statuses(b))
    expect(dims(a).EXECUTION.status).toBe('DEMONSTRATED')
    // and the next test never carries a minimum time
    const one = attempt(activeObjective(), 's1', T0, 'MET')
    expect(skillPicture(skill(one, 's1'), effectiveEvidence(one)).next).not.toHaveProperty('notBefore')
  })

  it('(5) there is no automatic window of 3 occasions', () => {
    expect(Object.keys(model)).not.toContain('RECENT_OCCASIONS')
    expect(Object.keys(nextTestModule)).not.toContain('RECENT_OCCASIONS')
  })

  it('(6) a contradiction does not disappear because three (or ten) successes follow it', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET')
    for (let i = 2; i <= 11; i++) {
      d = attempt(d, 's1', T0 + i * DAY, 'MET')
      expect(dims(d).EXECUTION.status).toBe('MIXED')
      expect(dims(d).CONSISTENCY.status).toBe('MIXED')
    }
    expect(dims(d).EXECUTION.contradicting).toHaveLength(1)
    expect(skillPicture(skill(d, 's1'), effectiveEvidence(d)).current).toMatchObject({ reason: 'CONTRADICTION' })
  })

  it('(7) consistency can never be DEMONSTRATED in B1, however many coherent successes', () => {
    let d = activeObjective()
    for (let i = 0; i < 20; i++) d = attempt(d, 's1', T0 + i * DAY, 'MET', 'AUTONOMOUS', i % 3 === 0 ? 'NOVEL' : 'SAME', { context: `Contexto ${i}` })
    expect(dims(d).EXECUTION.status).toBe('DEMONSTRATED')
    expect(dims(d).CONSISTENCY.status).toBe('SUPPORTED')
  })
})

describe('B1.1 · 3 — definitions are versioned; history is not rewritten', () => {
  const withEvidence = () => attempt(attempt(activeObjective(), 's1', T0, 'MET'), 's1', T0 + HOUR, 'MET')

  it('(8) editing a skill with evidence creates a new revision of the same lineage; the old record is not touched', () => {
    let d = withEvidence()
    const old = skill(d, 's1')
    d = must(updateSkill(d, 's1', { criterion: 'sin ninguna pausa de más de 3 segundos' }, T0 + DAY, 's1-v2'))
    expect(skill(d, 's1')).toEqual(old)
    expect(skill(d, 's1-v2')).toMatchObject({ lineageId: 's1', revision: 2, supersedesSkillId: 's1', criterion: 'sin ninguna pausa de más de 3 segundos', objectiveId: 'o1' })
    expect(activeSkillsOf(d, 'o1').map((s) => s.id)).toEqual(['s2', 's3', 's1-v2'])
    expect(d.objectives[0].skillIds).toEqual(['s1', 's2', 's3', 's1-v2'])
    // the old revision is history: it cannot be edited, nor tried again
    expect(updateSkill(d, 's1', { criterion: 'x y z' }, T0, 'v3')).toEqual({ ok: false, error: { code: 'SUPERSEDED' } })
    expect(startAttempt(d, { id: 'aX', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 })).toEqual({ ok: false, error: { code: 'SUPERSEDED' } })
  })

  it('(9) the historical evidence stays attached to the earlier revision', () => {
    let d = withEvidence()
    const evidence = d.evidence.map((e) => ({ ...e }))
    d = must(updateSkill(d, 's1', { criterion: 'otro criterio más exigente' }, T0 + DAY, 's1-v2'))
    expect(d.evidence).toEqual(evidence)
    expect(d.evidence.every((e) => e.skillId === 's1')).toBe(true)
    expect(dims(d, 's1').EXECUTION.status).toBe('DEMONSTRATED') // the old revision keeps what it showed
  })

  it('(10) the new revision does not inherit any demonstration: it starts UNKNOWN, with the base test', () => {
    let d = withEvidence()
    d = must(updateSkill(d, 's1', { criterion: 'otro criterio más exigente' }, T0 + DAY, 's1-v2'))
    for (const s of Object.values(dims(d, 's1-v2'))) expect(s.status).toBe('UNKNOWN')
    const p = skillPicture(skill(d, 's1-v2'), effectiveEvidence(d))
    expect(p.current).toMatchObject({ reason: 'NO_ATTEMPT', skillId: 's1-v2' })
    expect(p.next).toMatchObject({ kind: 'BASE', successCriterion: 'otro criterio más exigente' })
  })

  it('(11) changing a criterion — of a skill or of the objective — never rewrites evidence; the objective keeps its earlier definitions', () => {
    let d = withEvidence()
    const snapshot = JSON.stringify(d.evidence)
    const before = { ...d.objectives[0] }
    d = must(updateSkill(d, 's1', { criterion: 'otro criterio' }, T0 + DAY, 's1-v2'))
    d = must(updateObjective(d, 'o1', { criterion: 'el cliente firma la propuesta' }, T0 + DAY))
    expect(JSON.stringify(d.evidence)).toBe(snapshot)
    const o = d.objectives[0]
    expect(o).toMatchObject({ revision: 2, criterion: 'el cliente firma la propuesta' })
    expect(o.previousRevisions).toEqual([{ rawIntent: before.rawIntent, action: before.action, result: before.result, context: before.context, criterion: before.criterion, targetAutonomy: before.targetAutonomy, revision: 1, until: T0 + DAY }])
    expect(d.evidence.every((e) => e.objectiveRevision === 1)).toBe(true)
    // new evidence is produced under the new revision
    d = attempt(d, 's2', T0 + 2 * DAY, 'MET')
    expect(d.evidence.at(-1)!.objectiveRevision).toBe(2)
    // a revised definition must stay complete
    expect(updateObjective(d, 'o1', { criterion: '' }, T0 + 3 * DAY)).toEqual({ ok: false, error: { code: 'INVALID', issues: ['MISSING_CRITERION'] } })
    // and saving the same definition creates nothing
    expect(updateObjective(d, 'o1', { criterion: 'el cliente firma la propuesta' }, T0 + 3 * DAY)).toEqual({ ok: true, data: d })
  })
})

describe('B1.1 · 4 — a retrospective record never gets a date the person did not give', () => {
  const retro = (occurredOn?: string, recordedAt = T0 + 5 * HOUR) => {
    let d = must(startAttempt(activeObjective(), { id: 'r1', skillId: 's1', testStatement: 'La prueba', contextDescription: 'Una llamada', capture: 'RETROSPECTIVE', now: recordedAt - 60_000 }))
    d = must(saveAttemptRecord(d, 'r1', { outcomeDescription: 'Lo hice hace tiempo', criterionVerdict: 'MET', assistance: 'SUPPORTED', contextRelation: 'SAME', ...(occurredOn !== undefined ? { occurredOn } : {}) }))
    return confirmAttempt(d, 'r1', 'er1', recordedAt)
  }

  it('(12) without a known date, occurredAt is null (explicitly unknown) — not the moment it was typed', () => {
    const d = must(retro())
    expect(d.evidence[0].occurredAt).toBeNull()
    expect(d.evidence[0]).not.toHaveProperty('occurredOn')
    expect(evidenceStrength(d.evidence[0])).toBe('WEAK')
    for (const s of Object.values(dims(d))) expect(s.status).toBe('UNKNOWN')
  })

  it('(12b) with a day the person gave, that day is kept as approximate — still no exact moment; a future or impossible day is refused', () => {
    const d = must(retro('2026-09-14'))
    expect(d.evidence[0]).toMatchObject({ occurredAt: null, occurredOn: '2026-09-14' })
    expect(retro('2026-12-01')).toEqual({ ok: false, error: { code: 'BAD_DATE' } })
    expect(retro('2026-02-31')).toEqual({ ok: false, error: { code: 'BAD_DATE' } })
    const live = must(startAttempt(activeObjective(), { id: 'l1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    expect(saveAttemptRecord(live, 'l1', { occurredOn: '2026-09-14' })).toEqual({ ok: false, error: { code: 'BAD_DATE' } })
  })

  it('(13) recordedAt is the moment it was recorded; a correction keeps the unknown moment and has its own recordedAt', () => {
    let d = must(retro(undefined, T0 + 5 * HOUR))
    expect(d.evidence[0].recordedAt).toBe(T0 + 5 * HOUR)
    d = must(correctEvidence(d, 'er1', { newId: 'er1-c', reason: 'Fue con más ayuda', now: T0 + 6 * HOUR, observedResult: 'Lo hice con ayuda', criterionVerdict: 'MET', assistance: 'GUIDED', contextRelation: 'SAME' }))
    expect(d.evidence[1]).toMatchObject({ occurredAt: null, recordedAt: T0 + 6 * HOUR, supersedes: 'er1' })
    // a LIVE attempt has its exact moment: when it was recorded as ended
    const live = attempt(activeObjective(), 's1', T0 + 7 * HOUR, 'MET')
    expect(live.evidence[0]).toMatchObject({ occurredAt: T0 + 7 * HOUR, recordedAt: T0 + 7 * HOUR })
  })
})

describe('B1.1 · 5 — what stays', () => {
  it('(14) NOT_YET still means: there is applicable evidence, and it does not meet the criterion yet', () => {
    let d = attempt(activeObjective(), 's1', T0, 'NOT_MET')
    expect(dims(d).EXECUTION.status).toBe('NOT_YET')
    d = attempt(d, 's1', T0 + HOUR, 'PARTIAL')
    expect(dims(d).EXECUTION.status).toBe('NOT_YET')
    expect(dims(activeObjective()).EXECUTION.status).toBe('UNKNOWN')
  })
})
