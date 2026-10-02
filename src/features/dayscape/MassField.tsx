import { m, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import { massLife, massShape, seeded, type MassLayer } from './atmosphere'

export interface Pan {
  x: MotionValue<number>
  y: MotionValue<number>
}

interface MassFieldProps {
  layers: MassLayer[]
  width: number
  height: number
  reduced: boolean
  pan: Pan
  seed: number
}

/**
 * Masses of light, each on its own life (Web Animations: transform and
 * opacity only, on the compositor). A drag moves each mass by its own small
 * share, so the atmosphere never slides as one wallpaper.
 */
export function MassField({ layers, width, height, reduced, pan, seed }: MassFieldProps) {
  const sizeScale = Math.min(2.4, Math.max(1, Math.max((width / 390) * 0.6, height / 844)))
  const masses = useMemo(() => {
    const rand = seeded(seed)
    return layers.flatMap((layer) =>
      Array.from({ length: layer.count }, (_, i) => ({
        key: `${layer.kind}-${i}`,
        layer,
        ...massShape(layer, rand, sizeScale),
        seed: 1 + Math.floor(rand() * 1e6),
      })),
    )
  }, [layers, seed, sizeScale])
  return (
    <>
      {masses.map(({ key, ...mass }) => (
        <Mass key={key} {...mass} frameWidth={width} frameHeight={height} reduced={reduced} pan={pan} />
      ))}
    </>
  )
}

interface MassProps {
  layer: MassLayer
  width: number
  height: number
  drag: number
  seed: number
  frameWidth: number
  frameHeight: number
  reduced: boolean
  pan: Pan
}

function Mass({ layer, width, height, drag, seed, frameWidth, frameHeight, reduced, pan }: MassProps) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useTransform(() => pan.x.get() * drag)
  const y = useTransform(() => pan.y.get() * drag)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    const rand = seeded(seed)
    let anim: Animation | undefined
    let timer = 0
    let first = true
    // Born, drifts, expands, loses definition, gone — and born again elsewhere.
    const live = () => {
      const life = massLife(layer, frameWidth, frameHeight, rand, reduced)
      anim = el.animate(
        life.keyframes.map((k) => ({ ...k, easing: 'ease-in-out' })),
        { duration: life.duration * 1000, fill: 'both' },
      )
      if (first) {
        // Already mid-life when the field opens: never a synchronized start.
        anim.currentTime = rand() * life.duration * 900
        first = false
      }
      anim.onfinish = () => {
        timer = window.setTimeout(live, rand() * 1400)
      }
    }
    live()
    return () => {
      window.clearTimeout(timer)
      anim?.cancel()
    }
  }, [layer, seed, frameWidth, frameHeight, reduced])

  return (
    <m.div className="ds-mass-wrap" style={{ x, y }}>
      <div ref={ref} className={`ds-mass ds-mass-${layer.kind}`} style={{ width, height }} />
    </m.div>
  )
}
