import { routineForDate } from '../../data/routine'
import { shiftDateKey } from '../../domain/routine'
import { buildDayView, type DayView } from '../../domain/schedule'
import { loadDay } from '../../state/storage'

/**
 * Any date as HOY would read it at `minute`: the same resolver, the same
 * schedule engine and that date's own stored records (read only — nothing
 * is written). DAYSCAPE is fed from here when SEMANA opens a day other than
 * today; for today SEMANA hands it the live view instead.
 */
export function viewForDate(date: string, minute: number): DayView {
  return buildDayView(routineForDate(date).routine, loadDay(date), minute, {
    yesterday: routineForDate(shiftDateKey(date, -1)).routine,
    tomorrow: routineForDate(shiftDateKey(date, 1)).routine,
  })
}
