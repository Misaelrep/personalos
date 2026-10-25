import { autonomyRank, type Dimension, type Evidence, type Skill } from './model'
import { bestAssistanceMet, skillDimensions, type SkillDimensions } from './dimensions'
import { gapStatement } from './language'
import { isDirect } from './strength'

/**
 * GAPS — the difference between what has been shown and what is needed to move on: a concrete, traceable statement, never
 * "te falta un 23 %". DERIVED from the dimensions (and so from the evidence) every time; never edited by hand. The person
 * reads the words (language.ts); this decides which gaps exist, in which order, and on which evidence they rest.
 *
 * Order (the first one is the CURRENT gap):
 *   1. NO_ATTEMPT / NO_DIRECT_ATTEMPT  no evidence, or only a record made afterwards
 *   2. CONTRADICTION                   a dimension is MIXED
 *   3. CRITERION_NOT_MET               no attempt has met the criterion yet
 *   4. AUTONOMY_BELOW_TARGET           the criterion has been met, but not yet with the target's level of help
 *   5. then, once execution is DEMONSTRATED: TRANSFER_UNKNOWN before CONSISTENCY_UNKNOWN; before that, the other way round
 *      (one success first asks "is it repeatable?", a repeated one asks "does it travel?")
 * Comprehension opens no gap in B1: nothing here can close it (it is listed under "what we do not know yet").
 */

export type GapReason =
  | 'NO_ATTEMPT'
  | 'NO_DIRECT_ATTEMPT'
  | 'CONTRADICTION'
  | 'CRITERION_NOT_MET'
  | 'AUTONOMY_BELOW_TARGET'
  | 'TRANSFER_UNKNOWN'
  | 'CONSISTENCY_UNKNOWN'

export interface Gap {
  /** Stable: the same gap has the same id until it closes. */
  id: string
  skillId: string
  dimension: Dimension
  reason: GapReason
  /** What the gap is, in words (language.ts). */
  statement: string
  /** The evidence that shows the gap (empty when the gap is the absence of evidence). */
  evidenceRefs: string[]
  /** Derived gaps are always open: a gap that closes simply stops being derived. */
  status: 'OPEN'
}

type Draft = Omit<Gap, 'statement'>
const gap = (skill: Skill, dimension: Dimension, reason: GapReason, evidenceRefs: string[]): Draft => ({
  id: `${skill.id}:${reason}:${dimension}`,
  skillId: skill.id,
  dimension,
  reason,
  evidenceRefs,
  status: 'OPEN',
})

const has = (d: SkillDimensions[Dimension], ...statuses: SkillDimensions[Dimension]['status'][]) => statuses.includes(d.status)

/** `evidence`: the skill's effective evidence. */
export function skillGaps(skill: Skill, evidence: readonly Evidence[], dims: SkillDimensions = skillDimensions(skill, evidence)): Gap[] {
  const mine = evidence.filter((e) => e.skillId === skill.id)
  const live = mine.filter((e) => e.capture === 'LIVE')
  const best = bestAssistanceMet(live)
  const say = (list: Draft[]): Gap[] => list.map((g) => ({ ...g, statement: gapStatement(g.reason, g.dimension, skill, dims, best) }))
  if (mine.length === 0) return say([gap(skill, 'EXECUTION', 'NO_ATTEMPT', [])])
  if (!live.some(isDirect)) return say([gap(skill, 'EXECUTION', 'NO_DIRECT_ATTEMPT', mine.map((e) => e.id))])

  const gaps: Draft[] = []
  for (const d of ['EXECUTION', 'AUTONOMY', 'TRANSFER', 'CONSISTENCY'] as const) {
    if (dims[d].status === 'MIXED') gaps.push(gap(skill, d, 'CONTRADICTION', [...dims[d].supporting, ...dims[d].contradicting]))
  }
  const ex = dims.EXECUTION
  if (ex.status === 'NOT_YET') gaps.push(gap(skill, 'EXECUTION', 'CRITERION_NOT_MET', ex.contradicting))

  const metOnce = has(ex, 'SUPPORTED', 'DEMONSTRATED', 'MIXED')
  if (metOnce) {
    const belowTarget = best !== undefined && autonomyRank(best) < autonomyRank(skill.targetAutonomy)
    if (has(dims.AUTONOMY, 'UNKNOWN', 'NOT_YET') && (belowTarget || dims.AUTONOMY.status === 'NOT_YET')) {
      gaps.push(gap(skill, 'AUTONOMY', 'AUTONOMY_BELOW_TARGET', [...ex.supporting, ...dims.AUTONOMY.contradicting]))
    }
    const transfer = has(dims.TRANSFER, 'UNKNOWN', 'NOT_YET', 'SUPPORTED') ? [gap(skill, 'TRANSFER', 'TRANSFER_UNKNOWN', [...dims.TRANSFER.supporting, ...dims.TRANSFER.contradicting])] : []
    const consistency = has(dims.CONSISTENCY, 'UNKNOWN', 'SUPPORTED') ? [gap(skill, 'CONSISTENCY', 'CONSISTENCY_UNKNOWN', ex.supporting)] : []
    gaps.push(...(ex.status === 'DEMONSTRATED' ? [...transfer, ...consistency] : [...consistency, ...transfer]))
  }
  // A dimension can only be MIXED in one place, but the same evidence may open two gaps: keep the first of each id.
  return say(gaps.filter((g, i) => gaps.findIndex((x) => x.id === g.id) === i))
}
