import { describe, expect, it } from 'vitest'
import { tuesday } from '../data/routine/tuesday'
import type { DayState } from '../domain/types'
import { readOffset } from './clock'
import { LEGACY_TUESDAY_IDS, migrateDay } from './storage'

describe('clock — ?date= and ?t= simulation', () => {
  const real = new Date(2026, 8, 26, 15, 42, 10).getTime()
  const moved = (search: string) => new Date(real + readOffset(search, real))

  it('no params: the real clock, untouched', () => {
    expect(readOffset('', real)).toBe(0)
    expect(readOffset('?entry=none', real)).toBe(0)
  })

  it('?t= moves only the time of day', () => {
    const d = moved('?t=10:30')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 26, 10, 30])
  })

  it('?date= moves only the date', () => {
    const d = moved('?date=2026-09-28')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 28, 15, 42])
  })

  it('both together: that exact moment', () => {
    const d = moved('?date=2026-10-04&t=19:15')
    expect([d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getMinutes()]).toEqual([9, 4, 0, 19, 15])
  })

  it('malformed or impossible values are ignored, never rolled over', () => {
    expect(readOffset('?date=2026-02-31', real)).toBe(0)
    expect(readOffset('?date=28-09-2026', real)).toBe(0)
    expect(readOffset('?t=25h', real)).toBe(0)
  })
})

describe('storage — migration from the pre-V3 test Tuesday', () => {
  const legacy = (date: string): DayState => ({
    date,
    records: {
      merkaba: { status: 'completado' },
      'paginas-web': { status: 'parcial', outcome: 'parcial', objective: 'Landing', pendingNote: 'Footer' },
      ingles: { status: 'omitido' },
    },
    focus: { blockId: 'wellness-1', startedAt: 1 },
    meditationMoved: true,
  })

  it('on a Tuesday, records and the open Focus move to their V3 ids', () => {
    const s = migrateDay(legacy('2026-09-29'))
    expect(s.records).toEqual({
      'tue-merkaba-0600': { status: 'completado' },
      'tue-web-1000': { status: 'parcial', outcome: 'parcial', objective: 'Landing', pendingNote: 'Footer' },
      'tue-english-0835': { status: 'omitido' },
    })
    expect(s.focus).toEqual({ blockId: 'tue-wellness-1400', startedAt: 1 })
    expect(s.meditationMoved).toBe(true)
  })

  it('on any other day, legacy ids are dropped (they described the fallback Tuesday), the rest is kept', () => {
    const s = migrateDay({ ...legacy('2026-09-28'), records: { ...legacy('2026-09-28').records, 'mon-gym-1600': { status: 'completado' } } })
    expect(s.records).toEqual({ 'mon-gym-1600': { status: 'completado' } })
    expect(s.focus).toBeUndefined()
    expect(s.meditationMoved).toBe(true)
  })

  it('V3 state passes through untouched; a V3 record is never overwritten by a legacy one', () => {
    const v3: DayState = { date: '2026-09-29', records: { 'tue-web-1000': { status: 'completado' } } }
    expect(migrateDay(v3)).toBe(v3)
    const mixed = migrateDay({ date: '2026-09-29', records: { 'tue-web-1000': { status: 'completado' }, 'paginas-web': { status: 'omitido' } } })
    expect(mixed.records).toEqual({ 'tue-web-1000': { status: 'completado' } })
  })

  it('covers every block of the old Tuesday, one to one', () => {
    const targets = Object.values(LEGACY_TUESDAY_IDS)
    expect(targets).toHaveLength(18)
    expect(new Set(targets).size).toBe(18)
    expect(targets.every((id) => tuesday.blocks.some((b) => b.id === id))).toBe(true)
  })

  it('prototype names are not mistaken for legacy ids', () => {
    const s: DayState = { date: '2026-09-29', records: { toString: { status: 'completado' as const } } }
    expect(migrateDay(s)).toBe(s)
  })
})
