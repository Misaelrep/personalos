import { describe, expect, it } from 'vitest'
import { APARICION_TIMELINE, BRIEF_TIMELINE, FULL_TIMELINE, STAGE_ORDER, introVisible, reached, stageAt } from '../domain/ritual'
import { BEATS, CALM, FRAGMENTS_END, INTENSITY, INTENSITY_KEYS, STAGE_LEAVES, intensityAt } from './beats'

describe('APARICIÓN keeps the ritual’s rhythm', () => {
  it('the beats come in the order given: surface, contact, wave, reorganization, convergence, stable', () => {
    const b = [BEATS.surface, BEATS.contact, BEATS.wave, BEATS.reorganize, BEATS.converge, BEATS.stable]
    expect(b).toEqual([0, 0.2, 0.5, 0.7, 1.2, 1.5])
    expect([...b].sort((x, y) => x - y)).toEqual(b)
  })

  it('the total length is the ritual’s: the same ready, phrase, defragmentation, question, field and suggestions', () => {
    for (const stage of STAGE_ORDER) {
      if (stage === 'wordmark') continue
      expect(APARICION_TIMELINE[stage], stage).toBe(FULL_TIMELINE[stage])
    }
    expect(APARICION_TIMELINE.ready).toBe(8.7)
  })

  it('the dots of the wordmark start a little later, and are formed before the phrase', () => {
    expect(APARICION_TIMELINE.wordmark).toBeGreaterThan(FULL_TIMELINE.wordmark!)
    expect(APARICION_TIMELINE.wordmark! + 1.5).toBeLessThanOrEqual(APARICION_TIMELINE.phrase! - 0.3) // DotWord takes ≈1.5 s
  })

  it('the sky arrives while the structure forms and is complete before the phrase; the fragments are gone by then', () => {
    expect(FRAGMENTS_END).toBeGreaterThan(BEATS.stable + 0.2)
    expect(FRAGMENTS_END).toBeLessThan(APARICION_TIMELINE.phrase!)
  })

  it('the sky is gone exactly when the question begins: after the phrase starts to dissolve, never later than the prompt', () => {
    const start = APARICION_TIMELINE.defrag! + STAGE_LEAVES.after
    expect(start).toBeGreaterThan(APARICION_TIMELINE.defrag!)
    expect(start + STAGE_LEAVES.duration).toBeLessThanOrEqual(APARICION_TIMELINE.prompt! + 1e-9)
  })

  it('the surface calms for the phrase — from the moment it appears, and not entirely — and leaves slowly, not as a cut', () => {
    expect(CALM.from).toBe(APARICION_TIMELINE.phrase)
    expect(INTENSITY.frase).toBeGreaterThan(0.3)
    expect(INTENSITY.frase).toBeLessThan(0.8)
    expect(CALM.from + CALM.over).toBeLessThan(APARICION_TIMELINE.defrag!)
    expect(STAGE_LEAVES.duration).toBeGreaterThanOrEqual(0.6)
  })

  it('the optical surface is at 100 % for APARICIÓN and the contact, then 75, 55, 35 and, in AHORA, 15 % — the same identity, less of it', () => {
    expect(Object.values(INTENSITY)).toEqual([1, 1, 0.75, 0.55, 0.35, 0.15])
    expect(intensityAt(0.75)).toBe(1)
    expect(intensityAt(1.05)).toBe(1)
    expect(intensityAt(1.4)).toBeCloseTo(0.75, 5)
    expect(intensityAt(1.95)).toBeCloseTo(0.55, 5)
    expect(intensityAt(CALM.from)).toBeCloseTo(0.55, 5)
    expect(intensityAt(CALM.from + CALM.over)).toBeCloseTo(0.35, 5)
    expect(intensityAt(8)).toBeCloseTo(0.35, 5)
  })

  it('the curve only ever falls, and its last key is the end of the calm', () => {
    let last = 1
    for (let t = 0; t <= 5; t += 0.05) {
      const level = intensityAt(t)
      expect(level).toBeLessThanOrEqual(last + 1e-9)
      last = level
    }
    expect(INTENSITY_KEYS[INTENSITY_KEYS.length - 1][0]).toBe(CALM.from + CALM.over)
  })

  it('walks the same stages as the classic ritual', () => {
    expect(stageAt(APARICION_TIMELINE, 100)).toBe('atmosphere')
    expect(stageAt(APARICION_TIMELINE, 350)).toBe('wordmark')
    expect(stageAt(APARICION_TIMELINE, 2300)).toBe('phrase')
    expect(stageAt(APARICION_TIMELINE, 6000)).toBe('defrag')
    expect(stageAt(APARICION_TIMELINE, 7000)).toBe('prompt')
    expect(stageAt(APARICION_TIMELINE, 8700)).toBe('ready')
    expect(introVisible('atmosphere', APARICION_TIMELINE)).toBe(false)
    expect(introVisible('wordmark', APARICION_TIMELINE)).toBe(true)
    expect(introVisible('prompt', APARICION_TIMELINE)).toBe(false)
    expect(reached('field', 'prompt')).toBe(true)
  })

  it('the brief entry is untouched', () => {
    expect(BRIEF_TIMELINE.ready).toBe(0.9)
    expect(BRIEF_TIMELINE.wordmark).toBeUndefined()
  })
})
