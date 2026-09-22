/**
 * Core domain model. Routines are pure configuration; everything the UI shows
 * about "today" is derived from a routine + the day's local state + the clock.
 */

/** 0 = domingo … 6 = sábado (same convention as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type EnergyState =
  | 'activacion'
  | 'focus'
  | 'recuperacion'
  | 'produccion'
  | 'cuerpo'
  | 'segundo-pico'
  | 'cierre'

/**
 * What kind of time a block represents. Drives which actions HOY offers
 * and whether the block appears in the "Camino del día".
 */
export type BlockKind =
  | 'deep' // trabajo profundo — admite Focus y objetivo
  | 'practice' // prácticas diarias (escritura, inglés, lectura…)
  | 'ritual' // meditación, breathwork
  | 'recovery' // descanso cognitivo
  | 'body' // gimnasio
  | 'transition' // logística / comida / pausas — no aparece en el camino
  | 'sleep'

/** "HH:MM", 24h. */
export type ClockTime = string

export interface RoutineBlock {
  id: string
  start: ClockTime
  /** Omit for point-in-time entries: the block then lasts until the next one starts. */
  end?: ClockTime
  title: string
  /** Secondary line, e.g. "MVP / Testeo". */
  subtitle?: string
  /** Nature of the block, e.g. "Trabajo profundo", "Recuperación cognitiva". */
  descriptor?: string
  /** Short name used in the day path, e.g. "Merkaba". Defaults to title. */
  shortTitle?: string
  kind: BlockKind
  energy: EnergyState
  /** Default "¿Qué tiene que existir al terminar este bloque?" answer. Editable in HOY. */
  defaultObjective?: string
}

/**
 * La meditación es prioritaria a su hora. Si no se realizó, HOY puede
 * proponer moverla a una franja de rescate, sustituyendo lo que hubiera allí.
 */
export interface MeditationRule {
  blockId: string
  /** Block whose slot the meditation takes if moved. */
  rescueBlockId: string
}

export interface DayRoutine {
  weekday: Weekday
  /** Display name, e.g. "Martes". */
  dayName: string
  /** Day theme, e.g. "Páginas Web + Wellness". */
  theme: string
  blocks: RoutineBlock[]
  meditation?: MeditationRule
}

/* ------------------------------------------------------------------------ */
/* Day state (local, per date)                                               */
/* ------------------------------------------------------------------------ */

/** Explicit resolutions the user can record for a block. */
export type ResolvedStatus = 'completado' | 'parcial' | 'omitido'

/** Result of a deep block: ¿Se consiguió el resultado? */
export type Outcome = 'si' | 'parcial' | 'no'

export interface BlockRecord {
  status?: ResolvedStatus
  outcome?: Outcome
  /** "¿Qué quedó pendiente?" — only for partial results. Never rescheduled. */
  pendingNote?: string
  /** Objective override for the block. */
  objective?: string
}

export interface FocusSession {
  blockId: string
  startedAt: number
}

export interface DayState {
  /** Local date key, YYYY-MM-DD. */
  date: string
  records: Record<string, BlockRecord>
  focus?: FocusSession
  /** The priority meditation was moved into its rescue slot. */
  meditationMoved?: boolean
}

/* ------------------------------------------------------------------------ */
/* Derived schedule                                                          */
/* ------------------------------------------------------------------------ */

/** The only states a block can show. */
export type BlockStatus =
  | 'proximo'
  | 'activo'
  | 'en-focus'
  | 'completado'
  | 'parcial'
  | 'omitido'

export interface ScheduledBlock extends RoutineBlock {
  /** Minutes from local midnight. `endMin` may exceed 1440 for overnight blocks. */
  startMin: number
  endMin: number
  status: BlockStatus
  /** True when the status was inferred from the clock rather than recorded by the user. */
  implicit: boolean
  /** Visible in the "Camino del día" and counted in progress. */
  inPath: boolean
  objective?: string
  record: BlockRecord
  /** Set on a meditation block that was moved into another block's slot. */
  replaces?: string
  /** Synthetic filler for gaps between routine blocks. */
  synthetic?: boolean
}
