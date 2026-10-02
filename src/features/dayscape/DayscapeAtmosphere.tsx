import { m, type MotionValue } from 'framer-motion'
import { useViewport } from '../../hooks/useViewport'
import { EASE } from '../../motion/tokens'
import { LAYERS } from './atmosphere'
import { MassField, type Pan } from './MassField'

interface DayscapeAtmosphereProps {
  /** In: behind the last instants of the message. Out: as HOY emerges from it. */
  shown: boolean
  reduced: boolean
  pan: Pan
  /** Contrast of the atmosphere (lower while inspecting or leaving). */
  presence: MotionValue<number>
  /** Seconds the fade in / out takes. */
  fadeIn: number
  fadeOut: number
  delay?: number
}

/**
 * The ground of DAYSCAPE: a pearl ground with independent masses of light
 * (pearl, silver mist, ice, violet) and a specular reflection. It is alive
 * from the message to HOY and never stops while the day changes form.
 */
export function DayscapeAtmosphere({ shown, reduced, pan, presence, fadeIn, fadeOut, delay = 0 }: DayscapeAtmosphereProps) {
  const { width, height } = useViewport()
  return (
    <m.div
      aria-hidden
      className="ds-atmo"
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ duration: shown ? fadeIn : fadeOut, delay: shown ? delay : 0, ease: EASE }}
    >
      <div className="ds-ground" />
      <m.div className="absolute inset-0" style={{ opacity: presence }}>
        <MassField layers={LAYERS} width={width} height={height} reduced={reduced} pan={pan} seed={3} />
        {!reduced && <div className="ds-sheen" />}
      </m.div>
    </m.div>
  )
}
