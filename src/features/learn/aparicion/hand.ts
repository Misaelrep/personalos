import { clamp01, fbm2, lerp, smoothstep } from './noise'

/**
 * The hand that touches the glass, as a shaded form: not a drawing of a hand but the way light
 * lies on one — dark where it is turned away, a warm edge where the glass lights it from behind,
 * a pale, translucent tip. The form is a signed-distance field of a few tapered capsules (an
 * index finger pointing, the others folded, a thumb); the shading reads the field's slope as a
 * surface normal, so it is round without having been modeled. Pure numbers in, pixels out.
 */

/** The sprite, in the hand's own units (px at 1×): the index's tip at (TIP.x, TIP.y), pointing right, the hand trailing off to the left. */
export const HAND_BOX = { width: 660, height: 380 }
export const HAND_TIP = { x: 628, y: 112 }

/** Pixels of the sprite per unit: the field is computed at half resolution and the page stretches it. */
export const HAND_RES = 0.4

type Cap = [ax: number, ay: number, ar: number, bx: number, by: number, br: number]

/** Tapered capsules, in local units: the tip at the origin, the finger toward −x, drooping a little (+y). */
export const HAND_PARTS: Record<string, Cap> = {
  index1: [-6, 0, 22, -118, 9, 26],
  index2: [-118, 9, 26, -240, 28, 34],
  index3: [-240, 28, 34, -340, 58, 46],
  palm: [-340, 58, 46, -500, 128, 84],
  middle: [-262, 104, 33, -150, 120, 28],
  ring: [-330, 150, 40, -220, 168, 34],
  thumb: [-352, 196, 46, -176, 178, 33],
  thumbTip: [-176, 178, 33, -78, 152, 24],
}

const smin = (a: number, b: number, k: number) => {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return lerp(b, a, h) - k * h * (1 - h)
}

function capsule(px: number, py: number, [ax, ay, ar, bx, by, br]: Cap): number {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay))
  return Math.hypot(pax - bax * h, pay - bay * h) - lerp(ar, br, h)
}

/** Signed distance to the hand (negative inside), in local units. */
export function handSdf(x: number, y: number): number {
  const [first, ...rest] = Object.values(HAND_PARTS)
  let d = capsule(x, y, first)
  for (const cap of rest) d = smin(d, capsule(x, y, cap), 16)
  return d
}

type RGB = [number, number, number]

export interface HandColors {
  body: RGB
  cool: RGB
  white: RGB
  warm: RGB
  deepWarm: RGB
  glow: RGB
  nail: RGB
}

const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Pixel size of the field for a given resolution. */
export const handGrid = (res = HAND_RES) => ({ w: Math.round(HAND_BOX.width * res), h: Math.round(HAND_BOX.height * res) })

/** The field on a grid (row by row), as signed distances in local units. `rows` says which rows to fill (all by default). */
export function handField(res = HAND_RES, out?: Float32Array, rows?: [from: number, to: number]): Float32Array {
  const { w, h } = handGrid(res)
  const field = out ?? new Float32Array(w * h)
  const [from, to] = rows ?? [0, h]
  for (let gy = from; gy < to; gy++) for (let gx = 0; gx < w; gx++) field[gy * w + gx] = handSdf(gx / res - HAND_TIP.x, gy / res - HAND_TIP.y)
  return field
}

/** The depth, rounded: 0 on the edge, rising to a plateau toward the middle of a finger. */
const bulge = (depth: number) => (depth <= 0 ? 0 : 20 * (1 - Math.exp(-depth / 20)))

/**
 * Shades the field into RGBA pixels (straight alpha). `rows` says which rows to shade (all by default)
 * and `out` where to put them — so it can be done a few rows at a time.
 */
export function shadeHand(field: Float32Array, colors: HandColors, res = HAND_RES, out?: Uint8ClampedArray<ArrayBuffer>, rows?: [from: number, to: number]): Uint8ClampedArray<ArrayBuffer> {
  const { w, h } = handGrid(res)
  const px = out ?? new Uint8ClampedArray(w * h * 4)
  const [from, to] = rows ?? [0, h]
  const step = 1 / res
  const at = (gx: number, gy: number) => field[Math.min(h - 1, Math.max(0, gy)) * w + Math.min(w - 1, Math.max(0, gx))]
  for (let gy = from; gy < to; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const sdf = field[gy * w + gx]
      const i = (gy * w + gx) * 4
      if (sdf > 3) continue
      const lx = gx / res - HAND_TIP.x
      const ly = gy / res - HAND_TIP.y
      const depth = -sdf
      // The surface normal, from the slope of the rounded depth.
      const dx = (bulge(-at(gx + 1, gy)) - bulge(-at(gx - 1, gy))) / (2 * step)
      const dy = (bulge(-at(gx, gy + 1)) - bulge(-at(gx, gy - 1))) / (2 * step)
      const k = 1.5
      const len = Math.hypot(dx * k, dy * k, 1)
      const nx = (-dx * k) / len
      const ny = (-dy * k) / len
      const nz = 1 / len
      // How much the surface is turned from the viewer: the edge of the form.
      const edge = (1 - nz) ** 1.15

      // Body: blue-black, a little cooler toward the light from the upper left.
      const lam = clamp01(nx * -0.45 + ny * -0.55 + nz * 0.7)
      let col = mix3(colors.body, colors.cool, 0.1 + 0.3 * lam)

      // The glass lights the hand from behind and from the right: pale at the edges that face it, orange at the ones that face away.
      const facing = clamp01(0.5 + 0.5 * (nx * 0.78 + ny * -0.62))
      col = mix3(col, colors.white, clamp01(edge * facing * 1.3))
      col = mix3(col, colors.warm, clamp01(edge * (1 - facing) * 1.4))
      // A thin specular line along the back of the finger, where the glass is brightest.
      col = mix3(col, colors.white, clamp01((-ny * 0.9 + nx * 0.4) ** 5) * 0.55 * smoothstep(-340, -20, lx))

      // The skin is thin near its edges and at the tips: light comes through it, warm.
      const thin = Math.exp(-depth / 9)
      const tip = smoothstep(-300, -30, lx)
      col = mix3(col, colors.glow, thin * (0.25 + 0.5 * tip))
      col = mix3(col, colors.deepWarm, Math.exp(-depth / 34) * 0.22 * (1 - facing))
      // The thumb's pad, lit from behind like the tip of the index.
      const pad = Math.exp(-(((lx + 108) / 52) ** 2 + ((ly - 156) / 30) ** 2))
      col = mix3(col, colors.glow, pad * 0.75)
      col = mix3(col, colors.white, pad * pad * 0.5)
      // A faint warmth that runs inside the index, from the tip back.
      col = mix3(col, colors.warm, Math.exp(-(((ly - 8) / 14) ** 2)) * smoothstep(-260, -40, lx) * 0.1 * (depth > 6 ? 1 : 0))

      // The tip is where the light is: a white-hot core and a pale pad.
      const tx = lx + 6
      const toTip = Math.exp(-((tx * tx + ly * ly) / (30 * 30)))
      col = mix3(col, colors.white, toTip * 0.9)

      // The nail, a little lighter and glassy; the creases of the joints, a little darker.
      const nxm = (lx + 36) / 24
      const nym = (ly + 5) / 12
      const nail = smoothstep(1, 0.5, Math.hypot(nxm, nym))
      col = mix3(col, colors.nail, nail * 0.34)
      const crease = Math.exp(-(((lx + 120 + ly * 0.12) / 4.2) ** 2)) + Math.exp(-(((lx + 244 + ly * 0.1) / 5) ** 2))
      if (depth > 4 && ly < 70) col = mix3(col, colors.body, clamp01(crease) * 0.26)

      // Near the bottom of the hand, the glass no longer lights it: it goes back into shadow.
      col = mix3(col, colors.body, smoothstep(40, 230, ly) * 0.35)

      // The grain of skin.
      const grain = 0.9 + 0.2 * fbm2(lx * 0.11, ly * 0.11, 7, 2)
      px[i] = col[0] * grain
      px[i + 1] = col[1] * grain
      px[i + 2] = col[2] * grain
      px[i + 3] = 255 * smoothstep(-0.5, 1.8, depth * 1)
    }
  }
  return px
}
