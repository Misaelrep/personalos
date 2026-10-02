import { m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { EnergyGlyph } from '../../components/dot/EnergyGlyph'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'

/**
 * MICRO ENTRY — same day, back after a while.
 * ATMÓSFERA BREVE → ¿LISTO PARA VOLVER? → HOY, in about 1.7 s. Tap to skip.
 */
const SHOW_MS = 350
const LEAVE_AT_MS = 1400
const LEAVE_MS = 350

export function MicroEntry({ onDone }: { onDone: () => void }) {
  const { view } = useDay()
  const [leaving, setLeaving] = useState(false)
  const timers = useRef<number[]>([])

  const leave = () => {
    if (leaving) return
    timers.current.forEach((t) => window.clearTimeout(t))
    setLeaving(true)
    timers.current = [window.setTimeout(onDone, LEAVE_MS)]
  }

  useEffect(() => {
    timers.current.push(window.setTimeout(() => setLeaving(true), LEAVE_AT_MS))
    timers.current.push(window.setTimeout(onDone, LEAVE_AT_MS + LEAVE_MS))
    const list = timers.current
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [onDone])

  return (
    <m.div
      role="status"
      className="tone-ink fixed inset-0 z-30 grid cursor-pointer place-items-center px-6"
      onClick={leave}
    >
      <m.div
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, filter: 'blur(6px)' }}
        animate={leaving ? { opacity: 0, filter: 'blur(6px)' } : { opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: leaving ? LEAVE_MS / 1000 : 0.5, ease: EASE, delay: leaving ? 0 : SHOW_MS / 1000 }}
      >
        <EnergyGlyph energy={view.energy} className="size-7 text-accent" />
        <p className="mt-6 font-display text-[clamp(26px,5vw,38px)] leading-tight font-normal tracking-[-0.035em] text-ink">
          ¿Listo para volver?
        </p>
      </m.div>
    </m.div>
  )
}
