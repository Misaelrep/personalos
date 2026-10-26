import { autonomyRank, type Autonomy, type Dimension, type DimensionStatus, type Evidence, type Skill } from './model'
import { normalize } from './validate'
import { isDirect } from './strength'

/**
 * The state of each of the five dimensions of a skill REVISION, DERIVED from its effective evidence every time it is asked
 * — never stored, so it cannot drift from the history. No numbers: each dimension is UNKNOWN, NOT_YET, SUPPORTED,
 * DEMONSTRATED or MIXED, with the evidence it rests on (model.ts: DIMENSION_STATUSES).
 *
 * Only the evidence of this revision counts (a new revision starts with none). Within it nothing expires: no rule depends
 * on the time between attempts, and a contradiction stays a contradiction however many attempts follow it. (B2 may add an
 * explicit policy of recency or conditions; B1 has none.)
 *
 * The common rule (`judge`), on the evidence that applies to a dimension:
 *   1. none                                              → UNKNOWN
 *   2. none meets the criterion                          → NOT_YET   (we have evidence, and it does not meet it yet)
 *   3. some meets it and some does not (PARTIAL/NOT_MET) → MIXED     (kept, never averaged)
 *   4. all meet it, in ≥ 2 independent DIRECT attempts   → DEMONSTRATED
 *   5. otherwise                                         → SUPPORTED
 * Evidence recorded afterwards (RETROSPECTIVE) has no known moment and incomplete conditions: it is shown as a weak signal and
 * enters no dimension. Incomplete direct evidence can contradict but never demonstrate.
 */

export interface DimensionState {
  dimension: Dimension
  status: DimensionStatus
  /** What the state rests on: the evidence for it, and the evidence against it. */
  supporting: string[]
  contradicting: string[]
  /** Why it is UNKNOWN (or capped) when there IS evidence, so the screen can say what is missing. */
  note?: 'ONLY_MORE_HELP' | 'ONLY_SAME_CONTEXT' | 'SINGLE_SUCCESS' | 'NO_OCCASIONS_IN_B1' | 'NOT_EVALUATED' | 'EXPLANATION_UNVERIFIED'
}

export type SkillDimensions = Record<Dimension, DimensionState>

interface Judged {
  status: DimensionStatus
  supporting: string[]
  contradicting: string[]
}

/** Independent attempts: one per attempt (a correction replaces its record, it is not a second attempt). */
const attempts = (list: readonly Evidence[]) => new Set(list.map((e) => e.attemptId)).size

function judge(evidence: readonly Evidence[]): Judged {
  if (evidence.length === 0) return { status: 'UNKNOWN', supporting: [], contradicting: [] }
  const met = evidence.filter((e) => e.criterionVerdict === 'MET')
  const against = evidence.filter((e) => e.criterionVerdict !== 'MET')
  const supporting = met.map((e) => e.id)
  const contradicting = against.map((e) => e.id)
  if (met.length === 0) return { status: 'NOT_YET', supporting, contradicting }
  if (against.length) return { status: 'MIXED', supporting, contradicting }
  return { status: attempts(met.filter(isDirect)) >= 2 ? 'DEMONSTRATED' : 'SUPPORTED', supporting, contradicting }
}

const state = (dimension: Dimension, j: Judged, note?: DimensionState['note']): DimensionState => ({
  dimension,
  status: j.status,
  supporting: j.supporting,
  contradicting: j.contradicting,
  ...(note ? { note } : {}),
})

const UNKNOWN: Judged = { status: 'UNKNOWN', supporting: [], contradicting: [] }

/** The most independent help level with which the criterion has been met, if any. */
export function bestAssistanceMet(evidence: readonly Evidence[]): Autonomy | undefined {
  const met = evidence.filter((e) => e.capture === 'LIVE' && e.criterionVerdict === 'MET')
  return met.length ? met.reduce((best, e) => (autonomyRank(e.assistance) > autonomyRank(best) ? e.assistance : best), met[0].assistance) : undefined
}

/** `evidence`: the effective evidence (commands.ts: effectiveEvidence); only this revision's is read. */
export function skillDimensions(skill: Skill, evidence: readonly Evidence[]): SkillDimensions {
  const all = evidence.filter((e) => e.skillId === skill.id)
  const live = all.filter((e) => e.capture === 'LIVE')

  // EXECUTION — the criterion: MET supports it, PARTIAL and NOT_MET speak against it.
  const execution = state('EXECUTION', judge(live))

  // AUTONOMY — only attempts made with the target's help or less count: a guided success never shows autonomy.
  const atTarget = live.filter((e) => autonomyRank(e.assistance) >= autonomyRank(skill.targetAutonomy))
  const autonomy = atTarget.length ? state('AUTONOMY', judge(atTarget)) : state('AUTONOMY', UNKNOWN, live.length ? 'ONLY_MORE_HELP' : undefined)

  // TRANSFER — only a varied or new context says anything; the same context never does. DEMONSTRATED needs coherent direct
  // successes in more than one such context (different contexts, as written), at least one of them NOVEL.
  const elsewhere = live.filter((e) => e.contextRelation !== 'SAME')
  let transfer: DimensionState
  if (!elsewhere.length) transfer = state('TRANSFER', UNKNOWN, live.length ? 'ONLY_SAME_CONTEXT' : undefined)
  else {
    const j = judge(elsewhere)
    const directMet = elsewhere.filter((e) => e.criterionVerdict === 'MET' && isDirect(e))
    const contexts = new Set(directMet.map((e) => normalize(e.contextDescription))).size
    const novel = directMet.some((e) => e.contextRelation === 'NOVEL')
    transfer = state('TRANSFER', j.status === 'DEMONSTRATED' && !(contexts >= 2 && novel) ? { ...j, status: 'SUPPORTED' } : j)
  }

  // CONSISTENCY — stability over time needs occasions, and B1 has none (Session, B2). So: one success → UNKNOWN; several
  // successes → SUPPORTED at most; success and failure → MIXED; failures only → NOT_YET. Never DEMONSTRATED in B1.
  const direct = live.filter(isDirect)
  const c = judge(direct)
  let consistency: DimensionState
  if (c.status === 'UNKNOWN' || c.status === 'NOT_YET' || c.status === 'MIXED') consistency = state('CONSISTENCY', c)
  else if (attempts(direct.filter((e) => e.criterionVerdict === 'MET')) < 2) consistency = state('CONSISTENCY', UNKNOWN, 'SINGLE_SUCCESS')
  else consistency = state('CONSISTENCY', { ...c, status: 'SUPPORTED' }, 'NO_OCCASIONS_IN_B1')

  // COMPREHENSION — B1 has no reliable way to evaluate understanding. An explanation is kept, unverified; the state stays UNKNOWN.
  const explained = all.filter((e) => e.explanation)
  const comprehension: DimensionState = {
    dimension: 'COMPREHENSION',
    status: 'UNKNOWN',
    supporting: [],
    contradicting: [],
    note: explained.length ? 'EXPLANATION_UNVERIFIED' : 'NOT_EVALUATED',
  }

  return { COMPREHENSION: comprehension, EXECUTION: execution, AUTONOMY: autonomy, TRANSFER: transfer, CONSISTENCY: consistency }
}
