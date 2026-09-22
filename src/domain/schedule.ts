import { MINUTES_PER_DAY, toMinutes } from './time'
import type {
  BlockStatus,
  DayRoutine,
  DayState,
  EnergyState,
  RoutineBlock,
  ScheduledBlock,
} from './types'

export interface MeditationPrompt {
  block: ScheduledBlock
  /** Slot the meditation would move into. */
  rescue: ScheduledBlock
}

export interface DayView {
  routine: DayRoutine
  /** Full timeline, including transitions and synthetic gaps. */
  timeline: ScheduledBlock[]
  /** Blocks shown in the "Camino del día". */
  path: ScheduledBlock[]
  /** The block that covers `now`. Always defined. */
  current: ScheduledBlock
  next?: ScheduledBlock
  /** True when `next` belongs to tomorrow (after the day's last block). */
  nextIsTomorrow: boolean
  /** First meaningful (non-transition) block after `next`. */
  after?: ScheduledBlock
  energy: EnergyState
  progress: { done: number; total: number }
  meditationPrompt?: MeditationPrompt
}

const EMPTY_RECORD = {}

/** Blocks that never appear in the day path. */
function isInPath(block: RoutineBlock): boolean {
  return block.kind !== 'transition'
}

function sortByStart<T extends { startMin: number }>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => a.startMin - b.startMin)
}

/** Resolve start/end minutes. A block without `end` lasts until the next one starts. */
function withTimes(routine: DayRoutine) {
  const ordered = [...routine.blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  const firstStart = toMinutes(ordered[0].start)
  return ordered.map((block, i) => {
    const startMin = toMinutes(block.start)
    const nextStart = i < ordered.length - 1 ? toMinutes(ordered[i + 1].start) : firstStart + MINUTES_PER_DAY
    const endMin = block.end ? toMinutes(block.end) : nextStart
    return { ...block, startMin, endMin: endMin <= startMin ? endMin + MINUTES_PER_DAY : endMin }
  })
}

/**
 * Build the day as HOY sees it at `now` (minutes from local midnight).
 * Pure: same routine + state + time always produce the same view.
 */
export function buildDayView(routine: DayRoutine, state: DayState, now: number): DayView {
  const rule = routine.meditation
  const moved = rule && state.meditationMoved

  let timed = withTimes(routine)

  // Meditation exception: it takes over the rescue slot; the replaced activity
  // is not rescheduled anywhere else.
  let replacedTitle: string | undefined
  if (moved && rule) {
    const rescue = timed.find((b) => b.id === rule.rescueBlockId)
    if (rescue) {
      replacedTitle = rescue.shortTitle ?? rescue.title
      timed = timed
        .filter((b) => b.id !== rule.rescueBlockId)
        .map((b) =>
          b.id === rule.blockId
            ? { ...b, startMin: rescue.startMin, endMin: rescue.endMin, energy: rescue.energy }
            : b,
        )
      timed = sortByStart(timed)
    }
  }

  // Fill gaps so there is always something "now".
  const filled: typeof timed = []
  timed.forEach((b, i) => {
    filled.push(b)
    const following = timed[i + 1]
    if (following && b.endMin < following.startMin) {
      filled.push({
        id: `gap-${b.endMin}`,
        start: '',
        title: 'Transición',
        descriptor: `Prepárate para ${following.shortTitle ?? following.title}`,
        kind: 'transition',
        energy: following.energy,
        startMin: b.endMin,
        endMin: following.startMin,
      })
    }
  })

  const rescueSlot = rule ? withTimes(routine).find((b) => b.id === rule.rescueBlockId) : undefined

  const timeline: ScheduledBlock[] = filled.map((b) => {
    const record = state.records[b.id] ?? EMPTY_RECORD
    const synthetic = b.id.startsWith('gap-')
    let status: BlockStatus
    let implicit = false

    if (record.status) {
      status = record.status
    } else if (state.focus?.blockId === b.id) {
      status = 'en-focus'
    } else if (now >= b.startMin && now < b.endMin) {
      status = 'activo'
    } else if (now >= b.endMin) {
      implicit = true
      const isOriginalMeditation = rule && b.id === rule.blockId && !moved
      if (isOriginalMeditation) {
        // Priority meditation is never assumed done. It stays pending while it
        // can still be rescued, and counts as skipped once that window closes.
        status = rescueSlot && now < rescueSlot.endMin ? 'proximo' : 'omitido'
      } else {
        // The routine is assumed followed unless the user says otherwise.
        status = 'completado'
      }
    } else {
      status = 'proximo'
    }

    const objective =
      b.kind === 'deep'
        ? record.objective !== undefined
          ? record.objective.trim() || undefined
          : b.defaultObjective
        : undefined

    return {
      ...b,
      status,
      implicit,
      inPath: !synthetic && isInPath(b),
      objective,
      record,
      synthetic,
      replaces: moved && rule && b.id === rule.blockId ? replacedTitle : undefined,
    }
  })

  // Current block. Before the first block of the day we are still in last night's sleep.
  const currentIndex = timeline.findIndex((b) => now >= b.startMin && now < b.endMin)
  let current: ScheduledBlock
  if (currentIndex === -1) {
    const sleep = timeline[timeline.length - 1]
    current = {
      ...sleep,
      id: `${sleep.id}-overnight`,
      startMin: sleep.startMin - MINUTES_PER_DAY,
      endMin: timeline[0].startMin,
      status: 'activo',
      implicit: false,
      inPath: false,
      record: EMPTY_RECORD,
    }
  } else {
    current = timeline[currentIndex]
  }

  let next: ScheduledBlock | undefined
  let nextIsTomorrow = false
  if (currentIndex === -1) {
    next = timeline[0]
  } else if (currentIndex < timeline.length - 1) {
    next = timeline[currentIndex + 1]
  } else {
    next = timeline[0]
    nextIsTomorrow = true
  }

  let after: ScheduledBlock | undefined
  if (next && !nextIsTomorrow) {
    const from = timeline.indexOf(next)
    after = timeline.slice(from + 1).find((b) => b.kind !== 'transition' && !b.synthetic)
  }

  const path = timeline.filter((b) => b.inPath)
  const counted = path.filter((b) => b.kind !== 'sleep')
  const progress = {
    done: counted.filter((b) => b.status === 'completado' || b.status === 'parcial').length,
    total: counted.length,
  }

  let meditationPrompt: MeditationPrompt | undefined
  if (rule && !moved && rescueSlot) {
    const meditation = timeline.find((b) => b.id === rule.blockId)
    const rescue = timeline.find((b) => b.id === rule.rescueBlockId)
    if (
      meditation &&
      rescue &&
      !meditation.record.status &&
      now >= meditation.endMin &&
      now < rescue.endMin
    ) {
      meditationPrompt = { block: meditation, rescue }
    }
  }

  return {
    routine,
    timeline,
    path,
    current,
    next,
    nextIsTomorrow,
    after,
    energy: current.energy,
    progress,
    meditationPrompt,
  }
}

/** Block that follows `blockId` in the timeline (used after closing a Focus). */
export function blockAfter(view: DayView, blockId: string): ScheduledBlock | undefined {
  const i = view.timeline.findIndex((b) => b.id === blockId)
  if (i === -1) return undefined
  return view.timeline[i + 1]
}
