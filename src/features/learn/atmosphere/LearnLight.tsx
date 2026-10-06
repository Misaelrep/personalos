import type { CSSProperties } from 'react'
import { useMotion } from '../../../motion/MotionLevel'
import { learnLightVars, type LearnTheme } from './themes'

/**
 * APRENDER's own light — horizon, counter light, side light, mist and a
 * receding edge — behind the screen's content, above the shared ground.
 * It holds no state: the theme says which colors it has.
 */
export function LearnLight({ theme }: { theme: LearnTheme }) {
  const { ambient } = useMotion()
  return (
    <div aria-hidden className="learn-light" data-ambient={ambient ? 'on' : 'off'} style={learnLightVars(theme) as CSSProperties}>
      <div className="learn-orb learn-orb-1" />
      <div className="learn-orb learn-orb-2" />
      <div className="learn-orb learn-orb-3" />
      <div className="learn-haze" />
      <div className="learn-edge" />
    </div>
  )
}
