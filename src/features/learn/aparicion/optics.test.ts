import { describe, expect, it } from 'vitest'
import { SLABS, bendAt, bendPx, edgeLight, edgesOf, endsOf, waveRadius, waveStrength } from './optics'

describe('the plates of glass', () => {
  it('stand inside the view, in order, and never overlap', () => {
    let right = 0
    for (const s of SLABS) {
      expect(s.u).toBeGreaterThanOrEqual(right)
      expect(s.u + s.w).toBeLessThanOrEqual(1 + 1e-9)
      expect(s.w).toBeGreaterThan(0.03)
      expect(s.w).toBeLessThan(0.21)
      expect(s.v0).toBeGreaterThanOrEqual(0)
      expect(s.v1).toBeGreaterThan(s.v0 + 0.5)
      right = s.u + s.w
    }
  })

  it('are a handful, of different widths — a rhythm, not a fence — and only one of them holds the red', () => {
    expect(SLABS.length).toBeGreaterThanOrEqual(5)
    expect(SLABS.length).toBeLessThanOrEqual(8)
    expect(new Set(SLABS.map((s) => s.w)).size).toBeGreaterThanOrEqual(5)
    expect(SLABS.filter((s) => s.warm)).toHaveLength(1)
    // …and they lean both ways: some magnify, some reduce.
    expect(SLABS.some((s) => s.k > 0)).toBe(true)
    expect(SLABS.some((s) => s.k < 0)).toBe(true)
  })
})

describe('what the glass does to what lies behind it', () => {
  it('leaves the air between the plates alone', () => {
    for (const [u, v] of [[0.12, 0.5], [0.3, 0.4], [0.5, 0.5], [0.78, 0.5], [0.88, 0.5]]) {
      const b = bendAt(u, v)
      expect(b.weight, `${u},${v}`).toBe(0)
      expect(b.du).toBe(0)
      expect(b.slab).toBe(-1)
    }
  })

  it('bends it inside a plate — shifted one way on its left half and the other on its right, and not at all in the middle', () => {
    for (const [i, s] of SLABS.entries()) {
      const at = (f: number) => bendAt(s.u + s.w * f, 0.4)
      expect(at(0.5).du, `${i} middle`).toBeCloseTo(0, 6)
      expect(Math.sign(at(0.1).du), `${i}`).toBe(-Math.sign(at(0.9).du))
      expect(at(0.1).slab).toBe(i)
      expect(at(0.1).weight).toBeGreaterThan(0.9)
    }
  })

  it('never by more than a hand’s breadth: the world does not jump across the screen', () => {
    for (let u = 0; u < 1; u += 0.004) for (let v = 0; v < 1; v += 0.05) {
      const b = bendAt(u, v)
      expect(Math.abs(b.du)).toBeLessThan(0.045)
      expect(Math.abs(b.dv)).toBeLessThan(0.02)
    }
  })

  it('jumps across an edge: that is where the refraction is seen', () => {
    for (const s of SLABS) {
      if (s.u === 0) continue
      const inside = bendAt(s.u + 1e-4, 0.4).du
      const outside = bendAt(s.u - 1e-4, 0.4).du
      expect(Math.abs(inside - outside)).toBeGreaterThan(0.012)
    }
  })

  it('splits the colors most at its edges', () => {
    for (const s of SLABS) {
      expect(bendAt(s.u + s.w * 0.04, 0.4).ca).toBeGreaterThan(bendAt(s.u + s.w * 0.5, 0.4).ca)
    }
  })

  it('fades at the ends of a plate: it is there at its middle height and not above it', () => {
    const s = SLABS[2]
    expect(endsOf(s, 0.4)).toBe(1)
    expect(endsOf(s, s.v0 - 0.01)).toBe(0)
    expect(endsOf(s, s.v1 + 0.01)).toBe(0)
    expect(bendAt(s.u + s.w * 0.1, s.v1 + 0.02).weight).toBe(0)
  })

  it('answers in px as it does in fractions', () => {
    const view = { w: 390, h: 844 }
    const s = SLABS[3]
    const f = bendAt(s.u + s.w * 0.2, 0.4)
    const px = bendPx((s.u + s.w * 0.2) * view.w, 0.4 * view.h, view)
    expect(px.dx).toBeCloseTo(f.du * view.w, 6)
    expect(px.slab).toBe(3)
  })
})

describe('the thread of light along the edges', () => {
  it('has an edge on each side of every plate, left to right', () => {
    const edges = edgesOf(390)
    expect(edges).toHaveLength(SLABS.length * 2)
    for (let i = 1; i < edges.length; i++) expect(edges[i].x).toBeGreaterThanOrEqual(edges[i - 1].x)
    expect(edges[0].side).toBe(0)
    expect(edges[1].side).toBe(1)
  })

  it('is bright in places and absent in others', () => {
    for (let slab = 0; slab < SLABS.length; slab++) {
      const levels = Array.from({ length: 40 }, (_, k) => edgeLight(slab, 0, k / 40))
      for (const l of levels) {
        expect(l).toBeGreaterThanOrEqual(0)
        expect(l).toBeLessThanOrEqual(1)
      }
      expect(Math.max(...levels)).toBeGreaterThan(0.5)
      expect(Math.min(...levels)).toBeLessThan(0.2)
    }
  })
})

describe('the glass’s answer to a touch', () => {
  it('is a front whose radius wanders with the angle: not a circle', () => {
    const radii = Array.from({ length: 48 }, (_, k) => waveRadius((k / 48) * Math.PI * 2, 0.8, 100))
    expect(Math.min(...radii)).toBeGreaterThan(50)
    expect(Math.max(...radii)).toBeLessThan(160)
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.25)
  })

  it('is continuous around the ring, deterministic, and grows with its mean radius', () => {
    expect(waveRadius(0, 0.8, 100)).toBeCloseTo(waveRadius(Math.PI * 2, 0.8, 100), 6)
    expect(waveRadius(1.3, 0.8, 100)).toBe(waveRadius(1.3, 0.8, 100))
    expect(waveRadius(1.3, 0.8, 200)).toBeCloseTo(2 * waveRadius(1.3, 0.8, 100), 6)
    expect(waveRadius(1.3, 0.8, 0)).toBe(0)
  })

  it('is not there all the way round: parts of it break', () => {
    const s = Array.from({ length: 72 }, (_, k) => waveStrength((k / 72) * Math.PI * 2, 0.9))
    for (const x of s) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }
    expect(s.filter((x) => x < 0.25).length).toBeGreaterThan(6)
    expect(s.filter((x) => x > 0.75).length).toBeGreaterThan(6)
  })

  it('each of the fronts wanders differently', () => {
    expect(waveRadius(2, 0.8, 100, 0)).not.toBeCloseTo(waveRadius(2, 0.8, 100, 3.7), 3)
  })
})
