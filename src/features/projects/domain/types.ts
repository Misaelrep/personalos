import type { ProjectId as RoutineTag } from '../../../domain/types'

/**
 * PROYECTOS — the data model of a 90-day execution system for a few projects.
 *
 * Three rules shape it:
 *  1. What comes from a dossier is kept as it was written: original IDs
 *     (`sourceId`), the literal status, priority and approval, the raw record
 *     (`origin`) and any field the model does not know (`extra`). The app adds
 *     a normalization layer to work with them; it never replaces them.
 *  2. Work, priority and approval are separate dimensions. A task can be
 *     executed (by a person or by Claude Code / Codex) and still wait for a
 *     human approval; it is only done when both say so.
 *  3. Nothing here infers which routine block serves which project: those
 *     correspondences exist only when confirmed (`routineLinks`).
 *
 * Pure data, no behavior. Dates are local "YYYY-MM-DD"; instants are local ISO
 * strings with their offset, given by the caller.
 */

/** What the app understands by a status, whatever the dossier calls it. */
export const WORK_CLASSES = ['pendiente', 'en-curso', 'en-espera', 'ejecutada', 'descartada'] as const
export type WorkClass = (typeof WORK_CLASSES)[number]

/** Human approval, normalized. The dossier's own value is kept apart (`Approval.original`). */
export const APPROVAL_STATES = ['no-requiere', 'pendiente', 'aprobada', 'devuelta'] as const
export type ApprovalState = (typeof APPROVAL_STATES)[number]

export const OWNER_KINDS = ['humano', 'agente'] as const
export type OwnerKind = (typeof OWNER_KINDS)[number]

/** Where a record came from. Written once, at import; never rewritten. */
export interface Origin {
  /** File name of the dossier. */
  dossier: string
  /** Date or version of the dossier, as given. */
  dossierVersion?: string
  /** SHA-256 of the dossier file. */
  dossierHash?: string
  /** Where in the dossier: heading path, sheet and row, lines… */
  location?: string
  /** The record exactly as it was written. */
  raw?: string
  /** Version of the converter that read it. */
  converter?: string
  importedAt: string
}

/**
 * How one dossier's words map to the app's. Every literal a task uses must be
 * here; an unknown literal is an error, never a guess.
 */
export interface Vocabulary {
  status: { literal: string; workClass: WorkClass }[]
  /** `rank`: 1 is the most urgent. */
  priority: { literal: string; rank: number }[]
  approval: { literal: string; state: ApprovalState }[]
}

export interface Project {
  /** Internal, immutable. */
  id: string
  /** Original code of the project in its dossier, if it has one. Immutable. */
  sourceId?: string
  name: string
  /** Key of its dossier in `ProjectsData.vocabularies`. */
  dossier: string
  objective?: string
  expectedResults: string[]
  /** The project's own status, literal (projects have no normalized status). */
  statusLiteral?: string
  atlasRefs: string[]
  origin?: Origin
  extra?: Record<string, unknown>
}

export interface Milestone {
  id: string
  sourceId?: string
  projectId: string
  title: string
  /** Normalized due date, when the dossier gives one that can be read as a date. */
  due?: string
  /** The due date as written ("semana 6", "15/11", "fin de noviembre"…). */
  dueLiteral?: string
  /** Acceptance criteria. */
  acceptance: string[]
  statusLiteral?: string
  origin?: Origin
  extra?: Record<string, unknown>
}

export interface Owner {
  kind: OwnerKind
  /** "Misael", "Claude Code", "Codex", a collaborator… */
  name: string
}

export interface Approval {
  state: ApprovalState
  /** The dossier's approval, untouched: its value and, if given, who, when and on what evidence. */
  original?: { literal: string; by?: string; at?: string; evidence?: string }
  /** The latest human decision taken in ELYUM. */
  decidedAt?: string
  note?: string
}

export interface Evidence {
  label: string
  url?: string
  /** `enlace` a deliverable · `nota` a written record · `focus` a FOCUS session worked on this task. */
  kind: 'enlace' | 'nota' | 'focus'
  /** For `focus`: the local date and the routine block. */
  date?: string
  blockId?: string
  addedAt: string
}

export interface Task {
  /** Internal, immutable: `src:<sourceId>` for imported tasks, generated for tasks created in ELYUM. */
  id: string
  /** The dossier's original ID, literal and immutable (PUB-03, EDI-12, COM-1.4, SYS-07…). */
  sourceId?: string
  /** Optional readable reference for a task created in ELYUM. Never required. */
  ref?: string
  projectId: string
  milestoneId?: string
  title: string
  /** Operational status: a literal of the project's vocabulary. */
  status: string
  /** Priority: a literal of the project's vocabulary. */
  priority?: string
  owner?: Owner
  /** Internal ids of the tasks this one waits for (any project). */
  dependsOn: string[]
  /** Acceptance criteria. */
  acceptance: string[]
  evidence: Evidence[]
  approval: Approval
  /** The next physical, concrete action. */
  nextAction?: string
  estimateHours?: number
  atlasRefs: string[]
  origin?: Origin
  extra?: Record<string, unknown>
  createdAt: string
}

/** ATLAS: transversal reference of continuity and knowledge. Not a project; no status. */
export interface AtlasRef {
  id: string
  sourceId?: string
  title: string
  url?: string
  note?: string
  origin?: Origin
}

/** A routine tag (`wellness`, `web`…) that serves a project. Only confirmed ones give it routine hours. */
export interface RoutineLink {
  projectId: string
  tag: RoutineTag
  confirmed: boolean
}

/** One week of the cycle, decided in the Sunday review. */
export interface WeekPlan {
  /** Monday, local. */
  weekStart: string
  /** Hours the person declares available for project work this week (all projects). */
  humanCapacityHours?: number
  /** Most human commitments to hold at once this week. */
  wipLimit?: number
  /** Human commitments: tasks the person takes on this week. */
  commitments: { taskId: string; estimateHours?: number }[]
  notes: { projectId: string; text: string }[]
  decisions: string[]
  closedAt?: string
}

export interface HistoryEntry {
  at: string
  by: 'usuario' | 'importación'
  entity: 'task' | 'project' | 'milestone' | 'week' | 'routine-link'
  id: string
  field: string
  from?: unknown
  to?: unknown
  note?: string
}

export interface Cycle {
  /** A Monday. */
  start: string
  end: string
}

export interface ProjectsData {
  version: 1
  cycle: Cycle
  /** By dossier. */
  vocabularies: Record<string, Vocabulary>
  projects: Project[]
  milestones: Milestone[]
  tasks: Task[]
  atlas: AtlasRef[]
  routineLinks: RoutineLink[]
  weeks: WeekPlan[]
  /** Append-only. */
  history: HistoryEntry[]
}
