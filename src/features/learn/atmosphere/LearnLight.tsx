import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useMotion } from '../../../motion/MotionLevel'
import { LIVE_SECONDS } from './atmosphere'
import { learnLightVars, type LearnTheme } from './themes'

/** Streaks of light on the water along the bottom: how far down the sheet (%), across (%), how long (%), how strong, and whether warm. */
const STREAKS = [
  { y: 6, x: 4, w: 34, o: 0.5 },
  { y: 11, x: 30, w: 48, o: 0.7, warm: true },
  { y: 17, x: 8, w: 26, o: 0.45 },
  { y: 22, x: 52, w: 40, o: 0.8, warm: true },
  { y: 28, x: 18, w: 52, o: 0.55 },
  { y: 35, x: 60, w: 36, o: 0.75, warm: true },
  { y: 41, x: 2, w: 30, o: 0.4 },
  { y: 47, x: 38, w: 56, o: 0.6 },
  { y: 54, x: 70, w: 28, o: 0.85, warm: true },
  { y: 61, x: 12, w: 44, o: 0.45 },
  { y: 68, x: 48, w: 46, o: 0.7, warm: true },
  { y: 76, x: 6, w: 38, o: 0.35 },
]

/**
 * APRENDER's own light — horizon, counter light, side light, columns of glass,
 * mist, a pool of depth, an edge of light and a receding border — behind the
 * screen's content, above the shared ground.
 * It holds no state: the theme says which colors it has. When something opaque lies over it (the ritual's own stage),
 * `covered` takes it out of the picture — nothing is painted or animated that no one can see.
 */
export function LearnLight({ theme, covered = false }: { theme: LearnTheme; covered?: boolean }) {
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
    <div aria-hidden className="learn-light" data-ambient={ambient ? 'on' : 'off'} data-theme={theme.id} data-covered={covered || undefined} style={learnLightVars(theme) as CSSProperties}>
      <div className="learn-orb learn-orb-1" />
      <div className="learn-orb learn-orb-2" />
      <div className="learn-orb learn-orb-3" />
      <div className="learn-sky" />
      <div className="learn-cloud learn-cloud-1" />
      <div className="learn-cloud learn-cloud-2" />
      <div className="learn-cloud learn-cloud-3" />
      <div className="learn-glass" />
      <div className="learn-haze" />
      <div className="learn-depth" />
      <div className="learn-fringe" />
      <div className="learn-glow" />
      <div className="learn-rim" />
      <div className="learn-spot learn-spot-1" />
      <div className="learn-spot learn-spot-2" />
      <div className="learn-sea">
        {STREAKS.map((k) => (
          <i key={k.y} className={k.warm ? 'warm' : undefined} style={{ '--y': `${k.y}%`, '--x': `${k.x}%`, '--w': `${k.w}%`, '--o': String(k.o) } as CSSProperties} />
        ))}
      </div>
      <div className="learn-edge" />
      <div ref={sweep} className="learn-sweep" />
    </div>
  )
}
