import {
  MAX_ACTIVE_OBJECTIVES,
  MAX_FIELD_LENGTH,
  MAX_SKILLS,
  type Attempt,
  type Autonomy,
  type CapabilityData,
  type CapabilityObjective,
  type ContextRelation,
  type CriterionVerdict,
  type Evidence,
  type EvidenceCapture,
  type Skill,
} from './model'
import { activationIssues, activeSkillsOf, skillKey, templateIssues, type Issue, type TemplateFields } from './validate'

/**
 * Every change DESARROLLAR can make, as a pure transition: (data, input) → new data, or the reason it is refused.
 * Ids and time come from outside, so each transition is deterministic and testable.
 */

export type CapabilityError =
  | { code: 'NOT_FOUND' }
  | { code: 'INVALID'; issues: Issue[] }
  | { code: 'ACTIVE_LIMIT' }
  | { code: 'LOCKED_BY_EVIDENCE' }
  | { code: 'NOT_ACTIVE' }
  | { code: 'ATTEMPT_IN_PROGRESS' }
  | { code: 'ATTEMPT_CLOSED' }
  | { code: 'INCOMPLETE_RECORD' }
  | { code: 'ALREADY_SUPERSEDED' }
  | { code: 'MISSING_REASON' }
  | { code: 'BAD_STATUS' }

export type Result<T = CapabilityData> = { ok: true; data: T } | { ok: false; error: CapabilityError }

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: CapabilityError): Result<never> => ({ ok: false, error })
const clip = (s: string) => s.slice(0, MAX_FIELD_LENGTH)

export const objectiveOf = (data: CapabilityData, id: string) => data.objectives.find((o) => o.id === id)
export const skillOf = (data: CapabilityData, id: string) => data.skills.find((s) => s.id === id)
export const attemptOf = (data: CapabilityData, id: string) => data.attempts.find((a) => a.id === id)
/** The attempt that has been started and not yet recorded, if any (there is at most one). */
export const attemptInProgress = (data: CapabilityData) => data.attempts.find((a) => a.completedAt === undefined)
/** Once there is evidence, the decomposition it was produced against is fixed. */
export const hasEvidence = (data: CapabilityData, objectiveId: string) => data.evidence.some((e) => e.objectiveId === objectiveId)

const replace = <T extends { id: string }>(list: T[], item: T) => list.map((x) => (x.id === item.id ? item : x))

/* —— objectives —— */

/** "Quiero poder hacer X": a draft that only keeps what was written. Nothing is filled in from it. */
export function createObjective(data: CapabilityData, input: { id: string; rawIntent: string; now: number }): Result {
  const objective: CapabilityObjective = {
    id: input.id,
    rawIntent: clip(input.rawIntent.trim()),
    action: '',
    result: '',
    context: '',
    criterion: '',
    targetAutonomy: 'AUTONOMOUS',
    status: 'DRAFT',
    skillIds: [],
    createdAt: input.now,
    updatedAt: input.now,
  }
  return ok({ ...data, objectives: [...data.objectives, objective] })
}

export function updateObjective(data: CapabilityData, id: string, patch: Partial<TemplateFields & { rawIntent: string }>, now: number): Result {
  const o = objectiveOf(data, id)
  if (!o) return fail({ code: 'NOT_FOUND' })
  if (hasEvidence(data, id)) return fail({ code: 'LOCKED_BY_EVIDENCE' })
  const next: CapabilityObjective = { ...o, updatedAt: now }
  for (const k of ['rawIntent', 'action', 'result', 'context', 'criterion'] as const) if (patch[k] !== undefined) next[k] = clip(patch[k]!)
  if (patch.targetAutonomy) next.targetAutonomy = patch.targetAutonomy
  return ok({ ...data, objectives: replace(data.objectives, next) })
}

/** DRAFT or PAUSED → ACTIVE: the template complete, 3–7 valid skills with no duplicate, and room among the active ones. */
export function activateObjective(data: CapabilityData, id: string, now: number): Result {
  const o = objectiveOf(data, id)
  if (!o) return fail({ code: 'NOT_FOUND' })
  if (o.status === 'ACTIVE') return ok(data)
  if (o.status === 'ARCHIVED') return fail({ code: 'BAD_STATUS' })
  const issues = activationIssues(data, o)
  if (issues.length) return fail({ code: 'INVALID', issues })
  if (data.objectives.filter((x) => x.status === 'ACTIVE').length >= MAX_ACTIVE_OBJECTIVES) return fail({ code: 'ACTIVE_LIMIT' })
  return ok({ ...data, objectives: replace(data.objectives, { ...o, status: 'ACTIVE', updatedAt: now }) })
}

/** ACTIVE → PAUSED, or anything → ARCHIVED. Nothing is deleted: its evidence stays. (There is no COMPLETED: that will be derived.) */
export function setObjectiveStatus(data: CapabilityData, id: string, status: 'PAUSED' | 'ARCHIVED', now: number): Result {
  const o = objectiveOf(data, id)
  if (!o) return fail({ code: 'NOT_FOUND' })
  // Checked at runtime too: no other status (COMPLETED least of all) can be set by hand.
  if (status !== 'PAUSED' && status !== 'ARCHIVED') return fail({ code: 'BAD_STATUS' })
  if (status === 'PAUSED' && o.status !== 'ACTIVE') return fail({ code: 'BAD_STATUS' })
  if (attemptInProgress(data)?.objectiveId === id) return fail({ code: 'ATTEMPT_IN_PROGRESS' })
  return ok({ ...data, objectives: replace(data.objectives, { ...o, status, updatedAt: now }) })
}

/* —— skills: editable until the first evidence —— */

export function addSkill(data: CapabilityData, input: TemplateFields & { id: string; objectiveId: string; now: number }): Result {
  const o = objectiveOf(data, input.objectiveId)
  if (!o) return fail({ code: 'NOT_FOUND' })
  if (hasEvidence(data, o.id)) return fail({ code: 'LOCKED_BY_EVIDENCE' })
  const fields = { action: clip(input.action), result: clip(input.result), context: clip(input.context), criterion: clip(input.criterion), targetAutonomy: input.targetAutonomy }
  const issues = templateIssues(fields)
  if (issues.length) return fail({ code: 'INVALID', issues })
  const skills = activeSkillsOf(data, o.id)
  if (skills.length >= MAX_SKILLS) return fail({ code: 'INVALID', issues: ['TOO_MANY_SKILLS'] })
  if (skills.some((s) => skillKey(s) === skillKey(fields))) return fail({ code: 'INVALID', issues: ['DUPLICATE_SKILL'] })
  const skill: Skill = { id: input.id, objectiveId: o.id, ...fields, createdAt: input.now, updatedAt: input.now }
  return ok({
    ...data,
    skills: [...data.skills, skill],
    objectives: replace(data.objectives, { ...o, skillIds: [...o.skillIds, skill.id], updatedAt: input.now }),
  })
}

export function updateSkill(data: CapabilityData, id: string, patch: Partial<TemplateFields>, now: number): Result {
  const s = skillOf(data, id)
  if (!s || s.archivedAt !== undefined) return fail({ code: 'NOT_FOUND' })
  if (hasEvidence(data, s.objectiveId)) return fail({ code: 'LOCKED_BY_EVIDENCE' })
  const next: Skill = { ...s, updatedAt: now }
  for (const k of ['action', 'result', 'context', 'criterion'] as const) if (patch[k] !== undefined) next[k] = clip(patch[k]!)
  if (patch.targetAutonomy) next.targetAutonomy = patch.targetAutonomy
  const issues = templateIssues(next)
  if (issues.length) return fail({ code: 'INVALID', issues })
  if (activeSkillsOf(data, s.objectiveId).some((x) => x.id !== id && skillKey(x) === skillKey(next))) return fail({ code: 'INVALID', issues: ['DUPLICATE_SKILL'] })
  return ok({ ...data, skills: replace(data.skills, next) })
}

/**
 * Take a skill out of the decomposition (before any evidence). An ACTIVE objective cannot drop below three: it is paused first —
 * the count is never left in a state the activation rules would refuse.
 */
export function archiveSkill(data: CapabilityData, id: string, now: number): Result {
  const s = skillOf(data, id)
  if (!s || s.archivedAt !== undefined) return fail({ code: 'NOT_FOUND' })
  if (hasEvidence(data, s.objectiveId)) return fail({ code: 'LOCKED_BY_EVIDENCE' })
  const o = objectiveOf(data, s.objectiveId)
  if (o?.status === 'ACTIVE' && activeSkillsOf(data, o.id).length <= 3) return fail({ code: 'INVALID', issues: ['TOO_FEW_SKILLS'] })
  return ok({ ...data, skills: replace(data.skills, { ...s, archivedAt: now, updatedAt: now }) })
}

/* —— attempts —— */

/** Begin an attempt (or open the record of one made before: RETROSPECTIVE). Only on an ACTIVE objective, and one at a time. */
export function startAttempt(
  data: CapabilityData,
  input: { id: string; skillId: string; testStatement: string; contextDescription: string; gapId?: string; capture: EvidenceCapture; now: number },
): Result {
  const s = skillOf(data, input.skillId)
  if (!s || s.archivedAt !== undefined) return fail({ code: 'NOT_FOUND' })
  if (objectiveOf(data, s.objectiveId)?.status !== 'ACTIVE') return fail({ code: 'NOT_ACTIVE' })
  if (attemptInProgress(data)) return fail({ code: 'ATTEMPT_IN_PROGRESS' })
  const attempt: Attempt = {
    id: input.id,
    objectiveId: s.objectiveId,
    skillId: s.id,
    testStatement: clip(input.testStatement),
    contextDescription: clip(input.contextDescription),
    ...(input.gapId ? { gapId: input.gapId } : {}),
    capture: input.capture,
    startedAt: input.now,
    outcomeDescription: '',
    explanation: '',
    reference: '',
  }
  return ok({ ...data, attempts: [...data.attempts, attempt] })
}

export type AttemptRecord = Partial<Pick<Attempt, 'contextDescription' | 'outcomeDescription' | 'criterionVerdict' | 'assistance' | 'contextRelation' | 'explanation' | 'reference'>>

/** The record of an attempt in progress, as it is written (saved at every change). */
export function saveAttemptRecord(data: CapabilityData, id: string, patch: AttemptRecord): Result {
  const a = attemptOf(data, id)
  if (!a) return fail({ code: 'NOT_FOUND' })
  if (a.completedAt !== undefined) return fail({ code: 'ATTEMPT_CLOSED' })
  const next: Attempt = { ...a }
  for (const k of ['contextDescription', 'outcomeDescription', 'explanation', 'reference'] as const) if (patch[k] !== undefined) next[k] = clip(patch[k]!)
  if (patch.criterionVerdict) next.criterionVerdict = patch.criterionVerdict
  if (patch.assistance) next.assistance = patch.assistance
  if (patch.contextRelation) next.contextRelation = patch.contextRelation
  return ok({ ...data, attempts: replace(data.attempts, next) })
}

/** An attempt that was started and will not be recorded (nothing happened yet): it leaves no evidence. A recorded one cannot be discarded. */
export function discardAttempt(data: CapabilityData, id: string): Result {
  const a = attemptOf(data, id)
  if (!a) return fail({ code: 'NOT_FOUND' })
  if (a.completedAt !== undefined) return fail({ code: 'ATTEMPT_CLOSED' })
  return ok({ ...data, attempts: data.attempts.filter((x) => x.id !== id) })
}

/** What a record needs before it can become evidence: what happened, the verdict, the help and the context. */
export const recordComplete = (a: Pick<Attempt, 'outcomeDescription' | 'criterionVerdict' | 'assistance' | 'contextRelation'>) =>
  a.outcomeDescription.trim().length > 0 && a.criterionVerdict !== undefined && a.assistance !== undefined && a.contextRelation !== undefined

/** Close the attempt: it leaves one immutable piece of evidence — whatever the verdict. */
export function confirmAttempt(data: CapabilityData, id: string, evidenceId: string, now: number): Result {
  const a = attemptOf(data, id)
  if (!a) return fail({ code: 'NOT_FOUND' })
  if (a.completedAt !== undefined) return fail({ code: 'ATTEMPT_CLOSED' })
  if (!recordComplete(a)) return fail({ code: 'INCOMPLETE_RECORD' })
  const evidence: Evidence = {
    id: evidenceId,
    attemptId: a.id,
    objectiveId: a.objectiveId,
    skillId: a.skillId,
    observedResult: a.outcomeDescription.trim(),
    criterionVerdict: a.criterionVerdict!,
    assistance: a.assistance!,
    contextRelation: a.contextRelation!,
    occurredAt: now,
    recordedAt: now,
    provenance: 'SELF_REPORTED',
    capture: a.capture,
    testStatement: a.testStatement,
    contextDescription: a.contextDescription.trim(),
    ...(a.explanation.trim() ? { explanation: a.explanation.trim() } : {}),
    ...(a.reference.trim() ? { reference: a.reference.trim() } : {}),
  }
  return ok({ ...data, attempts: replace(data.attempts, { ...a, completedAt: now }), evidence: [...data.evidence, evidence] })
}

/** Evidence that no later record corrects: the one every derivation reads. The superseded ones stay in the history. */
export function effectiveEvidence(data: CapabilityData): Evidence[] {
  const superseded = new Set(data.evidence.map((e) => e.supersedes).filter(Boolean))
  return data.evidence.filter((e) => !superseded.has(e.id))
}

/**
 * Correct a confirmed record: a NEW record that supersedes it, with the reason. The original is never changed or removed.
 * Only the latest record of an attempt can be corrected.
 */
export function correctEvidence(
  data: CapabilityData,
  id: string,
  input: { newId: string; reason: string; now: number; observedResult: string; criterionVerdict: CriterionVerdict; assistance: Autonomy; contextRelation: ContextRelation },
): Result {
  const e = data.evidence.find((x) => x.id === id)
  if (!e) return fail({ code: 'NOT_FOUND' })
  if (data.evidence.some((x) => x.supersedes === id)) return fail({ code: 'ALREADY_SUPERSEDED' })
  if (!input.reason.trim()) return fail({ code: 'MISSING_REASON' })
  if (!input.observedResult.trim()) return fail({ code: 'INCOMPLETE_RECORD' })
  const correction: Evidence = {
    ...e,
    id: input.newId,
    observedResult: clip(input.observedResult.trim()),
    criterionVerdict: input.criterionVerdict,
    assistance: input.assistance,
    contextRelation: input.contextRelation,
    recordedAt: input.now,
    supersedes: e.id,
    correctionReason: clip(input.reason.trim()),
  }
  return ok({ ...data, evidence: [...data.evidence, correction] })
}
