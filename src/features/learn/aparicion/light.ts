import { BEATS } from './beats'
import type { View } from './fragments'

/**
 * The light of APARICIÓN, as functions of time: the flare where the finger touches,
 * the bloom that carries the glass over into the sky, the three rings of the wave, and
 * the finger's own comings and goings. Drawn on the canvas (not as layers of the page),
 * so a frame costs a few gradient fills and strokes and nothing is re-laid-out.
 */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3

export const vmin = (view: View) => Math.min(view.w, view.h)

export interface Glow {
  alpha: number
  radius: number
}

/** The point of contact lights up as the finger lands (BEATS.contact + the approach) and stays. */
export function flareAt(t: number, view: View): Glow {
  const start = 0.42
  const u = (t - start) / 0.9
  if (u <= 0) return { alpha: 0, radius: 0 }
  const grow = easeOut(u / 0.35)
  const alpha = u < 0.35 ? grow : lerp(1, 0.8, easeOut((u - 0.35) / 0.65))
  const size = u < 0.35 ? lerp(0.2, 1, grow) : lerp(1, 1.15, easeOut((u - 0.35) / 0.65))
  return { alpha, radius: 0.15 * vmin(view) * size }
}

/** The bloom: a white-hot swell from the contact that grows until it has carried the glass away. */
export function bloomAt(t: number, view: View): Glow {
  const u = (t - 0.62) / 1.15
  if (u <= 0 || u >= 1) return { alpha: 0, radius: 0 }
  const alpha = u < 0.38 ? 0.62 * easeOut(u / 0.38) : 0.62 * (1 - (u - 0.38) / 0.62)
  return { alpha, radius: 0.17 * vmin(view) * (0.5 + 2.6 * easeOut(u)) }
}

/**
 * The surge: for a moment, as the wave leaves and the information reacts, the red and orange at the
 * point of contact swell — a breath of heat, brightest at 0.62 s, gone by 1.2 s — and fall back.
 */
export function surgeAt(t: number, view: View): Glow {
  const u = (t - 0.45) / 0.75
  if (u <= 0 || u >= 1) return { alpha: 0, radius: 0 }
  const rise = easeOut(u / 0.22)
  const alpha = u < 0.22 ? 0.5 * rise : 0.5 * (1 - (u - 0.22) / 0.78) ** 1.6
  return { alpha, radius: 0.2 * vmin(view) * (0.55 + 0.7 * easeOut(u)) }
}

export interface Ring {
  radius: number
  alpha: number
}

/** The wave: three rings, one after the other, from the point of contact outward. */
const RING_STARTS = [BEATS.wave, BEATS.wave + 0.14, BEATS.wave + 0.3]
const RING_DURATION = 0.95

export function ringsAt(t: number, view: View): Ring[] {
  return RING_STARTS.flatMap((start) => {
    const u = (t - start) / RING_DURATION
    if (u <= 0 || u >= 1) return []
    const alpha = u < 0.12 ? 0.5 * (u / 0.12) : 0.5 * (1 - (u - 0.12) / 0.88) ** 1.4
    return [{ radius: 0.12 * vmin(view) * (0.06 + 3.8 * easeOut(u)), alpha }]
  })
}

/** The hand's scale for the screen it is on: its index reaches the left edge of a phone. */
export function handScale(view: View): number {
  return Math.min(1.7, Math.max(1.0, (Math.min(view.w, view.h * 0.6) / 390) * 1.28))
}

/** The hand's tilt: its index points up and to the right. */
export const HAND_TILT_DEG = -32
