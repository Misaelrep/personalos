import { describe, expect, it } from 'vitest'
import { BEATS } from './beats'
import { bloomAt, flareAt, handScale, HAND_TILT_DEG, ringsAt, surgeAt, vmin } from './light'

const view = { w: 390, h: 844 }

describe('the flare at the point of contact', () => {
  it('is not there before the finger lands, lights up as it does, and stays', () => {
    expect(flareAt(0.2, view).alpha).toBe(0)
    expect(flareAt(0.42, view).alpha).toBe(0)
    expect(flareAt(0.6, view).alpha).toBeGreaterThan(0.5)
    expect(flareAt(0.8, view).alpha).toBeGreaterThan(0.9)
    expect(flareAt(1.5, view).alpha).toBeCloseTo(0.8, 1)
    expect(flareAt(1.5, view).alpha).toBeGreaterThan(0.75)
  })

  it('grows from a point to about a sixth of the screen, never beyond a fifth', () => {
    expect(flareAt(0.43, view).radius).toBeLessThan(0.05 * vmin(view))
    expect(flareAt(1.5, view).radius).toBeGreaterThan(0.14 * vmin(view))
    for (let t = 0; t < 3; t += 0.05) expect(flareAt(t, view).radius).toBeLessThan(0.2 * vmin(view))
  })
})

describe('the surge of red at the contact', () => {
  it('swells as the wave leaves, brightest just after it, and is gone before the glass is', () => {
    expect(surgeAt(0.4, view).alpha).toBe(0)
    expect(surgeAt(0.62, view).alpha).toBeGreaterThan(0.4)
    expect(surgeAt(0.62, view).alpha).toBeGreaterThan(surgeAt(0.9, view).alpha)
    expect(surgeAt(1.2, view).alpha).toBe(0)
    expect(surgeAt(2, view).alpha).toBe(0)
  })

  it('is a breath, not a fill: its reach stays within a third of the screen', () => {
    for (let t = 0.4; t < 1.3; t += 0.02) {
      expect(surgeAt(t, view).alpha).toBeLessThanOrEqual(0.55)
      expect(surgeAt(t, view).radius).toBeLessThanOrEqual(0.33 * vmin(view))
    }
  })
})

describe('the bloom', () => {
  it('swells after the contact and is gone before the sky is complete', () => {
    expect(bloomAt(0.5, view).alpha).toBe(0)
    expect(bloomAt(1.0, view).alpha).toBeGreaterThan(0.5)
    expect(bloomAt(1.77, view).alpha).toBe(0)
    expect(bloomAt(2.5, view).alpha).toBe(0)
  })

  it('its reach never passes the screen’s own size (it carries the glass over, it does not fill the sky)', () => {
    for (let t = 0.6; t < 1.8; t += 0.02) expect(bloomAt(t, view).radius).toBeLessThanOrEqual(0.17 * vmin(view) * 5.4 + 1e-6)
  })
})

describe('the wave', () => {
  it('is three rings, leaving one after the other from the wave beat', () => {
    expect(ringsAt(BEATS.wave - 0.01, view)).toHaveLength(0)
    expect(ringsAt(BEATS.wave + 0.05, view)).toHaveLength(1)
    expect(ringsAt(BEATS.wave + 0.2, view)).toHaveLength(2)
    expect(ringsAt(BEATS.wave + 0.4, view)).toHaveLength(3)
    expect(ringsAt(BEATS.wave + 1.9, view).length).toBeLessThan(3)
    expect(ringsAt(BEATS.wave + 3, view)).toHaveLength(0)
  })

  it('each ring grows without stopping and fades as it goes', () => {
    let last = { radius: 0, alpha: 1 }
    for (let t = BEATS.wave + 0.1; t < BEATS.wave + 0.9; t += 0.1) {
      const [ring] = ringsAt(t, view)
      expect(ring.radius).toBeGreaterThan(last.radius)
      last = ring
    }
    expect(last.alpha).toBeLessThan(0.3)
  })
})

describe('the hand', () => {
  it('scales with the screen: the index reaches the left edge of a phone, and it never grows past what a large screen needs', () => {
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
