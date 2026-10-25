import { describe, expect, it } from 'vitest'
import { WORDMARK, WORDMARK_COLS, dotTone, wordmarkPitch, type MarkTone } from './wordmark'

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

describe('the tones of the dots', () => {
  const tones: MarkTone[] = [
    ['#111111', 0.66],
    ['#222222', 0.15],
    ['#333333', 0.11],
    ['#444444', 0.08],
  ]

  it('each dot always takes the same tone, one of the given ones', () => {
    for (let i = 0; i < 300; i++) {
      expect(dotTone(i, tones)).toBe(dotTone(i, tones))
      expect(tones.map(([c]) => c)).toContain(dotTone(i, tones))
    }
  })

  it('the tones are spread over the dots in their shares', () => {
    const n = 4000
    for (const [color, share] of tones) {
      const got = Array.from({ length: n }, (_, i) => dotTone(i, tones)).filter((c) => c === color).length / n
      expect(Math.abs(got - share), color).toBeLessThan(0.03)
    }
  })
})
