import { clamp01, fbm2, noise2, smoothstep } from './noise'

/**
 * The optics of the surface: a few tall plates of glass standing in front of everything the scene holds.
 * They are the scene's signature — not a landscape, a surface: what lies behind a plate is bent (displaced, magnified
 * or reduced), split into its colors where the plate is thick, and repeated in small zones; its edges hold a thread of light.
 * Everything that draws — the soft textures, the information inside the glass, the pieces of type, the hand — asks the same
 * function where the glass bends it, so the refraction is one thing seen through all of them.
 *
 * Pure numbers, deterministic; positions are fractions of the view, so a plate keeps its place on every screen.
 */

export interface Slab {
  /** Left edge and width, as fractions of the view's width. */
  u: number
  w: number
  /** Where the plate begins and ends, as fractions of the height (its ends are soft: it fades into the glass behind). */
  v0: number
  v1: number
  /** How strongly it bends what lies behind it: signed — positive magnifies toward its middle, negative reduces. */
  k: number
  /** How strongly it splits the colors (0..1). */
  ca: number
  /** The red and orange of the scene live here: the light that leaks along this plate's edges. */
  warm?: boolean
}

export const SLABS: readonly Slab[] = [
  { u: 0, w: 0.085, v0: 0, v1: 1, k: 0.9, ca: 0.5 },
  { u: 0.15, w: 0.125, v0: 0, v1: 0.9, k: -1.1, ca: 0.6 },
  { u: 0.335, w: 0.04, v0: 0.04, v1: 0.8, k: 1.6, ca: 0.85 },
  { u: 0.555, w: 0.2, v0: 0, v1: 1, k: 0.85, ca: 0.55 },
  { u: 0.81, w: 0.055, v0: 0.06, v1: 0.92, k: -1.3, ca: 0.8 },
  { u: 0.9, w: 0.1, v0: 0, v1: 1, k: 1, ca: 0.6, warm: true },
]

export interface Bend {
  /** How far what is behind is shifted, as fractions of the width and height of the view: sample the world at (u + du, v + dv). */
  du: number
  dv: number
  /** The split of the colors, as a fraction of the width: the red is sampled at u + du + ca, the blue at u + du − ca. */
  ca: number
  /** How much of the plate it is (0 outside, 1 inside; the ends fade). */
  weight: number
  /** Which plate (−1 outside), and where across it (0 at its left edge, 1 at its right). */
  slab: number
  s: number
}

const NONE: Bend = { du: 0, dv: 0, ca: 0, weight: 0, slab: -1, s: 0 }

/** The fading of a plate's two ends. */
export const endsOf = (slab: Slab, v: number): number => smoothstep(slab.v0, slab.v0 + 0.05, v) * (1 - smoothstep(slab.v1 - 0.07, slab.v1, v))

/** How the glass bends the point (u, v) — both 0..1. */
export function bendAt(u: number, v: number): Bend {
  for (let i = 0; i < SLABS.length; i++) {
    const slab = SLABS[i]
    if (u < slab.u || u >= slab.u + slab.w) continue
    const weight = endsOf(slab, v)
    if (weight <= 0) return NONE
    const s = (u - slab.u) / slab.w
    const across = 2 * s - 1
    // A cylinder of glass: the shift grows from the middle of the plate to its edges, so across an edge the world jumps — by a hand's breadth or less, whatever the plate's width.
    const du = slab.k * 0.03 * (0.6 + (0.4 * slab.w) / 0.1) * across * weight
    // A small wander of the shift along the plate, so it is not machine-straight.
    const dv = 0.006 * slab.k * Math.sin(v * 17 + i * 2.3) * weight
    const ca = slab.ca * 0.012 * (0.3 + 0.7 * Math.abs(across)) * weight
    return { du, dv, ca, weight, slab: i, s }
  }
  return NONE
}

/** The same, for a point in px. Returns the shift in px. */
export function bendPx(x: number, y: number, view: { w: number; h: number }): { dx: number; dy: number; ca: number; weight: number; slab: number } {
  const b = bendAt(x / view.w, y / view.h)
  return { dx: b.du * view.w, dy: b.dv * view.h, ca: b.ca * view.w, weight: b.weight, slab: b.slab }
}

/** How bright the thread of light along a plate's edge is, at a height (0..1): strong in places, absent in others. */
export function edgeLight(slab: number, side: 0 | 1, v: number): number {
  const seed = slab * 2 + side
  const n = 0.6 * noise2(v * 4.6 + seed * 3.1, seed * 1.7 + 0.5, 311 + seed) + 0.4 * noise2(v * 10.5 + seed * 1.3, seed * 2.9, 337 + seed)
  return clamp01(0.06 + 1.1 * smoothstep(0.36, 0.64, n))
}

/**
 * Where the plates stand, in px, as left and right edges (the edges of the screen included): for the thread of light along them.
 */
export function edgesOf(width: number): { x: number; slab: number; side: 0 | 1 }[] {
  return SLABS.flatMap((s, slab) => [
    { x: s.u * width, slab, side: 0 as const },
    { x: (s.u + s.w) * width, slab, side: 1 as const },
  ])
}

/**
 * The wave: the glass answers where it is touched. Not a circle — a front whose radius wanders with the angle and with time,
 * so it is stronger on one side than the other and breaks. `base` is the mean radius.
 */
export function waveRadius(angle: number, t: number, base: number, seed = 0): number {
  const a = fbm2(Math.cos(angle) * 1.15 + 4 + seed, Math.sin(angle) * 1.15 + 4 + t * 0.55, 407 + seed, 3)
  return base * (0.7 + 0.62 * a + 0.07 * Math.sin(angle * 3 + t * 2.2 + seed))
}

/** How much of the front there is toward an angle: it is not a whole ring, parts of it are not there. */
export function waveStrength(angle: number, t: number, seed = 0): number {
  return smoothstep(0.18, 0.62, fbm2(Math.cos(angle) * 1.4 + 9 + seed, Math.sin(angle) * 1.4 + 9 - t * 0.4, 419 + seed, 3))
}
