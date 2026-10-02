import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from 'framer-motion'
import { SHAPES, between, type FormId, type Fragment } from './forms'

/**
 * The matter of one activity: its configuration and its morph live in motion
 * values, so a form can change without re-rendering React, stop halfway while
 * it is inspected, and resume later.
 */
export interface MorphRec {
  /** Fragments the running morph starts from (a form, or a shape caught mid-morph). */
  from: Fragment[]
  /** Configuration the running morph leaves (its erosion blends into the new one). */
  fromForm: FormId
  to: FormId
  progress: MotionValue<number>
  anim?: AnimationPlaybackControls
  /** Seconds of the running morph, to resume it at the same pace. */
  duration: number
  paused: boolean
}

/** Organic easing: slow in, long soft landing. */
export const ORGANIC = [0.45, 0.05, 0.25, 1] as const

export function makeRec(form: FormId): MorphRec {
  return { from: SHAPES[form], fromForm: form, to: form, progress: motionValue(1), duration: 2, paused: false }
}

export function displayed(rec: MorphRec): Fragment[] {
  const t = rec.progress.get()
  return SHAPES[rec.to].map((f, i) => between(rec.from[i], f, t))
}

export const isMorphing = (rec: MorphRec) => rec.progress.get() < 1

/** The same matter moves to another configuration, from wherever it is now. */
export function startMorph(rec: MorphRec, to: FormId, seconds: number, speed: number): void {
  rec.anim?.stop()
  rec.from = displayed(rec)
  rec.fromForm = rec.to
  rec.to = to
  rec.duration = seconds
  rec.paused = false
  rec.progress.set(0)
  rec.anim = animate(rec.progress, 1, { duration: seconds * speed, ease: ORGANIC })
}

export function pauseMorph(rec: MorphRec): void {
  rec.anim?.stop()
  rec.paused = true
}

export function resumeMorph(rec: MorphRec, speed: number, seconds?: number): void {
  rec.paused = false
  const p = rec.progress.get()
  if (p >= 1) return
  rec.anim = animate(rec.progress, 1, { duration: (seconds ?? (1 - p) * rec.duration) * speed, ease: 'easeOut' })
}
