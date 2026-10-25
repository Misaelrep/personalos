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
/** Two attempts are separate occasions when at least this far apart (ms): consistency and corroboration need them. */
export const SEPARATE_OCCASION_MS = 8 * 60 * 60 * 1000
/** A dimension is judged on its most recent occasions: an old contradiction stays in the history and stops ruling the state once this many later occasions follow it. */
export const RECENT_OCCASIONS = 3

/** What the person wants to be able to do, made observable. */
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
  /** Its skills, in the order they were added (archived ones included: see Skill.archivedAt). */
  skillIds: string[]
  createdAt: number
  updatedAt: number
}

/** One capability the objective depends on, in the same template. */
export interface Skill {
  id: string
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
  /** Something a third party could check: a link to the result (optional). */
  reference: string
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
  /** When the attempt ended (its own moment, not when it was typed). */
  occurredAt: number
  /** When this record was confirmed. */
  recordedAt: number
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
