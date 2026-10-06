/**
 * APRENDER — domain objects prepared for later phases.
 *
 * TYPES ONLY, and deliberately minimal: Phase A gives each object an identity
 * (and `kind` to Knowledge, which the spec already fixes) and nothing else —
 * no relations, no behavior. A later phase adds exactly what it needs, here.
 */

/** Anything the learning system keeps. */
export interface Entity {
  id: string
}

/* Capability */
export interface LearningGoal extends Entity {}
export interface Skill extends Entity {}
export interface Evidence extends Entity {}
export interface LearningSession extends Entity {}

/* Understanding */

/** What a piece of knowledge is. A MentalModel is NOT one of these (see below). */
export const KNOWLEDGE_KINDS = ['principle', 'procedure', 'heuristic', 'observation'] as const
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number]

export interface Knowledge extends Entity {
  kind: KnowledgeKind
}
export interface KnowledgeConnection extends Entity {}
export interface Area extends Entity {}
/** A composed object, separate from Knowledge: it is built from knowledge, it is not a kind of it. */
export interface MentalModel extends Entity {}
export interface Source extends Entity {}
export interface Exploration extends Entity {}

/* Situation */
export interface Context extends Entity {}
export interface ContextUpdate extends Entity {}

/* Inquiry */
export interface Hypothesis extends Entity {}
export interface Experiment extends Entity {}

/** The three intellectual routes. They are routes of one flow, never top-level tabs. */
export const LEARN_ROUTES = ['orient', 'develop', 'explore'] as const
export type LearnRoute = (typeof LEARN_ROUTES)[number]
