import { describe, expect, it } from 'vitest'
import { BRIEF_TIMELINE, FULL_TIMELINE, SKIP_MS, STAGE_ORDER, introVisible, reached, stageAt, type RitualStage } from './ritual'

describe('the full ritual follows the specified rhythm', () => {
  it('has the spec’s marks, in seconds', () => {
    expect(FULL_TIMELINE).toMatchObject({ atmosphere: 0, wordmark: 0.2, phrase: 2.3, defrag: 6.0, prompt: 7.0, field: 7.6, suggestions: 8.2 })
  })

  it('every stage begins after the one before it', () => {
    const times = STAGE_ORDER.map((s) => FULL_TIMELINE[s]!)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })

  it('the question comes only after the phrase has dissolved, the field after the question', () => {
    expect(FULL_TIMELINE.prompt!).toBeGreaterThan(FULL_TIMELINE.defrag!)
    expect(FULL_TIMELINE.field!).toBeGreaterThan(FULL_TIMELINE.prompt!)
    expect(FULL_TIMELINE.suggestions!).toBeGreaterThan(FULL_TIMELINE.field!)
  })
})

describe('the ritual is never a lock', () => {
  it('after an interaction the functional state is reached within 400 ms', () => {
    expect(SKIP_MS).toBeLessThanOrEqual(400)
  })

  it('the brief entry has no wordmark, no phrase and no long wait', () => {
    for (const s of ['wordmark', 'phrase', 'defrag'] as RitualStage[]) expect(BRIEF_TIMELINE[s]).toBeUndefined()
    expect(BRIEF_TIMELINE.ready!).toBeLessThanOrEqual(1)
    expect(BRIEF_TIMELINE.ready!).toBeLessThan(FULL_TIMELINE.ready!)
  })
})

describe('stageAt', () => {
  const at = (s: number) => stageAt(FULL_TIMELINE, s * 1000)
  it('walks the full timeline', () => {
    expect(at(0)).toBe('atmosphere')
    expect(at(0.1)).toBe('atmosphere')
    expect(at(0.2)).toBe('wordmark')
    expect(at(1.5)).toBe('wordmark')
    expect(at(2.3)).toBe('phrase')
    expect(at(5.9)).toBe('phrase')
    expect(at(6.0)).toBe('defrag')
    expect(at(7.0)).toBe('prompt')
    expect(at(7.6)).toBe('field')
    expect(at(8.2)).toBe('suggestions')
    expect(at(9)).toBe('ready')
  })

  it('the brief timeline skips the stages it does not have', () => {
    expect(stageAt(BRIEF_TIMELINE, 0)).toBe('atmosphere')
    expect(stageAt(BRIEF_TIMELINE, 200)).toBe('prompt')
    expect(stageAt(BRIEF_TIMELINE, 2000)).toBe('ready')
  })
})

describe('introVisible: the wordmark and phrase layer', () => {
  it('is on stage from the wordmark to the question, only in the full ritual', () => {
    expect(introVisible('atmosphere', FULL_TIMELINE)).toBe(false)
    for (const s of ['wordmark', 'phrase', 'defrag'] as RitualStage[]) expect(introVisible(s, FULL_TIMELINE)).toBe(true)
    for (const s of ['prompt', 'field', 'suggestions', 'ready'] as RitualStage[]) expect(introVisible(s, FULL_TIMELINE)).toBe(false)
    for (const s of STAGE_ORDER) expect(introVisible(s, BRIEF_TIMELINE)).toBe(false)
  })

  it('reached() compares positions in the order', () => {
    expect(reached('field', 'prompt')).toBe(true)
    expect(reached('phrase', 'defrag')).toBe(false)
    expect(reached('ready', 'ready')).toBe(true)
  })
})
