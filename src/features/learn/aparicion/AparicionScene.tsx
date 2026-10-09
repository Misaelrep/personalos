import { m } from 'framer-motion'
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useViewport } from '../../../hooks/useViewport'
import { useMotion } from '../../../motion/MotionLevel'
import { sceneVars, type SceneColors } from '../atmosphere/themes'
import { SKIP_MS, reached, type RitualStage } from '../domain/ritual'
import './aparicion.css'
import { CALM, STAGE_LEAVES } from './beats'
import { contactPoint } from './geometry'
import { HAND_BOX, HAND_TIP } from './hand'
import { HAND_TILT_DEG, handScale } from './light'
import { SceneCanvas } from './SceneCanvas'
import { horizonOf, type TextureJob } from './pixels'
import { paintMatrix, paintPixels, paintSun, paintWet, requestTextures } from './textures'

interface AparicionSceneProps {
  scene: SceneColors
  stage: RitualStage
}

/** Where the glass catches the light: bokeh (position, size in px, when each one twinkles). */
const FLARES = [
  { x: '34%', y: '17%', s: 30, d: '0s' },
  { x: '21%', y: '27%', s: 12, d: '0.6s' },
  { x: '55%', y: '14%', s: 9, d: '1.1s' },
  { x: '40%', y: '29%', s: 14, d: '1.9s' },
  { x: '19%', y: '80%', s: 46, d: '1.4s' },
  { x: '87%', y: '89%', s: 24, d: '2.3s' },
  { x: '73%', y: '31%', s: 11, d: '0.9s' },
  { x: '4%', y: '88%', s: 30, d: '1.7s' },
]
/** Thin vertical beams of light along the glass: across, from the top, length, thickness (px), strength. */
const BEAMS = [
  { x: '31%', y: '16%', l: '16%', w: 2, o: 0.9 },
  { x: '62%', y: '5%', l: '30%', w: 2, o: 0.7 },
  { x: '66%', y: '38%', l: '22%', w: 3, o: 0.8 },
  { x: '80%', y: '10%', l: '24%', w: 2, o: 0.7 },
  { x: '88%', y: '44%', l: '30%', w: 3, o: 0.9 },
  { x: '47%', y: '60%', l: '20%', w: 2, o: 0.5 },
  { x: '10%', y: '52%', l: '20%', w: 2, o: 0.6 },
]
/** Arcs of the spectrum where an edge of the glass splits the light: the center of the arc (across, down), its radius in px, how much of the screen it is seen over. */
const PRISMS = [
  { x: '4%', y: '96%', r: 150, o: 1, a: '-20deg' },
  { x: '12%', y: '100%', r: 96, o: 0.85, a: '-10deg' },
  { x: '98%', y: '92%', r: 110, o: 0.7, a: '200deg' },
  { x: '58%', y: '2%', r: 200, o: 0.5, a: '60deg' },
]
/** Long highlights lying on the water: how far down (%, of the water), across (%), how long (%), how strong, warm or white. */
const WATER_LINES = [
  { y: 4, x: 38, w: 40, o: 0.8, t: 'w' },
  { y: 9, x: 52, w: 30, o: 0.9, t: 'e' },
  { y: 14, x: 24, w: 46, o: 0.55, t: 'w' },
  { y: 19, x: 58, w: 36, o: 0.85, t: 'e' },
  { y: 25, x: 8, w: 40, o: 0.5, t: 'w' },
  { y: 31, x: 46, w: 48, o: 0.9, t: 'w' },
  { y: 38, x: 66, w: 30, o: 0.8, t: 'e' },
  { y: 45, x: 20, w: 44, o: 0.6, t: 'w' },
  { y: 52, x: 54, w: 42, o: 0.95, t: 'w' },
  { y: 60, x: 4, w: 34, o: 0.45, t: 'e' },
  { y: 67, x: 36, w: 56, o: 0.8, t: 'w' },
  { y: 76, x: 62, w: 34, o: 0.85, t: 'e' },
  { y: 84, x: 14, w: 50, o: 0.6, t: 'w' },
  { y: 92, x: 48, w: 44, o: 0.7, t: 'e' },
]

/** Glints on the water: where (across, and how far below the horizon), and when each one twinkles. */
const GLINTS = [
  { x: '58%', y: '4vh', d: '0s' },
  { x: '64%', y: '9vh', d: '0.9s' },
  { x: '52%', y: '13vh', d: '1.7s' },
  { x: '70%', y: '16vh', d: '0.4s' },
  { x: '46%', y: '6vh', d: '2.2s' },
  { x: '61%', y: '20vh', d: '1.2s' },
  { x: '76%', y: '7vh', d: '2.8s' },
  { x: '38%', y: '11vh', d: '1.5s' },
  { x: '84%', y: '15vh', d: '0.7s' },
  { x: '25%', y: '8vh', d: '2.5s' },
]

const style = (vars: Record<string, string>) => vars as CSSProperties

/**
 * APARICIÓN: the glass, the hand, the information inside it — and then the sky where the structure
 * holds. Both are one surface changing state: the light of the glass is spent by 1.8 s and the
 * sky comes in under it, with the same flares, edges of light and prismatic fans above both. It
 * lives behind the ritual's words and leaves before the question arrives; a tap takes it away in
 * SKIP_MS like everything else.
 */
export function AparicionScene({ scene, stage }: AparicionSceneProps) {
  const view = useViewport()
  const { level } = useMotion()
  const still = level === 'reducido'
  const size = useMemo(() => ({ w: view.width, h: view.height }), [view.width, view.height])
  const contact = useMemo(() => contactPoint(size), [size])
  const leaving = reached(stage, 'defrag')
  // The light stage (glass, hand, information) is spent by 1.8 s; only the sky stays through the phrase.
  const lightStage = !reached(stage, 'phrase')
  const haze = useRef<HTMLCanvasElement>(null)
  const hand = useRef<HTMLCanvasElement>(null)
  const matrix = useRef<HTMLCanvasElement>(null)
  const sky = useRef<HTMLCanvasElement>(null)
  const wet = useRef<HTMLCanvasElement>(null)
  const sunfx = useRef<HTMLCanvasElement>(null)
  const hs = handScale(size)
  const horizon = horizonOf(size)

  // The information inside the glass and the wet of the surface are drawn before the first frame (a few milliseconds)…
  useLayoutEffect(() => {
    if (matrix.current && lightStage) paintMatrix(matrix.current, scene, size, contact)
    if (wet.current) paintWet(wet.current, scene, size, contact)
    if (sunfx.current) paintSun(sunfx.current, scene, size, contact)
  }, [scene, size, contact, lightStage])
  // …and the hand, the light of the glass and the sky are made by a worker, off the thread that draws the frames, and come in as
  // they arrive: until each is there, the plain gradient under it shows.
  useLayoutEffect(() => {
    const jobs: TextureJob[] = [
      { kind: 'hand', scene },
      { kind: 'haze', scene, view: size, contact },
      { kind: 'sky', scene, view: size, contact },
    ]
    return requestTextures(jobs, (index, px) => {
      const canvas = [hand.current, haze.current, sky.current][index]
      if (canvas) paintPixels(canvas, px)
    })
  }, [scene, size, contact])

  const waterTop = horizon * size.h

  return (
    <m.div
      aria-hidden
      data-apa=""
      className="apa"
      style={style({ ...sceneVars(scene), '--apa-cx': `${contact.x}px`, '--apa-cy': `${contact.y}px`, '--apa-h': `${waterTop}px`, '--apa-calm-from': `${CALM.from}s`, '--apa-calm-over': `${CALM.over}s`, '--apa-calm': String(CALM.level) })}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={leaving ? { delay: STAGE_LEAVES.after, duration: STAGE_LEAVES.duration, ease: 'easeInOut' } : { duration: 0.1 }}
      exit={{ opacity: 0, transition: { duration: SKIP_MS / 1000 } }}
    >
      {lightStage && (
        <div className="apa-light">
          <canvas ref={haze} className="apa-haze" />
          <div className="apa-frost" />
          <div
            className="apa-hand"
            style={style({
              left: `${contact.x - HAND_TIP.x * hs}px`,
              top: `${contact.y - HAND_TIP.y * hs}px`,
              width: `${HAND_BOX.width * hs}px`,
              height: `${HAND_BOX.height * hs}px`,
              transformOrigin: `${HAND_TIP.x * hs}px ${HAND_TIP.y * hs}px`,
              transform: `rotate(${HAND_TILT_DEG}deg)`,
              '--hs': String(hs),
            })}
          >
            <canvas ref={hand} className="apa-hand-body" />
          </div>
          {BEAMS.map((b) => (
            <div key={b.x + b.y} className="apa-beam" style={style({ '--x': b.x, '--y': b.y, '--l': b.l, '--w': `${b.w}px`, '--o': String(b.o) })} />
          ))}
          <canvas ref={matrix} className="apa-matrix" style={style({ transformOrigin: `${contact.x}px ${contact.y}px` })} />
        </div>
      )}

      <div className="apa-stage">
        <canvas ref={sky} className="apa-sky" />
        <div className="apa-monolith" />
        <div className="apa-hairline" style={style({ '--x': '78%', '--y': '0%', '--l': '30%' })} />
        <div className="apa-hairline" style={style({ '--x': '21%', '--y': '12%', '--l': '18%' })} />
        <canvas ref={sunfx} className="apa-sunfx" />
        <div className="apa-horizon" />
        <div className="apa-reflect" />
        {/* What is busiest — the long highlights and the glints on the water — calms while the phrase is read. */}
        <div className="apa-live">
          <div className="apa-wlines" style={style({ top: `${waterTop}px`, height: `${size.h - waterTop}px` })}>
            {WATER_LINES.map((l) => (
              <i key={l.y} className={l.t} style={style({ '--y': `${l.y}%`, '--x': `${l.x}%`, '--w': `${l.w}%`, '--o': String(l.o) })} />
            ))}
          </div>
          {GLINTS.map((g) => (
            <div key={g.x + g.y} className="apa-glint" style={style({ '--x': g.x, '--y': g.y, '--d': g.d })} />
          ))}
        </div>
        <div className="apa-grain" />
      </div>

      <SceneCanvas scene={scene} still={still} />
      {/* The same flares and fans of the spectrum over the glass and the sky: the surface does not change, its state does. */}
      <div className="apa-shared">
        <canvas ref={wet} className="apa-wet" />
        {FLARES.map((f) => (
          <div key={f.x + f.y} className="apa-flare" style={style({ '--x': f.x, '--y': f.y, '--s': `${f.s}px`, '--d': f.d })} />
        ))}
        {PRISMS.map((p) => (
          <div key={p.x + p.y} className="apa-prism" style={style({ '--x': p.x, '--y': p.y, '--r': `${p.r}px`, '--o': String(p.o), '--a': p.a })} />
        ))}
        <div className="apa-grain" />
      </div>
    </m.div>
  )
}
