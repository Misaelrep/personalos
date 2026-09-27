import { m, useMotionValue, useTransform, animate } from 'framer-motion'
import { memo, useEffect, useId, useMemo } from 'react'
import type { DayPart } from '../../domain/week'
import { EASE } from '../../motion/tokens'
import { extrudedPath, lensOutline, smoothPath, type LensForm } from './geometry'

/**
 * One day as a lens of molded optical glass. Everything is in the glass: the
 * edge seen under its face (thickness), how frosted it is, the matter
 * suspended inside, an optical ring, a thin luminous rim and a specular
 * reflection. No card, no pill, no button shape.
 *
 *   rest       seen at three quarters, its matter one mixed mass
 *   selected   turned to face us, a little flatter; the matter organizes into
 *              mañana · tarde · noche — densities of light, never bands
 *   opening    the shell loses cohesion; the matter is handed to the space
 */
export type LensMode = 'rest' | 'selected' | 'receded' | 'opening'

/** Centers of the three regions of matter when the day faces us (fraction of the height). */
export const PART_Y: Record<DayPart, number> = { manana: -0.085, tarde: 0.075, noche: 0.235 }

/** Frontal height / width of a selected lens: a fuller, calmer face to hold the day. */
export const SELECTED_ASPECT = 1.06

/** Aurora Pearl, desaturated. Mañana warm, tarde mauve, noche a cooler lavender. */
const FOG: Record<DayPart | 'depth', [string, string]> = {
  manana: ['rgba(228, 190, 170, 0.95)', 'rgba(241, 213, 195, 0.5)'],
  tarde: ['rgba(182, 164, 196, 0.95)', 'rgba(199, 184, 206, 0.5)'],
  noche: ['rgba(170, 164, 204, 0.92)', 'rgba(216, 208, 231, 0.5)'],
  depth: ['rgba(150, 140, 184, 0.9)', 'rgba(199, 184, 206, 0.35)'],
}

/** A day already lived: the same matter, a touch more silver. */
const FOG_PAST: typeof FOG = {
  manana: ['rgba(214, 198, 192, 0.95)', 'rgba(228, 220, 214, 0.5)'],
  tarde: ['rgba(184, 178, 196, 0.95)', 'rgba(205, 201, 212, 0.5)'],
  noche: ['rgba(178, 178, 200, 0.92)', 'rgba(214, 214, 226, 0.5)'],
  depth: ['rgba(160, 158, 182, 0.9)', 'rgba(204, 200, 212, 0.35)'],
}

/** Where each part's matter floats while the day is at rest: one mixed mass, morning to night. */
const REST: Record<DayPart, { x: number; y: number; rx: number; ry: number }> = {
  manana: { x: -0.2, y: 0.06, rx: 0.36, ry: 0.44 },
  tarde: { x: 0.03, y: 0.12, rx: 0.38, ry: 0.46 },
  noche: { x: 0.22, y: 0.02, rx: 0.33, ry: 0.42 },
}

interface LensProps {
  form: LensForm
  /** Frontal width, px. */
  width: number
  mode: LensMode
  /** Scale the lens is shown at (hairlines stay hairlines). */
  zoom: number
  today: boolean
  reduced: boolean
}

export const Lens = memo(function Lens({ form, width, mode, zoom, today, reduced }: LensProps) {
  const uid = useId().replace(/[:«»]/g, '')
  const W = width * form.widthK
  const H = W * form.aspect
  const face = useMemo(() => lensOutline(W, H, form.exponent, form.asym, form.seed), [W, H, form.exponent, form.asym, form.seed])
  const facePath = useMemo(() => smoothPath(face), [face])
  const ring = useMemo(() => smoothPath(lensOutline(W * 0.8, H * 0.78, form.exponent, form.asym * 0.5, form.seed + 3)), [W, H, form])
  const ringLow = useMemo(() => smoothPath(lensOutline(W * 0.86, H * 0.82, form.exponent, form.asym * 0.4, form.seed + 5)), [W, H, form])
  const spec = useMemo(() => specular(face), [face])
  const caustic = useMemo(() => lowerRim(face, 0.93), [face])
  const bevel = useMemo(() => lowerRim(face, 0.995, 0, 0.12, 0.38), [face])
  const inner = useMemo(() => smoothPath(face.map(([x, y]) => [x * 0.965, y * 0.955] as [number, number])), [face])

  const facing = mode === 'selected' || mode === 'opening'
  const fog = form.tense === 'past' ? FOG_PAST : FOG
  const T = W * form.thickness
  // The edge under the face: it thins as the lens turns to face us.
  const thick = useMotionValue(T)
  useEffect(() => {
    const c = animate(thick, facing ? T * 0.14 : T, { duration: reduced ? 0 : 0.7, ease: EASE })
    return () => c.stop()
  }, [facing, T, thick, reduced])
  const wall = useTransform(thick, (t) => extrudedPath(face, t))
  const wallLow = useTransform(thick, (t) => lowerRim(face, 1, t))
  const shadowY = useTransform(thick, (t) => H / 2 + t + H * 0.02)

  const k = 1 / Math.max(zoom, 0.01)
  const pad = 14
  const box = { x: -W / 2 - pad, y: -H / 2 - pad, w: W + pad * 2, h: H + pad * 2 + T + H * 0.12 }
  const shell = mode === 'opening' ? 0 : 1
  const shellT = { duration: mode === 'opening' ? 0.75 : 0.5, ease: EASE }
  const organize = { duration: reduced ? 0 : 0.62, ease: EASE, delay: reduced ? 0 : mode === 'selected' ? 0.24 : 0 }
  // Selected, the face turns frontal and a little fuller.
  const lean = facing ? 6 : form.lean
  const stretch = facing ? SELECTED_ASPECT / form.aspect : 1

  return (
    <m.div
      className="sm-glass"
      data-tense={form.tense}
      data-today={today || undefined}
      style={{ width: box.w, height: box.h, marginLeft: -box.w / 2, marginTop: -(H / 2 + pad), transformPerspective: 900, originY: `${((H / 2 + pad) / box.h) * 100}%` }}
      initial={false}
      animate={{ rotateX: lean, rotate: facing ? 0 : form.tilt, scaleY: stretch }}
      transition={{ duration: reduced ? 0 : 0.7, ease: EASE }}
    >
      <svg aria-hidden width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="overflow-visible">
        <defs>
          <clipPath id={`${uid}-face`}>
            <path d={facePath} />
          </clipPath>
          {/* Clear at the heart, brighter and more frosted toward the rim (Fresnel). */}
          <radialGradient id={`${uid}-body`} cx="44%" cy="36%" r="66%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.1 + form.frost * 0.4} />
            <stop offset="0.58" stopColor="#F4F0F6" stopOpacity={0.04 + form.frost * 0.5} />
            <stop offset="0.86" stopColor="#DCD5E6" stopOpacity={0.14 + form.frost * 0.45} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.55 + form.frost * 0.3} />
          </radialGradient>
          {/* The volume of a convex lens: light above, a cool lavender shade low on the far side. */}
          <radialGradient id={`${uid}-shade`} cx="64%" cy="78%" r="58%">
            <stop offset="0" stopColor="#9E94BA" stopOpacity={0.14 + form.load * 0.16} />
            <stop offset="1" stopColor="#9E94BA" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <stop offset="0.6" stopColor="#D2C7DC" stopOpacity={0.3 + form.load * 0.3} />
            <stop offset="1" stopColor="#A89FC2" stopOpacity={0.35 + form.load * 0.4} />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="0.38" stopColor="#FFFFFF" stopOpacity={0.55} />
            <stop offset="0.7" stopColor={today ? '#A9BBD6' : '#C3B6D0'} stopOpacity={today ? 0.95 : 0.75} />
            <stop offset="1" stopColor="#8F8AAE" stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id={`${uid}-inner`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#172034" stopOpacity={0} />
            <stop offset="0.55" stopColor="#172034" stopOpacity={0.02} />
            <stop offset="1" stopColor="#172034" stopOpacity={0.1 + form.load * 0.08} />
          </linearGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#8E86A8" stopOpacity={0.08 + form.load * 0.1} />
            <stop offset="1" stopColor="#8E86A8" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-spec`} x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
            <stop offset="0.35" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.15} />
          </linearGradient>
          {(['manana', 'tarde', 'noche', 'depth'] as const).map((p) => (
            <radialGradient key={p} id={`${uid}-fog-${p}`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={fog[p][0]} />
              <stop offset="0.45" stopColor={fog[p][1]} />
              <stop offset="1" stopColor={fog[p][1]} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Glass body: a faint caustic shadow, the molded edge, the face. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.ellipse cx={0} cy={shadowY} rx={W * 0.42} ry={H * 0.09} fill={`url(#${uid}-shadow)`} />
          <m.path d={wall} fill={`url(#${uid}-wall)`} />
          <m.path d={wallLow} fill="none" stroke="rgba(23, 32, 52, 0.14)" strokeWidth={0.6 * k} />
          <path d={facePath} fill={`url(#${uid}-body)`} />
        </m.g>

        {/* Suspended matter. At rest one mixed mass; facing us, three regions of light. */}
        <g clipPath={`url(#${uid}-face)`} className="sm-fog">
          {form.depth > 0 && (
            <m.ellipse
              fill={`url(#${uid}-fog-depth)`}
              initial={false}
              animate={{ cx: 0, cy: facing ? H * 0.08 : H * 0.08, rx: W * 0.5, ry: facing ? H * 0.32 : H * 0.3, opacity: mode === 'opening' ? 0 : form.depth * (facing ? 0.2 : 0.7) }}
              transition={organize}
            />
          )}
          {form.layers.map((l, i) => {
            const rest = REST[l.part]
            const amount = form.fog * (0.45 + 0.55 * l.matter)
            const target = facing
              ? { cx: W * (i - 1) * 0.015, cy: H * PART_Y[l.part], rx: W * 0.42, ry: H * 0.105, opacity: mode === 'opening' ? 0 : 0.12 + 0.88 * l.matter }
              : { cx: W * rest.x, cy: H * rest.y, rx: W * rest.rx * (0.85 + 0.35 * l.matter), ry: H * rest.ry, opacity: amount }
            return <m.ellipse key={l.part} fill={`url(#${uid}-fog-${l.part})`} initial={false} animate={target} transition={organize} />
          })}
        </g>

        {/* Optics: volume, the refraction ring, the luminous rim, the specular reflection. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <path d={facePath} fill={`url(#${uid}-shade)`} />
          <g className="sm-ring" style={{ opacity: form.ring }}>
            <path d={ring} transform={`translate(0 ${-H * 0.035})`} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={0.75 * k} />
            <path d={ringLow} transform={`translate(0 ${H * 0.02})`} fill="none" stroke="#A89CBF" strokeOpacity={0.38} strokeWidth={0.55 * k} />
          </g>
          <path d={inner} fill="none" stroke={`url(#${uid}-inner)`} strokeWidth={2.2 * k} />
          <path d={caustic} fill="none" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.2 * k} strokeLinecap="round" />
          <path d={bevel} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.4 * k} strokeLinecap="round" />
          <path className="sm-edge" d={facePath} fill="none" stroke={`url(#${uid}-edge)`} strokeWidth={(today ? 1.3 : 1) * k} />
          <path className="sm-spec" d={spec} fill={`url(#${uid}-spec)`} />
          <ellipse className="sm-spec-dot" style={facing ? { opacity: 0 } : undefined} cx={W * 0.25} cy={H * 0.25} rx={W * 0.05} ry={H * 0.028} transform={`rotate(-18 ${W * 0.25} ${H * 0.25})`} fill="#FFFFFF" />
        </m.g>
      </svg>
    </m.div>
  )
})

/** A crescent of light hugging the upper-left rim. */
function specular(face: [number, number][]): string {
  const n = face.length
  const from = Math.round(n * 0.56)
  const to = Math.round(n * 0.78)
  const outer: [number, number][] = []
  const inner: [number, number][] = []
  for (let i = from; i <= to; i++) {
    const u = (i - from) / (to - from)
    const [x, y] = face[i % n]
    outer.push([x * 0.88, y * 0.84])
    const s = 0.88 - 0.13 * Math.sin(Math.PI * u)
    inner.push([x * s, y * (s - 0.05)])
  }
  const pts = [...outer, ...inner.reverse()]
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`
}

/** An arc of the lower rim (scaled by `s`, moved down by `dy`): light gathered in the glass, or its silhouette. */
function lowerRim(face: [number, number][], s: number, dy = 0, from = 0.08, to = 0.42): string {
  const n = face.length
  const pts = face.slice(Math.round(n * from), Math.round(n * to)).map(([x, y]) => [x * s, y * s + dy] as [number, number])
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}`
}
