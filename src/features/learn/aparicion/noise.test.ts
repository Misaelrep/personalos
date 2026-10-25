import { describe, expect, it } from 'vitest'
import { cells, clamp01, fbm2, noise2, smoothstep } from './noise'

describe('noise', () => {
  it('is deterministic: the same point and seed give the same value, another seed another one', () => {
    expect(noise2(3.3, 7.1, 4)).toBe(noise2(3.3, 7.1, 4))
    expect(noise2(3.3, 7.1, 4)).not.toBe(noise2(3.3, 7.1, 5))
    expect(fbm2(1.2, 0.4, 2, 4)).toBe(fbm2(1.2, 0.4, 2, 4))
  })

  it('stays within [0, 1] and uses most of the range', () => {
    let lo = 1
    let hi = 0
    for (let i = 0; i < 4000; i++) {
      const v = fbm2(i * 0.173, i * 0.071, 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    expect(hi - lo).toBeGreaterThan(0.5)
  })

  it('is continuous: a small step changes the value a little', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37
      expect(Math.abs(noise2(x + 0.01, 2.2) - noise2(x, 2.2))).toBeLessThan(0.08)
    }
  })

  it('smoothstep eases between its edges and clamps outside them', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(clamp01(1.4)).toBe(1)
  })
})

describe('cells', () => {
  it('is deterministic, and the second nearest point is never nearer than the first', () => {
    expect(cells(3.3, 7.1, 2)).toEqual(cells(3.3, 7.1, 2))
    for (let i = 0; i < 500; i++) {
      const c = cells(i * 0.137, i * 0.091, 4)
      expect(c.f2).toBeGreaterThanOrEqual(c.f1)
      expect(c.f1).toBeLessThan(1.5)
      expect(c.id).toBeGreaterThanOrEqual(0)
      expect(c.id).toBeLessThan(1)
    }
  })

  it('has cracks where two cells meet: f2 − f1 is small along their border and large inside a cell', () => {
    let small = 0
    let large = 0
    for (let i = 0; i < 4000; i++) {
      const c = cells((i % 80) * 0.11, Math.floor(i / 80) * 0.11, 6)
      if (c.f2 - c.f1 < 0.04) small++
      if (c.f2 - c.f1 > 0.3) large++
    }
    expect(small).toBeGreaterThan(100)
    expect(large).toBeGreaterThan(small)
  })

  it('gives each cell one id: the points of a cell share it', () => {
    const near = cells(5.5, 5.5, 1)
    const same = cells(5.5 + 0.01, 5.5 + 0.01, 1)
    expect(same.id).toBe(near.id)
  })
})
