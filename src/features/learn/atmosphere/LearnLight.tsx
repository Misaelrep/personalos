import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useMotion } from '../../../motion/MotionLevel'
import { LIVE_SECONDS } from './atmosphere'
import { learnLightVars, type LearnTheme } from './themes'

/**
 * APRENDER's own light — horizon, counter light, side light, columns of glass,
 * mist, a pool of depth, an edge of light and a receding border — behind the
 * screen's content, above the shared ground.
 * It holds no state: the theme says which colors it has.
 */
export function LearnLight({ theme }: { theme: LearnTheme }) {
  const { ambient } = useMotion()

  // When the hour changes the atmosphere in front of the person, one soft band of light crosses the glass, once —
  // a refraction, coloured by whatever edge light the atmospheres involved have (day and night have none: for them it is clear).
  const sweep = useRef<HTMLDivElement>(null)
  const shown = useRef(theme.id)
  useLayoutEffect(() => {
    const changed = shown.current !== theme.id
    shown.current = theme.id
    const el = sweep.current
    if (!changed || !el || !ambient) return
    const crossing = el.animate(
      [
        { transform: 'translateX(-30vw) skewX(-8deg)', opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { opacity: 1, offset: 0.65 },
        { transform: 'translateX(125vw) skewX(-8deg)', opacity: 0 },
      ],
      { duration: LIVE_SECONDS * 1000, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    )
    return () => crossing.cancel()
  }, [theme.id, ambient])

  return (
    <div aria-hidden className="learn-light" data-ambient={ambient ? 'on' : 'off'} style={learnLightVars(theme) as CSSProperties}>
      <div className="learn-orb learn-orb-1" />
      <div className="learn-orb learn-orb-2" />
      <div className="learn-orb learn-orb-3" />
      <div className="learn-glass" />
      <div className="learn-haze" />
      <div className="learn-depth" />
      <div className="learn-rim" />
      <div className="learn-edge" />
      <div ref={sweep} className="learn-sweep" />
    </div>
  )
}
