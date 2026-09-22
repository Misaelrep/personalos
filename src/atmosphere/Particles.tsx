import { m } from 'framer-motion'
import { useMemo } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMotion } from '../motion/MotionLevel'
import { EASE } from '../motion/tokens'

/**
 * DISPERSIÓN → CONCENTRACIÓN → LIBERACIÓN.
 * A handful of slow points: peripheral in HOY, drawn toward the center in
 * Focus, released outward when Focus ends.
 */
export type ParticleMode = 'dispersed' | 'converged' | 'released'

interface Particle {
  /** Peripheral resting place (vw / vh). */
  home: [number, number]
  /** Position around the center while in Focus. */
  focus: [number, number]
  /** Outward position on release. */
  out: [number, number]
  size: number
  drift: number
  delay: number
  opacity: number
}

/** Deterministic PRNG so the sky never jumps between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeParticles(count: number): Particle[] {
  const rand = mulberry32(7)
  const list: Particle[] = []
  while (list.length < count) {
    const x = rand() * 100
    const y = rand() * 100
    // Keep the reading area clear: only the periphery.
    const dx = (x - 50) / 38
    const dy = (y - 50) / 34
    if (dx * dx + dy * dy < 1) continue
    const angle = rand() * Math.PI * 2
    const r = 9 + rand() * 13
    const outR = 1.35
    list.push({
      home: [x, y],
      focus: [50 + Math.cos(angle) * r * 1.1, 50 + Math.sin(angle) * r * 1.35],
      out: [50 + (x - 50) * outR, 50 + (y - 50) * outR],
      size: 1.5 + rand() * 2,
      drift: 15 + rand() * 25,
      delay: -rand() * 30,
      opacity: 0.35 + rand() * 0.5,
    })
  }
  return list
}

export function Particles({ mode }: { mode: ParticleMode }) {
  const { particles: enabled, ambient } = useMotion()
  const compact = useMediaQuery('(max-width: 640px)')
  const list = useMemo(() => makeParticles(compact ? 9 : 16), [compact])

  if (!enabled) return null

  return (
    <div className="particles">
      {list.map((p, i) => {
        const [x, y] = mode === 'converged' ? p.focus : mode === 'released' ? p.out : p.home
        const duration = mode === 'converged' ? 2.4 + (i % 5) * 0.25 : mode === 'released' ? 2.2 : 6
        return (
          <m.span
            key={i}
            className="particle"
            initial={false}
            animate={{ x: `${x}vw`, y: `${y}vh`, opacity: mode === 'converged' ? Math.min(1, p.opacity + 0.3) : p.opacity }}
            transition={{ duration, ease: EASE, delay: mode === 'converged' ? (i % 7) * 0.06 : 0 }}
          >
            <span
              className="particle-dot"
              style={{
                width: p.size,
                height: p.size,
                animationDuration: ambient ? `${p.drift}s` : undefined,
                animationDelay: `${p.delay}s`,
              }}
            />
          </m.span>
        )
      })}
    </div>
  )
}
