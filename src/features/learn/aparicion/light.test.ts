import { describe, expect, it } from 'vitest'
import { BEATS } from './beats'
import { bloomAt, fingerAt, fingerScale, flareAt, ringsAt, vmin } from './light'

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
    for (let t = BEATS.wave + 0.1; t < BEATS.wave + 1.7; t += 0.1) {
      const [ring] = ringsAt(t, view)
      expect(ring.radius).toBeGreaterThan(last.radius)
      last = ring
    }
    expect(last.alpha).toBeLessThan(0.3)
  })
})

describe('the finger', () => {
  it('appears at the contact beat, rests on the glass, and withdraws as the sky arrives', () => {
    expect(fingerAt(0).alpha).toBe(0)
    expect(fingerAt(BEATS.contact + 0.05).alpha).toBeGreaterThan(0)
    expect(fingerAt(0.7).alpha).toBe(1)
    expect(fingerAt(0.7).away).toBe(0)
    expect(fingerAt(1.0).alpha).toBe(1)
    expect(fingerAt(1.9).alpha).toBeLessThan(0.1)
    expect(fingerAt(3).alpha).toBe(0)
  })

  it('comes from below and to the left (away from the tip) and goes back that way', () => {
    expect(fingerAt(BEATS.contact + 0.01).away).toBeGreaterThan(0.5)
    expect(fingerAt(1.5).away).toBeGreaterThan(0)
    expect(fingerAt(1.5).away).toBeLessThan(0.5)
  })

  it('is fully there for long enough to be read as a finger (≥ 0.5 s) before the glass starts to leave', () => {
    let full = 0
    for (let t = 0; t < 2; t += 0.01) if (fingerAt(t).alpha >= 0.99) full += 0.01
    expect(full).toBeGreaterThanOrEqual(0.5)
  })

  it('scales with the screen between 1.2 and 1.9', () => {
    expect(fingerScale({ w: 320, h: 568 })).toBeGreaterThanOrEqual(1.2)
    expect(fingerScale({ w: 390, h: 844 })).toBeLessThan(1.9)
    expect(fingerScale({ w: 1440, h: 900 })).toBe(1.9)
    expect(fingerScale({ w: 320, h: 568 })).toBeLessThan(fingerScale({ w: 430, h: 932 }))
  })
})
