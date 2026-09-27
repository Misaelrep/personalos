import { memo, useId, type CSSProperties } from 'react'
import type { Fiber } from './geometry'

/**
 * The light network: very thin optical fibers, curved, incomplete. Each one
 * breathes, shifts its curvature a little and now and then carries a small
 * glint — on its own long cycle (20–60 s), so only one or two are ever
 * perceptible at once. It suggests the flow of the week; it never organizes it.
 *
 * Each fiber is its own small layer, and everything that moves is opacity or
 * transform (the glint travels on `offset-path`), so the network costs the
 * compositor, not a repaint of the field every frame.
 */
export const Fibers = memo(function Fibers({ fibers, still }: { fibers: Fiber[]; still: boolean }) {
  const uid = useId().replace(/[:«»]/g, '')
  return (
    <div aria-hidden className="sm-fibers">
      {fibers.map((f, k) => {
        const n = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
        const xs = n.filter((_, i) => i % 2 === 0)
        const ys = n.filter((_, i) => i % 2 === 1)
        const pad = 6
        const x0 = Math.min(...xs) - pad
        const y0 = Math.min(...ys) - pad
        const w = Math.max(...xs) - x0 + pad
        const h = Math.max(...ys) - y0 + pad
        // The same curve in the fiber's own box.
        const local = f.d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(Number(x) - x0).toFixed(1)},${(Number(y) - y0).toFixed(1)}`)
        const [sx, sy, ex, ey] = [n[0] - x0, n[1] - y0, n[n.length - 2] - x0, n[n.length - 1] - y0]
        const a = f.offset
        const b = f.offset + f.drawn
        const long = f.to - f.from > 1
        const dash = `${f.drawn.toFixed(3)} 2`
        const dashOffset = (-f.offset).toFixed(3)
        const style = {
          left: x0,
          top: y0,
          width: w,
          height: h,
          '--breathe': `${f.breathe.toFixed(1)}s`,
          '--glint': `${f.glint.toFixed(1)}s`,
          '--sway': `${f.sway.toFixed(1)}s`,
          '--delay': `${f.delay.toFixed(1)}s`,
          '--peak': long ? 0.55 : 1,
          '--g0': `${(a * 100).toFixed(1)}%`,
          '--g1': `${(b * 100).toFixed(1)}%`,
        } as CSSProperties
        return (
          <div key={k} className="sm-fiber" style={style} data-still={still || undefined}>
            <svg className="sm-fiber-line" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <defs>
                <linearGradient id={`${uid}-${k}`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={ex} y2={ey}>
                  <stop offset={a} stopColor="#FFFFFF" stopOpacity={0} />
                  <stop offset={a + (b - a) * 0.3} stopColor="#FFFFFF" stopOpacity={1} />
                  <stop offset={a + (b - a) * 0.72} stopColor="#EDE6F2" stopOpacity={1} />
                  <stop offset={b} stopColor="#EDE6F2" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* A soft halo of light and a hairline core: a fiber, not a line. */}
              <path d={local} pathLength={1} fill="none" stroke={`url(#${uid}-${k})`} strokeWidth={2.8} strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="round" opacity={0.75} />
              <path d={local} pathLength={1} fill="none" stroke="#9A8FB3" strokeWidth={0.65} strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="round" opacity={0.5} />
            </svg>
            {!still && <i className="sm-glint" style={{ offsetPath: `path('${local}')` }} />}
          </div>
        )
      })}
    </div>
  )
})
