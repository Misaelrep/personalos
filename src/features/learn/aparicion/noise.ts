/**
 * Smooth, deterministic noise: the grain of everything the scene generates (haze, clouds,
 * ripples, the frost of the glass). Value noise with a smoothstep blend, summed over octaves.
 * The same seed gives the same sky on every device and every run.
 */
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** An integer lattice point → a number in [0, 1). */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Value noise in [0, 1], continuous: one lattice cell per unit. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

/** Fractal noise in [0, 1]: each octave twice as fine and `gain` as strong as the one before. */
export function fbm2(x: number, y: number, seed = 0, octaves = 4, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, y * f, seed + o * 31)
    norm += amp
    amp *= gain
    f *= 2
  }
  return sum / norm
}

export interface Cells {
  /** Distance to the nearest feature point, and to the second nearest (in cells). */
  f1: number
  f2: number
  /** A number in [0, 1) that belongs to the cell the point is in. */
  id: number
}

/**
 * Cellular (Worley) noise: scatter a feature point in every unit cell, and ask how far the nearest two
 * are. Where the two are nearly the same distance the point is on the border between two cells: `f2 − f1`
 * is a field of cracks. Deterministic.
 */
export function cells(x: number, y: number, seed = 0): Cells {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let f1 = Infinity
  let f2 = Infinity
  let id = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const px = cx + hash(cx, cy, seed + 101)
      const py = cy + hash(cx, cy, seed + 202)
      const d = Math.hypot(px - x, py - y)
      if (d < f1) {
        f2 = f1
        f1 = d
        id = hash(cx, cy, seed + 303)
      } else if (d < f2) {
        f2 = d
      }
    }
  }
  return { f1, f2, id }
}
