import { RECENT_OCCASIONS, SEPARATE_OCCASION_MS, autonomyRank, type Autonomy, type Dimension, type DimensionStatus, type Evidence, type Skill } from './model'
import { isDirect } from './strength'

/**
 * The state of each of the five dimensions of a skill, DERIVED from its effective evidence every time it is asked — never
 * stored, so it cannot drift from the history. No numbers: each dimension is UNKNOWN, NOT_YET, SUPPORTED, DEMONSTRATED or
 * MIXED, with the evidence it rests on (model.ts: DIMENSION_STATUSES).
 *
 * The common rule (`judge`), for the evidence that applies to a dimension, in the order it happened:
 *   1. none                                            → UNKNOWN
 *   2. none meets the criterion                        → NOT_YET            (failures are evidence, not "zero")
 *   3. from the first MET on, only its most recent occasions (RECENT_OCCASIONS) rule the state; earlier failures are the
 *      history of getting there, not a contradiction
 *   4. among those, any PARTIAL / NOT_MET              → MIXED              (kept, never averaged)
 *   5. all MET, on ≥ 2 separate occasions of DIRECT evidence → DEMONSTRATED
 *   6. otherwise                                       → SUPPORTED
 * Evidence recorded afterwards (RETROSPECTIVE) has no reliable moment and conditions: it is shown as a weak signal and does
 * not enter any dimension. Incomplete direct evidence (WEAK) can contradict but never demonstrate.
 */

export interface DimensionState {
  dimension: Dimension
  status: DimensionStatus
  /** What the state rests on: the evidence for it, and the evidence against it. */
  supporting: string[]
  contradicting: string[]
  /** Why it is UNKNOWN when there IS evidence, so the screen can say what is missing. */
  note?: 'ONLY_MORE_HELP' | 'ONLY_SAME_CONTEXT' | 'SINGLE_OCCASION' | 'NOT_EVALUATED' | 'EXPLANATION_UNVERIFIED'
}

export type SkillDimensions = Record<Dimension, DimensionState>

const byTime = (a: Evidence, b: Evidence) => a.occurredAt - b.occurredAt || a.recordedAt - b.recordedAt

/** Evidence grouped into occasions: a new occasion starts SEPARATE_OCCASION_MS after the start of the previous one. */
export function occasions(evidence: readonly Evidence[]): Evidence[][] {
  const groups: Evidence[][] = []
  let start = -Infinity
  for (const e of [...evidence].sort(byTime)) {
    if (e.occurredAt - start >= SEPARATE_OCCASION_MS) {
      groups.push([e])
      start = e.occurredAt
    } else groups[groups.length - 1].push(e)
  }
  return groups
}

interface Judged {
  status: DimensionStatus
  supporting: string[]
  contradicting: string[]
  /** The recent occasions the state was judged on (for consistency). */
  recent: Evidence[][]
}

function judge(evidence: readonly Evidence[], demonstrateAt = 2): Judged {
  const sorted = [...evidence].sort(byTime)
  if (sorted.length === 0) return { status: 'UNKNOWN', supporting: [], contradicting: [], recent: [] }
  const first = sorted.findIndex((e) => e.criterionVerdict === 'MET')
  if (first < 0) return { status: 'NOT_YET', supporting: [], contradicting: sorted.map((e) => e.id), recent: [] }
  const recent = occasions(sorted.slice(first)).slice(-RECENT_OCCASIONS)
  const flat = recent.flat()
  const met = flat.filter((e) => e.criterionVerdict === 'MET')
  const against = flat.filter((e) => e.criterionVerdict !== 'MET')
  const supporting = met.map((e) => e.id)
  if (against.length) return { status: 'MIXED', supporting, contradicting: against.map((e) => e.id), recent }
  const directOccasions = occasions(met.filter(isDirect)).length
  return { status: directOccasions >= demonstrateAt ? 'DEMONSTRATED' : 'SUPPORTED', supporting, contradicting: [], recent }
}

const state = (dimension: Dimension, j: Pick<Judged, 'status' | 'supporting' | 'contradicting'>, note?: DimensionState['note']): DimensionState => ({
  dimension,
  status: j.status,
  supporting: j.supporting,
  contradicting: j.contradicting,
  ...(note ? { note } : {}),
})

const UNKNOWN = { status: 'UNKNOWN' as const, supporting: [], contradicting: [] }

/** The most independent help level with which the criterion has been met, if any. */
export function bestAssistanceMet(evidence: readonly Evidence[]): Autonomy | undefined {
  const met = evidence.filter((e) => e.capture === 'LIVE' && e.criterionVerdict === 'MET')
  return met.length ? met.reduce((best, e) => (autonomyRank(e.assistance) > autonomyRank(best) ? e.assistance : best), met[0].assistance) : undefined
}

/** `evidence`: the skill's effective evidence (commands.ts: effectiveEvidence). */
export function skillDimensions(skill: Skill, evidence: readonly Evidence[]): SkillDimensions {
  const all = evidence.filter((e) => e.skillId === skill.id)
  const live = all.filter((e) => e.capture === 'LIVE')

  // EXECUTION — the criterion: MET supports it, PARTIAL and NOT_MET speak against it.
  const execution = state('EXECUTION', judge(live))

  // AUTONOMY — only attempts made with no more help than the target count: a guided success never shows autonomy.
  const atTarget = live.filter((e) => autonomyRank(e.assistance) >= autonomyRank(skill.targetAutonomy))
  const autonomy = atTarget.length ? state('AUTONOMY', judge(atTarget)) : state('AUTONOMY', UNKNOWN, live.length ? 'ONLY_MORE_HELP' : undefined)

  // TRANSFER — only a varied or new context says anything; the same context never does. Demonstrating it also needs a NOVEL success.
  const elsewhere = live.filter((e) => e.contextRelation !== 'SAME')
  let transfer: DimensionState
  if (!elsewhere.length) transfer = state('TRANSFER', UNKNOWN, live.length ? 'ONLY_SAME_CONTEXT' : undefined)
  else {
    const j = judge(elsewhere)
    const novel = elsewhere.some((e) => e.contextRelation === 'NOVEL' && e.criterionVerdict === 'MET' && isDirect(e) && j.supporting.includes(e.id))
    transfer = state('TRANSFER', j.status === 'DEMONSTRATED' && !novel ? { ...j, status: 'SUPPORTED' } : j)
  }

  // CONSISTENCY — a single occasion never shows it. Judged on separate occasions of direct evidence: two successful ones
  // support it, three demonstrate it; a failure among the recent ones makes it MIXED.
  const direct = live.filter(isDirect)
  let consistency: DimensionState
  const j = judge(direct, 3)
  if (occasions(direct).length < 2) consistency = state('CONSISTENCY', UNKNOWN, direct.length ? 'SINGLE_OCCASION' : undefined)
  else if (j.status === 'NOT_YET' || j.status === 'MIXED') consistency = state('CONSISTENCY', j)
  else if (j.recent.length < 2) consistency = state('CONSISTENCY', UNKNOWN, 'SINGLE_OCCASION')
  else consistency = state('CONSISTENCY', j)

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
