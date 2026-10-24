import { m } from 'framer-motion'
import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useViewport } from '../../../hooks/useViewport'
import { useMotion } from '../../../motion/MotionLevel'
import { sceneVars, type SceneColors } from '../atmosphere/themes'
import { SKIP_MS, reached, type RitualStage } from '../domain/ritual'
import './aparicion.css'
import { SUNSET_ASSETS as ASSET } from './assets'
import { CALM, INTENSITY, INTENSITY_KEYS, STAGE_LEAVES } from './beats'
import { B_ON_A, assetFrame, contactPoint } from './geometry'
import { slabsIn } from './optics'
import { SceneCanvas } from './SceneCanvas'
import { paintGlass, paintMatrix, paintWet } from './textures'

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
  const frame = useMemo(() => assetFrame(size, contact), [size, contact])
  const slabs = useMemo(() => slabsIn(size), [size])
  const box = (w: number, h: number, ox = 0, oy = 0): CSSProperties => ({ left: frame.x + ox * frame.s, top: frame.y + oy * frame.s, width: w * frame.s, height: h * frame.s })
  const leaving = reached(stage, 'defrag')
  // The light stage (glass, finger, information) is spent by 1.8 s; only the deep glass stays through the phrase.
  const lightStage = !reached(stage, 'phrase')
  const matrix = useRef<HTMLCanvasElement>(null)
  const wet = useRef<HTMLCanvasElement>(null)
  const glass = useRef<HTMLCanvasElement>(null)
  const optics = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // One clock for the whole scene: the CSS beats (B at BEATS.contact, A1's ice and A2 from BEATS.reorganize, the light stage leaving) and the
  // curve of intensity start from the instant the canvas starts counting the contact, the wave and the fragments — not from whenever the first
  // frame happens to be painted (a slow first frame used to put B and A2 ~0.3 s behind the contact).
  const anchor = useCallback((t0: number) => {
    const el = root.current
    if (!el || !el.getAnimations) return
    for (const a of el.getAnimations({ subtree: true })) a.startTime = t0
    el.dataset.clock = String(t0)
  }, [])

  // The information inside the glass, the wet of the surface and the thread of light along the plates are drawn before the first frame (a few milliseconds)…
  useLayoutEffect(() => {
    if (matrix.current && lightStage) paintMatrix(matrix.current, scene, size, contact)
    if (wet.current) paintWet(wet.current, scene, size)
    if (glass.current) paintGlass(glass.current, scene, size)
  }, [scene, size, contact, lightStage])
  // The finger, the light glass and the deep glass are the frozen assets (assets.ts), decoded before the scene is mounted: nothing to wait for here.

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
      ref={root}
      aria-hidden
      data-apa=""
      className="apa"
      data-leaving={leaving || undefined}
      style={style({ ...sceneVars(scene), '--apa-calm-from': `${CALM.from}s`, '--apa-calm-over': `${CALM.over}s`, '--apa-veil': String(1 - INTENSITY.frase / INTENSITY.aprender) })}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={leaving ? { delay: STAGE_LEAVES.after, duration: STAGE_LEAVES.duration, ease: 'easeInOut' } : { duration: 0.1 }}
      exit={{ opacity: 0, transition: { duration: SKIP_MS / 1000 } }}
    >
      {lightStage && (
        <div className="apa-light">
          <img alt="" src={ASSET.a1} className="apa-asset apa-a1" style={box(880, 1904)} />
          <div className="apa-frost" />
          <div className="apa-b">
            <img alt="" src={ASSET.b} className="apa-asset" style={box(1024, 768, B_ON_A.x, B_ON_A.y)} />
          </div>
          <canvas ref={matrix} className="apa-matrix" style={style({ transformOrigin: `${contact.x}px ${contact.y}px` })} />
        </div>
      )}

      <div className="apa-stage">
        <img alt="" src={ASSET.a2} className="apa-asset apa-a2" style={box(880, 1904)} />
      </div>

      {/* The same plates, edges and leaks of light above both states of the glass: the surface does not change, its state does. */}
      <div ref={optics} className="apa-optics">
        <img alt="" src={ASSET.c1} className="apa-asset apa-c1" style={box(880, 1904)} />
        <img alt="" src={ASSET.c2} className="apa-asset apa-c2" style={box(880, 1904)} />
        <canvas ref={glass} className="apa-glass" />
        {GLINTS.map((g) => (
          <div
            key={`${g.slab}-${g.side}-${g.y}`}
            className="apa-glint"
            style={style({ '--x': `${(slabs[g.slab].u + (g.side === 1 ? slabs[g.slab].w : 0)) * 100}%`, '--y': `${g.y}%`, '--s': `${g.s}px`, '--d': g.d })}
          />
        ))}
      </div>

      <SceneCanvas scene={scene} still={still} onClock={anchor} />
      <div className="apa-shared">
        <canvas ref={wet} className="apa-wet" />
        <div className="apa-veil" />
        <div className="apa-grain" />
      </div>
    </m.div>
  )
}
