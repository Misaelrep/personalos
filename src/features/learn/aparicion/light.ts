import { BEATS } from './beats'
import type { View } from './fragments'
import { contactPoint } from './geometry'

/**
 * The light of APARICIÓN, as functions of time: the small light where the finger touches the glass, the swell
 * that goes through it, the fronts the glass answers with (each of its own shape — see optics.ts: frontShape — and
 * each at a constant speed), and the finger's own scale. Drawn on the canvas (not as layers of the page), so a frame costs a few gradient fills
 * and strokes and nothing is re-laid-out.
 */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3
const smooth = (x: number) => {
  const u = clamp01(x)
  return u * u * (3 - 2 * u)
}

export const vmin = (view: View) => Math.min(view.w, view.h)

export interface Glow {
  alpha: number
  radius: number
}

/**
 * The point of contact lights up as the finger lands (BEATS.contact + the approach) and stays while the glass goes on answering it: it is
 * where the fronts are born. It loses some of itself as they leave, and it is gone before the deep glass comes in.
 */
export function flareAt(t: number, view: View): Glow {
  const start = 0.42
  const u = (t - start) / 0.9
  if (u <= 0) return { alpha: 0, radius: 0 }
  const grow = easeOut(u / 0.35)
  // It hands itself over to the light the deep glass keeps in that plate: from the touch it spends itself slowly, and it is gone before the deep glass is in.
  const fade = (1 - 0.55 * smooth((t - 1.0) / 2.0)) * (1 - easeOut((t - 3.12) / 0.48))
  const alpha = (u < 0.35 ? grow : lerp(1, 0.8, easeOut((u - 0.35) / 0.65))) * fade
  const size = u < 0.35 ? lerp(0.2, 1, grow) : lerp(1, 1.15, easeOut((u - 0.35) / 0.65))
  return { alpha, radius: 0.09 * vmin(view) * size }
}

/** The swell: a small expansion of light from the contact, as the glass takes it — a breath, not a burst; it is gone before the structure is stable. */
// It hands over to the deep glass: gone by 1.45 s, so no white haze lies over the glass while it deepens.
const BLOOM_SPAN = 0.83
export function bloomAt(t: number, view: View): Glow {
  const u = (t - 0.62) / BLOOM_SPAN
  if (u <= 0 || u >= 1) return { alpha: 0, radius: 0 }
  const alpha = u < 0.38 ? 0.46 * easeOut(u / 0.38) : 0.46 * (1 - (u - 0.38) / 0.62)
  return { alpha, radius: 0.085 * vmin(view) * (0.5 + 2.8 * easeOut(u)) }
}

/**
 * The surge: for a moment, as the wave leaves and the information reacts, the red and orange the glass holds at the
 * point of contact swell — a breath of heat, brightest at 0.62 s, gone by 1.2 s — and fall back. It is drawn stretched along the plate.
 */
export function surgeAt(t: number, view: View): Glow {
  const u = (t - 0.45) / 0.75
  if (u <= 0 || u >= 1) return { alpha: 0, radius: 0 }
  const rise = easeOut(u / 0.22)
  const alpha = u < 0.22 ? 0.4 * rise : 0.4 * (1 - (u - 0.22) / 0.78) ** 1.6
  return { alpha, radius: 0.13 * vmin(view) * (0.55 + 0.7 * easeOut(u)) }
}

/**
 * The glass's answer to the touch: fronts that leave the point of contact one after another. Each one, once born, grows at one constant
 * speed until it leaves the screen or spends itself — it never stops, pauses, speeds up or slows down. Only how it looks changes as it ages:
 * fainter, a little wider, bending less of what it crosses. Several are on the glass at once.
 *
 * Births: the first as the touch is complete, then ≈0.75 s apart — not a metronome (0.75, 0.72, 0.78 s).
 */
export const FRONT_BIRTHS: readonly number[] = [BEATS.wave, BEATS.wave + 0.75, BEATS.wave + 1.47, BEATS.wave + 2.25]

/** How long a front takes to reach the farthest corner of the screen from the contact (s): this sets its speed on each screen. */
export const FRONT_CROSSING = 2.85

/** Each front is born a little weaker than the one before: the touch spends itself. */
const BIRTH_STRENGTH = [1, 0.86, 0.74, 0.64]
/** Over its life a front's appearance (never its speed) fades: it comes in over FRONT_RAMP, and spends itself over FRONT_LIFE. */
const FRONT_RAMP = 0.18
const FRONT_LIFE = 3.4
/** The propagation spends itself over this long before BEATS.propagated (s): the last fronts fade while they still move. */
const PROPAGATION_FADE = 0.55

/** The distance from the contact to the farthest corner of the screen (px). */
export function frontReach(view: View): number {
  const c = contactPoint(view)
  return Math.max(Math.hypot(c.x, c.y), Math.hypot(view.w - c.x, c.y), Math.hypot(c.x, view.h - c.y), Math.hypot(view.w - c.x, view.h - c.y))
}

/** The speed of every front on this screen (px/s): one, constant. */
export const frontSpeed = (view: View) => frontReach(view) / FRONT_CROSSING

export interface Front {
  /** Which front it is (0 the first), and when it was born (s). */
  index: number
  birth: number
  age: number
  /** Its radius, px: exactly its speed × its age (toward each angle, times its shape: optics.ts, frontShape). */
  radius: number
  alpha: number
  /** The thickness of its line of light, px: it widens a little as it ages. */
  width: number
  /** 1..0.5: how much it bends what it crosses, and how far it is shifted behind a plate — less as it ages. */
  refraction: number
  /** Its own shape and gaps. */
  seed: number
}

/** How much of front `index` there is at `t` (0..1) — its appearance, never its speed. 0 before it is born and once the propagation is over. */
export function frontVigor(index: number, t: number): number {
  const age = t - FRONT_BIRTHS[index]
  if (age <= 0 || t >= BEATS.propagated) return 0
  const spent = 1 - smooth((t - (BEATS.propagated - PROPAGATION_FADE)) / PROPAGATION_FADE)
  return BIRTH_STRENGTH[index] * smooth(age / FRONT_RAMP) * (1 - Math.min(1, age / FRONT_LIFE)) ** 1.1 * spent
}

export function frontsAt(t: number, view: View): Front[] {
  const speed = frontSpeed(view)
  return FRONT_BIRTHS.flatMap((birth, index) => {
    const vigor = frontVigor(index, t)
    if (vigor <= 0) return []
    const age = t - birth
    return [{ index, birth, age, radius: speed * age, alpha: 0.5 * vigor, width: (1.3 + 0.55 * age) * (vmin(view) / 390), refraction: 1 - 0.5 * Math.min(1, age / FRONT_LIFE), seed: index * 3.7 }]
  })
}

/** The hand's scale for the screen it is on: its index reaches the left edge of a phone. */
export function handScale(view: View): number {
  return Math.min(1.7, Math.max(1.0, (Math.min(view.w, view.h * 0.6) / 390) * 1.28))
}

/** The hand's tilt: its index points up and to the right. */
export const HAND_TILT_DEG = -32
