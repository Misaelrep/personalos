/**
 * DAYSCAPE atmosphere — independent masses of light, never a gradient that
 * slides. Each mass lives its own short life: it appears, drifts slowly,
 * expands, loses definition and disappears, then is born again somewhere
 * else. Lives last 9–24 s and are never in step, so the ground is visibly
 * alive within a few seconds and never repeats.
 *
 * Pure: it only describes lives (keyframes); the component plays them.
 */
export type MassKind = 'pearl' | 'mist' | 'ice' | 'violet' | 'front'

export interface MassLayer {
  kind: MassKind
  count: number
  /** Width range (px on the design phone) and height / width ratio. */
  size: [number, number]
  ratio: number
  /** Seconds a life lasts. */
  life: [number, number]
  /** Peak opacity range. */
  peak: [number, number]
  /** Distance travelled in one life (px). */
  travel: [number, number]
  /** Share of a drag it follows (2–10 %). */
  drag: [number, number]
}

export const LAYERS: MassLayer[] = [
  { kind: 'pearl', count: 3, size: [380, 540], ratio: 0.8, life: [16, 24], peak: [0.75, 1], travel: [70, 130], drag: [0.06, 0.1] },
  { kind: 'mist', count: 3, size: [420, 560], ratio: 0.5, life: [13, 20], peak: [0.55, 0.9], travel: [60, 120], drag: [0.04, 0.07] },
  { kind: 'ice', count: 2, size: [210, 300], ratio: 0.85, life: [9, 14], peak: [0.6, 0.95], travel: [50, 100], drag: [0.07, 0.1] },
  { kind: 'violet', count: 2, size: [280, 360], ratio: 0.75, life: [11, 17], peak: [0.5, 0.9], travel: [40, 90], drag: [0.02, 0.04] },
]

/** A thin veil of mist that passes in front of the far plane. */
export const FRONT: MassLayer = { kind: 'front', count: 2, size: [300, 420], ratio: 0.45, life: [14, 20], peak: [0.5, 0.8], travel: [60, 110], drag: [0.05, 0.08] }

export interface Keyframe {
  transform: string
  opacity: number
  offset: number
}

export interface MassLife {
  /** Seconds. */
  duration: number
  keyframes: Keyframe[]
}

const between = (r: [number, number], u: number) => r[0] + (r[1] - r[0]) * u

/**
 * One life of a mass inside a frame of `width` × `height` px: born small and
 * faint, full at a third of its life, then larger, softer and gone.
 * Reduced motion keeps only the slow change of opacity, in place.
 */
export function massLife(layer: MassLayer, width: number, height: number, rand: () => number, reduced: boolean): MassLife {
  const duration = between(layer.life, rand())
  const peak = between(layer.peak, rand())
  const x0 = -0.15 * width + rand() * 1.3 * width
  const y0 = -0.1 * height + rand() * 1.2 * height
  const heading = rand() * Math.PI * 2
  const travel = reduced ? 0 : between(layer.travel, rand())
  const at = (k: number) => [x0 + Math.cos(heading) * travel * k, y0 + Math.sin(heading) * travel * k * 0.8]
  const turn = (rand() - 0.5) * 30
  const frame = (k: number, scale: number, opacity: number): Keyframe => {
    const [x, y] = at(k)
    const s = reduced ? 1 : scale
    const r = reduced ? 0 : turn * k
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`, opacity, offset: 0 }
  }
  const keyframes = [
    { ...frame(0, 0.78, 0), offset: 0 },
    { ...frame(0.3, 1, peak), offset: 0.3 },
    { ...frame(0.62, 1.14, peak * 0.78), offset: 0.62 },
    { ...frame(1, 1.32, 0), offset: 1 },
  ]
  return { duration, keyframes }
}

/** Width, height (px) of a mass, and how much of a drag it follows. */
export function massShape(layer: MassLayer, rand: () => number, sizeScale: number) {
  const width = between(layer.size, rand()) * sizeScale
  return { width, height: width * (layer.ratio + rand() * 0.2), drag: between(layer.drag, rand()) }
}

export function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}
