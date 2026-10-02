import { describe, expect, it } from 'vitest'
import type { DailyMessage } from '../../data/dailyMessages'
import { dayOfYear, messageForDate } from './dailyMessage'
import { decideEntry, MICRO_ENTRY_AFTER_MS, readEntryOverride, readFieldMode } from './entryPolicy'

const NOW = new Date(2026, 8, 22, 10, 14).getTime()
const MIN = 60_000

describe('decideEntry', () => {
  it('first open of the day → full', () => {
    expect(decideEntry({ today: '2026-09-22', now: NOW })).toBe('full')
    expect(decideEntry({ today: '2026-09-22', seenDate: '2026-09-21', lastActiveAt: NOW - 5 * MIN, now: NOW })).toBe('full')
  })

  it('same day, back after 30 min or more → micro', () => {
    expect(
      decideEntry({ today: '2026-09-22', seenDate: '2026-09-22', lastActiveAt: NOW - MICRO_ENTRY_AFTER_MS, now: NOW }),
    ).toBe('micro')
    expect(decideEntry({ today: '2026-09-22', seenDate: '2026-09-22', lastActiveAt: NOW - 3 * 60 * MIN, now: NOW })).toBe(
      'micro',
    )
  })

  it('same day, back in less than 30 min → none', () => {
    expect(decideEntry({ today: '2026-09-22', seenDate: '2026-09-22', lastActiveAt: NOW - 29 * MIN, now: NOW })).toBe(
      'none',
    )
  })

  it('an unfinished ritual (ENTRAR never pressed) shows again', () => {
    expect(decideEntry({ today: '2026-09-22', lastActiveAt: NOW - 1 * MIN, now: NOW })).toBe('full')
  })

  it('never interrupts a running Focus session', () => {
    expect(decideEntry({ today: '2026-09-22', now: NOW, focusActive: true })).toBe('none')
  })

  it('?entry= overrides every rule', () => {
    expect(decideEntry({ today: '2026-09-22', seenDate: '2026-09-22', lastActiveAt: NOW, now: NOW, override: 'full' })).toBe(
      'full',
    )
    expect(decideEntry({ today: '2026-09-22', now: NOW, override: 'micro' })).toBe('micro')
    expect(readEntryOverride('?t=10:14&entry=full')).toBe('full')
    expect(readEntryOverride('?entry=micro')).toBe('micro')
    expect(readEntryOverride('?entry=other')).toBeUndefined()
  })
})

describe('daily message', () => {
  const library: DailyMessage[] = Array.from({ length: 30 }, (_, i) => ({ id: `m${i + 1}`, lines: [`${i + 1}`] }))

  it('dayOfYear uses the local date', () => {
    expect(dayOfYear(new Date(2026, 0, 1, 0, 5))).toBe(1)
    expect(dayOfYear(new Date(2026, 8, 22, 23, 59))).toBe(265)
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366)
  })

  it('is deterministic for a date and changes day to day', () => {
    const a = messageForDate(new Date(2026, 8, 22, 8), library)
    const b = messageForDate(new Date(2026, 8, 22, 21), library)
    const c = messageForDate(new Date(2026, 8, 23, 8), library)
    expect(a.id).toBe(b.id)
    expect(a.id).toBe(library[265 % 30].id)
    expect(c.id).not.toBe(a.id)
  })

  it('keeps the message recorded for today', () => {
    const recorded = { date: '2026-09-22', id: 'm3' }
    expect(messageForDate(new Date(2026, 8, 22), library, recorded).id).toBe('m3')
    // A record from another day is ignored.
    expect(messageForDate(new Date(2026, 8, 23), library, recorded).id).toBe(library[266 % 30].id)
  })
})

describe('readFieldMode', () => {
  it('reads hold, fast, collapse or combinations; nothing by default', () => {
    expect(readFieldMode('')).toEqual({ hold: false, fast: false, collapse: false })
    expect(readFieldMode('?entry=full&field=hold')).toEqual({ hold: true, fast: false, collapse: false })
    expect(readFieldMode('?field=fast')).toEqual({ hold: false, fast: true, collapse: false })
    expect(readFieldMode('?field=fast,hold')).toEqual({ hold: true, fast: true, collapse: false })
    expect(readFieldMode('?field=collapse')).toEqual({ hold: false, fast: false, collapse: true })
  })
})
