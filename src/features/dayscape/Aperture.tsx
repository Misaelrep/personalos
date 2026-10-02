import { m, motionValue, useTransform, type MotionValue } from 'framer-motion'
import { memo, type CSSProperties, type ReactNode } from 'react'
import { formatClock } from '../../domain/time'
import { NAME, NAME_S } from './choreography'
import { SHAPES, between, pathOf, type FormId } from './forms'
import { NAME_STYLE, rangeText, type Placed } from './layout'
import type { Pan } from './MassField'
import type { Activity } from './model'
import type { MorphRec } from './morph'

/**
 * One activity of DAYSCAPE: an Aperture (one of the five configurations of the
 * same matter), its Astral Fade, its modular core and, while the day forms,
 * its temporary name. Position, size, presence and softness live in motion
 * values, so drag, inspection and the exit never re-render React.
 */
export interface ApertureMotion {
  /** Offset from home (inspection). */
  dx: MotionValue<number>
  dy: MotionValue<number>
  /** Radius multiplier. */
  grow: MotionValue<number>
  opacity: MotionValue<number>
  blur: MotionValue<number>
  /** 0 → 1 while it forms. */
  reveal: MotionValue<number>
  /** 0 → 1 while it is inspected: it recovers matter. */
  focus: MotionValue<number>
  /** 0 → 1 as it lets go of its form (exit). */
  release: MotionValue<number>
}

export function makeMotion(p: Placed, revealed: boolean): ApertureMotion {
  return {
    dx: motionValue(0),
    dy: motionValue(0),
    grow: motionValue(1),
    opacity: motionValue(p.opacity),
    blur: motionValue(p.blur),
    reveal: motionValue(revealed ? 1 : 0),
    focus: motionValue(0),
    release: motionValue(0),
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Dash geometry of a fragment as its form erodes (pathLength units). */
function erosion(form: FormId, e: number) {
  switch (form) {
    case 'cardinal':
    case 'dissolving':
      return { length: 1 - e, offset: e / 2, spacing: 1, stroke: 1 - smooth(0.85, 1, e), fill: 1 }
    case 'axis':
      return { length: 1 - e, offset: e, spacing: 1, stroke: 1 - smooth(0.85, 1, e), fill: 1 }
    case 'orbit': {
      const k = smooth(0, 0.45, e)
      return { length: 1 - 0.84 * k, offset: 0, spacing: 0.12, stroke: 1 - smooth(0.45, 1, e), fill: 1 }
    }
    case 'prism':
      return { length: 1, offset: 0, spacing: 1, stroke: 1 - smooth(0, 0.35, e), fill: 1 - smooth(0.3, 0.95, e) }
  }
}

/**
 * Matter by time: the past is eroded (silver, broken), the future still
 * forming (incomplete), the present whole. Inspected, it recovers some matter.
 */
export function matterOf(a: Pick<Activity, 'side' | 'f'>, form: FormId, focus: number) {
  if (a.side === 'past') return erosion(form, (0.22 + 0.55 * a.f) * (1 - focus) + (0.12 + 0.3 * a.f) * focus)
  const length = a.side === 'future' ? (0.72 - 0.25 * a.f) * (1 - focus) + 0.88 * focus : 1
  return { length, offset: 0, spacing: 1, stroke: 1, fill: 1 }
}

/** Visible part of each fragment ([start, end] along it), for its breakup. */
export function visibleRange(a: Pick<Activity, 'side' | 'f'>, form: FormId): [number, number] {
  const d = matterOf(a, form, 0)
  if (d.spacing < 1) return [0, 1]
  const start = d.offset
  return [start, Math.min(1, start + d.length)]
}

const COLOR = { past: 'var(--ds-past)', future: 'var(--ds-future)', current: 'var(--ds-now-line)' } as const

interface FragmentProps {
  p: Placed
  rec: MorphRec
  mo: ApertureMotion
  i: number
  reduced: boolean
}

function Fragment({ p, rec, mo, i, reduced }: FragmentProps) {
  const { a } = p
  const now = a.side === 'current'
  const space = a.role === 'space'
  const frag = () => between(rec.from[i], SHAPES[rec.to][i], rec.progress.get())
  const d = useTransform(() => pathOf(frag(), 0, 0, p.R * mo.grow.get() * (space ? 0.9 : 1)))
  const dash = useTransform(() => {
    // Mid-morph, the matter of the old configuration blends into the new one.
    const t = rec.progress.get()
    const to = matterOf(a, rec.to, mo.focus.get())
    if (t >= 1 || rec.fromForm === rec.to) return to
    const from = matterOf(a, rec.fromForm, mo.focus.get())
    const mix = (k: keyof typeof to) => from[k] + (to[k] - from[k]) * t
    return { length: mix('length'), offset: mix('offset'), spacing: mix('spacing'), stroke: mix('stroke'), fill: mix('fill') }
  })
  const draw = useTransform(() => (reduced ? 1 : smooth(0.1, 0.8, mo.reveal.get())))
  const pathLength = useTransform(() => dash.get().length * draw.get())
  const pathOffset = useTransform(() => dash.get().offset)
  const pathSpacing = useTransform(() => dash.get().spacing)
  const strokeOpacity = useTransform(() => {
    const f = frag()
    // AHORA: the most material form of the field — sharper and more contrasted, never louder.
    const gain = now ? 1.35 : space ? 0.55 : a.side === 'future' ? 0.78 : 1
    return Math.min(now ? 0.98 : 0.95, f.stroke * 1.45 * gain) * dash.get().stroke * (reduced ? 1 : smooth(0.02, 0.1, mo.reveal.get()))
  })
  const fillOpacity = useTransform(() => {
    const f = frag()
    const gain = now ? 1.6 : a.side === 'future' ? 1.7 : 1
    return f.fill * 1.8 * gain * dash.get().fill * (reduced ? 1 : smooth(0.5, 1, mo.reveal.get()))
  })
  const strokeWidth = useTransform(() => (now ? 1.6 : p.R * mo.grow.get() > 16 ? 1.35 : 1.15) * frag().width)
  return (
    <m.path
      d={d}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: COLOR[a.side], fill: 'var(--ds-facet)', strokeOpacity, fillOpacity, strokeWidth, pathLength, pathOffset, pathSpacing }}
    />
  )
}

/** Real stored state on the core, without symbols: solid, half, open or hollow. */
function Core({ a, r, color }: { a: Activity; r: number; color: string }) {
  const stroke: CSSProperties = { stroke: color, fill: 'none' }
  const width = Math.max(0.7, r * 0.35)
  if (a.role === 'endpoint')
    return (
      <>
        <circle r={r * 1.4} strokeWidth={0.9} style={stroke} />
        <circle r={r * 0.5} style={{ fill: color }} />
      </>
    )
  switch (a.execution) {
    case 'completed':
      return <circle r={r} style={{ fill: color, fillOpacity: 0.85 }} />
    case 'partial':
      return (
        <>
          <circle r={r} strokeWidth={width} style={stroke} />
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} style={{ fill: color, fillOpacity: 0.85 }} />
        </>
      )
    case 'skipped': {
      const a0 = -20 * (Math.PI / 180)
      const a1 = 250 * (Math.PI / 180)
      const d = `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 1 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`
      return <path d={d} strokeWidth={width} strokeLinecap="round" style={stroke} />
    }
    default:
      return <circle r={r} strokeWidth={width} style={stroke} />
  }
}

const SATELLITES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const

/** Module geometry: 3 × 3 points, pitch 6 at scale 1 (as HOY's AHORA marker). */
export const MODULE_SCALE = 1.6

/**
 * AHORA's modular core: core + four satellites. Leaving, the satellites move
 * out to the edges of the module and the core takes AHORA's color.
 */
function NowCore({ c0, module, pulse }: { c0: number; module: MotionValue<number>; pulse: boolean }) {
  const S = MODULE_SCALE
  const pitch = 6 * S
  const dist = useTransform(() => c0 + 2.6 + (pitch - c0 - 2.6) * module.get())
  const satR = useTransform(() => 0.9 + (1.25 * S - 0.9) * module.get())
  const coreR = useTransform(() => c0 + (2.2 * S - c0) * module.get())
  const before = useTransform(() => 1 - smooth(0.35, 0.7, module.get()))
  const after = useTransform(() => smooth(0.35, 0.7, module.get()))
  const satBefore = useTransform(() => 0.68 * before.get())
  const satAfter = useTransform(() => 0.6 * after.get())
  return (
    <g>
      {pulse && <circle className="matrix-pulse" r={c0} style={{ fill: 'var(--ds-now-core)', animationDuration: '3.4s' }} />}
      {SATELLITES.map(([sx, sy], i) => (
        <Satellite key={i} sx={sx} sy={sy} dist={dist} r={satR} before={satBefore} after={satAfter} />
      ))}
      <m.circle r={coreR} style={{ fill: 'var(--ds-now-core)', opacity: before }} />
      <m.circle r={coreR} style={{ fill: 'var(--ds-now)', opacity: after }} />
    </g>
  )
}

function Satellite({ sx, sy, dist, r, before, after }: { sx: number; sy: number; dist: MotionValue<number>; r: MotionValue<number>; before: MotionValue<number>; after: MotionValue<number> }) {
  const cx = useTransform(() => sx * dist.get())
  const cy = useTransform(() => sy * dist.get())
  return (
    <>
      <m.circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--ds-now-core)', opacity: before }} />
      <m.circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--ink-3)', opacity: after }} />
    </>
  )
}

/** A temporary name: its own place, depth and moment; it dissolves where it is. */
function TempName({ p, delay, speed }: { p: Placed; delay: number; speed: number }) {
  const spot = p.name
  if (!spot) return null
  const st = NAME_STYLE[p.a.plane]
  // Names of the rest of the day: present, lighter than AHORA's.
  const tone = { fg: ['var(--ink-2)', 'var(--ink-3)'], mid: ['var(--ink-3)', 'var(--ink-4)'], bg: ['var(--ink-4)', 'var(--ink-4)'] }[p.a.plane]
  const weight = p.a.plane === 'fg' ? 450 : 400
  const life = `${NAME_S * speed}s`
  const vars = { '--life': life, '--b': `${st.blur}px`, '--ls': `${st.spacing}em` } as CSSProperties
  return (
    <div
      aria-hidden
      className="ds-name"
      style={{ ...vars, left: spot.dx, top: spot.dy, width: spot.w, textAlign: spot.align }}
    >
      <span
        className="ds-name-label"
        style={{ fontSize: st.size, fontWeight: weight, letterSpacing: `${st.spacing}em`, color: tone[0], animationDelay: `${delay * speed}s` }}
      >
        {p.a.label}
      </span>
      <span
        className="ds-name-time"
        style={{ fontSize: st.size - 0.5, color: tone[1], animationDelay: `${(delay + NAME.timeLag) * speed}s` }}
      >
        {rangeText(p.a, formatClock)}
      </span>
    </div>
  )
}

interface ApertureProps {
  p: Placed
  rec: MorphRec
  mo: ApertureMotion
  pan: Pan
  /** Share of a drag this plane follows. */
  parallax: number
  z: MotionValue<number> | number
  /** Largest radius it may take (inspection), to size its drawing. */
  maxR: number
  reduced: boolean
  /** Ambient life: drift and the past letting go of matter. */
  alive: boolean
  /** Seconds (from the start of DAYSCAPE) its temporary name appears; null: no name. */
  nameDelay: number | null
  speed: number
  /** AHORA only: its module (0 → 1) and its permanent name. */
  module?: MotionValue<number>
  children?: ReactNode
}

export const Aperture = memo(function Aperture({ p, rec, mo, pan, parallax, z, maxR, reduced, alive, nameDelay, speed, module, children }: ApertureProps) {
  const { a } = p
  const now = a.side === 'current'
  const x = useTransform(() => p.x + pan.x.get() * parallax + mo.dx.get())
  const y = useTransform(() => p.y + pan.y.get() * parallax + mo.dy.get())
  const bodyOpacity = useTransform(() => mo.opacity.get() * (reduced ? mo.reveal.get() : 1))
  const filter = useTransform(() => {
    const b = mo.blur.get()
    return b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none'
  })
  // The form hands itself over to the particles in an instant; the light expands and goes.
  const formOpacity = useTransform(() => 1 - Math.min(1, mo.release.get() * (now ? 3 : 7)))
  const fadeOpacity = useTransform(() => (reduced ? 1 : smooth(0.35, 1, mo.reveal.get())) * (1 - mo.release.get()))
  const fadeScale = useTransform(() => mo.grow.get() * (1 - 0.22 * mo.focus.get()) * (1 + 0.7 * (1 - (1 - mo.release.get()) ** 2)))
  const seedOpacity = useTransform(() => {
    const r = mo.reveal.get()
    return reduced || r <= 0 ? 0 : smooth(0, 0.05, r) * (1 - smooth(0.08, 0.3, r))
  })
  const c0 = Math.max(1.4, p.R * 0.15)
  const coreOpacity = useTransform(() => (reduced ? 1 : smooth(0.35, 0.7, mo.reveal.get())) * (now ? 1 : formOpacity.get()))
  const coreScale = useTransform(() => mo.grow.get())
  const box = Math.ceil(maxR * 1.3 + 8)
  const color = COLOR[a.side]
  const modular = a.role === 'medium' || a.role === 'major'
  const leaks = a.side === 'past' ? 2 + Math.round(6 * a.f) : 0
  const R = p.R
  const blobs = (
    <>
      {now || a.role === 'major' ? (
        <>
          <span className="ds-blob ds-blob-pearl" style={blobStyle(R * 5.6, R * 4.4, 11, 3, a.order)} />
          <span className={`ds-blob ${a.side === 'past' ? 'ds-blob-silver' : 'ds-blob-ice'}`} style={blobStyle(R * 4.6, R * 3.4, 13, 5, a.order)} />
        </>
      ) : (
        <>
          <span className="ds-blob ds-blob-pearl" style={blobStyle(R * 5, R * 3.8, 13, 3, a.order)} />
          <span className={`ds-blob ${a.side === 'past' ? 'ds-blob-silver' : 'ds-blob-ice'}`} style={blobStyle(R * 3.6, R * 2.6, 15, 4, a.order)} />
        </>
      )}
      {now && <span className="ds-blob ds-blob-violet" style={blobStyle(R * 6.4, R * 5, 17, 4, a.order)} />}
      {a.role === 'space' && <span className="ds-blob ds-blob-space" style={blobStyle(R * 6.2, R * 6.2, 14, 6, a.order)} />}
    </>
  )

  return (
    <m.div className="ds-obj" style={{ x, y, zIndex: z }}>
      <m.div className="ds-body" style={{ opacity: bodyOpacity, filter }}>
        <m.div className="ds-fade" style={{ opacity: fadeOpacity, scale: fadeScale }}>
          {blobs}
        </m.div>
        <div className={alive && !now ? 'ds-drift' : undefined} style={alive && !now ? driftStyle(a.order) : undefined}>
          <svg
            aria-hidden
            width={box * 2}
            height={box * 2}
            viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`}
            className="absolute overflow-visible"
            style={{ left: -box, top: -box }}
          >
            <m.circle r={1.6} style={{ fill: 'var(--ds-particle)', opacity: seedOpacity }} />
            <m.g style={{ opacity: formOpacity }}>
              {SHAPES[rec.to].map((_, i) => (
                <Fragment key={i} p={p} rec={rec} mo={mo} i={i} reduced={reduced} />
              ))}
            </m.g>
            <m.g style={{ opacity: coreOpacity, scale: coreScale }}>
              {now && module ? (
                <NowCore c0={c0} module={module} pulse={!reduced} />
              ) : (
                <>
                  <Core a={a} r={c0} color={color} />
                  {modular &&
                    SATELLITES.map(([sx, sy], i) => (
                      <circle key={i} cx={sx * (c0 + 2.6)} cy={sy * (c0 + 2.6)} r={0.6} style={{ fill: color, opacity: 0.55 }} />
                    ))}
                </>
              )}
            </m.g>
          </svg>
          {leaks > 0 && (
            <m.div style={{ opacity: formOpacity }}>
              {Array.from({ length: leaks }, (_, i) => leak(a.order, i, R, p.x))}
            </m.div>
          )}
        </div>
      </m.div>
      {nameDelay !== null && <TempName p={p} delay={nameDelay} speed={speed} />}
      {children}
    </m.div>
  )
})

function blobStyle(width: number, height: number, base: number, k: number, index: number): CSSProperties {
  return {
    width,
    height,
    animationDuration: `${base + ((index * k) % 7)}s`,
    animationDelay: `${-((index * (k + 2.3)) % 13)}s`,
  }
}

function driftStyle(index: number): CSSProperties {
  return { animationDuration: `${15 + ((index * 7) % 9)}s`, animationDelay: `${-((index * 3.7) % 11)}s` }
}

/** A point of matter leaving a past form, upward and away from the present. */
function leak(order: number, i: number, R: number, x: number) {
  const s = Math.sin(order * 12.9898 + i * 78.233) * 43758.5453
  const u = s - Math.floor(s)
  const angle = -Math.PI / 2 - 0.9 + u * 1.8 + (x < 180 ? -0.6 : 0.6)
  const dist = R * (1.05 + ((u * 7) % 1) * 1.1)
  const style = {
    left: Math.cos(angle) * dist,
    top: Math.sin(angle) * dist,
    '--lx': `${(Math.cos(angle) * 10).toFixed(1)}px`,
    '--ly': `${(Math.sin(angle) * 12).toFixed(1)}px`,
    animationDuration: `${4 + u * 3}s`,
    animationDelay: `${-(u * 6).toFixed(2)}s`,
  } as CSSProperties
  return <span key={i} className="ds-leak" style={style} />
}
