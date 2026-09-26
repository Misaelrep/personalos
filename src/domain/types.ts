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
 * What a block is. The category drives behavior, never decoration: which
 * actions HOY offers, how DAYSCAPE draws it and what it defaults to for Focus
 * and progress (each block states `focusEligible` / `countsForProgress`
 * explicitly anyway).
 */
export type BlockCategory =
  | 'deep_work' // producción profunda — objetivo y Focus
  | 'learning' // inglés, lectura, PROTEGE, Derecho, formación…
  | 'ritual' // meditación, Merkaba, breathwork, cierre digital
  | 'creative_practice' // escritura, TouchDesigner…
  | 'body' // gimnasio, caminata
  | 'recovery' // comida, descanso, pausa
  | 'transition' // traslados, preparación, cambios de actividad
  | 'admin' // Substack (publicación), Jets, finanzas, correo
  | 'reflection' // introspección semanal
  | 'sleep'
  | 'free' // espacio abierto intencional (jueves)

/** Projects a block belongs to (a block may belong to none). */
export type ProjectId =
  | 'web'
  | 'wellness'
  | 'newsletter'
  | 'substack'
  | 'touchdesigner'
  | 'biotron'
  | 'polaris'
  | 'jets'
  | 'finances'

/** "HH:MM", 24h. */
export type ClockTime = string

/** How DAYSCAPE draws a block. Normally derived from its category (see features/dayscape/model.ts). */
export type DayscapeRole = 'micro' | 'medium' | 'major' | 'space'

/** A lesser alternative inside the same block: never a second obligation, never split time. */
export interface SecondaryOption {
  title: string
  description?: string
  project?: ProjectId
}

/** Something that happens inside a block without breaking it (e.g. ~1 h of AI Polaris within Wellness). */
export interface IncludedActivity {
  title: string
  /** Approximate minutes within the block, when known. */
  minutes?: number
  project?: ProjectId
}

export interface RoutineBlock {
  /** Stable, readable identity: `<day>-<slug>-<HHMM>`, e.g. `tue-web-1000`. Never an index. */
  id: string
  start: ClockTime
  /** Omit for point-in-time entries: the block then lasts until the next one starts. */
  end?: ClockTime
  title: string
  /** Secondary line, e.g. "MVP / Testeo". */
  subtitle?: string
  /** Nature of the block, e.g. "Trabajo profundo", "Recuperación cognitiva". Defaults to the category's name. */
  descriptor?: string
  /** Short name for the day path and DAYSCAPE, e.g. "Merkaba". Defaults to title. */
  shortTitle?: string
  category: BlockCategory
  project?: ProjectId
  energy: EnergyState
  /** HOY offers INICIAR FOCUS (and an objective) only on these. */
  focusEligible: boolean
  /** Deliberately registered: appears in the day path and counts in progress. */
  countsForProgress: boolean
  /** Optional override of how DAYSCAPE draws it. */
  dayscapeRole?: DayscapeRole
  /** Default "¿Qué tiene que existir al terminar este bloque?". Normally unset: objectives are per date. */
  defaultObjective?: string
  secondaryOption?: SecondaryOption
  includes?: IncludedActivity[]
  metadata?: Record<string, unknown>
}

/**
 * La meditación es prioritaria a su hora. Si no se realizó, HOY puede
 * proponer moverla a una franja de rescate (09:30), sustituyendo lo que hubiera
 * allí — solo los días en que esa franja existe.
 */
export interface MeditationRule {
  blockId: string
  /** Block whose slot the meditation takes if moved. Unset: this day has no rescue slot. */
  rescueBlockId?: string
}

export interface DayRoutine {
  weekday: Weekday
  /** Display name, e.g. "Martes". */
  dayName: string
  /** Day direction, e.g. "Páginas Web + Wellness". */
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

/** The only states a block can show. A block whose time has passed is never assumed completed. */
export type BlockStatus =
  | 'proximo'
  | 'activo'
  | 'en-focus'
  | 'completado'
  | 'parcial'
  | 'omitido'
  /** Its time has passed and nothing was recorded. */
  | 'sin-registrar'

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
