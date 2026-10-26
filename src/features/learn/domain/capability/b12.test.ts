import { describe, expect, it } from 'vitest'
import { entryStep } from '../../storage/capabilityCodec'
import {
  activateObjective,
  addSkill,
  archiveSkill,
  attemptInProgress,
  confirmAttempt,
  createObjective,
  discardAttempt,
  effectiveEvidence,
  markPerformed,
  newSkillDefaults,
  openAttemptFor,
  pendingEvaluations,
  saveAttemptRecord,
  startAttempt,
  updateObjective,
  updateSkill,
} from './commands'
import { skillDimensions } from './dimensions'
import { attempt, HOUR, must, OBJECTIVE, SKILLS, T0 } from './fixtures'
import { AUTONOMY_HINT, nextTestRationale, whatWeDontKnow, whatWeKnow } from './language'
import { EMPTY_CAPABILITY, MAX_SKILLS, type CapabilityData } from './model'
import { skillPicture } from './nextTest'

/** B1.2 — less friction before the first evidence, the same rigor in the model. */

const DAY = 24 * HOUR
const skill = (d: CapabilityData, id = 's1') => d.skills.find((s) => s.id === id)!
const dims = (d: CapabilityData, id = 's1') => skillDimensions(skill(d, id), effectiveEvidence(d))
const picture = (d: CapabilityData, id = 's1') => skillPicture(skill(d, id), effectiveEvidence(d))

/** An objective with only `n` skills (s1…sn), ACTIVE. */
function withSkills(n: number): CapabilityData {
  let d = must(createObjective(EMPTY_CAPABILITY, { id: 'o1', rawIntent: 'Quiero poder presentar en inglés', now: T0 }))
  d = must(updateObjective(d, 'o1', OBJECTIVE, T0))
  for (let i = 0; i < n; i++) d = must(addSkill(d, { ...SKILLS[i % 3], action: `${SKILLS[i % 3].action} (${i + 1})`, id: `s${i + 1}`, objectiveId: 'o1', now: T0 }))
  return must(activateObjective(d, 'o1', T0))
}

/** A LIVE attempt on s1, done and saved to be evaluated later. */
function performed(d = withSkills(1), at = T0 + HOUR): CapabilityData {
  d = must(startAttempt(d, { id: 'a1', skillId: 's1', testStatement: 'Diseñar la landing y probarla con 5 personas', contextDescription: 'la landing real', capture: 'LIVE', now: at - HOUR }))
  d = must(saveAttemptRecord(d, 'a1', { outcomeDescription: 'Landing diseñada y publicada; aún no la han probado.', assistance: 'AUTONOMOUS', contextRelation: 'SAME' }))
  return must(markPerformed(d, 'a1', at))
}

describe('B1.2 · progressive decomposition', () => {
  it('(1) an objective can start testing with ONE valid skill', () => {
    const d = withSkills(1)
    expect(d.objectives[0].status).toBe('ACTIVE')
    expect(startAttempt(d, { id: 'a', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }).ok).toBe(true)
  })

  it('(2) two skills are valid too', () => {
    expect(withSkills(2).objectives[0].status).toBe('ACTIVE')
  })

  it('(3) the maximum of 7 stands', () => {
    const d = withSkills(MAX_SKILLS)
    expect(addSkill(d, { ...SKILLS[0], action: 'Una octava', id: 's8', objectiveId: 'o1', now: T0 })).toEqual({ ok: false, error: { code: 'INVALID', issues: ['TOO_MANY_SKILLS'] } })
  })

  it('(4) adding a skill later — even after evidence — does not revise the objective', () => {
    let d = attempt(withSkills(1), 's1', T0 + HOUR, 'MET')
    const before = d.objectives[0]
    d = must(addSkill(d, { ...SKILLS[1], id: 's2', objectiveId: 'o1', now: T0 + DAY }))
    expect(d.objectives[0]).toMatchObject({ revision: before.revision, previousRevisions: before.previousRevisions, action: before.action, criterion: before.criterion })
    expect(d.objectives[0].skillIds).toEqual(['s1', 's2'])
  })

  it('(5) adding a skill never alters earlier evidence, nor other skills’ revisions', () => {
    let d = attempt(withSkills(1), 's1', T0 + HOUR, 'MET')
    const evidence = JSON.stringify(d.evidence)
    const s1 = { ...skill(d) }
    d = must(addSkill(d, { ...SKILLS[1], id: 's2', objectiveId: 'o1', now: T0 + DAY }))
    expect(JSON.stringify(d.evidence)).toBe(evidence)
    expect(skill(d)).toEqual(s1)
  })

  it('(6) a new skill inherits the objective’s context', () => {
    expect(newSkillDefaults(OBJECTIVE).context).toBe(OBJECTIVE.context)
  })

  it('(7) …and its target autonomy; action, result and criterion are left for the person to write', () => {
    expect(newSkillDefaults({ ...OBJECTIVE, targetAutonomy: 'SUPPORTED' })).toEqual({ action: '', result: '', context: OBJECTIVE.context, criterion: '', targetAutonomy: 'SUPPORTED' })
  })

  it('(8) both can be adjusted explicitly, and are kept as adjusted', () => {
    let d = withSkills(1)
    d = must(addSkill(d, { ...newSkillDefaults(d.objectives[0]), action: 'Escribir el guion', result: 'un guion de una página', criterion: 'cabe en 10 minutos', context: 'en casa, sin público', targetAutonomy: 'GUIDED', id: 's2', objectiveId: 'o1', now: T0 }))
    expect(skill(d, 's2')).toMatchObject({ context: 'en casa, sin público', targetAutonomy: 'GUIDED' })
  })

  it('(9) with the person’s words already written, DESARROLLAR opens on «Hazlo observable» — no screen that only reconfirms them', () => {
    expect(entryStep('quiero poder presentar en inglés')).toBe('observable')
    expect(entryStep('   ')).toBe('intent')
    expect(entryStep('')).toBe('intent')
  })
})

describe('B1.2 · done ≠ evaluated', () => {
  it('(10) an attempt can be done and left pending evaluation — distinct from a RUNNING draft', () => {
    const running = must(startAttempt(withSkills(1), { id: 'a1', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    expect(attemptInProgress(running)?.id).toBe('a1')
    expect(pendingEvaluations(running)).toEqual([])
    const d = performed()
    expect(attemptInProgress(d)).toBeUndefined()
    expect(pendingEvaluations(d).map((a) => a.id)).toEqual(['a1'])
    expect(d.attempts[0]).toMatchObject({ performedAt: T0 + HOUR })
    expect(d.attempts[0].completedAt).toBeUndefined()
    expect(d.attempts[0].criterionVerdict).toBeUndefined()
    // needs what was done; a verdict picked before "later" is not kept
    let e = must(startAttempt(withSkills(1), { id: 'a2', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 }))
    expect(markPerformed(e, 'a2', T0)).toEqual({ ok: false, error: { code: 'INCOMPLETE_RECORD' } })
    e = must(saveAttemptRecord(e, 'a2', { outcomeDescription: 'hecho', criterionVerdict: 'MET' }))
    expect(must(markPerformed(e, 'a2', T0)).attempts[0].criterionVerdict).toBeUndefined()
  })

  it('(11) pending evaluation creates NO evidence', () => {
    expect(performed().evidence).toEqual([])
  })

  it('(12) pending evaluation changes no dimension, opens no false gap and no progress', () => {
    const d = performed()
    for (const s of Object.values(dims(d))) expect(s.status).toBe('UNKNOWN')
    expect(picture(d).current).toMatchObject({ reason: 'NO_ATTEMPT' })
    expect(whatWeKnow(skill(d), dims(d), effectiveEvidence(d), undefined)).toEqual([])
  })

  it('(13) the pending attempt is plain data: it survives a reload (serialization) intact', () => {
    const d = performed()
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })

  it('(14) it can be resumed and evaluated later; meanwhile other skills can be tried, this one is continued (not doubled)', () => {
    let d = performed(withSkills(2))
    expect(openAttemptFor(d, 's1')?.id).toBe('a1')
    expect(startAttempt(d, { id: 'b', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 + 2 * HOUR })).toEqual({ ok: false, error: { code: 'PENDING_EVALUATION' } })
    expect(startAttempt(d, { id: 'c', skillId: 's2', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 + 2 * HOUR }).ok).toBe(true)
    d = must(saveAttemptRecord(d, 'a1', { criterionVerdict: 'PARTIAL' }))
    expect(confirmAttempt(d, 'a1', 'e1', T0 + 3 * DAY).ok).toBe(true)
  })

  it('(15) evaluating it creates exactly ONE piece of evidence, dated when the action was done (not when it was judged)', () => {
    let d = performed()
    d = must(saveAttemptRecord(d, 'a1', { criterionVerdict: 'NOT_MET' }))
    d = must(confirmAttempt(d, 'a1', 'e1', T0 + 3 * DAY))
    expect(d.evidence).toHaveLength(1)
    expect(d.evidence[0]).toMatchObject({ attemptId: 'a1', criterionVerdict: 'NOT_MET', occurredAt: T0 + HOUR, recordedAt: T0 + 3 * DAY })
    expect(confirmAttempt(d, 'a1', 'e2', T0 + 4 * DAY)).toEqual({ ok: false, error: { code: 'ATTEMPT_CLOSED' } })
    expect(dims(d).EXECUTION.status).toBe('NOT_YET')
  })

  it('a pending attempt can be discarded (it is not evidence); a confirmed one cannot', () => {
    expect(must(discardAttempt(performed(), 'a1')).attempts).toEqual([])
  })

  it('a skill whose attempt waits to be evaluated is not revised or taken out from under it', () => {
    let d = attempt(withSkills(2), 's1', T0 + HOUR, 'MET')
    d = must(startAttempt(d, { id: 'px', skillId: 's1', testStatement: 't', contextDescription: 'c', capture: 'LIVE', now: T0 + 2 * HOUR }))
    d = must(saveAttemptRecord(d, 'px', { outcomeDescription: 'hecho' }))
    d = must(markPerformed(d, 'px', T0 + 3 * HOUR))
    expect(updateSkill(d, 's1', { criterion: 'otro criterio distinto' }, T0 + 4 * HOUR, 's1-v2')).toEqual({ ok: false, error: { code: 'PENDING_EVALUATION' } })
    expect(archiveSkill(d, 's1', T0 + 4 * HOUR)).toEqual({ ok: false, error: { code: 'PENDING_EVALUATION' } })
  })
})

describe('B1.2 · a contradiction, without a false promise', () => {
  it('(16) a failure and a success stay MIXED', () => {
    let d = attempt(withSkills(1), 's1', T0, 'NOT_MET')
    d = attempt(d, 's1', T0 + DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('MIXED')
  })

  it('(17) ten later successes do not erase the contradictory history', () => {
    let d = attempt(withSkills(1), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET')
    for (let i = 2; i < 12; i++) d = attempt(d, 's1', T0 + i * DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('MIXED')
    expect(d.evidence.filter((e) => e.criterionVerdict === 'NOT_MET')).toHaveLength(1)
  })

  it('(18) neither the gap, nor the next test, nor its reason promise to resolve or erase the contradiction', () => {
    let d = attempt(withSkills(1), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET')
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'CONTRADICTION', statement: 'Tus intentos no muestran todavía un resultado consistente bajo esta definición.' })
    expect(p.next).toMatchObject({ kind: 'COMPARE', rationale: 'Una nueva prueba puede mostrar si el resultado vuelve a aparecer. No elimina los intentos anteriores.' })
    expect(p.next!.statement).toMatch(/^Haz otra prueba comparable .*y registra qué ocurre/)
    const words = [p.current!.statement, p.next!.statement, p.next!.rationale ?? ''].join(' ')
    expect(words).not.toMatch(/resuelv|resolv|aclar|limpi|desaparec|borr/i)
    expect(nextTestRationale('REPEAT')).toBeUndefined()
  })
})

describe('B1.2 · what stays', () => {
  it('(19) explanation and link are still recorded into the evidence', () => {
    const d = attempt(withSkills(1), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { explanation: 'Separé la propuesta en tres partes.', reference: 'https://example.com/landing' })
    expect(d.evidence[0]).toMatchObject({ explanation: 'Separé la propuesta en tres partes.', reference: 'https://example.com/landing' })
    expect(whatWeDontKnow(skill(d), dims(d)).at(-1)).toBe('Si lo comprendes: tu explicación está guardada, pero APRENDER todavía no evalúa la comprensión.')
  })

  it('(20) autonomy keeps its reducer logic; only its wording stops being absolute', () => {
    const d = attempt(withSkills(1), 's1', T0, 'MET', 'GUIDED')
    expect(dims(d).AUTONOMY).toMatchObject({ status: 'UNKNOWN', note: 'ONLY_MORE_HELP' })
    expect(AUTONOMY_HINT.AUTONOMOUS).not.toMatch(/nadie|nada/)
    expect(AUTONOMY_HINT.AUTONOMOUS).toMatch(/herramientas/)
  })
})
