import type { ResolvedDay } from '../../../domain/routine'
import { shiftDateKey } from '../../../domain/routine'
import { toMinutes } from '../../../domain/time'
import type { ProjectId as RoutineTag } from '../../../domain/types'
import type { ProjectsData } from './types'

/**
 * Capacity of a week, from two sources kept apart:
 *  - routine hours: minutes of the routine's blocks tagged for a project —
 *    ONLY through a confirmed correspondence (`routineLinks`). Nothing is
 *    inferred from tag names: with no confirmed link a project has 0 routine hours;
 *  - declared hours: what the person states in the Sunday review.
 * Projects outside the routine (ELYUM, Obsidian…) rely on the second.
 */

/** Every tag the routine can carry (the routine's `ProjectId`). A test keeps it in step with the data. */
export const ROUTINE_TAGS = ['web', 'wellness', 'newsletter', 'substack', 'touchdesigner', 'biotron', 'polaris', 'jets', 'finances'] as const satisfies readonly RoutineTag[]

/** Minutes per routine tag in the week starting on `weekStart`, read with the routine's own resolver. */
export function routineMinutesByTag(weekStart: string, resolve: (date: string) => ResolvedDay): Partial<Record<RoutineTag, number>> {
  const minutes: Partial<Record<RoutineTag, number>> = {}
  for (let i = 0; i < 7; i++) {
    const blocks = resolve(shiftDateKey(weekStart, i)).routine.blocks
    for (const b of blocks) {
      if (!b.project || !b.end) continue
      minutes[b.project] = (minutes[b.project] ?? 0) + toMinutes(b.end) - toMinutes(b.start)
    }
  }
  return minutes
}

export interface ProjectCapacity {
  projectId: string
  /** Hours from the routine through confirmed correspondences (0 without them). */
  routineHours: number
  confirmedTags: RoutineTag[]
}

export function routineCapacity(data: ProjectsData, weekStart: string, resolve: (date: string) => ResolvedDay): ProjectCapacity[] {
  const byTag = routineMinutesByTag(weekStart, resolve)
  return data.projects.map((p) => {
    const tags = data.routineLinks.filter((l) => l.projectId === p.id && l.confirmed).map((l) => l.tag)
    const minutes = tags.reduce((sum, t) => sum + (byTag[t] ?? 0), 0)
    return { projectId: p.id, routineHours: Math.round((minutes / 60) * 100) / 100, confirmedTags: tags }
  })
}

/** The correspondence table: every project × every tag, «sin asignar» unless a link says otherwise. */
export function correspondenceTable(data: ProjectsData): { projectId: string; tag: RoutineTag; state: 'sin-asignar' | 'propuesta' | 'confirmada' }[] {
  return data.projects.flatMap((p) =>
    ROUTINE_TAGS.map((tag) => {
      const link = data.routineLinks.find((l) => l.projectId === p.id && l.tag === tag)
      return { projectId: p.id, tag, state: !link ? ('sin-asignar' as const) : link.confirmed ? ('confirmada' as const) : ('propuesta' as const) }
    }),
  )
}
