import { describe, expect, it } from 'vitest'
import { WORDMARK, WORDMARK_COLS, wordmarkPitch } from './wordmark'

describe('the APRENDER wordmark in dots', () => {
  it('spells APRENDER on 54 columns of the 5 × 7 matrix', () => {
    expect(WORDMARK).toBe('APRENDER')
    expect(WORDMARK_COLS).toBe(8 * 5 + 7 * 2)
  })

  it('fits the viewport with a margin at every phone width', () => {
    for (const w of [320, 375, 390, 430]) expect(wordmarkPitch(w) * WORDMARK_COLS).toBeLessThanOrEqual(w - 40 + 0.001)
  })

  it('stays legible: a dot never gets smaller than the size checked at 320 px', () => {
    // dot diameter = 0.64 × pitch (DotWord): ≈ 3.3 px at 320 px, 4.0 at 375, 4.15 at 390
    for (const w of [320, 375, 390, 430]) expect(wordmarkPitch(w) * 0.64).toBeGreaterThanOrEqual(3.3)
  })

  it('grows with the screen up to the size FOCUS uses on desktop', () => {
    expect(wordmarkPitch(390)).toBeGreaterThan(wordmarkPitch(320))
    expect(wordmarkPitch(1440)).toBe(15)
  })
})
