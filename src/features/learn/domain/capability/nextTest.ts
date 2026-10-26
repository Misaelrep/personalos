import { AUTONOMY_LEVELS, autonomyRank, type Autonomy, type ContextRelation, type Dimension, type Evidence, type Skill } from './model'
import { bestAssistanceMet, skillDimensions } from './dimensions'
import { skillGaps, type Gap, type GapReason } from './gaps'
import { nextTestStatement } from './language'

/**
 * NEXT TEST — the attempt that would reduce the relevant uncertainty most: the one that closes the CURRENT gap (gaps.ts).
 * Deterministic templates, one per kind of gap — no generic advice, no generated text. B1 ends by producing it; there is no
 * session engine here.
 *
 *   A  no direct attempt          → the base test: the skill as it is defined, before studying
 *   B  criterion not met          → the same test again, aimed at the criterion, with no more help than last time
 *   C  met, but with more help    → the same, with one step less help (never beyond the target)
 *   D  execution demonstrated, transfer unknown → the same in a VARIED context (a NOVEL one once a varied one has worked)
 *   E  a single success           → the same again "en otra ocasión" (no minimum time is made up: what an occasion is, B2 defines)
 *   F  contradictory evidence     → reproduce the conditions of the attempt that went against the rest
 */

export type NextTestKind = 'BASE' | 'FOCUS_CRITERION' | 'LESS_HELP' | 'TRANSFER' | 'REPEAT' | 'RESOLVE'

export interface NextTest {
  skillId: string
  gapId: string
  kind: NextTestKind
  /** What to do, in words (language.ts). */
  statement: string
  /** Why this test: the reason of the gap it closes. */
  reason: GapReason
  targetDimension: Dimension
  /** Where to try it: the skill's own context, a varied one, or a new one. */
  targetContext: ContextRelation
  /** The most help the attempt may use and still answer the question. */
  maxAssistance: Autonomy
  /** Met when the result meets the skill's criterion — always the skill's own, never a softer one. */
  successCriterion: string
  /** The evidence the test answers to. */
  evidenceRefs: string[]
}

// Live evidence always has its moment; recorded order breaks ties (and stands in for a missing moment).
const byTime = (a: Evidence, b: Evidence) => (a.occurredAt ?? a.recordedAt) - (b.occurredAt ?? b.recordedAt) || a.recordedAt - b.recordedAt
const last = (list: readonly Evidence[]) => [...list].sort(byTime).at(-1)
const lessHelp = (a: Autonomy, cap: Autonomy): Autonomy => AUTONOMY_LEVELS[Math.min(autonomyRank(a) + 1, autonomyRank(cap))]

type Plan = Omit<NextTest, 'statement' | 'reason'>

function plan(skill: Skill, gap: Gap, evidence: readonly Evidence[]): Plan {
  const mine = evidence.filter((e) => e.skillId === skill.id && e.capture === 'LIVE')
  const refs = (list: readonly Evidence[]) => list.map((e) => e.id)
  const base = { skillId: skill.id, gapId: gap.id, targetDimension: gap.dimension, successCriterion: skill.criterion, evidenceRefs: gap.evidenceRefs }
  switch (gap.reason) {
    case 'NO_ATTEMPT':
    case 'NO_DIRECT_ATTEMPT':
      return { ...base, kind: 'BASE', targetContext: 'SAME', maxAssistance: skill.targetAutonomy }
    case 'CRITERION_NOT_MET': {
      const prev = last(mine)
      return { ...base, kind: 'FOCUS_CRITERION', targetContext: 'SAME', maxAssistance: prev?.assistance ?? skill.targetAutonomy }
    }
    case 'AUTONOMY_BELOW_TARGET': {
      const best = bestAssistanceMet(mine) ?? 'GUIDED'
      const max = autonomyRank(best) < autonomyRank(skill.targetAutonomy) ? lessHelp(best, skill.targetAutonomy) : skill.targetAutonomy
      return { ...base, kind: 'LESS_HELP', targetContext: 'SAME', maxAssistance: max }
    }
    case 'TRANSFER_UNKNOWN': {
      const variedWorked = mine.some((e) => e.contextRelation === 'VARIED' && e.criterionVerdict === 'MET')
      return { ...base, kind: 'TRANSFER', targetContext: variedWorked ? 'NOVEL' : 'VARIED', maxAssistance: skill.targetAutonomy }
    }
    case 'CONSISTENCY_UNKNOWN': {
      const prev = last(mine.filter((e) => e.criterionVerdict === 'MET'))
      return { ...base, kind: 'REPEAT', targetContext: 'SAME', maxAssistance: prev?.assistance ?? skill.targetAutonomy }
    }
    case 'CONTRADICTION': {
      // The conditions to reproduce are those of the latest attempt that went against the rest.
      const against = last(mine.filter((e) => gap.evidenceRefs.includes(e.id) && e.criterionVerdict !== 'MET')) ?? last(mine)
      return { ...base, kind: 'RESOLVE', targetContext: against?.contextRelation ?? 'SAME', maxAssistance: against?.assistance ?? skill.targetAutonomy, evidenceRefs: refs(mine.filter((e) => gap.evidenceRefs.includes(e.id))) }
    }
  }
}

export function nextTestFor(skill: Skill, gap: Gap, evidence: readonly Evidence[]): NextTest {
  const p = plan(skill, gap, evidence)
  const against = p.kind === 'RESOLVE' ? evidence.filter((e) => p.evidenceRefs.includes(e.id) && e.criterionVerdict !== 'MET').sort(byTime).at(-1) : undefined
  return { ...p, reason: gap.reason, statement: nextTestStatement(p.kind, skill, p, against) }
}

/** Everything DESARROLLAR derives for a skill: its dimensions, its gaps (the first is the current one) and the next test. */
export function skillPicture(skill: Skill, evidence: readonly Evidence[]) {
  const dimensions = skillDimensions(skill, evidence)
  const gaps = skillGaps(skill, evidence, dimensions)
  const current = gaps[0]
  return { dimensions, gaps, current, next: current ? nextTestFor(skill, current, evidence) : undefined }
}
