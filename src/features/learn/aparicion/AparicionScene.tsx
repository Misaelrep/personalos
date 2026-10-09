import { m } from 'framer-motion'
import type { CSSProperties } from 'react'
import { useViewport } from '../../../hooks/useViewport'
import { useMotion } from '../../../motion/MotionLevel'
import { sceneVars, type SceneColors } from '../atmosphere/themes'
import { SKIP_MS, reached, type RitualStage } from '../domain/ritual'
import './aparicion.css'
import { STAGE_LEAVES } from './beats'
import { contactPoint } from './geometry'
import { SceneCanvas } from './SceneCanvas'

interface AparicionSceneProps {
  scene: SceneColors
  stage: RitualStage
}

const COLUMNS = [
  { x: '5%', w: '9vw', o: '46%' },
  { x: '23%', w: '13vw', o: '38%' },
  { x: '42%', w: '6vw', o: '56%' },
  { x: '59%', w: '11vw', o: '30%' },
  { x: '83%', w: '8vw', o: '42%' },
]
const PILLARS = [
  { x: '73%', w: '10vw', o: '24%' },
  { x: '32%', w: '5vw', o: '14%' },
]
const SLITS = ['31%', '52%', '88%']
/** Glints on the water: where (across, and how far below the horizon), and when each one twinkles. */
const GLINTS = [
  { x: '58%', y: '4vh', d: '0s' },
  { x: '64%', y: '9vh', d: '0.9s' },
  { x: '52%', y: '13vh', d: '1.7s' },
  { x: '70%', y: '16vh', d: '0.4s' },
  { x: '46%', y: '6vh', d: '2.2s' },
  { x: '61%', y: '20vh', d: '1.2s' },
  { x: '76%', y: '7vh', d: '2.8s' },
]

const style = (vars: Record<string, string>) => vars as CSSProperties

/**
 * APARICIÓN: the glass, a finger, the fragments — and then the sky where the
 * structure holds. The glass is one still layer; everything that moves in it is on one canvas. It lives behind the ritual's words and leaves before the
 * question arrives; a tap takes it away in SKIP_MS like everything else.
 */
export function AparicionScene({ scene, stage }: AparicionSceneProps) {
  const view = useViewport()
  const { level } = useMotion()
  const still = level === 'reducido'
  const contact = contactPoint({ w: view.width, h: view.height })
  const leaving = reached(stage, 'defrag')
  // The light stage (glass, finger, fragments) is spent by 1.8 s; only the sky stays through the phrase.
  const lightStage = !reached(stage, 'phrase')

  return (
    <m.div
      aria-hidden
      data-apa=""
      className="apa"
      style={style({ ...sceneVars(scene), '--apa-cx': `${contact.x}px`, '--apa-cy': `${contact.y}px` })}
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={leaving ? { delay: STAGE_LEAVES.after, duration: STAGE_LEAVES.duration, ease: 'easeInOut' } : { duration: 0.22 }}
      exit={{ opacity: 0, transition: { duration: SKIP_MS / 1000 } }}
    >
      <div className="apa-stage">
        <div className="apa-sun" />
        <div className="apa-rays" />
        <div className="apa-streak" />
        <div className="apa-ghost" style={style({ '--dx': '-13vmin', '--dy': '1.5vmin', '--hue': 'var(--apa-cyan)' })} />
        <div className="apa-ghost" style={style({ '--dx': '17vmin', '--dy': '-1vmin', '--hue': 'var(--apa-vermilion)' })} />
        <div className="apa-horizon" />
        <div className="apa-reflect" />
        {GLINTS.map((g) => (
          <div key={g.x + g.y} className="apa-glint" style={style({ '--x': g.x, '--y': g.y, '--d': g.d })} />
        ))}
        <div className="apa-grain" />
      </div>

      {lightStage && (
        <div className="apa-light">
          <div className="apa-glass" />
          {COLUMNS.map((c) => (
            <div key={c.x} className="apa-col" style={style({ '--x': c.x, '--w': c.w, '--o': c.o })} />
          ))}
          {PILLARS.map((p) => (
            <div key={p.x} className="apa-pillar" style={style({ '--x': p.x, '--w': p.w, '--o': p.o })} />
          ))}
          {SLITS.map((x) => (
            <div key={x} className="apa-slit" style={style({ '--x': x })} />
          ))}
          <div className="apa-floor" />
          <SceneCanvas scene={scene} still={still} />
          <div className="apa-grain" />
        </div>
      )}
    </m.div>
  )
}
