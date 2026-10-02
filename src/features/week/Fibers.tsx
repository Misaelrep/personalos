import { memo, useId, type CSSProperties } from 'react'
import type { Fiber, Spark } from './geometry'

/**
 * The light network: open fibers that bend and change direction through the
 * shared field — they pass near pieces, split, get lost, join regions — and a
 * few small concentrations of light. Fibers breathe, bend a little and now and
 * then carry a glint, each on its own long cycle (20–60 s). A field, never a
 * diagram; it connects, it never organizes.
 *
 * Each fiber is its own small layer and everything that moves is opacity or
 * transform (the glint travels on `offset-path`), so the network costs the
 * compositor, not a repaint of the field every frame.
 */
interface FibersProps {
  fibers: Fiber[]
  sparks?: Spark[]
  /** Only the fibers of this depth layer. */
  layer: 'back' | 'mid'
  /** Today's relations are a little more alive. */
  today: number
  still: boolean
}

export const Fibers = memo(function Fibers({ fibers, sparks = [], layer, today, still }: FibersProps) {
  const uid = useId().replace(/[:«»]/g, '')
  return (
    <div aria-hidden className="sm-fibers" data-layer={layer}>
      {fibers.map((f, k) => {
        if (f.layer !== layer) return null
        const n = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
        const xs = n.filter((_, i) => i % 2 === 0)
        const ys = n.filter((_, i) => i % 2 === 1)
        const pad = 8
        const x0 = Math.min(...xs) - pad
        const y0 = Math.min(...ys) - pad
        const w = Math.max(...xs) - x0 + pad
        const h = Math.max(...ys) - y0 + pad
        // The same curve in the fiber's own box.
        const local = f.d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(Number(x) - x0).toFixed(1)},${(Number(y) - y0).toFixed(1)}`)
        const [sx, sy, ex, ey] = [n[0] - x0, n[1] - y0, n[n.length - 2] - x0, n[n.length - 1] - y0]
        const a = f.offset
        const b = f.offset + f.drawn
        const dash = `${f.drawn.toFixed(3)} 2`
        const dashOffset = (-f.offset).toFixed(3)
        const alive = f.near.includes(today)
        const style = {
          left: x0,
          top: y0,
          width: w,
          height: h,
          '--breathe': `${f.breathe.toFixed(1)}s`,
          '--glint': `${f.glint.toFixed(1)}s`,
          '--sway': `${f.sway.toFixed(1)}s`,
          '--delay': `${f.delay.toFixed(1)}s`,
          '--base': Math.min(1, f.base + (alive ? 0.2 : 0)),
          '--g0': `${(a * 100).toFixed(1)}%`,
          '--g1': `${(b * 100).toFixed(1)}%`,
        } as CSSProperties
        // Orbits: gradient along the chord fades both ends. Relations fade toward where they never arrive.
        return (
          <div key={k} className="sm-fiber" data-kind={f.kind} data-today={alive || undefined} style={style}>
            <svg className="sm-fiber-line" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <defs>
                <linearGradient id={`${uid}-${k}`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={ex} y2={ey}>
                  <stop offset={Math.max(0, a - 0.02)} stopColor="#FFFFFF" stopOpacity={0} />
                  <stop offset={a + (b - a) * 0.22} stopColor="#FFFFFF" stopOpacity={1} />
                  <stop offset={a + (b - a) * 0.7} stopColor="#F3ECF6" stopOpacity={1} />
                  <stop offset={Math.min(1, b + 0.02)} stopColor="#F3ECF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* A soft halo of light and a hairline core: a fiber, not a line. */}
              <path d={local} pathLength={1} fill="none" stroke={`url(#${uid}-${k})`} strokeWidth={f.width * 4.2} strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="round" opacity={0.75} />
              <path d={local} pathLength={1} fill="none" stroke={`url(#${uid}-${k})`} strokeWidth={f.width * 1.2} strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="round" />
              <path d={local} pathLength={1} fill="none" stroke="#9488B0" strokeWidth={f.width * 0.55} strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="round" opacity={0.3} />
            </svg>
            {!still && <i className="sm-glint" style={{ offsetPath: `path('${local}')` }} />}
          </div>
        )
      })}
      {sparks.map((s, k) => (
        <i
          key={`s${k}`}
          className="sm-spark"
          style={{ left: s.x, top: s.y, width: s.size * 4, height: s.size * 4, marginLeft: -s.size * 2, marginTop: -s.size * 2, '--dur': `${s.dur.toFixed(1)}s`, '--delay': `${s.delay.toFixed(1)}s` } as CSSProperties}
        />
      ))}
    </div>
  )
})
