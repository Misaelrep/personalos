import { afterAll, describe, expect, it } from 'vitest'
import { dateKey } from '../../../domain/time'
import { PHRASES } from '../data/phrases'
import { dayNumber, phraseForDate, type Phrase } from './phrase'

/** Seven distinct phrases, so consecutive days always differ. */
const LIB: Phrase[] = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, quote: `frase ${i}`, author: null }))

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ORIGINAL_TZ = env.TZ
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete env.TZ
  else env.TZ = ORIGINAL_TZ
})

describe('dayNumber', () => {
  it('counts calendar days, across months, years and leap days', () => {
    expect(dayNumber('2026-10-06') - dayNumber('2026-10-05')).toBe(1)
    expect(dayNumber('2026-11-01') - dayNumber('2026-10-31')).toBe(1)
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1)
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2) // 2028 is a leap year
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1)
  })
})

describe('phrase of the day', () => {
  it('one date, one phrase — the same every time it is asked', () => {
    expect(phraseForDate('2026-10-05', LIB)).toBe(phraseForDate('2026-10-05', LIB))
  })

  it('consecutive dates walk through the library and wrap around', () => {
    const ids = Array.from({ length: 8 }, (_, i) => phraseForDate(`2026-10-0${i + 1}`, LIB).id)
    expect(new Set(ids.slice(0, 7)).size).toBe(7)
    expect(ids[7]).toBe(ids[0])
  })

  it('a phrase recorded for that date wins, even if the library changes meanwhile', () => {
    const recorded = { date: '2026-10-05', id: 't3' }
    expect(phraseForDate('2026-10-05', LIB, recorded).id).toBe('t3')
    expect(phraseForDate('2026-10-05', [...LIB].reverse(), recorded).id).toBe('t3')
  })

  it('a record for another date, or for a phrase that no longer exists, is ignored', () => {
    expect(phraseForDate('2026-10-05', LIB, { date: '2026-10-04', id: 't3' })).toBe(phraseForDate('2026-10-05', LIB))
    expect(phraseForDate('2026-10-05', LIB, { date: '2026-10-05', id: 'gone' })).toBe(phraseForDate('2026-10-05', LIB))
  })

  it('an empty library is a loud development error, not a blank screen', () => {
    expect(() => phraseForDate('2026-10-05', [])).toThrow()
  })
})

describe('the date is the device’s LOCAL date, never UTC', () => {
  // 03:30 UTC on the 6th is still the evening of the 5th in Mexico City (UTC−6)
  // and already midday of the 6th in Tokyo (UTC+9).
  const INSTANT = Date.UTC(2026, 9, 6, 3, 30)

  it('Mexico City, evening: the phrase is the 5th’s, not the 6th’s (UTC)', () => {
    env.TZ = 'America/Mexico_City'
    expect(new Date(INSTANT).getHours()).toBe(21) // the zone really took effect
    const key = dateKey(new Date(INSTANT))
    expect(key).toBe('2026-10-05')
    expect(phraseForDate(key, LIB)).toBe(phraseForDate('2026-10-05', LIB))
    expect(phraseForDate(key, LIB)).not.toBe(phraseForDate('2026-10-06', LIB))
  })

  it('Tokyo, midday: the same instant is already the 6th', () => {
    env.TZ = 'Asia/Tokyo'
    expect(new Date(INSTANT).getHours()).toBe(12)
    expect(dateKey(new Date(INSTANT))).toBe('2026-10-06')
  })

  it('one local day keeps one phrase from 00:00 to 23:59', () => {
    env.TZ = 'America/Mexico_City'
    const phrases = new Set<string>()
    for (let h = 0; h < 24; h++) phrases.add(phraseForDate(dateKey(new Date(2026, 9, 5, h, 59)), LIB).id)
    expect(phrases.size).toBe(1)
    expect(phraseForDate(dateKey(new Date(2026, 9, 6, 0, 0)), LIB).id).not.toBe([...phrases][0])
  })
})

describe('the development seed library', () => {
  it('has at least three phrases, unique ids, and every one is flagged as a seed', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(3)
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length)
    for (const p of PHRASES) expect(p.seed).toBe(true)
  })

  it('never attributes an unverified line: a seed has no author', () => {
    for (const p of PHRASES) if (p.seed) expect(p.author).toBeNull()
  })

  it('works through the real selection', () => {
    expect(PHRASES).toContain(phraseForDate('2026-10-06', PHRASES))
  })
})
