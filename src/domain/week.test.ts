import { describe, expect, it } from 'vitest'
import { routineForDate } from '../data/routine'
import { SUNDAY_ROTATION_ANCHOR } from '../data/routine/config'
import { buildWeek, shortDateLabel, weekDates, weekRangeLabel, weekStart } from './week'

/** SEMANA reads the week only through the product's day resolver. */
const week = (today: string, offset = 0) => buildWeek(today, routineForDate, offset)
const names = (today: string, day: number) => week(today).days[day].layers.map((l) => l.names.join(' · '))

describe('week resolver: the active week by real date', () => {
  it('runs Monday → Sunday around any date', () => {
    expect(weekStart('2026-09-27')).toBe('2026-09-21') // Sunday → its Monday
    expect(weekStart('2026-09-28')).toBe('2026-09-28') // Monday is its own start
    expect(weekStart('2026-10-01')).toBe('2026-09-28')
    expect(weekDates('2026-09-30')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('crosses months and years without a hardcoded range', () => {
    expect(weekDates('2026-12-31')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
    expect(weekRangeLabel('2026-09-21', '2026-09-27')).toBe('21 — 27 sep')
    expect(weekRangeLabel('2026-09-28', '2026-10-04')).toBe('28 sep — 4 oct')
    expect(weekRangeLabel('2026-12-28', '2027-01-03')).toBe('28 dic 2026 — 3 ene 2027')
    expect(shortDateLabel('2026-10-03')).toBe('3 oct')
  })

  it('has seven days, Lunes → Domingo, each with its routine function', () => {
    const w = week('2026-09-27')
    expect(w.start).toBe('2026-09-21')
    expect(w.end).toBe('2026-09-27')
    expect(w.days.map((d) => d.dayName)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])
    expect(w.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(w.days.map((d) => d.theme)).toEqual([
      'Wellness + Web + Newsletter',
      'Web + Wellness',
      'Wellness + Web + Newsletter',
      'Regeneración',
      'Cierre operativo + trabajo profundo + revisión',
      'Máximo rendimiento creativo / estratégico',
      'Profundización',
    ])
  })

  it('marks HOY, the past and the future from the local date', () => {
    const w = week('2026-09-27')
    expect(w.todayIndex).toBe(6)
    expect(w.days.map((d) => d.tense)).toEqual(['past', 'past', 'past', 'past', 'past', 'past', 'today'])
    const mid = week('2026-09-30')
    expect(mid.todayIndex).toBe(2)
    expect(mid.days.map((d) => d.tense)).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future'])
  })

  it('prepares the previous and next weeks internally', () => {
    expect(week('2026-09-27', 1).start).toBe('2026-09-28')
    expect(week('2026-09-27', -1).start).toBe('2026-09-14')
    // Not the current week: no HOY, everything on one side.
    expect(week('2026-09-27', 1).todayIndex).toBe(-1)
    expect(week('2026-09-27', 1).days.every((d) => d.tense === 'future')).toBe(true)
    expect(week('2026-09-27', -1).days.every((d) => d.tense === 'past')).toBe(true)
  })
})

describe('week resolver: how each day is designed', () => {
  const w = week('2026-09-30')
  const [mon, , , thu, , sat, sun] = w.days

  it('Thursday is regeneration: no deep work, the most open and lightest day', () => {
    expect(thu.theme).toBe('Regeneración')
    expect(thu.minutes.deep).toBe(0)
    expect(thu.layers.every((l) => l.density === 0)).toBe(true)
    expect(thu.minutes.open).toBe(Math.max(...w.days.map((d) => d.minutes.open)))
    expect(thu.load).toBe(Math.min(...w.days.map((d) => d.load)))
    // Visible, not empty: the gym and its rituals are still there.
    expect(thu.load).toBeGreaterThan(0)
  })

  it('Saturday carries the highest load and deep work of the week', () => {
    expect(sat.minutes.deep).toBe(580)
    expect(sat.load).toBe(Math.max(...w.days.map((d) => d.load)))
    expect(sat.minutes.open).toBe(Math.min(...w.days.map((d) => d.minutes.open)))
    expect(sat.layers.map((l) => l.label)).toEqual(['Mañana', 'Tarde', 'Noche'])
    expect(names('2026-09-30', 5)).toEqual(['Páginas Web', 'TouchDesigner · Wellness', 'Newsletter · Páginas Web'])
  })

  it('Sunday is depth: the longest single period of deep work', () => {
    expect(sun.theme).toBe('Profundización')
    expect(sun.maxDeep).toBe(180)
    expect(sun.maxDeep).toBe(Math.max(...w.days.map((d) => d.maxDeep)))
    // Not necessarily denser than Saturday.
    expect(sun.load).toBeLessThan(sat.load)
  })

  it('a part without deep work is named by its activities, never by a meal or a transition', () => {
    expect(names('2026-09-30', 3)).toEqual(['Meditación · Desayuno / silencio', 'Regeneración · Gimnasio', 'Regeneración · Cierre digital'])
    expect(names('2026-09-30', 6)[0]).toBe('Inglés · Gimnasio')
    expect(names('2026-09-30', 0)).toEqual(['Wellness', 'Páginas Web', 'Newsletter'])
    expect(mon.layers[1].density).toBeGreaterThan(0)
  })

  it('layer matter follows the weighted load, deep work first', () => {
    for (const d of w.days)
      for (const l of d.layers) {
        expect(l.density).toBeGreaterThanOrEqual(0)
        expect(l.matter).toBeGreaterThanOrEqual(l.density)
        expect(l.matter).toBeLessThanOrEqual(1)
      }
  })
})

describe('week resolver: Sunday rotation', () => {
  it('follows the anchor: Newsletter on the anchor Sunday, Páginas Web the next', () => {
    expect(SUNDAY_ROTATION_ANCHOR).toBe('2026-09-27')
    const anchor = week('2026-09-27').days[6]
    expect(anchor.date).toBe('2026-09-27')
    expect(anchor.rotation).toBe('newsletter')
    expect(anchor.layers[1].names).toEqual(['Newsletter', 'Wellness'])

    const next = week('2026-09-27', 1).days[6]
    expect(next.date).toBe('2026-10-04')
    expect(next.rotation).toBe('web')
    expect(next.layers[1].names).toEqual(['Páginas Web', 'Wellness'])
  })

  it('keeps alternating before the anchor', () => {
    expect(week('2026-09-20').days[6].rotation).toBe('web')
    expect(week('2026-09-13').days[6].rotation).toBe('newsletter')
  })
})
