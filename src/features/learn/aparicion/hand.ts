import { clamp01, fbm2, lerp, smoothstep } from './noise'

/**
 * The finger behind the glass, as a shaded form: not a drawing of a hand but the way light lies on one — dark
 * where it is turned away, a warm edge where the glass lights it from behind, a pale, translucent tip. Only the
 * index finger and the touch are there: its far end leaves into the mist, and the palm and the other fingers do not
 * exist. The form is a signed-distance field of a few tapered capsules; the shading reads the field's slope as a surface
 * normal, so it is round without having been modeled. Pure numbers in, one pixel out (pixels.ts lays them on the screen, where the glass bends them).
 */

type Cap = [ax: number, ay: number, ar: number, bx: number, by: number, br: number]

/** Tapered capsules, in local units: the tip at the origin, pointing right, the finger running toward −x and drooping a little (+y). */
export const HAND_PARTS: Record<string, Cap> = {
  index1: [-6, 0, 22, -118, 9, 26],
  index2: [-118, 9, 26, -240, 28, 34],
  index3: [-240, 28, 34, -340, 58, 46],
}

/** Where the finger has gone into the mist: fully there at the near mark, gone at the far one (local x). */
export const HAND_MIST = { near: -190, far: -345 } as const

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

/** Signed distance to the finger (negative inside), in local units. */
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
  /** What the finger turns into where it leaves into the mist. */
  mist: RGB
}

const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** The depth, rounded: 0 on the edge, rising to a plateau toward the middle of a finger. */
const bulge = (depth: number) => (depth <= 0 ? 0 : 20 * (1 - Math.exp(-depth / 20)))

const CLEAR: [number, number, number, number] = [0, 0, 0, 0]

/**
 * One shaded point of the finger, as RGBA (straight alpha, 0..255), at a point in local units. `step` is the distance, in local units, over which the slope is read.
 */
export function handSample(lx: number, ly: number, colors: HandColors, step = 2): [number, number, number, number] {
  const sdf = handSdf(lx, ly)
  if (sdf > 3) return CLEAR
  const mist = smoothstep(HAND_MIST.far, HAND_MIST.near, lx)
  if (mist <= 0) return CLEAR
  const depth = -sdf
  // The surface normal, from the slope of the rounded depth.
  const dx = (bulge(-handSdf(lx + step, ly)) - bulge(-handSdf(lx - step, ly))) / (2 * step)
  const dy = (bulge(-handSdf(lx, ly + step)) - bulge(-handSdf(lx, ly - step))) / (2 * step)
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

  // The glass lights it from behind and from the right: pale at the edges that face it, orange at the ones that face away.
  const facing = clamp01(0.5 + 0.5 * (nx * 0.78 + ny * -0.62))
  col = mix3(col, colors.white, clamp01(edge * facing * 1.3))
  col = mix3(col, colors.warm, clamp01(edge * (1 - facing) * 1.4))
  // A thin specular line along the back of the finger.
  col = mix3(col, colors.white, clamp01((-ny * 0.9 + nx * 0.4) ** 5) * 0.55 * smoothstep(-340, -20, lx))

  // The skin is thin near its edges and at the tip: light comes through it, warm.
  const thin = Math.exp(-depth / 9)
  const tip = smoothstep(-300, -30, lx)
  col = mix3(col, colors.glow, thin * (0.25 + 0.5 * tip))
  col = mix3(col, colors.deepWarm, Math.exp(-depth / 34) * 0.22 * (1 - facing))
  // A faint warmth that runs inside the finger, from the tip back.
  col = mix3(col, colors.warm, Math.exp(-(((ly - 8) / 14) ** 2)) * smoothstep(-260, -40, lx) * 0.1 * (depth > 6 ? 1 : 0))

  // The tip is where the light is: a white-hot core and a pale pad.
  const tx = lx + 6
  const toTip = Math.exp(-((tx * tx + ly * ly) / (30 * 30)))
  col = mix3(col, colors.white, toTip * 0.9)

  // The nail, a little lighter and glassy; the creases of the joints, a little darker.
  const nail = smoothstep(1, 0.5, Math.hypot((lx + 36) / 24, (ly + 5) / 12))
  col = mix3(col, colors.nail, nail * 0.34)
  const crease = Math.exp(-(((lx + 120 + ly * 0.12) / 4.2) ** 2)) + Math.exp(-(((lx + 244 + ly * 0.1) / 5) ** 2))
  if (depth > 4) col = mix3(col, colors.body, clamp01(crease) * 0.26)

  // Toward its far end it turns to mist.
  col = mix3(col, colors.mist, (1 - mist) * 0.75)

  // The grain of skin.
  const grain = 0.9 + 0.2 * fbm2(lx * 0.11, ly * 0.11, 7, 2)
  return [col[0] * grain, col[1] * grain, col[2] * grain, 255 * smoothstep(-0.5, 1.8, depth) * mist ** 1.3]
}
