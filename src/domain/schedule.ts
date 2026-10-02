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
  /** The block right after `next` (DESPUÉS). */
  after?: ScheduledBlock
  energy: EnergyState
  progress: { done: number; total: number }
  meditationPrompt?: MeditationPrompt
}

/** Neighbouring days, so the night never breaks at midnight. */
export interface DayContext {
  /** Yesterday's routine: before today's first block, its sleep is still the present. */
  yesterday?: DayRoutine
  /** Tomorrow's routine: after today's last block, its first block comes next. */
  tomorrow?: DayRoutine
}

const EMPTY_RECORD = {}

/** Deliberately registered blocks, plus the day's sleep as its end point. */
function isInPath(block: RoutineBlock): boolean {
  return block.countsForProgress || block.category === 'sleep'
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
export function buildDayView(routine: DayRoutine, state: DayState, now: number, context: DayContext = {}): DayView {
  const rule = routine.meditation
  const moved = rule?.rescueBlockId && state.meditationMoved

  let timed = withTimes(routine)

  // Meditation exception: it takes over the rescue slot; the replaced activity
  // is not rescheduled anywhere else, and nothing else moves.
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
        category: 'transition',
        focusEligible: false,
        countsForProgress: false,
        energy: following.energy,
        startMin: b.endMin,
        endMin: following.startMin,
      })
    }
  })

  const rescueSlot = rule?.rescueBlockId ? withTimes(routine).find((b) => b.id === rule.rescueBlockId) : undefined

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
      // Passed time is never assumed completed: without a record it is just past.
      implicit = true
      const isOriginalMeditation = rule && b.id === rule.blockId && !moved
      if (isOriginalMeditation && rescueSlot) {
        // Priority meditation: pending while it can still be rescued, skipped once that window closes.
        status = now < rescueSlot.endMin ? 'proximo' : 'omitido'
      } else {
        status = 'sin-registrar'
      }
    } else {
      status = 'proximo'
    }

    const objective = b.focusEligible
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
    const lastNight = overnightSleep(context.yesterday, routine, timeline[0].startMin)
    const record = state.records[lastNight.id] ?? EMPTY_RECORD
    current = { ...lastNight, status: record.status ?? 'activo', implicit: false, inPath: false, record }
  } else {
    current = timeline[currentIndex]
  }

  let next: ScheduledBlock | undefined
  let nextIsTomorrow = false
  if (currentIndex === -1) {
    next = timeline[0]
  } else if (currentIndex < timeline.length - 1) {
    next = timeline[currentIndex + 1]
  } else if (context.tomorrow) {
    next = firstOf(context.tomorrow, state)
    nextIsTomorrow = true
  }

  let after: ScheduledBlock | undefined
  if (next && !nextIsTomorrow) {
    const from = timeline.indexOf(next)
    after = timeline.slice(from + 1).find((b) => !b.synthetic)
  }

  const path = timeline.filter((b) => b.inPath)
  const counted = path.filter((b) => b.countsForProgress)
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

/**
 * Last night's sleep, from the routine it belongs to (yesterday), running until
 * today's first block. Without yesterday at hand, today's own sleep stands in
 * under a distinct id, so it is never confused with tonight's.
 */
function overnightSleep(yesterday: DayRoutine | undefined, today: DayRoutine, todayStart: number) {
  const source = withTimes(yesterday ?? today)
  const sleep = source.find((b) => b.category === 'sleep') ?? source[source.length - 1]
  return {
    ...sleep,
    id: yesterday ? sleep.id : `${sleep.id}-overnight`,
    startMin: sleep.startMin - MINUTES_PER_DAY,
    endMin: todayStart,
  }
}

/** Tomorrow's first block, on today's clock (+24 h). */
function firstOf(tomorrow: DayRoutine, state: DayState): ScheduledBlock {
  const first = withTimes(tomorrow)[0]
  return {
    ...first,
    startMin: first.startMin + MINUTES_PER_DAY,
    endMin: first.endMin + MINUTES_PER_DAY,
    status: 'proximo',
    implicit: false,
    inPath: false,
    objective: undefined,
    record: state.records[first.id] ?? EMPTY_RECORD,
  }
}

/** Block that follows `blockId` in the timeline (used after closing a Focus). */
export function blockAfter(view: DayView, blockId: string): ScheduledBlock | undefined {
  const i = view.timeline.findIndex((b) => b.id === blockId)
  if (i === -1) return undefined
  return view.timeline[i + 1]
}
