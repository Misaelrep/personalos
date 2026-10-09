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
  const alpha = u < 0.38 ? 0.85 * easeOut(u / 0.38) : 0.85 * (1 - (u - 0.38) / 0.62)
  return { alpha, radius: 0.17 * vmin(view) * (0.5 + 4.9 * easeOut(u)) }
}

export interface Ring {
  radius: number
  alpha: number
}

/** The wave: three rings, one after the other, from the point of contact outward. */
const RING_STARTS = [BEATS.wave, BEATS.wave + 0.14, BEATS.wave + 0.3]
const RING_DURATION = 1.8

export function ringsAt(t: number, view: View): Ring[] {
  return RING_STARTS.flatMap((start) => {
    const u = (t - start) / RING_DURATION
    if (u <= 0 || u >= 1) return []
    const alpha = u < 0.12 ? 0.9 * (u / 0.12) : 0.9 * (1 - (u - 0.12) / 0.88)
    return [{ radius: 0.12 * vmin(view) * (0.06 + 5.74 * easeOut(u)), alpha }]
  })
}

export interface FingerPose {
  alpha: number
  /** Offset from resting at the contact, as a fraction of the finger's travel (along the finger's axis, away from the tip). */
  away: number
}

/** The finger arrives (fading in as it comes), rests on the glass, and withdraws as the sky comes in. */
const FINGER = { start: BEATS.contact, duration: 1.5, arrived: 0.26, leaves: 0.6 }

export function fingerAt(t: number): FingerPose {
  const u = (t - FINGER.start) / FINGER.duration
  if (u <= 0) return { alpha: 0, away: 0.7 }
  if (u < FINGER.arrived) {
    const e = easeOut(u / FINGER.arrived)
    return { alpha: e, away: lerp(0.7, 0, e) }
  }
  if (u < FINGER.leaves) return { alpha: 1, away: 0 }
  const e = easeOut((u - FINGER.leaves) / (1 - FINGER.leaves))
  return { alpha: 1 - e, away: lerp(0, 0.45, e) }
}

/** The finger's scale for the screen it is on. */
export function fingerScale(view: View): number {
  return Math.min(1.9, Math.max(1.2, (Math.min(view.w, view.h * 0.6) / 390) * 1.5))
}
