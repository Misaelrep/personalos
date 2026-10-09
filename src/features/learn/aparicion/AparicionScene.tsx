import { m } from 'framer-motion'
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useViewport } from '../../../hooks/useViewport'
import { useMotion } from '../../../motion/MotionLevel'
import { sceneVars, type SceneColors } from '../atmosphere/themes'
import { SKIP_MS, reached, type RitualStage } from '../domain/ritual'
import './aparicion.css'
import { CALM, INTENSITY, INTENSITY_KEYS, STAGE_LEAVES } from './beats'
import { contactPoint } from './geometry'
import { SLABS } from './optics'
import { SceneCanvas } from './SceneCanvas'
import { type TextureJob } from './pixels'
import { paintGlass, paintMatrix, paintPixels, paintWet, requestTextures } from './textures'

interface AparicionSceneProps {
  scene: SceneColors
  stage: RitualStage
}

/** Where the plates catch the light and it flickers: which plate, which of its edges (0 left, 1 right), how far down (%), the size of the star in px, and when it twinkles. */
const GLINTS = [
  { slab: 3, side: 0, y: 7, s: 13, d: '0s' },
  { slab: 1, side: 1, y: 19, s: 9, d: '1.1s' },
  { slab: 5, side: 0, y: 24, s: 15, d: '0.6s' },
  { slab: 5, side: 1, y: 46, s: 11, d: '1.7s' },
  { slab: 3, side: 1, y: 79, s: 12, d: '1.4s' },
  { slab: 4, side: 0, y: 86, s: 9, d: '2.2s' },
  { slab: 0, side: 1, y: 91, s: 14, d: '0.9s' },
  { slab: 2, side: 1, y: 74, s: 8, d: '2.6s' },
]

const style = (vars: Record<string, string>) => vars as CSSProperties

/** The ritual's length the curve of intensity is spread over (s): the last of its keys. */
const CURVE_END = INTENSITY_KEYS[INTENSITY_KEYS.length - 1][0]

/**
 * APARICIÓN: one surface — plates of glass that bend what lies behind them — changing state. The light glass
 * holds the finger and the information inside it; as the structure forms the same glass goes deep and the words of APRENDER are read on
 * it. The plates, the thread of light along their edges, the leaks of red and orange and the wet below are the same in both: only how much of
 * them is there changes (beats.ts: INTENSITY — the surface at its fullest for the touch, a quarter less as the structure converges, and so on
 * down to AHORA's trace). It lives behind the ritual's words and leaves before the question arrives; a tap takes it away in SKIP_MS like everything else.
 */
export function AparicionScene({ scene, stage }: AparicionSceneProps) {
  const view = useViewport()
  const { level } = useMotion()
  const still = level === 'reducido'
  const size = useMemo(() => ({ w: view.width, h: view.height }), [view.width, view.height])
  const contact = useMemo(() => contactPoint(size), [size])
  const leaving = reached(stage, 'defrag')
  // The light stage (glass, finger, information) is spent by 1.8 s; only the deep glass stays through the phrase.
  const lightStage = !reached(stage, 'phrase')
  const haze = useRef<HTMLCanvasElement>(null)
  const hand = useRef<HTMLCanvasElement>(null)
  const matrix = useRef<HTMLCanvasElement>(null)
  const depth = useRef<HTMLCanvasElement>(null)
  const wet = useRef<HTMLCanvasElement>(null)
  const glass = useRef<HTMLCanvasElement>(null)
  const optics = useRef<HTMLDivElement>(null)

  // The information inside the glass, the wet of the surface and the thread of light along the plates are drawn before the first frame (a few milliseconds)…
  useLayoutEffect(() => {
    if (matrix.current && lightStage) paintMatrix(matrix.current, scene, size, contact)
    if (wet.current) paintWet(wet.current, scene, size)
    if (glass.current) paintGlass(glass.current, scene, size)
  }, [scene, size, contact, lightStage])
  // …and the finger, the light glass and the deep glass are made by a worker, off the thread that draws the frames, and come in as
  // they arrive: until each is there, the plain gradient under it shows.
  useLayoutEffect(() => {
    const jobs: TextureJob[] = [
      { kind: 'hand', scene, view: size, contact },
      { kind: 'glass', scene, view: size, contact },
      { kind: 'depth', scene, view: size, contact },
    ]
    return requestTextures(jobs, (index, px) => {
      const canvas = [hand.current, haze.current, depth.current][index]
      if (canvas) paintPixels(canvas, px)
    })
  }, [scene, size, contact])

  // How much of the optical surface is there, over the ritual: the curve of beats.ts, as one fade of its layers.
  useLayoutEffect(() => {
    const el = optics.current
    if (!el || !el.animate) return
    const curve = el.animate(
      INTENSITY_KEYS.map(([at, opacity]) => ({ offset: at / CURVE_END, opacity })),
      { duration: CURVE_END * 1000, fill: 'forwards', easing: 'linear' },
    )
    return () => curve.cancel()
  }, [])

  return (
    <m.div
      aria-hidden
      data-apa=""
      className="apa"
      style={style({ ...sceneVars(scene), '--apa-calm-from': `${CALM.from}s`, '--apa-calm-over': `${CALM.over}s`, '--apa-veil': String(1 - INTENSITY.frase / INTENSITY.aprender) })}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={leaving ? { delay: STAGE_LEAVES.after, duration: STAGE_LEAVES.duration, ease: 'easeInOut' } : { duration: 0.1 }}
      exit={{ opacity: 0, transition: { duration: SKIP_MS / 1000 } }}
    >
      {lightStage && (
        <div className="apa-light">
          <canvas ref={haze} className="apa-haze" />
          <div className="apa-frost" />
          <canvas ref={hand} className="apa-hand" />
          <canvas ref={matrix} className="apa-matrix" style={style({ transformOrigin: `${contact.x}px ${contact.y}px` })} />
        </div>
      )}

      <div className="apa-stage">
        <canvas ref={depth} className="apa-depth" />
      </div>

      {/* The same plates, edges and leaks of light above both states of the glass: the surface does not change, its state does. */}
      <div ref={optics} className="apa-optics">
        <canvas ref={glass} className="apa-glass" />
        {GLINTS.map((g) => (
          <div
            key={`${g.slab}-${g.side}-${g.y}`}
            className="apa-glint"
            style={style({ '--x': `${(SLABS[g.slab].u + (g.side === 1 ? SLABS[g.slab].w : 0)) * 100}%`, '--y': `${g.y}%`, '--s': `${g.s}px`, '--d': g.d })}
          />
        ))}
      </div>

      <SceneCanvas scene={scene} still={still} />
      <div className="apa-shared">
        <canvas ref={wet} className="apa-wet" />
        <div className="apa-veil" />
        <div className="apa-grain" />
      </div>
    </m.div>
  )
}
