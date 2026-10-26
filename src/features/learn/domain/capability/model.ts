/**
 * DESARROLLAR — the capability engine's records (Phase B1).
 *
 * APRENDER turns consumed information into usable capability. A skill is the reproducible capacity to produce an observable
 * result, under given conditions, with a given autonomy:
 *
 *   Ser capaz de [action] para producir [result], en [context], cumpliendo [criterion], con [autonomy].
 *
 * The source of truth is what the person configured (objectives, skills) and what they did (attempts, and the evidence each
 * completed attempt leaves). Everything else — the state of each dimension, the gaps, the next test — is DERIVED from that
 * and never stored (see dimensions.ts, gaps.ts, nextTest.ts). Nothing here is a percentage, a score or a level: without
 * evidence the answer is UNKNOWN — "we do not know yet", never "incapable".
 *
 * Pure data and constants; no behavior.
 */

/** How much help an attempt used, and how much a skill aims to need: from guided to autonomous (GUIADO → APOYADO → AUTÓNOMO). */
export const AUTONOMY_LEVELS = ['GUIDED', 'SUPPORTED', 'AUTONOMOUS'] as const
export type Autonomy = (typeof AUTONOMY_LEVELS)[number]
/** Higher is more independent. */
export const autonomyRank = (a: Autonomy) => AUTONOMY_LEVELS.indexOf(a)

/** An objective is never marked COMPLETED by hand: achievement will be derived from evidence (a later phase). */
export const OBJECTIVE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number]

/** Did the observed result meet the skill's criterion? A NOT_MET attempt is valid evidence, never "zero progress". */
export const CRITERION_VERDICTS = ['MET', 'PARTIAL', 'NOT_MET'] as const
export type CriterionVerdict = (typeof CRITERION_VERDICTS)[number]

/** The attempt's context, against the skill's own: the same, a varied one, a new one. */
export const CONTEXT_RELATIONS = ['SAME', 'VARIED', 'NOVEL'] as const
export type ContextRelation = (typeof CONTEXT_RELATIONS)[number]

/**
 * Who stands behind a piece of evidence. B1 only has the person's own report. Other provenances (an observer, a verified
 * artifact, an assessment) belong to later phases and are added here when something real produces them — never simulated.
 */
export const EVIDENCE_PROVENANCES = ['SELF_REPORTED'] as const
export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCES)[number]
/** Provenances that count as independent verification (what VERY_STRONG requires). None exists in B1. */
export const INDEPENDENT_PROVENANCES: readonly EvidenceProvenance[] = []

/** LIVE: the attempt was started here and recorded when it ended. RETROSPECTIVE: an attempt from before, recorded afterwards. */
export const EVIDENCE_CAPTURES = ['LIVE', 'RETROSPECTIVE'] as const
export type EvidenceCapture = (typeof EVIDENCE_CAPTURES)[number]

/** Derived from what the record holds (strength.ts), never chosen by the person. */
export const EVIDENCE_STRENGTHS = ['WEAK', 'MODERATE', 'STRONG', 'VERY_STRONG'] as const
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number]

export const DIMENSIONS = ['COMPREHENSION', 'EXECUTION', 'AUTONOMY', 'TRANSFER', 'CONSISTENCY'] as const
export type Dimension = (typeof DIMENSIONS)[number]

/**
 * The qualitative state of a dimension (dimensions.ts):
 *   UNKNOWN       no applicable evidence
 *   NOT_YET       there is applicable evidence, and none of it meets the criterion yet
 *   SUPPORTED     a direct signal, not yet enough to claim stability
 *   DEMONSTRATED  direct evidence, repeated on separate occasions and coherent
 *   MIXED         material evidence for and against: the contradiction is kept, never averaged
 */
export const DIMENSION_STATUSES = ['UNKNOWN', 'NOT_YET', 'SUPPORTED', 'DEMONSTRATED', 'MIXED'] as const
export type DimensionStatus = (typeof DIMENSION_STATUSES)[number]

export const MAX_ACTIVE_OBJECTIVES = 3
export const MIN_SKILLS = 3
export const MAX_SKILLS = 7
export const MAX_FIELD_LENGTH = 500
// B1 has no notion of an "occasion" (that needs Session, B2): no rule here depends on how much time passed between attempts,
// and no contradiction stops counting because time passed or because later attempts went well.

/** The semantic definition of an objective: what changing it means (see revisions below). */
export interface ObjectiveDefinition {
  rawIntent: string
  action: string
  result: string
  context: string
  criterion: string
  targetAutonomy: Autonomy
}

/** An earlier definition of an objective, frozen as it was while it was in force (until the moment it was replaced). */
export interface ObjectiveRevision extends ObjectiveDefinition {
  revision: number
  until: number
}

/**
 * What the person wants to be able to do, made observable.
 *
 * Revisions: changing the definition never rewrites history. Until there is evidence the definition is simply edited. Once
 * there is, a change freezes the definition in force into `previousRevisions` (append-only) and raises `revision`; every
 * piece of evidence keeps the `objectiveRevision` it was produced under. (The objective keeps its id — skills and attempts
 * point to it — so its earlier definitions are kept as frozen snapshots rather than as separate records; skills, whose
 * evidence depends on their exact criterion, are revised as separate records: see Skill.)
 */
export interface CapabilityObjective {
  id: string
  /** What they wrote, as they wrote it. Never turned into the fields below automatically. */
  rawIntent: string
  action: string
  result: string
  context: string
  criterion: string
  targetAutonomy: Autonomy
  status: ObjectiveStatus
  /** Its skills, in the order they were added — archived and superseded revisions included. */
  skillIds: string[]
  createdAt: number
  updatedAt: number
  /** The definition's revision: 1 until it is changed after evidence exists. */
  revision: number
  /** The definitions it had before, oldest first. Never edited. */
  previousRevisions: ObjectiveRevision[]
}

/**
 * One capability the objective depends on, in the same template.
 *
 * Revisions: a skill with evidence is never edited. Changing its definition creates a NEW record — same `lineageId`,
 * `revision + 1`, `supersedesSkillId` = the one it replaces — and the earlier record stays as it was, with its evidence
 * still attached to it. The new revision starts with no evidence: the old one never shows the new criterion. The current
 * revision of a lineage is the one no other record supersedes.
 */
export interface Skill {
  id: string
  /** The same skill across its revisions (the id of its first revision). */
  lineageId: string
  revision: number
  /** The revision this one replaces. */
  supersedesSkillId?: string
  objectiveId: string
  action: string
  result: string
  context: string
  criterion: string
  targetAutonomy: Autonomy
  createdAt: number
  updatedAt: number
  /** Taken out of the decomposition (only possible before any evidence exists). */
  archivedAt?: number
}

/**
 * A concrete attempt. While it is in progress (no completedAt) its record is a draft that is saved as it is written, so a
 * reload never loses it; once confirmed it is closed and it leaves one piece of Evidence.
 */
export interface Attempt {
  id: string
  objectiveId: string
  skillId: string
  /** What is being tested (the next test's statement, or the base test's). */
  testStatement: string
  /** Where, with what, under which conditions. */
  contextDescription: string
  /** The gap the attempt was designed to close, if it came from one. */
  gapId?: string
  capture: EvidenceCapture
  startedAt: number
  completedAt?: number
  /* The record — filled in when the attempt ends. */
  outcomeDescription: string
  criterionVerdict?: CriterionVerdict
  assistance?: Autonomy
  contextRelation?: ContextRelation
  /** In the person's own words (optional). Stored; NOT evaluated in B1. */
  explanation: string
  /** A link or pointer to the result (optional). Kept as given; NOT verified in B1. */
  reference: string
  /** RETROSPECTIVE only: the day it happened, if the person gives it (YYYY-MM-DD, local). Never filled in for them. */
  occurredOn?: string
}

/**
 * What a completed attempt shows. Immutable once confirmed: a correction is a NEW record that `supersedes` this one; the
 * history is never rewritten.
 */
export interface Evidence {
  id: string
  attemptId: string
  objectiveId: string
  skillId: string
  observedResult: string
  criterionVerdict: CriterionVerdict
  assistance: Autonomy
  contextRelation: ContextRelation
  /**
   * When the attempt happened, exactly — known only for a LIVE attempt (the moment it was recorded as ended). For a
   * RETROSPECTIVE one it is `null`: the moment is not known, and none is made up.
   */
  occurredAt: number | null
  /** RETROSPECTIVE: the approximate day the person gave, if any (YYYY-MM-DD, local). Absent: unknown. */
  occurredOn?: string
  /** When this record was confirmed. Always known. */
  recordedAt: number
  /** The objective's definition revision in force when it was produced. */
  objectiveRevision: number
  provenance: EvidenceProvenance
  capture: EvidenceCapture
  /** The conditions it was taken under, copied from the attempt so the record stands on its own. */
  testStatement: string
  contextDescription: string
  notes?: string
  /** The person's explanation: kept, unverified (comprehension is not judged from text in B1). */
  explanation?: string
  reference?: string
  /** The record this one corrects, and why. */
  supersedes?: string
  correctionReason?: string
}

/** Everything DESARROLLAR keeps: configuration and history. The derived states are not here. */
export interface CapabilityData {
  objectives: CapabilityObjective[]
  skills: Skill[]
  attempts: Attempt[]
  evidence: Evidence[]
}

export const EMPTY_CAPABILITY: CapabilityData = { objectives: [], skills: [], attempts: [], evidence: [] }
