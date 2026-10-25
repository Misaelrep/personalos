import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useMotion } from '../../../motion/MotionLevel'
import { useViewport } from '../../../hooks/useViewport'
import { SUNSET_ASSETS } from '../aparicion/assets'
import { assetFrame, contactPoint } from '../aparicion/geometry'
import { slabsIn } from '../aparicion/optics'
import { LIVE_SECONDS } from './atmosphere'
import { learnLightVars, type LearnTheme } from './themes'


/**
 * APRENDER's own light — horizon, counter light, side light, two plates of glass,
 * mist, a pool of depth, an edge of light, grain and a receding border — behind the
 * screen's content, above the shared ground. In ATARDECER it is the surface of APARICIÓN at a fifth of its presence (see ../aparicion/optics.ts: the plates stand where the ritual's do).
 * It holds no state: the theme says which colors it has. When something opaque lies over it (the ritual's own stage),
 * `covered` takes it out of the picture — nothing is painted or animated that no one can see.
 */
export function LearnLight({ theme, covered = false }: { theme: LearnTheme; covered?: boolean }) {
  const { ambient } = useMotion()
  // The plates where the assets have them on this screen, and sunset-ahora (the light glass of AHORA, A1 lightened) in the same frame.
  const vp = useViewport()
  const view = { w: vp.width, h: vp.height }
  const slabs = slabsIn(view)
  const PANES = [slabs[3], slabs[5]]
  const frame = assetFrame(view, contactPoint(view))

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
      {theme.id === 'learn-sunset' && (
        <img alt="" src={SUNSET_ASSETS.ahora} className="learn-ahora" style={{ left: frame.x, top: frame.y, width: 880 * frame.s, height: 1904 * frame.s }} />
      )}
      {PANES.map((p, i) => (
        <div key={p.u} className={`learn-pane learn-pane-${i + 1}`} style={{ left: `${p.u * 100}%`, width: `${p.w * 100}%` }} />
      ))}
      <div className="learn-haze" />
      <div className="learn-depth" />
      <div className="learn-fringe" />
      <div className="learn-glow" />
      <div className="learn-rim" />
      <div className="learn-sea" />
      <div className="learn-grain" />
      <div className="learn-edge" />
      <div ref={sweep} className="learn-sweep" />
    </div>
  )
}
