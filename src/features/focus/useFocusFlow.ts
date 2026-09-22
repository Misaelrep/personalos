import { useCallback, useEffect, useRef, useState } from 'react'
import type { AtmosphereKey } from '../../atmosphere/presets'
import type { ParticleMode } from '../../atmosphere/Particles'
import type { Outcome } from '../../domain/types'
import { useMotion } from '../../motion/MotionLevel'
import { FOCUS_ENTER, FOCUS_EXIT, NEXT_HOLD } from '../../motion/tokens'
import { nowMs } from '../../state/clock'
import { useDay } from '../../state/DayProvider'

/**
 * HOY → INICIAR FOCUS → FOCUS → CERRAR BLOQUE → RESULTADO → SIGUIENTE → HOY
 *
 * `step` subdivides the cinematic phases:
 *   entering 1–5 (see FOCUS_ENTER) · exiting 1.
 */
export type FlowPhase = 'today' | 'entering' | 'focus' | 'exiting' | 'result' | 'next'

export interface FocusFlow {
  phase: FlowPhase
  step: number
  /** Block closed in this flow (result / next phases). */
  closedBlockId?: string
  start: (blockId: string) => void
  finish: () => void
  leave: () => void
  answer: (outcome: Outcome, note?: string) => void
  backToToday: () => void
  /** Atmosphere directives derived from the phase. */
  atmosphere: { preset: AtmosphereKey; expanded: boolean; particles: ParticleMode; duration: number; wave: number }
}

export function useFocusFlow(): FocusFlow {
  const { state, view, dispatch } = useDay()
  const { cinematic } = useMotion()
  const [phase, setPhase] = useState<FlowPhase>(() => (state.focus ? 'focus' : 'today'))
  const [step, setStep] = useState(0)
  const [wave, setWave] = useState(0)
  const [closedBlockId, setClosedBlockId] = useState<string>()
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => clearTimers, [])

  const start = useCallback(
    (blockId: string) => {
      clearTimers()
      dispatch({ type: 'startFocus', blockId, at: nowMs() })
      if (!cinematic) {
        setPhase('focus')
        return
      }
      setPhase('entering')
      setStep(1)
      later(FOCUS_ENTER.phase2, () => setStep(2))
      later(FOCUS_ENTER.phase3, () => setStep(3))
      later(FOCUS_ENTER.phase4, () => setStep(4))
      later(FOCUS_ENTER.phase5, () => setStep(5))
      later(FOCUS_ENTER.done, () => {
        setPhase('focus')
        setStep(0)
      })
    },
    [cinematic, dispatch],
  )

  const finish = useCallback(() => {
    clearTimers()
    setClosedBlockId(state.focus?.blockId)
    if (!cinematic) {
      setPhase('result')
      return
    }
    setPhase('exiting')
    setStep(1)
    setWave((w) => w + 1)
    later(FOCUS_EXIT.showResult, () => {
      setPhase('result')
      setStep(0)
    })
  }, [cinematic, state.focus?.blockId])

  const backToToday = useCallback(() => {
    clearTimers()
    setPhase('today')
    setStep(0)
    setClosedBlockId(undefined)
  }, [])

  const answer = useCallback(
    (outcome: Outcome, note?: string) => {
      if (!closedBlockId) return
      dispatch({ type: 'close', blockId: closedBlockId, outcome, note })
      setPhase('next')
      later(NEXT_HOLD, backToToday)
    },
    [closedBlockId, dispatch, backToToday],
  )

  const leave = useCallback(() => {
    clearTimers()
    dispatch({ type: 'leaveFocus' })
    setPhase('today')
    setStep(0)
  }, [dispatch])

  // Focus was closed elsewhere (another tab, a midnight reset): return to HOY.
  useEffect(() => {
    if ((phase === 'focus' || phase === 'entering') && !state.focus) backToToday()
  }, [phase, state.focus, backToToday])

  const deep = (phase === 'entering' && step >= 3) || phase === 'focus'
  const atmosphere: FocusFlow['atmosphere'] = {
    preset: deep ? 'focus-session' : phase === 'today' || phase === 'entering' ? view.energy : 'exhale',
    expanded: (phase === 'entering' && step >= 2) || phase === 'focus',
    particles: deep ? 'converged' : phase === 'exiting' || phase === 'result' ? 'released' : 'dispersed',
    // Without the cinematic sequence, content appears at once: let the light settle quickly.
    duration: !cinematic ? 0.6 : phase === 'entering' ? 1.1 : phase === 'exiting' ? 1.6 : 1.8,
    wave,
  }

  return { phase, step, closedBlockId, start, finish, leave, answer, backToToday, atmosphere }
}
