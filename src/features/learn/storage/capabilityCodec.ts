import {
  AUTONOMY_LEVELS,
  CONTEXT_RELATIONS,
  CRITERION_VERDICTS,
  EMPTY_CAPABILITY,
  EVIDENCE_CAPTURES,
  EVIDENCE_PROVENANCES,
  MAX_FIELD_LENGTH,
  OBJECTIVE_STATUSES,
  type Attempt,
  type CapabilityData,
  type CapabilityObjective,
  type Evidence,
  type Skill,
} from '../domain/capability/model'

/**
 * DESARROLLAR's records as stored, and back. The slot holds `{ schema, objectives, skills, attempts, evidence, flow }`
 * inside APRENDER's usual envelope (`{ v: 1, data }`, learnStore.ts).
 *
 * Reading never trusts what it finds: every record is checked field by field and one that does not hold is dropped on its
 * own (the rest survive). `schema` versions the shape of this slot; a newer schema than this code knows is not read and
 * not overwritten (see learnStore: 'newer').
 */
export const CAPABILITY_SCHEMA = 1

/** Where the person is in DESARROLLAR, so a reload brings them back to the same screen. Not derived, not evidence: navigation. */
export const FLOW_STEPS = ['intent', 'observable', 'skills', 'pick', 'attempt', 'record', 'result'] as const
export type FlowStep = (typeof FLOW_STEPS)[number]
export interface CapabilityFlow {
  objectiveId?: string
  step?: FlowStep
  skillId?: string
}

export interface StoredCapability {
  data: CapabilityData
  flow: CapabilityFlow
}

export const EMPTY_STORED: StoredCapability = { data: EMPTY_CAPABILITY, flow: {} }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string'
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)
const text = (v: unknown) => (str(v) ? v.slice(0, MAX_FIELD_LENGTH) : undefined)

function toObjective(v: unknown): CapabilityObjective | undefined {
  if (!isObject(v)) return undefined
  const { id, rawIntent, action, result, context, criterion, targetAutonomy, status, skillIds, createdAt, updatedAt } = v
  if (!str(id) || !num(createdAt) || !num(updatedAt) || !oneOf(AUTONOMY_LEVELS, targetAutonomy) || !oneOf(OBJECTIVE_STATUSES, status)) return undefined
  if (![rawIntent, action, result, context, criterion].every(str) || !Array.isArray(skillIds) || !skillIds.every(str)) return undefined
  return { id, rawIntent: text(rawIntent)!, action: text(action)!, result: text(result)!, context: text(context)!, criterion: text(criterion)!, targetAutonomy, status, skillIds: [...skillIds], createdAt, updatedAt }
}

function toSkill(v: unknown): Skill | undefined {
  if (!isObject(v)) return undefined
  const { id, objectiveId, action, result, context, criterion, targetAutonomy, createdAt, updatedAt, archivedAt } = v
  if (!str(id) || !str(objectiveId) || !num(createdAt) || !num(updatedAt) || !oneOf(AUTONOMY_LEVELS, targetAutonomy)) return undefined
  if (![action, result, context, criterion].every(str) || (archivedAt !== undefined && !num(archivedAt))) return undefined
  return { id, objectiveId, action: text(action)!, result: text(result)!, context: text(context)!, criterion: text(criterion)!, targetAutonomy, createdAt, updatedAt, ...(archivedAt !== undefined ? { archivedAt } : {}) }
}

function toAttempt(v: unknown): Attempt | undefined {
  if (!isObject(v)) return undefined
  const { id, objectiveId, skillId, testStatement, contextDescription, gapId, capture, startedAt, completedAt, outcomeDescription, criterionVerdict, assistance, contextRelation, explanation, reference } = v
  if (!str(id) || !str(objectiveId) || !str(skillId) || !str(testStatement) || !str(contextDescription) || !num(startedAt) || !oneOf(EVIDENCE_CAPTURES, capture)) return undefined
  if (completedAt !== undefined && !num(completedAt)) return undefined
  if (criterionVerdict !== undefined && !oneOf(CRITERION_VERDICTS, criterionVerdict)) return undefined
  if (assistance !== undefined && !oneOf(AUTONOMY_LEVELS, assistance)) return undefined
  if (contextRelation !== undefined && !oneOf(CONTEXT_RELATIONS, contextRelation)) return undefined
  return {
    id,
    objectiveId,
    skillId,
    testStatement: text(testStatement)!,
    contextDescription: text(contextDescription)!,
    ...(str(gapId) ? { gapId } : {}),
    capture,
    startedAt,
    ...(completedAt !== undefined ? { completedAt } : {}),
    outcomeDescription: text(outcomeDescription) ?? '',
    ...(criterionVerdict !== undefined ? { criterionVerdict } : {}),
    ...(assistance !== undefined ? { assistance } : {}),
    ...(contextRelation !== undefined ? { contextRelation } : {}),
    explanation: text(explanation) ?? '',
    reference: text(reference) ?? '',
  }
}

/** Evidence is the history: a record that does not hold completely is dropped rather than repaired (repairing would rewrite it). */
function toEvidence(v: unknown): Evidence | undefined {
  if (!isObject(v)) return undefined
  const e = v
  if (![e.id, e.attemptId, e.objectiveId, e.skillId, e.observedResult, e.testStatement, e.contextDescription].every(str)) return undefined
  if (!num(e.occurredAt) || !num(e.recordedAt)) return undefined
  if (!oneOf(CRITERION_VERDICTS, e.criterionVerdict) || !oneOf(AUTONOMY_LEVELS, e.assistance) || !oneOf(CONTEXT_RELATIONS, e.contextRelation)) return undefined
  if (!oneOf(EVIDENCE_PROVENANCES, e.provenance) || !oneOf(EVIDENCE_CAPTURES, e.capture)) return undefined
  const optional = ['notes', 'explanation', 'reference', 'supersedes', 'correctionReason'] as const
  for (const k of optional) if (e[k] !== undefined && !str(e[k])) return undefined
  const kept: Evidence = {
    id: e.id as string,
    attemptId: e.attemptId as string,
    objectiveId: e.objectiveId as string,
    skillId: e.skillId as string,
    observedResult: e.observedResult as string,
    criterionVerdict: e.criterionVerdict,
    assistance: e.assistance,
    contextRelation: e.contextRelation,
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
    provenance: e.provenance,
    capture: e.capture,
    testStatement: e.testStatement as string,
    contextDescription: e.contextDescription as string,
  }
  for (const k of optional) if (str(e[k])) kept[k] = e[k] as string
  return kept
}

const each = <T>(v: unknown, read: (x: unknown) => T | undefined): T[] => (Array.isArray(v) ? v.map(read).filter((x): x is T => x !== undefined) : [])
const unique = <T extends { id: string }>(list: T[]) => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i)

function toFlow(v: unknown, data: CapabilityData): CapabilityFlow {
  if (!isObject(v)) return {}
  const flow: CapabilityFlow = {}
  if (str(v.objectiveId) && data.objectives.some((o) => o.id === v.objectiveId)) flow.objectiveId = v.objectiveId
  if (oneOf(FLOW_STEPS, v.step)) flow.step = v.step
  if (str(v.skillId) && data.skills.some((s) => s.id === v.skillId)) flow.skillId = v.skillId
  return flow
}

/** The slot's content as valid records (anything that does not hold is dropped), and how many were dropped. */
export function decodeCapability(raw: unknown): { stored: StoredCapability; dropped: number } {
  if (!isObject(raw)) return { stored: EMPTY_STORED, dropped: 0 }
  const lists = { objectives: raw.objectives, skills: raw.skills, attempts: raw.attempts, evidence: raw.evidence }
  const objectives = unique(each(lists.objectives, toObjective))
  const skills = unique(each(lists.skills, toSkill))
  // At most one attempt can be in progress: if several were stored, the latest started is kept open.
  const allAttempts = unique(each(lists.attempts, toAttempt))
  const open = allAttempts.filter((a) => a.completedAt === undefined).sort((a, b) => b.startedAt - a.startedAt)
  const attempts = allAttempts.filter((a) => a.completedAt !== undefined || a === open[0])
  const evidence = unique(each(lists.evidence, toEvidence))
  const data: CapabilityData = { objectives, skills, attempts, evidence }
  const total = Object.values(lists).reduce<number>((n, l) => n + (Array.isArray(l) ? l.length : 0), 0)
  const kept = objectives.length + skills.length + attempts.length + evidence.length
  return { stored: { data, flow: toFlow(raw.flow, data) }, dropped: total - kept }
}

export function encodeCapability(stored: StoredCapability): unknown {
  return { schema: CAPABILITY_SCHEMA, ...stored.data, flow: stored.flow }
}
