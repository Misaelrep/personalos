import { describe, expect, it } from 'vitest'
import { lightWeb, voronoi } from './facets'

const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, a, i) => s + (a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y), 0)) / 2

describe('voronoi', () => {
  const bounds = { x0: 0, y0: 0, x1: 100, y1: 60 }

  it('splits two sites down the middle', () => {
    const [a, b] = voronoi([{ x: 25, y: 30 }, { x: 75, y: 30 }], bounds)
    expect(area(a)).toBeCloseTo(3000)
    expect(area(b)).toBeCloseTo(3000)
    expect(Math.max(...a.map((p) => p.x))).toBeCloseTo(50)
    expect(Math.min(...b.map((p) => p.x))).toBeCloseTo(50)
  })

  it('tiles the bounds: the cells of many sites cover exactly the area', () => {
    const sites = Array.from({ length: 30 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 60 }))
    const cells = voronoi(sites, bounds, 29)
    expect(cells.reduce((s, c) => s + area(c), 0)).toBeCloseTo(6000, 0)
  })

  it('keeps every cell inside the bounds', () => {
    const sites = Array.from({ length: 12 }, (_, i) => ({ x: (i * 31) % 100, y: (i * 17) % 60 }))
    for (const cell of voronoi(sites, bounds)) for (const p of cell) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6)
      expect(p.x).toBeLessThanOrEqual(100 + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(-1e-6)
      expect(p.y).toBeLessThanOrEqual(60 + 1e-6)
    }
  })
})

describe('the web of light', () => {
  it('gathers around its center', () => {
    const web = lightWeb({ x: 200, y: 200 }, 150)
    expect(web.length).toBeGreaterThan(30)
    const small = web.filter((c) => c.some((p) => Math.hypot(p.x - 200, p.y - 200) < 40))
    expect(small.length).toBeGreaterThan(2)
  })

})
