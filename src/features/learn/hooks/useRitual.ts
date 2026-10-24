import { useCallback, useEffect, useRef, useState } from 'react'
import { STAGE_ORDER, type RitualStage, type Timeline } from '../domain/ritual'

/** Keys that are not an intention to move on. */
const QUIET_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'Dead'])

/** The click of the tap that skipped the ritual arrives after pointerup; this is how long we wait past it. */
const AFTER_RELEASE_MS = 60
/** If the release never arrives (a scroll took the gesture), stop waiting here. */
const MAX_HOLD_MS = 800

/** When each stage of a timeline comes (ms from the start) — nothing while the ritual is held (APARICIÓN waits for its glass). */
export function scheduleOf(timeline: Timeline, hold = false): [RitualStage, number][] {
  if (hold) return []
  return STAGE_ORDER.flatMap((s) => {
    const at = timeline[s]
    return at === undefined || at <= 0 ? [] : [[s, at * 1000] as [RitualStage, number]]
  })
}

/**
 * Runs the ritual's timeline — from the moment `hold` is false (APARICIÓN holds it until its glass is decoded). Never a lock: a click, tap or key anywhere
 * brings it to the functional state (`ready`) at once; the components then
 * settle in SKIP_MS (they read `skipped`).
 *
 * `locked` stays true until the gesture that skipped has ended. Whatever
 * appears under a finger — a suggestion, the field — must not receive the
 * click of the very tap that only meant "move on".
 */
export function useRitual(timeline: Timeline, hold = false): { stage: RitualStage; skipped: boolean; locked: boolean; skip: () => void } {
  const [stage, setStage] = useState<RitualStage>('atmosphere')
  const [skipped, setSkipped] = useState(false)
  const [locked, setLocked] = useState(false)
  const timers = useRef<number[]>([])
  const release = useRef<(() => void) | null>(null)
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => {
    const list = scheduleOf(timeline, hold).map(([s, ms]) => window.setTimeout(() => setStage(s), ms))
    timers.current = list
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [timeline, hold])

  // Never leave a listener or a timer behind.
  useEffect(() => () => release.current?.(), [])

  const skip = useCallback((e?: Event) => {
    if (stageRef.current === 'ready') return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setSkipped(true)
    setStage('ready')
    if (e?.type !== 'pointerdown') return
    setLocked(true)
    let done = false
    let after = 0
    const finish = () => {
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.clearTimeout(cap)
      window.clearTimeout(after)
      release.current = null
      if (!done) setLocked(false)
      done = true
    }
    const onEnd = () => {
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      after = window.setTimeout(finish, AFTER_RELEASE_MS)
    }
    const cap = window.setTimeout(finish, MAX_HOLD_MS)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    release.current = () => {
      done = true
      finish()
    }
  }, [])

  const done = stage === 'ready'
  useEffect(() => {
    if (done) return
    const onKey = (e: KeyboardEvent) => {
      if (!QUIET_KEYS.has(e.key)) skip()
    }
    window.addEventListener('pointerdown', skip, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', onKey)
    }
  }, [done, skip])

  return { stage, skipped, locked, skip }
}
