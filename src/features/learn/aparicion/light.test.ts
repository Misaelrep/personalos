import { describe, expect, it } from 'vitest'
import { BEATS } from './beats'
import { FRONT_BIRTHS, FRONT_CROSSING, bloomAt, flareAt, frontReach, frontSpeed, frontsAt, handScale, HAND_TILT_DEG, surgeAt, vmin } from './light'

const view = { w: 390, h: 844 }

describe('the light at the point of contact', () => {
  it('is not there before the finger lands, lights up as it does, stays while the fronts are born from it, and is gone before the deep glass is in', () => {
    expect(flareAt(0.2, view).alpha).toBe(0)
    expect(flareAt(0.42, view).alpha).toBe(0)
    expect(flareAt(0.6, view).alpha).toBeGreaterThan(0.5)
    expect(flareAt(0.8, view).alpha).toBeGreaterThan(0.9)
    expect(flareAt(0.95, view).alpha).toBeGreaterThan(0.75)
    for (const birth of FRONT_BIRTHS) expect(flareAt(birth, view).alpha, String(birth)).toBeGreaterThan(0.3)
    expect(flareAt(3.6, view).alpha).toBeLessThan(0.02)
    // It spends itself without a jump.
    for (let t = 0.8; t < 3.7; t += 0.02) expect(Math.abs(flareAt(t + 0.02, view).alpha - flareAt(t, view).alpha)).toBeLessThan(0.06)
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

describe('the wave: fronts that propagate', () => {
  const VIEWS = [view, { w: 320, h: 568 }, { w: 1280, h: 800 }]

  it('are born from the touch every ≈0.65–0.85 s, the first as the touch is complete — not a metronome', () => {
    expect(FRONT_BIRTHS[0]).toBe(BEATS.wave)
    const gaps = FRONT_BIRTHS.slice(1).map((b, i) => b - FRONT_BIRTHS[i])
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(0.65)
      expect(g).toBeLessThanOrEqual(0.85)
    }
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(1)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.1) // a small jitter, not a scatter
    expect(FRONT_BIRTHS[FRONT_BIRTHS.length - 1]).toBeLessThan(BEATS.converge)
  })

  it('each front grows at one constant speed from its birth: radius = speed × age, exactly — no pause, no acceleration, no step', () => {
    for (const v of VIEWS) {
      const speed = frontSpeed(v)
      for (let t = BEATS.wave + 0.01; t < BEATS.propagated; t += 0.01) {
        for (const f of frontsAt(t, v)) {
          expect(f.radius).toBeCloseTo(speed * (t - FRONT_BIRTHS[f.index]), 6)
          const later = frontsAt(t + 0.01, v).find((g) => g.index === f.index)
          if (later) expect(later.radius - f.radius).toBeCloseTo(speed * 0.01, 6)
        }
      }
    }
  })

  it('the first front reaches the farthest corner just as the propagation ends; the speed is the same on every front', () => {
    for (const v of VIEWS) {
      expect(frontSpeed(v) * FRONT_CROSSING).toBeCloseTo(frontReach(v), 6)
      expect(FRONT_BIRTHS[0] + FRONT_CROSSING).toBeLessThanOrEqual(BEATS.propagated)
      expect(FRONT_BIRTHS[0] + FRONT_CROSSING).toBeGreaterThan(BEATS.propagated - 0.3)
    }
  })

  it('several are on the glass at once; none before the touch is complete, none once the propagation is over', () => {
    expect(frontsAt(BEATS.wave - 0.01, view)).toHaveLength(0)
    expect(frontsAt(BEATS.wave + 0.05, view)).toHaveLength(1)
    expect(frontsAt(1.7, view)).toHaveLength(2)
    expect(frontsAt(2.5, view)).toHaveLength(3)
    expect(frontsAt(3.2, view)).toHaveLength(4)
    expect(frontsAt(BEATS.propagated, view)).toHaveLength(0)
    expect(frontsAt(BEATS.propagated + 1, view)).toHaveLength(0)
  })

  it('only its look changes as it ages: fainter, a little wider, bending less — and without a jump', () => {
    for (let index = 0; index < FRONT_BIRTHS.length; index++) {
      const seen = []
      for (let t = FRONT_BIRTHS[index] + 0.25; t < BEATS.propagated; t += 0.05) {
        const f = frontsAt(t, view).find((g) => g.index === index)
        if (f) seen.push(f)
      }
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i].alpha).toBeLessThanOrEqual(seen[i - 1].alpha + 1e-9)
        expect(seen[i].width).toBeGreaterThan(seen[i - 1].width)
        expect(seen[i].refraction).toBeLessThanOrEqual(seen[i - 1].refraction)
        expect(Math.abs(seen[i].alpha - seen[i - 1].alpha)).toBeLessThan(0.08)
      }
      expect(seen[seen.length - 1].width).toBeLessThan(seen[0].width * 3)
    }
    for (let t = BEATS.wave; t < BEATS.propagated; t += 0.01) for (const f of frontsAt(t, view)) expect(f.alpha).toBeLessThanOrEqual(0.5)
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
