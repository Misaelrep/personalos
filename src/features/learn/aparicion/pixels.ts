import type { SceneColors } from '../atmosphere/themes'
import { parseHex, type RGB } from './color'
import type { Point, View } from './fragments'
import { HAND_RES, handField, handGrid, shadeHand, type HandColors } from './hand'
import { cells, clamp01, fbm2, lerp, noise2, smoothstep } from './noise'

/**
 * The soft light of the scene as pixels: haze, clouds, the wash of warm light, the shine of the water, the
 * shaded hand. Pure numbers in, a buffer out — no canvas, no page — so it can be made in a worker, off the
 * thread that draws the frames, and tested. The buffers are low-resolution on purpose: what they hold is light, not
 * edges, and the stretch the page gives them is the blur. Nothing here is an image that was drawn elsewhere: it is
 * noise, mixed from the theme's colors.
 */

export interface Pixels {
  w: number
  h: number
  /** RGBA, straight alpha. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Pixels of the glass's texture per pixel of the screen. */
export const TEXTURE_SCALE = 0.4

/** Pixels of the sky's texture per pixel of the screen: finer than the glass's, because clouds and ripples have detail to keep. */
export const SKY_SCALE = 0.55

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

/** Tall columns of glass behind the surface: where (0..1 across), how wide, and how much lighter (+) or darker (−) they are. */
const PILLARS = [
  { u: 0.05, w: 0.1, k: 0.18 },
  { u: 0.24, w: 0.13, k: -0.34 },
  { u: 0.42, w: 0.06, k: 0.16 },
  { u: 0.55, w: 0.14, k: 0.14 },
  { u: 0.7, w: 0.09, k: -0.26 },
  { u: 0.86, w: 0.07, k: 0.2 },
] as const

/**
 * The glass of APARICIÓN, as light: gray-blue haze in soft blotches and tall columns of pearl and
 * deep teal, a white glare where the finger lands, a pink-white wash along the right edge.
 */
export function hazePixels(view: View, scene: SceneColors, contact: Point): Pixels {
  const w = Math.max(8, Math.round(view.w * TEXTURE_SCALE))
  const h = Math.max(8, Math.round(view.h * TEXTURE_SCALE))
  const c = paletteOf(scene)
  const dark = mix3(c.teal, c.deep, 0.5)
  const light = mix3(c.mist, c.ice, 0.3)
  const cu = contact.x / view.w
  const cv = contact.y / view.h
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const u = x / w
      // Large blotches of light and shade, then tall bands inside them, then a fine vertical frost.
      const blotch = fbm2(u * 2.3 + 0.4, v * 1.5 + 0.2, 3, 3)
      const band = fbm2(u * 7.5, v * 1.05, 14, 2)
      const frost = noise2(u * 64, v * 2.2, 9)
      let t = 0.5 + (blotch - 0.5) * 1.5 + (band - 0.5) * 0.6 + (frost - 0.5) * 0.1 + (0.5 - v) * 0.06
      // Columns of glass: each is softer at the ends than in the middle, and fades toward the bottom.
      for (const p of PILLARS) t += p.k * Math.exp(-(((u - p.u) / p.w) ** 2)) * (0.55 + 0.45 * Math.sin(v * 9 + p.u * 20)) * (1 - 0.5 * smoothstep(0.7, 1, v))
      // The glare around the point of contact.
      const gx = (u - cu) / 0.22
      const gy = (v - cv) / 0.14
      const glare = Math.exp(-(gx * gx + gy * gy))
      t += glare * 0.5
      // Hue wanders between gray-blue and sky blue; the shadows lean teal.
      const tint = noise2(u * 3.1 + 5, v * 2.4, 21)
      const mid = mix3(c.haze, c.sky, 0.1 + 0.5 * tint)
      let col = ramp(mix3(dark, c.steel, 0.3 * tint), mid, light, clamp01(t))
      col = mix3(col, c.white, glare * glare * 0.65)
      // The right edge is warm: pink-white, with coral deeper in it; and a breath of warmth low in the middle.
      const wash = smoothstep(0.56, 1, u) * (0.55 + 0.45 * fbm2(u * 3 + 2, v * 2.2, 5, 2))
      col = mix3(col, c.peach, wash * 0.5)
      col = mix3(col, c.coral, wash * wash * (1 - smoothstep(0.1, 0.55, Math.abs(v - 0.4))) * 0.3)
      const low = Math.exp(-(((u - 0.4) / 0.28) ** 2 + ((v - 0.62) / 0.16) ** 2))
      col = mix3(col, c.peach, low * 0.3)
      // The lower edge goes back into the glass: a little darker, a little colder.
      col = mix3(col, c.steel, smoothstep(0.9, 1, v) * 0.3)
      const i = (y * w + x) * 4
      d[i] = curve(col[0])
      d[i + 1] = curve(col[1])
      d[i + 2] = curve(col[2])
      d[i + 3] = 255
    }
  }
  return { w, h, data: d }
}

/** Where the sky meets the water, as a fraction of the height: below the phrase, which is centered with the wordmark (a phone's phrase is at most ≈ 160 px tall). */
export const horizonOf = (view: View): number => Math.max(0.7, 0.5 + 158 / view.h)

/**
 * The sky and the water of the ritual's stage, as light: cyan-blue clouds above — turbulent, lit from the
 * side where the sun is — a dark and quiet band where the words are, the sun's glare and the red it
 * stains the right side with, and below the horizon the water, with the sheen of its ripples and the
 * sun's reflection.
 */
export function skyPixels(view: View, scene: SceneColors, sun: Point): Pixels {
  const w = Math.max(8, Math.round(view.w * SKY_SCALE))
  const h = Math.max(8, Math.round(view.h * SKY_SCALE))
  const c = paletteOf(scene)
  const H = horizonOf(view)
  const su = sun.x / view.w
  const sv = sun.y / view.h
  const aspect = view.w / view.h
  const night = mix3(c.night, c.deep, 0.3)
  const slate = mix3(c.steel, c.haze, 0.35)
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const u = x / w
      let col: RGB
      if (v < H) {
        const q = v / H
        // From cyan-blue at the top, through steel, to the dark of the words, and back to a slate haze at the horizon.
        col =
          q < 0.25
            ? mix3(mix3(c.teal, c.sky, 0.5), mix3(c.steel, c.deep, 0.2), q / 0.25)
            : q < 0.55
              ? mix3(mix3(c.steel, c.deep, 0.2), night, (q - 0.25) / 0.3)
              : q < 0.85
                ? mix3(night, mix3(c.deep, c.steel, 0.25), (q - 0.55) / 0.3)
                : mix3(mix3(c.deep, c.steel, 0.25), mix3(slate, c.ice, 0.28), (q - 0.85) / 0.15)
        // Clouds: turbulent (the noise is bent by noise), pale cyan above with dark undersides, banked along the horizontal.
        const wx = fbm2(u * 1.7 + 4, v * 1.9, 91, 3) - 0.5
        const wy = fbm2(u * 1.7, v * 1.9 + 7, 92, 3) - 0.5
        const n = fbm2(u * 2.9 + wx * 1.5, v * 4.2 + wy * 1.5, 61, 5)
        const fine = fbm2(u * 14, v * 18, 97, 3)
        const top = 1 - smoothstep(0.1, 0.62, q)
        const body = smoothstep(0.5, 0.72, n)
        col = mix3(col, mix3(c.sky, c.ice, 0.5), body * 0.9 * top * (0.75 + 0.5 * fine))
        col = mix3(col, c.night, smoothstep(0.52, 0.2, n) * 0.62 * smoothstep(0.05, 0.4, q))
        const bank = smoothstep(0.5, 0.9, fbm2(u * 1.5 + wx, v * 15, 67, 3))
        col = mix3(col, mix3(c.haze, c.ice, 0.4), bank * 0.55 * smoothstep(0.72, 1, q))
        // Near the horizon the sky lights up: ice-blue, and warm where the sun is.
        const glow = smoothstep(0.86, 1, q)
        col = mix3(col, mix3(c.ice, c.sky, 0.25), glow * 0.6)
        col = mix3(col, mix3(c.peach, c.ember, 0.4), glow * Math.exp(-(((u - su) / 0.3) ** 2)) * 0.55)
        // The sun lights what is near it: clouds are pale around it and rimmed with warm light, and the glare is white-hot.
        const dx = (u - su) * aspect
        const dy = v - sv
        const dist = Math.hypot(dx, dy)
        col = mix3(col, mix3(c.white, c.ice, 0.3), Math.exp(-((dist / 0.3) ** 2)) * (0.05 + 0.7 * body) * 0.7)
        col = mix3(col, mix3(c.peach, c.ember, 0.4), Math.exp(-((dist / 0.22) ** 2)) * body * (1 - body) * 1.6 * 0.6)
        col = mix3(col, c.ember, Math.exp(-((dist / 0.15) ** 2)) * 0.5)
        col = mix3(col, c.hot, Math.exp(-((dist / 0.09) ** 2)) * 0.85)
        // A shaft of red light that leans out from the sun to the right edge: streaky, brightest on the sun's own row,
        // coral above, deeper red below, darker still at the very edge. It is light: it thins toward the left like a glare does.
        const lean = Math.exp(-(((u - su - 0.22) / 0.34) ** 2 + ((v - sv - 0.03) / 0.26) ** 2))
        const edge = clamp01((u - 0.48 + 0.1 * (fbm2(u * 6, v * 1.1, 71, 2) - 0.5)) / 0.52) ** 1.5
        const fall = 1 - smoothstep(0.42, 0.78, v)
        const shaft = Math.max(edge * fall * (0.5 + 0.5 * fbm2(u * 10, v * 0.7, 73, 3)), lean * 0.85)
        const reach = Math.exp(-(((v - sv) / 0.3) ** 2))
        const crown = smoothstep(0.34, 0.04, v)
        const hue = mix3(mix3(c.vermilion, c.garnet, smoothstep(0.3, 0.7, v) * 0.7), mix3(c.coral, c.ember, 0.45), clamp01(reach * 0.75 + crown * 0.5))
        col = mix3(col, hue, shaft * 0.96)
        col = mix3(col, mix3(c.vermilion, c.garnet, 0.6), smoothstep(0.95, 1, u) * edge * 0.45)
        // The words are quiet: the glare keeps to the sides of them.
        const quiet = smoothstep(0.3, 0.38, v) * (1 - smoothstep(0.6, 0.7, v)) * (1 - 0.9 * smoothstep(0.7, 1, u))
        col = mix3(col, night, quiet * 0.88)
        // A dark mass at the left, far away: depth.
        const mass = (1 - smoothstep(0, 0.24, u)) * smoothstep(0.26, 0.33, v) * (1 - smoothstep(0.5, 0.6, v)) * (0.6 + 0.4 * fbm2(u * 8, v * 6, 79, 3))
        col = mix3(col, c.night, mass * 0.72)
      } else {
        const z = (v - H) / (1 - H)
        // The water takes the sky's light at the horizon and goes dark toward the viewer.
        col = mix3(mix3(c.steel, c.ice, 0.2), mix3(c.deep, c.night, 0.4), smoothstep(0, 0.4, z))
        const r = fbm2(u * 2.2, v * 60, 83, 4)
        col = mix3(col, mix3(c.steel, c.ice, 0.45), smoothstep(0.5, 0.86, r) * 0.4 * (1 - z * 0.5))
        // Broken glass lies on it, in perspective: panes that are small and many at the horizon and large near the viewer,
        // each its own shade, and along the borders between them, cracks of light.
        const depth = 1 / (z + 0.08)
        // The lattice is bent by noise, so the panes are not a pattern: they are broken, each its own size and angle.
        const wxg = fbm2(u * 3.2 + 3, depth * 0.9, 51, 3) - 0.5
        const wyg = fbm2(u * 3.2, depth * 0.9 + 9, 52, 3) - 0.5
        const gx = (u - 0.5) * depth * 1.2 + wxg * 0.9
        const gy = depth * 1.0 + wyg * 0.9
        const cell = cells(gx * 1.7, gy * 1.7, 41)
        const pane = cell.id
        col = mix3(col, c.night, (0.28 + 0.5 * pane) * smoothstep(0.02, 0.35, z + 0.1))
        // A few panes catch the sky.
        col = mix3(col, mix3(c.steel, c.ice, 0.5), smoothstep(0.82, 0.97, pane) * 0.4 * (1 - z * 0.4))
        // The sun on the water: a column of broken light, wider the nearer it is, and the red along the right.
        const reflect = Math.exp(-((((u - su) / (0.1 + 0.2 * z)) ** 2)))
        const redside = smoothstep(0.45, 1, u)
        const gap = cell.f2 - cell.f1
        const crack = 1 - smoothstep(0, 0.05 + 0.02 * z, gap)
        const glow = 1 - smoothstep(0, 0.22, gap)
        // Not every crack is lit: it depends on its pane, and on how near the sun's light it lies.
        const lit = clamp01(0.14 + 0.95 * Math.max(reflect * 0.9, redside * 0.6)) * (0.3 + 0.7 * pane ** 1.4)
        const crackColor = mix3(mix3(c.ice, c.cyan, 0.2), mix3(mix3(c.ember, c.hot, 0.55), c.coral, redside * 0.6), clamp01(lit * 1.6))
        col = mix3(col, crackColor, glow * glow * lit * 0.5)
        col = mix3(col, mix3(crackColor, c.white, 0.4), crack * (0.25 + 0.75 * lit))
        // The sun's own reflection, and the red at the right and low in the corners.
        col = mix3(col, mix3(c.hot, c.white, 0.4), reflect * (1 - z * 0.45) * (0.3 + 0.7 * r) * 0.5)
        col = mix3(col, mix3(c.coral, c.vermilion, 0.4), redside * (0.2 + 0.5 * z) * 0.5)
        col = mix3(col, c.vermilion, Math.exp(-(((u - 0.04) / 0.24) ** 2 + ((z - 0.88) / 0.24) ** 2)) * 0.45)
        // The line where water meets sky holds the light.
        col = mix3(col, c.mist, Math.exp(-(((v - H) / 0.014) ** 2)) * 0.6)
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
 * The hand: shaded from its field (hand.ts) into a sprite, at half resolution — the page stretches it, which is the softness
 * it needs.
 */
export function handPixels(scene: SceneColors): Pixels {
  const c = paletteOf(scene)
  const { w, h } = handGrid()
  const colors: HandColors = {
    body: mix3(c.deep, c.night, 0.55),
    cool: mix3(c.steel, c.sky, 0.3),
    white: c.white,
    warm: mix3(c.coral, c.ember, 0.35),
    deepWarm: c.vermilion,
    glow: mix3(c.peach, c.coral, 0.3),
    nail: c.mist,
  }
  return { w, h, data: shadeHand(handField(HAND_RES), colors, HAND_RES) }
}

/** What a texture job is, and the worker's answer to it. */
export type TextureJob =
  | { kind: 'haze'; scene: SceneColors; view: View; contact: Point }
  | { kind: 'hand'; scene: SceneColors }
  | { kind: 'sky'; scene: SceneColors; view: View; contact: Point }

export function makePixels(job: TextureJob): Pixels {
  if (job.kind === 'haze') return hazePixels(job.view, job.scene, job.contact)
  if (job.kind === 'sky') return skyPixels(job.view, job.scene, job.contact)
  return handPixels(job.scene)
}
