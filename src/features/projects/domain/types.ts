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

/**
 * What the app understands by a status, whatever the dossier calls it.
 * `sin-decidir` (P1.1 · M1): the literal is kept but nobody has said what it
 * means yet. Such a task is valid, shows as «por clasificar», and is never a
 * candidate nor done.
 */
export const WORK_CLASSES = ['sin-decidir', 'pendiente', 'en-curso', 'en-espera', 'ejecutada', 'descartada'] as const
export type WorkClass = (typeof WORK_CLASSES)[number]

/**
 * Human approval, normalized. The dossier's own value is kept apart (`Approval.original`).
 * `sin-dato` (P1.1 · M11): imported from a dossier that declares no approval.
 * It never counts as approved: an executed task with `sin-dato` waits for the person.
 */
export const APPROVAL_STATES = ['sin-dato', 'no-requiere', 'pendiente', 'aprobada', 'devuelta'] as const
export type ApprovalState = (typeof APPROVAL_STATES)[number]

export const OWNER_KINDS = ['humano', 'agente'] as const
export type OwnerKind = (typeof OWNER_KINDS)[number]

/** P1.1 · M2: whether what the task claims was checked. Optional and independent of work and approval. */
export const VERIFICATION_STATES = ['verificada', 'sin-verificar', 'no-consta'] as const
export type VerificationState = (typeof VERIFICATION_STATES)[number]

/** P1.1 · M3: how a requirement reads. A label for the person; the logic is `mode` + `options`. */
export const REQUIREMENT_KINDS = ['tarea', 'alternativa', 'condicional', 'externo', 'recurso', 'mixto'] as const
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number]

export const CONDITION_STATES = ['por-verificar', 'cumplida', 'no-cumplida'] as const
export type ConditionState = (typeof CONDITION_STATES)[number]

/** P1.1 · M5: what an estimate repeats over. */
export const ESTIMATE_PERIODS = ['sesion', 'revision', 'semana'] as const
export type EstimatePeriod = (typeof ESTIMATE_PERIODS)[number]

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
  /**
   * P3: the values the import derived from `raw`, by field. A re-import
   * compares the new dossier with these (did the dossier change?) and the
   * record with these (did the person change it in ELYUM?).
   */
  snapshot?: Record<string, unknown>
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

/** P1.1 · M9: a rule the project's dossier states («máximo tres piezas activas»). Informative only. */
export interface ProjectRule {
  literal: string
  /** `wip`: a limit of things in progress at once. Absent when the rule is only text. */
  kind?: 'wip'
  limit?: number
  /** What the limit counts, as written ("piezas creativas activas"). */
  scope?: string
  origin?: Origin
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
  /** P1.1 · M9. Shown, never enforced. */
  rules?: ProjectRule[]
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

/** P1.1 · M10: one part of a partial approval («mecanismo sí; arte no»). */
export interface ApprovalPart {
  /** What this part covers, as the person or the dossier names it: "arte", "ruta", "mecanismo"… */
  scope: string
  state: ApprovalState
  literal?: string
}

export interface Approval {
  /** The decision that counts for «done». Parts never override it. */
  state: ApprovalState
  /**
   * The dossier's approval, untouched: its value and, if given, who, when, on
   * what evidence and what it covered (`scope`, P1.1 · M10).
   */
  original?: { literal: string; by?: string; at?: string; evidence?: string; scope?: string }
  /** P1.1 · M10: approvals that cover only part of the task. Informative. */
  parts?: ApprovalPart[]
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

/** P1.1 · M2. */
export interface Verification {
  state: VerificationState
  /** The dossier's words about it, when they exist. */
  literal?: string
  at?: string
  note?: string
}

/**
 * P1.1 · M3: one option of a requirement — another task, or a condition the
 * app cannot check by itself (an access, a resource, «según pieza»…), which
 * stays `por-verificar` until the person says otherwise.
 */
export type RequirementOption =
  | { kind: 'tarea'; taskId: string }
  | { kind: 'condicion'; literal: string; state: ConditionState; at?: string; note?: string }

/**
 * P1.1 · M3: what a task needs before it can be done, kept with its source
 * text. `todas`: every option (cumulative). `alguna`: one valid option is
 * enough (alternative). An unknown task id or an unchecked condition is never
 * read as met.
 */
export interface Requirement {
  /** Stable within the task. */
  id: string
  /** The text as written in the source. Always kept. */
  literal: string
  kind: RequirementKind
  mode: 'todas' | 'alguna'
  options: RequirementOption[]
  /** How the literal was read when it was not plain (e.g. «AAA-02,03 → AAA-02, AAA-03»). Shown to the person. */
  reading?: string
}

/** P1.1 · M5. `minMinutes`/`maxMinutes` only when the literal says them plainly. */
export interface Estimate {
  literal: string
  minMinutes?: number
  maxMinutes?: number
  per?: EstimatePeriod
}

/** P1.1 · M6: who could take the task, as written. Not the owner. */
export interface Delegation {
  literal?: string
  /** Agents or people the person considers for it. Never filled by an import. */
  candidates: Owner[]
}

/** P1.1 · M7: the sources a task cites ("F2 §9.14; F4"), literal and as keys of the dossier's source list. */
export interface SourceRefs {
  literal: string
  keys: string[]
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
  /** Hours, a number the person gives (e.g. when committing it). Never derived from `estimate`. */
  estimateHours?: number
  atlasRefs: string[]
  /** P1.1 · M2. */
  verification?: Verification
  /** P1.1 · M3. Read together with `dependsOn` (which stays: every id there is required). */
  requirements?: Requirement[]
  /** P1.1 · M4. */
  area?: string
  deliverable?: string
  /** P1.1 · M5. */
  estimate?: Estimate
  /** P1.1 · M6. */
  delegation?: Delegation
  /** P1.1 · M7. */
  sourceRefs?: SourceRefs
  origin?: Origin
  extra?: Record<string, unknown>
  createdAt: string
}

/** P1.1 · M7: one source a dossier lists (F1…F14), by its own key. */
export interface DossierSource {
  /** Name of the dossier that lists it. */
  dossier: string
  /** The dossier's key, literal ("F2"). Unique within the dossier. */
  key: string
  title: string
  note?: string
  origin?: Origin
}

/**
 * P1.1 · M7: a record of a dossier that is not a task (an editorial piece, a
 * file, a step of a process…), kept as a reference with its cells literal.
 * No status, no approval, never turned into a task by itself (M8 is deferred).
 */
export interface DossierReference {
  id: string
  dossier: string
  projectId: string
  /** Where it was: the table's heading. */
  group: string
  /** The first cell, or whatever names the row. */
  label: string
  cells: { column: string; value: string }[]
  origin?: Origin
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
  entity: 'task' | 'project' | 'milestone' | 'week' | 'routine-link' | 'vocabulary' | 'import'
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
  /** P1.1 · M7. Optional so that data written before P1.1 still reads. */
  sources?: DossierSource[]
  references?: DossierReference[]
  /** P3: one line per confirmed import, append-only. Optional so that earlier data still reads. */
  imports?: ImportRecord[]
  routineLinks: RoutineLink[]
  weeks: WeekPlan[]
  /** Append-only. */
  history: HistoryEntry[]
}

/** P3: what one confirmed import did. Written once; never rewritten. */
export interface ImportRecord {
  id: string
  at: string
  projectId: string
  dossier: string
  dossierVersion?: string
  dossierHash: string
  converter: string
  counts: { new: number; changed: number; unchanged: number; conflicts: number; missing: number; references: number; sources: number }
  /** Every conflict and how the person resolved it. */
  resolutions: { taskId: string; field: string; choice: 'mantener-elyum' | 'usar-dossier' }[]
}
