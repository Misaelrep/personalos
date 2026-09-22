import type { Transition, Variants } from 'framer-motion'

/**
 * Motion vocabulary. Every animation in the app maps to one of these verbs:
 *
 *   FADE      entrada / salida de información
 *   DRIFT     movimiento ambiental (halos, partículas) — CSS keyframes
 *   CONVERGE  concentración, entrar en Focus
 *   DISSOLVE  finalización
 *   EXPAND    profundizar (desplegar detalle)
 *   PULSE     estado activo — CSS keyframes
 *   MORPH     cambio de estado
 *   ORBIT     continuidad (anillo del temporizador)
 */

export const EASE = [0.22, 1, 0.36, 1] as const

/** Seconds. */
export const DURATION = {
  hover: 0.19,
  micro: 0.38,
  state: 0.65,
  cinematic: 1.0,
} as const

export const transition = {
  micro: { duration: DURATION.micro, ease: EASE } satisfies Transition,
  state: { duration: DURATION.state, ease: EASE } satisfies Transition,
  cinematic: { duration: DURATION.cinematic, ease: EASE } satisfies Transition,
}

/** FADE — information in/out, with a very small rise. */
export const fade: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.state },
  exit: { opacity: 0, y: -4, transition: transition.micro },
}

/** Staggered FADE for a group of surfaces. */
export const fadeGroup = (stagger = 0.08, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  exit: {},
})

/** MORPH — swapping content inside a stable container. */
export const morph: Variants = {
  hidden: { opacity: 0, filter: 'blur(6px)' },
  visible: { opacity: 1, filter: 'blur(0px)', transition: transition.state },
  exit: { opacity: 0, filter: 'blur(6px)', transition: transition.micro },
}

/** EXPAND — revealing depth (detail rows, collapsible path). */
export const expand: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1, transition: { ...transition.state, opacity: { duration: DURATION.micro, delay: 0.08 } } },
  exit: { height: 0, opacity: 0, transition: { ...transition.micro, opacity: { duration: 0.18 } } },
}

/**
 * HOY → FOCUS timeline (ms). Phases follow the spec:
 * 1 secondary surfaces fade · 2 navigation leaves, AHORA takes over, halos expand ·
 * 3 atmosphere deepens, particles converge · 4 dot word FOCUS · 5 word dissolves, focus content appears.
 */
export const FOCUS_ENTER = {
  phase2: 250,
  phase3: 650,
  phase4: 1000,
  phase5: 2350,
  done: 3000,
} as const

/** FOCUS → result timeline (ms): the visual exhale. */
export const FOCUS_EXIT = {
  showResult: 850,
} as const

/** How long "Siguiente" stays before HOY returns on its own (ms). */
export const NEXT_HOLD = 4200
