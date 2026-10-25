import { describe, expect, it } from 'vitest'
import { APARICION_PROPAGATION, APARICION_TIMELINE, BRIEF_TIMELINE, FULL_TIMELINE, STAGE_ORDER, introVisible, reached, stageAt } from '../domain/ritual'
import { BEATS, CALM, FRAGMENTS_END, INTENSITY, INTENSITY_KEYS, SCENE_END_FRAME_TOLERANCE, SCENE_END_TARGET, STAGE_LEAVES, intensityAt } from './beats'

describe('APARICIÓN keeps the ritual’s rhythm', () => {
  it('the beats come in the order given: surface, contact, touch complete, first front, convergence, propagation over, stable', () => {
    const b = [BEATS.surface, BEATS.contact, BEATS.touched, BEATS.wave, BEATS.converge, BEATS.propagated, BEATS.stable]
    expect(b).toEqual([0, 0.2, 0.82, 0.85, 3.3, 3.85, 4.5])
    expect([...b].sort((x, y) => x - y)).toEqual(b)
    // The contact is complete at ≈0.8–0.85 s; the propagation runs ≈0.85–3.85 s; the convergence may begin while it is ending.
    expect(BEATS.touched).toBeGreaterThanOrEqual(0.8)
    expect(BEATS.touched).toBeLessThanOrEqual(0.85)
    expect(BEATS.propagated - BEATS.wave).toBeCloseTo(APARICION_PROPAGATION, 9)
    expect(BEATS.converge).toBeLessThan(BEATS.propagated)
  })

  it('the propagation adds its 3 s after the contact; nothing after it is shortened to pay for it', () => {
    expect(APARICION_PROPAGATION).toBe(3)
    for (const stage of STAGE_ORDER) {
      if (stage === 'atmosphere' || stage === 'wordmark') continue
      expect(APARICION_TIMELINE[stage]! - FULL_TIMELINE[stage]!, stage).toBeCloseTo(APARICION_PROPAGATION, 9)
    }
    expect(APARICION_TIMELINE.atmosphere).toBe(0)
    expect(APARICION_TIMELINE.ready).toBeCloseTo(11.7, 9)
    // FRASE → AHORA keeps every one of its intervals.
    const gaps = (tl: typeof FULL_TIMELINE) => (['defrag', 'prompt', 'field', 'suggestions', 'ready'] as const).map((s) => tl[s]! - tl.phrase!)
    gaps(APARICION_TIMELINE).forEach((g, i) => expect(g).toBeCloseTo(gaps(FULL_TIMELINE)[i], 9))
  })

  it('the dots of the wordmark start after the propagation, and APRENDER is formed at ≈4.7–4.9 s, before the phrase', () => {
    expect(APARICION_TIMELINE.wordmark).toBeCloseTo(0.35 + APARICION_PROPAGATION, 9)
    // Placed dots (Wordmark: PLACED_DELAY 0.95 s, over 0.5 s): formed at wordmark + 1.45 s.
    const formed = APARICION_TIMELINE.wordmark! + 0.95 + 0.5
    expect(formed).toBeGreaterThanOrEqual(4.7)
    expect(formed).toBeLessThanOrEqual(4.9)
    expect(formed).toBeLessThanOrEqual(APARICION_TIMELINE.phrase! - 0.3)
  })

  it('the sky arrives while the structure forms and is complete before the phrase; the fragments are gone by then', () => {
    expect(FRAGMENTS_END).toBeGreaterThan(BEATS.stable + 0.2)
    expect(FRAGMENTS_END).toBeLessThan(APARICION_TIMELINE.phrase!)
  })

  it('the scene leaves after the phrase starts to dissolve and its exit is timed to end at the target (7.25 s before, 10.25 s with the propagation) — the question may begin over its residue', () => {
    const start = APARICION_TIMELINE.defrag! + STAGE_LEAVES.after
    const end = start + STAGE_LEAVES.duration
    expect(start).toBeGreaterThan(APARICION_TIMELINE.defrag!)
    expect(SCENE_END_TARGET).toBeCloseTo(7.25 + APARICION_PROPAGATION, 9)
    expect(end).toBeCloseTo(SCENE_END_TARGET, 9)
    expect(SCENE_END_FRAME_TOLERANCE).toBeCloseTo(1 / 60, 9)
    // Approved overlap: the question starts while the scene is already leaving, and before it is gone (not a cut, not a wait).
    expect(APARICION_TIMELINE.prompt!).toBeGreaterThan(start)
    expect(APARICION_TIMELINE.prompt!).toBeLessThan(end)
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
    // Held through the whole propagation: the fronts cross the glass at its fullest.
    expect(intensityAt(BEATS.converge)).toBe(1)
    expect(intensityAt(BEATS.converge + 0.65)).toBeCloseTo(0.75, 5)
    expect(intensityAt(4.9)).toBeCloseTo(0.55, 5)
    expect(intensityAt(CALM.from)).toBeCloseTo(0.55, 5)
    expect(intensityAt(CALM.from + CALM.over)).toBeCloseTo(0.35, 5)
    expect(intensityAt(9)).toBeCloseTo(0.35, 5)
  })

  it('the curve only ever falls, and its last key is the end of the calm', () => {
    let last = 1
    for (let t = 0; t <= 8; t += 0.05) {
      const level = intensityAt(t)
      expect(level).toBeLessThanOrEqual(last + 1e-9)
      last = level
    }
    expect(INTENSITY_KEYS[INTENSITY_KEYS.length - 1][0]).toBe(CALM.from + CALM.over)
  })

  it('walks the same stages as the classic ritual', () => {
    expect(stageAt(APARICION_TIMELINE, 100)).toBe('atmosphere')
    expect(stageAt(APARICION_TIMELINE, 3000)).toBe('atmosphere')
    expect(stageAt(APARICION_TIMELINE, 3350)).toBe('wordmark')
    expect(stageAt(APARICION_TIMELINE, 5300)).toBe('phrase')
    expect(stageAt(APARICION_TIMELINE, 9000)).toBe('defrag')
    expect(stageAt(APARICION_TIMELINE, 10000)).toBe('prompt')
    expect(stageAt(APARICION_TIMELINE, 11700)).toBe('ready')
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
