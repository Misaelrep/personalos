import type { SceneColors } from '../atmosphere/themes'
import { parseHex, type RGB } from './color'
import type { Point, View } from './fragments'
import { handSample, type HandColors } from './hand'
import { HAND_TILT_DEG, handScale } from './light'
import { clamp01, fbm2, lerp, noise2, smoothstep } from './noise'
import { SLABS, bendAt, bendPx, edgeLight, edgesOf, endsOf } from './optics'

/**
 * The soft light of the scene as pixels: the glass and its depth — what lies behind the plates of glass, bent, split
 * and repeated by them (optics.ts) — and the hand behind it. Pure numbers in, a buffer out — no canvas, no page — so it
 * can be made in a worker, off the thread that draws the frames, and tested. The buffers are low-resolution on purpose: what
 * they hold is light, not edges (the thread of light along a plate is drawn sharp, on its own canvas), and the stretch the
 * page gives them is the blur. Nothing here is an image that was drawn elsewhere: it is noise, mixed from the theme's colors.
 */

export interface Pixels {
  w: number
  h: number
  /** RGBA, straight alpha. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Pixels of the glass's texture per pixel of the screen. */
export const TEXTURE_SCALE = 0.4

/** Pixels of the depth's texture per pixel of the screen: a little finer than the glass's, because ripples have detail to keep. */
export const DEPTH_SCALE = 0.5

export const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

export interface Palette {
  white: RGB
  mist: RGB
  ice: RGB
  haze: RGB
  sky: RGB
  steel: RGB
  teal: RGB
  deep: RGB
  night: RGB
  vermilion: RGB
  coral: RGB
  ember: RGB
  hot: RGB
  peach: RGB
  cyan: RGB
  violet: RGB
  magenta: RGB
  garnet: RGB
}

export function paletteOf(scene: SceneColors): Palette {
  return Object.fromEntries(Object.entries(scene).map(([k, v]) => [k, parseHex(v)])) as unknown as Palette
}

/** Where along a three-color ramp `t` (0..1) falls. */
const ramp = (lo: RGB, mid: RGB, hi: RGB, t: number): RGB => (t < 0.5 ? mix3(lo, mid, smoothstep(0, 0.5, t)) : mix3(mid, hi, smoothstep(0.5, 1, t)))

/** A gentle S: the darks go a little deeper and the lights a little brighter — the range a photograph has and a gradient does not. */
const curve = (v: number): number => {
  const t = Math.min(1, Math.max(0, v / 255))
  return 255 * (t < 0.5 ? 0.5 * (2 * t) ** 1.18 : 1 - 0.5 * (2 * (1 - t)) ** 1.18)
}


/** Where the words begin, as a fraction of the height: the top of the wordmark. The wordmark and the phrase are one block, centered, about 214 px tall at every size of phone (measured on 320×480 to 430×932). */
export const wordsFrom = (view: View): number => 0.5 - 112 / view.h

/** How much the block of words is there at a height (0 outside it, 1 inside it, with soft ends: the light keeps out of it). */
export const wordsBand = (view: View, v: number): number => smoothstep(wordsFrom(view) - 0.09, wordsFrom(view) - 0.015, v) * (1 - smoothstep(wetFrom(view) - 0.1, wetFrom(view) - 0.02, v))

/** Where the wet of the surface begins, as a fraction of the height: below the phrase, which is centered with the wordmark (a phone's phrase is at most ≈ 160 px tall). */
export const wetFrom = (view: View): number => Math.max(0.7, 0.5 + 158 / view.h)

/** Which of the two states of the same surface a texture is: the light glass of APARICIÓN, or the same glass gone deep for APRENDER and its phrase. */
type State = 'glass' | 'depth'

/**
 * What lies behind the glass at (u, v), as a function: a luminous field of blotches and tall fibres, a light caught where the finger lands (stretched along
 * the glass, not a sun), the red-orange that leaks along the warm plate's edges, and — low on the screen — the wet: the same field shaken by ripples,
 * with the plates' edges mirrored as broken ribbons of light. `detail` is the fine frost: the plates are clear glass, so inside them it is not there.
 */
function surfaceOf(view: View, scene: SceneColors, contact: Point, state: State) {
  const c = paletteOf(scene)
  const deep = state === 'depth'
  const cu = contact.x / view.w
  const cv = contact.y / view.h
  const wf = wetFrom(view)
  const w0 = wordsFrom(view)
  const dark = mix3(c.teal, c.deep, 0.5)
  const light = mix3(c.mist, c.ice, 0.3)
  const night = mix3(c.night, c.deep, 0.3)
  const edges = edgesOf(1)
  const warmEdges = edges.filter((e) => SLABS[e.slab].warm)
  return (u0: number, v0: number, detail: boolean): RGB => {
    const wet = smoothstep(wf - 0.03, wf + 0.1, v0)
    // The wet shakes everything under it: a slow wave of the lookups, finer toward the bottom.
    const ripple = wet > 0 ? wet * (0.006 * Math.sin(v0 * 120 + fbm2(u0 * 6, v0 * 9, 59, 2) * 9) + 0.034 * (fbm2(u0 * 9, v0 * 38, 61, 3) - 0.5)) : 0
    const u = u0 + ripple
    const v = v0
    // The words' own band stays quiet: the light keeps out of it, except along the right edge.
    const quiet = wordsBand(view, v) * (1 - 0.85 * smoothstep(0.86, 0.96, u))
    const glare = Math.exp(-((((u - cu) / 0.1) ** 2) + ((v - cv) / 0.24) ** 2))
    let col: RGB
    if (!deep) {
      const blotch = fbm2(u * 2.3 + 0.4, v * 1.5 + 0.2, 3, 3)
      const band = fbm2(u * 7.5, v * 1.05, 14, 2)
      let t = 0.55 + (blotch - 0.5) * 1.45 + (band - 0.5) * 0.5 + (0.5 - v) * 0.06
      if (detail) t += (noise2(u * 64, v * 2.2, 9) - 0.5) * 0.1
      t += glare * 0.5
      // A shaft of light caught in the plate the finger touches: tall, narrow, strongest above the touch.
      t += Math.exp(-((((u - cu) / 0.05) ** 2))) * smoothstep(0, 0.12, v) * (1 - smoothstep(0.55, 0.9, v)) * 0.3
      const tint = noise2(u * 3.1 + 5, v * 2.4, 21)
      const mid = mix3(c.haze, c.sky, 0.1 + 0.5 * tint)
      col = ramp(mix3(dark, c.steel, 0.3 * tint), mid, light, clamp01(t))
      col = mix3(col, c.white, glare * glare * 0.6)
    } else {
      const blotch = fbm2(u * 2.1 + 7, v * 1.3 + 3, 33, 4)
      const band = fbm2(u * 6.5, v * 0.9, 35, 2)
      col = mix3(night, c.deep, 0.2 + 0.6 * blotch)
      const lit = smoothstep(0.5, 0.86, fbm2(u * 2.8 + 3, v * 1.5 + 1, 41, 4)) * (0.4 + 0.6 * band)
      col = mix3(col, mix3(c.teal, c.steel, 0.55), lit * (0.7 + 0.35 * (detail ? 0 : 1) + 0.3 * (1 - smoothstep(0, 0.3, v))) * (1 - 0.9 * quiet))
      col = mix3(col, mix3(c.sky, c.ice, 0.4), glare * 0.4 * (1 - 0.8 * quiet))
      col = mix3(col, c.white, glare * glare * 0.16 * (1 - quiet))
      // Behind the words the glass is at its deepest: the wordmark's dots and the phrase need the dark.
      col = mix3(col, c.night, 0.3 * quiet)
      if (detail) col = mix3(col, c.steel, (noise2(u * 64, v * 2.2, 9) - 0.5) * 0.06 + 0.03)
    }
    // The light that leaks along the warm plate's edges: in from the edge, strongest where the edge is bright — in two places, above the words and below them (the middle is theirs).
    let leak = 0
    const lobes = Math.max(smoothstep(0, 0.1, v) * (1 - smoothstep(w0 - 0.12, w0 - 0.02, v)), smoothstep(wf - 0.1, wf + 0.02, v) * (1 - smoothstep(0.9, 0.99, v)))
    if (lobes > 0.01) {
      for (const e of warmEdges) {
        const d = u - e.x
        const inward = e.side === 0 ? d : -d
        const reach = inward >= 0 ? 0.05 : 0.018
        // Smoothed along the plate: this is the soft light the crisp thread (textures.ts) is drawn over.
        const light = (edgeLight(e.slab, e.side, v - 0.025) + edgeLight(e.slab, e.side, v) + edgeLight(e.slab, e.side, v + 0.025)) / 3
        leak = Math.max(leak, light * Math.exp(-((Math.abs(d) / reach) ** 1.3)) * endsOf(SLABS[e.slab], v) * lobes)
      }
    }
    if (leak > 0.01) {
      const q = 1 - 0.8 * quiet
      if (!deep) col = mix3(col, mix3(c.peach, c.coral, clamp01(leak * 1.3)), leak * 0.34 * q)
      else col = mix3(col, mix3(mix3(c.vermilion, c.ember, 0.3), c.coral, clamp01(leak - 0.5)), leak * 0.5 * q)
    }
    if (wet > 0) {
      // The plates' edges, mirrored: ribbons of light that wander and break, wider the lower they go.
      let rib = 0
      let ribWarm = 0
      for (const e of edges) {
        const width = 0.007 + 0.02 * wet
        const k = Math.exp(-(((u - e.x) / width) ** 2)) * edgeLight(e.slab, e.side, v * 0.7 + 0.15) * (0.25 + 0.75 * fbm2(v * 26 + e.x * 9, e.slab * 3.1, 77, 2))
        if (SLABS[e.slab].warm) ribWarm = Math.max(ribWarm, k)
        else rib = Math.max(rib, k)
      }
      col = mix3(col, deep ? mix3(c.ice, c.sky, 0.4) : c.white, rib * wet * (deep ? 0.5 : 0.6))
      col = mix3(col, mix3(c.ember, c.hot, 0.3), ribWarm * wet * (deep ? 0.72 : 0.6))
      // The lower edge goes back into the glass: a little darker, a little colder.
      col = mix3(col, deep ? night : c.steel, smoothstep(0.9, 1, v) * (deep ? 0.35 : 0.3))
    }
    return col
  }
}

/**
 * The glass and its depth, as light. Both are the same surface — the same plates, in the same places, bending the same field — in two states: the light
 * glass of APARICIÓN (pearl, ice, steel, a glare where the finger lands), and the glass gone deep for APRENDER and the phrase (blue-black, with the
 * light kept in the plates' bodies and edges). Where a plate stands what lies behind it is bent, split into its colors and repeated in small zones.
 */
export function surfacePixels(state: State, view: View, scene: SceneColors, contact: Point): Pixels {
  const scale = state === 'glass' ? TEXTURE_SCALE : DEPTH_SCALE
  const w = Math.max(8, Math.round(view.w * scale))
  const h = Math.max(8, Math.round(view.h * scale))
  const c = paletteOf(scene)
  const deep = state === 'depth'
  const surface = surfaceOf(view, scene, contact, state)
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const u = x / w
      const b = bendAt(u, v)
      let col: RGB
      if (b.weight <= 0) {
        col = surface(u, v, true)
      } else {
        const uu = u + b.du
        const vv = v + b.dv
        // The colors parted: the red is looked for a little to one side and the blue to the other.
        const g = surface(uu, vv, false)
        col = [surface(uu + b.ca, vv, false)[0], g[1], surface(uu - b.ca, vv, false)[2]]
        // The words' band keeps the light down in what follows: the plate's body, and the copy of a small zone (which would bring in light from above the words).
        const across = Math.abs(2 * b.s - 1)
        const hushed = 1 - 0.85 * wordsBand(view, v) * (1 - 0.8 * smoothstep(0.86, 0.96, u))
        // A small zone, repeated: the plate holds a second, fainter copy of what is beside it.
        const echo = surface(uu + (b.s < 0.5 ? 0.034 : -0.034), vv - 0.024, false)
        col = mix3(col, echo, 0.22 * b.weight * (deep ? hushed : 1))
        // The body of the plate: clear glass holds more light than the dark around it — more near its top, more toward its edges.
        if (deep) col = mix3(col, mix3(c.steel, c.sky, 0.45), b.weight * (0.12 + 0.16 * (1 - v) ** 1.5 + 0.12 * across ** 2) * hushed)
        // Light spills along the edges of the plate.
        col = mix3(col, c.white, smoothstep(0.7, 1, across) * (deep ? 0.07 : 0.15) * edgeLight(b.slab, b.s < 0.5 ? 0 : 1, v) * (deep ? hushed : 1))
      }
      const i = (y * w + x) * 4
      d[i] = curve(col[0])
      d[i + 1] = curve(col[1])
      d[i + 2] = curve(col[2])
      d[i + 3] = 255
    }
  }
  return { w, h, data: d }
}

/**
 * The finger: not a hand — an index finger and the touch, seen from behind the glass. It is shaded in the screen's own space (hand.ts: the way light lies on it), so the plates
 * bend it like everything else: where it passes behind one it is shifted and its edges part into color. It leaves the mist at its far end: the rest of the hand is not there.
 */
export function handPixels(view: View, scene: SceneColors, contact: Point): Pixels {
  const c = paletteOf(scene)
  const w = Math.max(8, Math.round(view.w * TEXTURE_SCALE))
  const h = Math.max(8, Math.round(view.h * TEXTURE_SCALE))
  const hs = handScale(view)
  const ang = (-HAND_TILT_DEG * Math.PI) / 180
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const colors: HandColors = {
    body: mix3(c.steel, c.haze, 0.35),
    cool: mix3(c.haze, c.ice, 0.35),
    white: c.white,
    warm: mix3(c.peach, c.coral, 0.45),
    deepWarm: mix3(c.coral, c.vermilion, 0.4),
    glow: mix3(c.peach, c.white, 0.35),
    nail: c.mist,
    mist: mix3(c.mist, c.ice, 0.4),
  }
  // The step of the finite differences, in the hand's own units: about a pixel of the texture.
  const step = 1 / (TEXTURE_SCALE * hs)
  const sample = (px: number, py: number) => {
    const dx = px - contact.x
    const dy = py - contact.y
    return handSample((dx * cos - dy * sin) / hs, (dx * sin + dy * cos) / hs, colors, step)
  }
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / TEXTURE_SCALE
      const py = (y + 0.5) / TEXTURE_SCALE
      const b = bendPx(px, py, view)
      const mid = sample(px + b.dx, py + b.dy)
      let r = mid[0]
      let g = mid[1]
      let bl = mid[2]
      let a = mid[3]
      if (b.weight > 0 && b.ca > 0.1) {
        // The colors parted: three looks at the finger, a little to one side and to the other.
        const lo = sample(px + b.dx + b.ca, py + b.dy)
        const hi = sample(px + b.dx - b.ca, py + b.dy)
        r = lo[3] > 0 ? lo[0] : mid[0]
        bl = hi[3] > 0 ? hi[2] : mid[2]
        a = Math.max(mid[3], lo[3] * 0.85, hi[3] * 0.85)
        if (mid[3] === 0) g = (lo[1] + hi[1]) / 2
      }
      const i = (y * w + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = bl
      d[i + 3] = a
    }
  }
  return { w, h, data: d }
}

/** What a texture job is, and the worker's answer to it. */
export type TextureJob =
  | { kind: 'glass'; scene: SceneColors; view: View; contact: Point }
  | { kind: 'depth'; scene: SceneColors; view: View; contact: Point }
  | { kind: 'hand'; scene: SceneColors; view: View; contact: Point }

export function makePixels(job: TextureJob): Pixels {
  if (job.kind === 'hand') return handPixels(job.view, job.scene, job.contact)
  return surfacePixels(job.kind, job.view, job.scene, job.contact)
}
