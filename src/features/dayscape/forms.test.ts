import { describe, expect, it } from 'vitest'
import {
  FORMS,
  FRAGMENTS,
  MORPH_CHAIN,
  SHAPES,
  between,
  burst,
  lengthOf,
  nextForm,
  pointAt,
  type FormId,
} from './forms'

describe('Polymorphic forms', () => {
  it('five forms, all made of the same six fragments', () => {
    expect(FORMS).toHaveLength(5)
    for (const form of FORMS) {
      expect(SHAPES[form]).toHaveLength(FRAGMENTS)
      for (const f of SHAPES[form])
        for (let t = 0; t <= 1; t += 0.125) expect(Math.hypot(...pointAt(f, t))).toBeLessThanOrEqual(1.03)
    }
  })

  it('orbit suggests a circle but never closes it', () => {
    const arcs = SHAPES.orbit.map((f) => Math.atan2(f.p[3][1], f.p[3][0]) - Math.atan2(f.p[0][1], f.p[0][0]))
    const sweep = arcs.reduce((sum, a) => sum + ((a + 2 * Math.PI) % (2 * Math.PI)), 0)
    expect(sweep).toBeLessThan(2 * Math.PI * 0.85)
  })

  it('only the prism carries facets (fill); the rest are hairlines', () => {
    for (const form of FORMS) {
      const filled = SHAPES[form].some((f) => f.fill > 0)
      expect(filled).toBe(form === 'prism')
    }
  })

  it('cardinal is four corners: two of its fragments are gathered into points', () => {
    expect(SHAPES.cardinal.filter((f) => lengthOf(f) < 0.01)).toHaveLength(2)
  })

  it('a morph moves the same fragments: ends match the forms, the middle lies between', () => {
    const a = SHAPES.cardinal[0]
    const b = SHAPES.orbit[0]
    const close = (x: readonly (readonly number[])[], y: readonly (readonly number[])[]) =>
      x.forEach((q, i) => q.forEach((v, j) => expect(v).toBeCloseTo(y[i][j])))
    close(between(a, b, 0).p, a.p)
    close(between(a, b, 1).p, b.p)
    const mid = between(a, b, 0.5)
    expect(mid.p[0][0]).toBeCloseTo((a.p[0][0] + b.p[0][0]) / 2)
    expect(mid.stroke).toBeCloseTo((a.stroke + b.stroke) / 2)
  })

  it('the chain runs Cardinal → Orbit → Prism → Axis → Dissolving and back', () => {
    expect(MORPH_CHAIN).toEqual(['cardinal', 'orbit', 'prism', 'axis', 'dissolving'])
    let f: FormId = 'cardinal'
    const seen: FormId[] = [f]
    for (let i = 0; i < 5; i++) seen.push((f = nextForm(f)))
    expect(seen).toEqual(['cardinal', 'orbit', 'prism', 'axis', 'dissolving', 'cardinal'])
  })

  it('each form breaks up in its own way', () => {
    const f = SHAPES.orbit[0]
    const spun = burst(f, 'orbit', 1)
    const pushed = burst(SHAPES.cardinal[0], 'cardinal', 1)
    // Orbit keeps turning along its curvature; cardinal corners move straight out.
    const angle = (q: readonly [number, number]) => Math.atan2(q[1], q[0]) * (180 / Math.PI)
    expect(angle(pointAt(spun, 0.5)) - angle(pointAt(f, 0.5))).toBeGreaterThan(30)
    expect(Math.hypot(...pointAt(pushed, 0.5))).toBeGreaterThan(Math.hypot(...pointAt(SHAPES.cardinal[0], 0.5)) + 0.3)
    expect(burst(f, 'axis', 0)).toBe(f)
  })
})
