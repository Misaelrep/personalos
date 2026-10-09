import type { Point } from './fragments'

/**
 * A web of light around the sun: the edges of a Voronoi diagram — the cells a set of points would
 * claim if each took everything nearer to it than to any other. Pure geometry, deterministic; the page
 * draws the edges as SVG, dotted.
 */

export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Keep the side of the line through `a` and `b`'s midpoint that is nearer to `a`. */
function clip(poly: Point[], a: Point, b: Point): Point[] {
  // A point p is nearer to a than to b when (p − m)·(b − a) ≤ 0, m being the midpoint.
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const nx = b.x - a.x
  const ny = b.y - a.y
  const side = (p: Point) => (p.x - mx) * nx + (p.y - my) * ny
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(p)
    const sq = side(q)
    if (sp <= 0) out.push(p)
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq)
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}

/** The cell of every site, clipped to the bounds (a cell can be empty only if two sites coincide). */
export function voronoi(sites: Point[], bounds: Bounds, neighbors = 14): Point[][] {
  const box: Point[] = [
    { x: bounds.x0, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y1 },
    { x: bounds.x0, y: bounds.y1 },
  ]
  return sites.map((a, i) => {
    // Only the nearest sites can bound a cell; ordering them by distance lets the box shrink early.
    const near = sites
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((n) => n.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, neighbors)
    let cell = box
    for (const { j } of near) {
      cell = clip(cell, a, sites[j])
      if (cell.length < 3) break
    }
    return cell
  })
}

/** Deterministic numbers in [0, 1). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A web of cells around a point (the sun): the edges only are drawn. Sites crowd in toward the center. */
export function lightWeb(center: Point, radius: number, count = 46, seed = 9): Point[][] {
  const r = rng(seed)
  const sites: Point[] = [center]
  for (let i = 1; i < count; i++) {
    const angle = r() * Math.PI * 2
    const dist = radius * r() ** 1.35
    sites.push({ x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist * 0.8 })
  }
  return voronoi(sites, { x0: center.x - radius * 1.2, y0: center.y - radius, x1: center.x + radius * 1.2, y1: center.y + radius })
}
