import { describe, expect, it } from 'vitest'
import { BEATS } from './beats'
import { bloomAt, flareAt, frontsAt, handScale, HAND_TILT_DEG, surgeAt, vmin } from './light'

const view = { w: 390, h: 844 }

describe('the light at the point of contact', () => {
  it('is not there before the finger lands, lights up as it does, and hands itself over before the canvas stops', () => {
    expect(flareAt(0.2, view).alpha).toBe(0)
    expect(flareAt(0.42, view).alpha).toBe(0)
    expect(flareAt(0.6, view).alpha).toBeGreaterThan(0.5)
    expect(flareAt(0.8, view).alpha).toBeGreaterThan(0.9)
    expect(flareAt(0.95, view).alpha).toBeGreaterThan(0.75)
    expect(flareAt(1.6, view).alpha).toBeLessThan(0.05)
  })

  it('is small: a point that grows to about a tenth of the screen, never beyond a seventh', () => {
    expect(flareAt(0.43, view).radius).toBeLessThan(0.03 * vmin(view))
    expect(flareAt(1.0, view).radius).toBeGreaterThan(0.08 * vmin(view))
    for (let t = 0; t < 3; t += 0.05) expect(flareAt(t, view).radius).toBeLessThan(0.14 * vmin(view))
  })
})

describe('the heat the glass takes from it', () => {
  it('swells as the wave leaves, brightest just after it, and is gone before the glass is', () => {
    expect(surgeAt(0.4, view).alpha).toBe(0)
    expect(surgeAt(0.62, view).alpha).toBeGreaterThan(0.3)
    expect(surgeAt(0.62, view).alpha).toBeGreaterThan(surgeAt(0.9, view).alpha)
    expect(surgeAt(1.2, view).alpha).toBe(0)
    expect(surgeAt(2, view).alpha).toBe(0)
  })

  it('is a breath, not a fill: its reach stays within a fifth of the screen, and it is never strong', () => {
    for (let t = 0.4; t < 1.3; t += 0.02) {
      expect(surgeAt(t, view).alpha).toBeLessThanOrEqual(0.41)
      expect(surgeAt(t, view).radius).toBeLessThanOrEqual(0.2 * vmin(view))
    }
  })
})

describe('the swell', () => {
  it('rises after the contact and is gone before the structure is stable', () => {
    expect(bloomAt(0.5, view).alpha).toBe(0)
    expect(bloomAt(1.0, view).alpha).toBeGreaterThan(0.4)
    expect(bloomAt(1.77, view).alpha).toBe(0)
    expect(bloomAt(2.5, view).alpha).toBe(0)
  })

  it('is a small expansion of light: its reach never passes half the screen’s own size, and it is never more than half strength', () => {
    for (let t = 0.6; t < 1.8; t += 0.02) {
      expect(bloomAt(t, view).radius).toBeLessThanOrEqual(0.085 * vmin(view) * 3.3 + 1e-6)
      expect(bloomAt(t, view).alpha).toBeLessThanOrEqual(0.47)
    }
  })
})

describe('the wave', () => {
  it('is three fronts, leaving one after the other from the wave beat, each wandering differently', () => {
    expect(frontsAt(BEATS.wave - 0.01, view)).toHaveLength(0)
    expect(frontsAt(BEATS.wave + 0.05, view)).toHaveLength(1)
    expect(frontsAt(BEATS.wave + 0.2, view)).toHaveLength(2)
    const three = frontsAt(BEATS.wave + 0.4, view)
    expect(three).toHaveLength(3)
    expect(new Set(three.map((f) => f.seed)).size).toBe(3)
    expect(frontsAt(BEATS.wave + 1.9, view).length).toBeLessThan(3)
    expect(frontsAt(BEATS.wave + 3, view)).toHaveLength(0)
  })

  it('each front grows without stopping and fades as it goes', () => {
    let last = { radius: 0, alpha: 1, seed: 0 }
    for (let t = BEATS.wave + 0.1; t < BEATS.wave + 0.9; t += 0.1) {
      const [front] = frontsAt(t, view)
      expect(front.radius).toBeGreaterThan(last.radius)
      last = front
    }
    expect(last.alpha).toBeLessThan(0.3)
  })
})

describe('the finger', () => {
  it('scales with the screen: it reaches the left edge of a phone, and it never grows past what a large screen needs', () => {
    expect(handScale({ w: 320, h: 568 })).toBeGreaterThanOrEqual(1)
    expect(handScale({ w: 390, h: 844 })).toBeCloseTo(1.28, 1)
    expect(handScale({ w: 1440, h: 900 })).toBeLessThanOrEqual(1.7)
    expect(handScale({ w: 320, h: 568 })).toBeLessThan(handScale({ w: 430, h: 932 }))
  })

  it('points up and to the right: a turn to the left of the horizontal', () => {
    expect(HAND_TILT_DEG).toBeLessThan(0)
    expect(HAND_TILT_DEG).toBeGreaterThan(-60)
  })
})
