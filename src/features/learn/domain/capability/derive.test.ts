import { describe, expect, it } from 'vitest'
import { effectiveEvidence, correctEvidence } from './commands'
import { skillDimensions } from './dimensions'
import { activeObjective, attempt, HOUR, must, T0 } from './fixtures'
import { skillGaps } from './gaps'
import { whatWeDontKnow } from './language'
import { DIMENSION_STATUSES, type CapabilityData } from './model'
import { nextTestFor, skillPicture } from './nextTest'
import { evidenceStrength } from './strength'

const DAY = 24 * HOUR
const skill = (d: CapabilityData, id = 's1') => d.skills.find((s) => s.id === id)!
const dims = (d: CapabilityData, id = 's1') => skillDimensions(skill(d, id), effectiveEvidence(d))
const picture = (d: CapabilityData, id = 's1') => skillPicture(skill(d, id), effectiveEvidence(d))

describe('no evidence: UNKNOWN, never a number', () => {
  it('every dimension is UNKNOWN; the gap is the missing attempt; the next test is the base test', () => {
    const d = activeObjective()
    for (const s of Object.values(dims(d))) expect(s.status).toBe('UNKNOWN')
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'NO_ATTEMPT', dimension: 'EXECUTION', statement: 'No tenemos todavía un intento directo de esta habilidad.', evidenceRefs: [], status: 'OPEN' })
    expect(p.next).toMatchObject({ kind: 'BASE', reason: 'NO_ATTEMPT', targetContext: 'SAME', maxAssistance: 'AUTONOMOUS', successCriterion: skill(d).criterion, gapId: p.current!.id, skillId: 's1' })
    expect(p.next!.statement).toMatch(/^Intenta explicar la arquitectura en inglés .*antes de estudiar nada/)
  })

  it('the states are qualitative: nothing in them is a percentage or a score', () => {
    expect(DIMENSION_STATUSES).toEqual(['UNKNOWN', 'NOT_YET', 'SUPPORTED', 'DEMONSTRATED', 'MIXED'])
    const p = picture(attempt(activeObjective(), 's1', T0 + HOUR, 'MET'))
    expect(JSON.stringify(p)).not.toMatch(/%|percent|score|progress/i)
  })
})

describe('execution', () => {
  it('a failed attempt is evidence: NOT_YET (not UNKNOWN, not "0"); the gap is the criterion; the next test aims at it with no more help', () => {
    const d = attempt(activeObjective(), 's1', T0 + HOUR, 'NOT_MET', 'SUPPORTED')
    expect(dims(d).EXECUTION).toMatchObject({ status: 'NOT_YET', contradicting: ['e' + d.evidence[0].id.slice(1)] })
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'CRITERION_NOT_MET', evidenceRefs: [d.evidence[0].id] })
    expect(p.current!.statement).toBe('El resultado aún no cumple el criterio: «sin pausas largas ni cambiar al español».')
    expect(p.next).toMatchObject({ kind: 'FOCUS_CRITERION', maxAssistance: 'SUPPORTED', targetContext: 'SAME' })
  })

  it('one success supports execution; successes on two separate occasions demonstrate it; earlier failures are the way there, not a contradiction', () => {
    let d = attempt(activeObjective(), 's1', T0, 'NOT_MET')
    d = attempt(d, 's1', T0 + DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('SUPPORTED')
    d = attempt(d, 's1', T0 + DAY + HOUR, 'MET') // same occasion: does not count twice
    expect(dims(d).EXECUTION.status).toBe('SUPPORTED')
    d = attempt(d, 's1', T0 + 2 * DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('DEMONSTRATED')
  })

  it('contradictory evidence is MIXED — the contradiction is kept, never averaged into something in between', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET')
    const ex = dims(d).EXECUTION
    expect(ex.status).toBe('MIXED')
    expect(ex.supporting).toHaveLength(1)
    expect(ex.contradicting).toHaveLength(1)
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'CONTRADICTION', dimension: 'EXECUTION' })
    expect(p.next).toMatchObject({ kind: 'RESOLVE', targetContext: 'SAME', maxAssistance: 'AUTONOMOUS' })
    expect(p.next!.statement).toMatch(/^Reproduce las condiciones del intento que no salió \(en el mismo contexto, de forma autónoma\)/)
  })

  it('a contradiction stops ruling the state only after RECENT_OCCASIONS later occasions agree — it stays in the history', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'PARTIAL')
    d = attempt(d, 's1', T0 + 2 * DAY, 'MET')
    d = attempt(d, 's1', T0 + 3 * DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('MIXED')
    d = attempt(d, 's1', T0 + 4 * DAY, 'MET')
    expect(dims(d).EXECUTION.status).toBe('DEMONSTRATED')
    expect(d.evidence.some((e) => e.criterionVerdict === 'PARTIAL')).toBe(true)
  })
})

describe('autonomy: never promoted by an attempt that used more help', () => {
  it('a GUIDED success does not show AUTONOMOUS autonomy: the gap is the help, and the next test asks for one step less', () => {
    const d = attempt(activeObjective(), 's1', T0, 'MET', 'GUIDED')
    expect(dims(d).EXECUTION.status).toBe('SUPPORTED')
    expect(dims(d).AUTONOMY).toMatchObject({ status: 'UNKNOWN', note: 'ONLY_MORE_HELP' })
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'AUTONOMY_BELOW_TARGET', dimension: 'AUTONOMY' })
    expect(p.current!.statement).toBe('Has producido el resultado con guía, pero todavía no existe evidencia de hacerlo de forma autónoma.')
    expect(p.next).toMatchObject({ kind: 'LESS_HELP', maxAssistance: 'SUPPORTED' })
  })

  it('a SUPPORTED success does not show AUTONOMOUS either; two GUIDED successes on separate days demonstrate execution, never autonomy', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'SUPPORTED')
    expect(dims(d).AUTONOMY.status).toBe('UNKNOWN')
    d = attempt(activeObjective(), 's1', T0, 'MET', 'GUIDED')
    d = attempt(d, 's1', T0 + DAY, 'MET', 'GUIDED')
    expect(dims(d).EXECUTION.status).toBe('DEMONSTRATED')
    expect(dims(d).AUTONOMY.status).toBe('UNKNOWN')
  })

  it('for a skill whose target is SUPPORTED, a SUPPORTED success counts (and an AUTONOMOUS one too)', () => {
    let d = attempt(activeObjective(), 's3', T0, 'MET', 'SUPPORTED')
    expect(dims(d, 's3').AUTONOMY.status).toBe('SUPPORTED')
    d = attempt(d, 's3', T0 + DAY, 'MET', 'AUTONOMOUS')
    expect(dims(d, 's3').AUTONOMY.status).toBe('DEMONSTRATED')
  })

  it('a failure at the target level after a guided success: autonomy NOT_YET, the gap says so', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'GUIDED')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET', 'AUTONOMOUS')
    expect(dims(d).AUTONOMY.status).toBe('NOT_YET')
  })
})

describe('transfer: the same context never shows it', () => {
  it('successes in the SAME context leave transfer UNKNOWN ("only the original context")', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'MET')
    expect(dims(d).TRANSFER).toMatchObject({ status: 'UNKNOWN', note: 'ONLY_SAME_CONTEXT' })
    const p = picture(d)
    // execution demonstrated, autonomy at target → transfer is asked before consistency
    expect(p.current).toMatchObject({ reason: 'TRANSFER_UNKNOWN', statement: 'Solo existe evidencia en el contexto original.' })
    expect(p.next).toMatchObject({ kind: 'TRANSFER', targetContext: 'VARIED' })
  })

  it('a VARIED success supports it; demonstrating it needs a NOVEL success too; then the next test asks for a new context', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'VARIED')
    expect(dims(d).TRANSFER.status).toBe('SUPPORTED')
    d = attempt(d, 's1', T0 + DAY, 'MET', 'AUTONOMOUS', 'VARIED')
    expect(dims(d).TRANSFER.status).toBe('SUPPORTED')
    expect(nextTestFor(skill(d), skillGaps(skill(d), effectiveEvidence(d)).find((g) => g.reason === 'TRANSFER_UNKNOWN')!, effectiveEvidence(d))).toMatchObject({ targetContext: 'NOVEL' })
    d = attempt(d, 's1', T0 + 2 * DAY, 'MET', 'AUTONOMOUS', 'NOVEL')
    expect(dims(d).TRANSFER.status).toBe('DEMONSTRATED')
  })
})

describe('consistency: one success never shows it', () => {
  it('a single positive piece of evidence: consistency UNKNOWN; the next test repeats it on another occasion, not before 8 h', () => {
    const d = attempt(activeObjective(), 's1', T0, 'MET')
    expect(dims(d).CONSISTENCY).toMatchObject({ status: 'UNKNOWN', note: 'SINGLE_OCCASION' })
    const p = picture(d)
    expect(p.current).toMatchObject({ reason: 'CONSISTENCY_UNKNOWN', statement: 'Existe un resultado exitoso, pero todavía no sabemos si es consistente.' })
    expect(p.next).toMatchObject({ kind: 'REPEAT', notBefore: T0 + 8 * HOUR, maxAssistance: 'AUTONOMOUS' })
  })

  it('many successes in one sitting are one occasion: still UNKNOWN', () => {
    let d = activeObjective()
    for (let i = 0; i < 5; i++) d = attempt(d, 's1', T0 + i * HOUR, 'MET')
    expect(dims(d).CONSISTENCY.status).toBe('UNKNOWN')
  })

  it('two occasions support it, three demonstrate it; a recent failure makes it MIXED', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    d = attempt(d, 's1', T0 + DAY, 'MET')
    expect(dims(d).CONSISTENCY.status).toBe('SUPPORTED')
    d = attempt(d, 's1', T0 + 2 * DAY, 'MET')
    expect(dims(d).CONSISTENCY.status).toBe('DEMONSTRATED')
    d = attempt(d, 's1', T0 + 3 * DAY, 'NOT_MET')
    expect(dims(d).CONSISTENCY.status).toBe('MIXED')
  })
})

describe('comprehension: no false semantic evaluation', () => {
  it('an explanation is kept, unverified — comprehension stays UNKNOWN however long the text', () => {
    const d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { explanation: 'La arquitectura separa la ingesta del procesamiento porque… '.repeat(10) })
    expect(d.evidence[0].explanation).toBeTruthy()
    expect(dims(d).COMPREHENSION).toMatchObject({ status: 'UNKNOWN', note: 'EXPLANATION_UNVERIFIED' })
    expect(whatWeDontKnow(skill(d), dims(d)).at(-1)).toMatch(/explicación está guardada, pero todavía no hay forma de verificarla/)
    expect(picture(d).gaps.some((g) => g.dimension === 'COMPREHENSION')).toBe(false)
  })
})

describe('evidence strength is derived, never chosen', () => {
  it('direct and complete: MODERATE; recorded afterwards or without context: WEAK', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET')
    expect(evidenceStrength(d.evidence[0], d.evidence)).toBe('MODERATE')
    d = attempt(d, 's2', T0, 'MET', 'AUTONOMOUS', 'SAME', { capture: 'RETROSPECTIVE' })
    expect(evidenceStrength(d.evidence[1], d.evidence)).toBe('WEAK')
    d = attempt(d, 's3', T0, 'MET', 'AUTONOMOUS', 'SAME', { context: '' })
    expect(evidenceStrength(d.evidence[2], d.evidence)).toBe('WEAK')
  })

  it('STRONG with a verifiable link, or corroborated by another direct attempt on a separate occasion; VERY_STRONG never in B1', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { reference: 'https://example.com/grabacion' })
    expect(evidenceStrength(d.evidence[0], d.evidence)).toBe('STRONG')
    d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { reference: 'mi cuaderno' })
    expect(evidenceStrength(d.evidence[0], d.evidence)).toBe('MODERATE')
    d = attempt(d, 's1', T0 + HOUR, 'MET')
    expect(evidenceStrength(d.evidence[0], d.evidence)).toBe('MODERATE') // same occasion
    d = attempt(d, 's1', T0 + DAY, 'MET')
    expect(evidenceStrength(d.evidence[0], d.evidence)).toBe('STRONG')
    for (const e of d.evidence) expect(evidenceStrength(e, d.evidence)).not.toBe('VERY_STRONG')
  })

  it('a record made afterwards does not count as a direct attempt: the gap asks for one, and it enters no dimension', () => {
    const d = attempt(activeObjective(), 's1', T0, 'MET', 'AUTONOMOUS', 'SAME', { capture: 'RETROSPECTIVE' })
    for (const s of Object.values(dims(d))) expect(s.status).toBe('UNKNOWN')
    expect(picture(d).current).toMatchObject({ reason: 'NO_DIRECT_ATTEMPT' })
    expect(picture(d).next).toMatchObject({ kind: 'BASE' })
  })
})

describe('derivation follows the history', () => {
  it('a correction changes what is derived (the superseded record stays in the history)', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'GUIDED')
    expect(dims(d).EXECUTION.status).toBe('SUPPORTED')
    d = must(correctEvidence(d, d.evidence[0].id, { newId: 'c1', reason: 'No lo cumplí', now: T0 + HOUR, observedResult: 'No llegué', criterionVerdict: 'NOT_MET', assistance: 'GUIDED', contextRelation: 'SAME' }))
    expect(dims(d).EXECUTION.status).toBe('NOT_YET')
    expect(d.evidence).toHaveLength(2)
  })

  it('the same history always derives the same picture (nothing derived is stored)', () => {
    let d = attempt(activeObjective(), 's1', T0, 'MET', 'GUIDED')
    d = attempt(d, 's1', T0 + DAY, 'NOT_MET', 'SUPPORTED', 'VARIED')
    expect(picture(d)).toEqual(picture(JSON.parse(JSON.stringify(d))))
    expect(Object.keys(d).sort()).toEqual(['attempts', 'evidence', 'objectives', 'skills'])
  })
})

describe('the words say only what the evidence says', () => {
  it('what we know keeps the failures that came before a success; nothing is a percentage', async () => {
    const { whatWeKnow } = await import('./language')
    const { bestAssistanceMet } = await import('./dimensions')
    let d = attempt(activeObjective(), 's1', T0, 'NOT_MET', 'GUIDED')
    d = attempt(d, 's1', T0 + DAY, 'MET', 'AUTONOMOUS')
    const ev = effectiveEvidence(d)
    const known = whatWeKnow(skill(d), dims(d), ev, bestAssistanceMet(ev))
    expect(known).toEqual(['Has cumplido el criterio en un intento directo.', 'Antes, un intento no lo cumplió.', 'Tu mejor resultado fue de forma autónoma.'])
    for (const t of [...known, ...whatWeDontKnow(skill(d), dims(d))]) expect(t).not.toMatch(/\d+\s?%/)
  })
})
