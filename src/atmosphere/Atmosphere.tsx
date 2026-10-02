import { m } from 'framer-motion'
import { useEffect } from 'react'
import { useMotion } from '../motion/MotionLevel'
import { EASE } from '../motion/tokens'
import { Particles, type ParticleMode } from './Particles'
import { PRESETS, type AtmosphereKey } from './presets'

interface AtmosphereProps {
  preset: AtmosphereKey
  /** Halos open up while entering Focus. */
  expanded?: boolean
  particles: ParticleMode
  /** Seconds for the light to change (color transitions). */
  duration?: number
  /** Increment to emit one soft ring from the center (end of Focus). */
  wave?: number
  /** 'today' adds HOY's light system; Focus and its closing keep their own atmosphere. */
  scene?: 'today' | 'flow'
  /** HOY's dot field gathers toward the center as Focus begins. */
  gather?: boolean
}

/**
 * ASTRAL FADE — layered radial light behind the whole interface.
 * Colors are registered custom properties, so they interpolate smoothly
 * when the energy state (or Focus) changes.
 */
export function Atmosphere({
  preset,
  expanded = false,
  particles,
  duration = 1.8,
  wave = 0,
  scene = 'today',
  gather = false,
}: AtmosphereProps) {
  const p = PRESETS[preset]
  const { ambient } = useMotion()

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--atmo-dur', `${duration}s`)
    // Entering Focus, the blue light arrives before the ground darkens:
    // light → blue → depth, instead of passing through grey.
    root.style.setProperty('--halo-dur', `${preset === 'focus-session' ? Math.min(duration, 0.45) : duration}s`)
    root.style.setProperty('--atmo-base', p.base)
    p.halos.forEach((c, i) => root.style.setProperty(`--halo-${i + 1}`, c))
    root.style.setProperty('--particle', p.particle)
    root.style.setProperty('--particle-glow', p.glow ?? p.particle)
    root.style.setProperty('--accent', p.accent)
    root.dataset.tone = p.tone
    root.dataset.scene = scene
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.base)
  }, [p, preset, duration, scene])

  return (
    <div aria-hidden className="atmo" data-ambient={ambient ? 'on' : 'off'} data-scene={scene} data-gather={gather}>
      <m.div
        className="atmo-halos"
        initial={false}
        animate={{ scale: expanded ? 1.22 : 1, opacity: 1 }}
        transition={{ duration: expanded ? 1.2 : 1.6, ease: EASE }}
      >
        <div className="halo halo-1" />
        <div className="halo halo-2" />
        <div className="halo halo-3" />
        <div className="halo halo-beam" />
      </m.div>
      <div className="atmo-light">
        <div className="light-veil" />
        <div className="light-mist" />
        <div className="light-arc" />
        <div className="light-cool" />
        <div className="light-astral" />
        <div className="light-sheen" />
      </div>
      <div className="atmo-dots" />
      <Particles mode={particles} />
      {wave > 0 && (
        <m.div
          key={wave}
          className="atmo-wave"
          initial={{ scale: 0.2, opacity: 0.55 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 2.4, ease: EASE }}
        />
      )}
      <div className="atmo-grain" />
    </div>
  )
}
