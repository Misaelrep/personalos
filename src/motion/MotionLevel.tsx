import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { EASE } from './tokens'

/**
 * Three motion levels.
 *
 *   completo  halos alive, particles drift and converge, cinematic Focus transition.
 *   sutil     halos and particles hold still; Focus transition keeps its phases but shorter moves.
 *   reducido  no particles, no ambient motion; only the fades needed to follow the interface.
 *
 * `prefers-reduced-motion` selects `reducido` automatically. `?motion=` overrides it for review.
 */
export type MotionLevel = 'completo' | 'sutil' | 'reducido'

export interface MotionCaps {
  level: MotionLevel
  ambient: boolean
  particles: boolean
  cinematic: boolean
}

const CAPS: Record<MotionLevel, Omit<MotionCaps, 'level'>> = {
  completo: { ambient: true, particles: true, cinematic: true },
  sutil: { ambient: false, particles: true, cinematic: true },
  reducido: { ambient: false, particles: false, cinematic: false },
}

const QUERY = '(prefers-reduced-motion: reduce)'

function readOverride(): MotionLevel | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('motion')
  return v === 'completo' || v === 'sutil' || v === 'reducido' ? v : null
}

function useSystemReduced(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const Ctx = createContext<MotionCaps>({ level: 'completo', ...CAPS.completo })

export function MotionLevelProvider({ children }: { children: ReactNode }) {
  const systemReduced = useSystemReduced()
  const level: MotionLevel = readOverride() ?? (systemReduced ? 'reducido' : 'completo')

  useEffect(() => {
    document.documentElement.dataset.motion = level
  }, [level])

  return (
    <Ctx.Provider value={{ level, ...CAPS[level] }}>
      {/* In `reducido`, Framer keeps opacity changes and drops transforms/layout motion. */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion={level === 'reducido' ? 'always' : 'never'} transition={{ ease: EASE }}>
          {children}
        </MotionConfig>
      </LazyMotion>
    </Ctx.Provider>
  )
}

export function useMotion(): MotionCaps {
  return useContext(Ctx)
}
