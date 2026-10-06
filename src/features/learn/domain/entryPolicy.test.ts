import { afterAll, describe, expect, it } from 'vitest'
import { dateKey } from '../../../domain/time'
import { decideLearnEntry, readLearnOverride } from './entryPolicy'

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ORIGINAL_TZ = env.TZ
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete env.TZ
  else env.TZ = ORIGINAL_TZ
})

describe('decideLearnEntry: first entry of the local date vs later ones', () => {
  it('never seen → the full ritual', () => {
    expect(decideLearnEntry({ today: '2026-10-05' })).toBe('full')
  })

  it('seen on an earlier date → the full ritual again (a new day)', () => {
    expect(decideLearnEntry({ today: '2026-10-05', lastEntryDate: '2026-10-04' })).toBe('full')
  })

  it('seen today → the brief entry, however many times the section opens', () => {
    expect(decideLearnEntry({ today: '2026-10-05', lastEntryDate: '2026-10-05' })).toBe('brief')
  })

  it('?learn= overrides the rule in both directions', () => {
    expect(decideLearnEntry({ today: '2026-10-05', lastEntryDate: '2026-10-05', override: 'full' })).toBe('full')
    expect(decideLearnEntry({ today: '2026-10-05', override: 'brief' })).toBe('brief')
  })

  it('reads the override from the URL and ignores anything else', () => {
    expect(readLearnOverride('?learn=full')).toBe('full')
    expect(readLearnOverride('?section=aprender&learn=brief')).toBe('brief')
    expect(readLearnOverride('?learn=other')).toBeUndefined()
    expect(readLearnOverride('')).toBeUndefined()
  })
})

describe('the day changes at LOCAL midnight, not at UTC', () => {
  it('23:50 and 00:10 on either side of local midnight are two different dates', () => {
    env.TZ = 'America/Mexico_City'
    const before = dateKey(new Date(2026, 9, 5, 23, 50))
    const after = dateKey(new Date(2026, 9, 6, 0, 10))
    expect(before).toBe('2026-10-05')
    expect(after).toBe('2026-10-06')
    // Seen at 23:50 → 20 minutes later it is a new date, so the ritual plays in full again.
    expect(decideLearnEntry({ today: after, lastEntryDate: before })).toBe('full')
    // Still the same local date at 21:30 although UTC has already turned over.
    const evening = dateKey(new Date(Date.UTC(2026, 9, 6, 3, 30)))
    expect(evening).toBe('2026-10-05')
    expect(decideLearnEntry({ today: evening, lastEntryDate: before })).toBe('brief')
  })
})
