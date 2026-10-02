import { alternativeLine, natureLabel } from '../../domain/labels'
import type { DayView } from '../../domain/schedule'
import type { EnergyState, ScheduledBlock } from '../../domain/types'
import type { FormId } from './forms'

/**
 * DAYSCAPE model — the whole day at once, independent of drawing.
 *
 * Every activity of the day floats at the same time; time is depth and matter,
 * not a line. Two axes are kept apart on purpose:
 *   temporal   past · current · future       (from the clock)
 *   execution  unregistered · completed · partial · skipped   (from stored records only)
 * A block whose time has passed is never assumed completed.
 */
export type VisualRole = 'micro' | 'medium' | 'major' | 'space' | 'endpoint'
export type TemporalSide = 'past' | 'current' | 'future'
export type Execution = 'unregistered' | 'completed' | 'partial' | 'skipped'
/** Depth plane: foreground, middle, background. */
export type Plane = 'fg' | 'mid' | 'bg'

export interface Activity {
  id: string
  /** Name while it floats in the field: short, and never two alike. */
  label: string
  /** Full name, for inspection. */
  title: string
  role: VisualRole
  category: ScheduledBlock['category']
  energy: EnergyState
  startMin: number
  endMin: number
  side: TemporalSide
  execution: Execution
  /** What the block is: "Trabajo profundo", "Aprendizaje"… */
  natureLabel: string
  /** Inspection only: the block's secondary option, never a second object in the field. */
  alternative?: string
  objective?: string
  /** Minutes between the block and now (0 for the present). */
  delta: number
  /** 0 (touching now) → 1 (seven hours or more away). */
  f: number
  /** Depth, 0 = the present → 1 = the horizon. The past sits a little further than the future. */
  z: number
  plane: Plane
  form: FormId
  /** Chronological index in the day. */
  order: number
  /** Reveal wave (0–5) and moment it starts to form (s from the start of DAYSCAPE). */
  wave: number
  revealAt: number
}

export interface DayscapeModel {
  /** Minutes from local midnight the field was built for. */
  now: number
  /** Every activity of the day, in time order (the present included). */
  activities: Activity[]
  current: Activity
}

const SHORT_MINUTES = 10

/** How a block is drawn: an explicit `dayscapeRole` in the routine wins, then its category. */
export function getVisualRole(block: ScheduledBlock, meditationBlockId?: string): VisualRole {
  if (block.dayscapeRole) return block.dayscapeRole
  if (block.category === 'sleep') return 'endpoint'
  // Pauses, meals and open time are space between objects, not objects.
  if (block.synthetic || block.category === 'transition' || block.category === 'free' || block.category === 'recovery') return 'space'
  if (block.category === 'deep_work') return 'major'
  // The gym is a mass of the day; a short walk is not.
  if (block.category === 'body') return block.endMin - block.startMin >= 60 ? 'major' : 'medium'
  if (block.category === 'creative_practice' && block.focusEligible) return 'major'
  if (block.category === 'ritual') return block.id === meditationBlockId ? 'medium' : 'micro'
  return block.endMin - block.startMin <= SHORT_MINUTES ? 'micro' : 'medium'
}

/** Real, stored execution state. No record → unregistered, whatever the clock says. */
export function getExecution(block: ScheduledBlock): Execution {
  switch (block.record.status) {
    case 'completado':
      return 'completed'
    case 'parcial':
      return 'partial'
    case 'omitido':
      return 'skipped'
    default:
      return 'unregistered'
  }
}

/** Inspection only: where the block stands. */
export function stateLabel(a: Pick<Activity, 'side' | 'execution'>): string {
  if (a.side === 'current') return 'Ahora'
  if (a.execution === 'completed') return 'Completado'
  if (a.execution === 'partial') return 'Parcial'
  if (a.execution === 'skipped') return 'Omitido'
  return a.side === 'past' ? 'Sin registrar' : 'Próximo'
}

/** Minutes at which depth reaches the horizon. */
export const DEPTH_HORIZON_MIN = 420

/**
 * Plane by distance in time. The past goes back sooner than the future comes
 * forward: foreground up to 1 h behind / ~2 h ahead, middle up to 2.5 h / 5.5 h.
 */
export function planeOf(side: TemporalSide, delta: number): Plane {
  if (side === 'current') return 'fg'
  const [fg, mid] = side === 'past' ? [60, 150] : [130, 330]
  return delta <= fg ? 'fg' : delta <= mid ? 'mid' : 'bg'
}

export function depthOf(side: TemporalSide, delta: number): { f: number; z: number } {
  const f = Math.min(1, delta / DEPTH_HORIZON_MIN)
  if (side === 'current') return { f: 0, z: 0 }
  const z = side === 'past' ? Math.min(1, 0.2 + 0.85 * f ** 0.75) : Math.min(1, 0.1 + 0.8 * f ** 0.85)
  return { f, z }
}

/** The six reveal windows (s): morning first, night last. */
export const REVEAL_WINDOWS: readonly (readonly [number, number])[] = [
  [0, 2],
  [2, 3.5],
  [3.5, 5],
  [5, 7],
  [7, 9],
  [9, 11],
]
/** Share of the day that enters in each wave (cumulative): 2 · 3 · 3 · 3 · 3 · 4 of 18. */
const WAVE_SPLIT = [0, 2, 5, 8, 11, 14, 18].map((v) => v / 18)

/** Chronological index → wave. Scales to any number of activities. */
export function waveOf(order: number, count: number): number {
  for (let w = REVEAL_WINDOWS.length - 1; w >= 0; w--) if (order >= Math.round(WAVE_SPLIT[w] * count)) return w
  return 0
}

/** Each activity forms at its own moment inside its window, never in lockstep. */
export function revealAtOf(wave: number, indexInWave: number, waveSize: number): number {
  const [s0, s1] = REVEAL_WINDOWS[wave]
  return s0 + ((indexInWave + 0.3) / waveSize) * (s1 - s0) * 0.8
}

/**
 * The reveal takes the time the day needs: the approved ~11 s for a full day
 * (18 activities), shorter for a light one, a little longer for a crowded one.
 */
export const revealSpan = (count: number) => Math.min(1.4, Math.max(0.3, count / 18))

/** Short field label: the short title, the first half of a long "a / b" name, and never two alike. */
function labelsOf(blocks: ScheduledBlock[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    let label = b.shortTitle ?? b.title
    if (label.length > 16 && label.includes(' / ')) label = label.split(' / ')[0]
    // "Breathwork" twice: the second one takes its fuller name ("Breathwork relajante").
    if (out.includes(label) && b.title !== label && b.title.startsWith(label)) label = b.title
    out.push(label)
  }
  return out
}

/** The five configurations, handed out from the foreground outward so all five are seen together. */
const FORM_CYCLE: FormId[] = ['cardinal', 'orbit', 'axis', 'dissolving', 'prism']
const PLANE_RANK: Record<Plane, number> = { fg: 0, mid: 1, bg: 2 }

/**
 * Build DAYSCAPE from the same DayView HOY uses: every block of the routine,
 * transitions included (synthetic gaps only when they are the present).
 */
export function buildDayscape(view: DayView, now: number): DayscapeModel {
  const meditationId = view.routine.meditation?.blockId
  const blocks = view.timeline.filter((b) => !b.synthetic || b.id === view.current.id)
  // Before the first block of the day the present is last night's sleep, ahead of everything.
  if (!blocks.some((b) => b.id === view.current.id)) blocks.unshift(view.current)
  const labels = labelsOf(blocks)

  const activities: Activity[] = blocks.map((b, order) => {
    const side: TemporalSide = b.id === view.current.id ? 'current' : b.endMin <= now ? 'past' : 'future'
    const delta = side === 'past' ? Math.max(0, now - b.endMin) : side === 'future' ? Math.max(0, b.startMin - now) : 0
    const { f, z } = depthOf(side, delta)
    return {
      id: b.id,
      label: labels[order],
      title: b.title,
      role: getVisualRole(b, meditationId),
      category: b.category,
      energy: b.energy,
      startMin: b.startMin,
      endMin: b.endMin,
      side,
      execution: getExecution(b),
      natureLabel: natureLabel(b),
      alternative: alternativeLine(b),
      objective: b.objective,
      delta,
      f,
      z,
      plane: planeOf(side, delta),
      form: 'cardinal',
      order,
      wave: waveOf(order, blocks.length),
      revealAt: 0,
    }
  })

  for (let w = 0; w < REVEAL_WINDOWS.length; w++) {
    const members = activities.filter((a) => a.wave === w)
    members.forEach((a, i) => (a.revealAt = revealAtOf(w, i, members.length) * revealSpan(activities.length)))
  }

  // The present is a Prism: the clearest, most material configuration.
  let k = 0
  const byDepth = [...activities].sort((p, q) => PLANE_RANK[p.plane] - PLANE_RANK[q.plane] || p.delta - q.delta)
  for (const a of byDepth) a.form = a.side === 'current' ? 'prism' : FORM_CYCLE[k++ % FORM_CYCLE.length]

  return { now, activities, current: activities.find((a) => a.side === 'current')! }
}
