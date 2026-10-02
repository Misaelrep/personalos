import { useEffect, useRef } from 'react'
import type { Plane, TemporalSide } from './model'
import { moteLook, shardPoint, shardRange, stepMatter, type Gathering, type Matter } from './matter'

/**
 * The shared matter, drawn on one canvas per depth plane, each sitting in its
 * plane between the forms: far matter is softer, near matter sharper. Forms,
 * names and information stay in SVG / HTML.
 */
interface MatterCanvasProps {
  width: number
  height: number
  matter: Matter
  gathering: { current?: Gathering }
  anchor: { x: number; y: number }
  /** Exit clock (ms from CONTINUAR). */
  clock: () => number
  running: boolean
  /** Stacking order of each plane's canvas among the forms. */
  z: Record<Plane, number>
}

const PLANES: Plane[] = ['bg', 'mid', 'fg']
const SOFT: Record<Plane, string | undefined> = { bg: 'blur(1.1px)', mid: 'blur(0.45px)', fg: undefined }
const SAMPLES = 7

/** A soft pearl dot in the given CSS color, drawn once and stamped per point. */
function makeSprite(color: string): HTMLCanvasElement {
  const size = 48
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.22, 'rgba(0,0,0,0.9)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  // A pearl heart: the point holds light, not only color.
  ctx.globalCompositeOperation = 'source-over'
  const heart = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.16)
  heart.addColorStop(0, 'rgba(255,255,255,0.85)')
  heart.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = heart
  ctx.fillRect(0, 0, size, size)
  return c
}

export function MatterCanvas({ width, height, matter, gathering, anchor, clock, running, z }: MatterCanvasProps) {
  const refs = useRef<Record<Plane, HTMLCanvasElement | null>>({ bg: null, mid: null, fg: null })

  useEffect(() => {
    if (!running) return
    const canvases = PLANES.map((p) => refs.current[p])
    if (canvases.some((c) => !c)) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ctxs = {} as Record<Plane, CanvasRenderingContext2D>
    PLANES.forEach((p, i) => {
      const c = canvases[i]!
      c.width = Math.round(width * dpr)
      c.height = Math.round(height * dpr)
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctxs[p] = ctx
    })
    const style = getComputedStyle(canvases[0]!)
    const css = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const color: Record<TemporalSide, string> = {
      past: css('--ds-past', '#8793a4'),
      future: css('--ds-future', '#98b1cc'),
      current: css('--ds-now-line', '#7f98b6'),
    }
    const facet = css('--ds-facet', '#c7d9e9')
    const sprite = makeSprite(css('--ds-particle', '#8ea6c0'))
    const solid = css('--ink-3', '#5c6778')

    let frame = 0
    let last = clock()
    const draw = () => {
      const t = clock()
      const dt = Math.min(50, Math.max(0, t - last))
      last = t
      const g = gathering.current
      stepMatter(matter.motes, t, dt, anchor, g)
      for (const p of PLANES) ctxs[p].clearRect(0, 0, width, height)

      // Fragments: pieces of each form, drifting apart and eroding.
      for (const s of matter.shards) {
        if (t < s.born || t > s.end) continue
        const [a, b] = shardRange(s, t)
        if (b - a < 0.004) continue
        const ctx = ctxs[s.plane]
        const q = Math.min(1, Math.max(0, (t - s.erodeAt) / (s.end - s.erodeAt)))
        ctx.beginPath()
        for (let k = 0; k < SAMPLES; k++) {
          const [x, y] = shardPoint(s, a + ((b - a) * k) / (SAMPLES - 1), t)
          if (k === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        const presence = s.alpha * (1 - 0.35 * q) * Math.min(1, (t - s.born) / 90)
        if (s.fill > 0.03) {
          ctx.globalAlpha = Math.min(0.5, s.fill * 1.8 * (s.side === 'future' ? 1.7 : 1)) * presence
          ctx.fillStyle = facet
          ctx.fill()
        }
        const now = s.side === 'current'
        ctx.globalAlpha = Math.min(0.97, s.stroke * 1.45 * (now ? 1.15 : 1)) * (s.side === 'future' ? 0.78 : 1) * presence
        ctx.strokeStyle = color[s.side]
        ctx.lineWidth = (now ? 1.45 : s.radius > 16 ? 1.35 : 1.15) * s.width
        ctx.stroke()
      }

      // Microfragments settling into points; points converging on AHORA.
      for (const m of matter.motes) {
        const look = moteLook(m, t, g)
        if (look.a <= 0.004 || look.r <= 0.05) continue
        const ctx = ctxs[m.plane]
        const stroke = m.len > 0 ? look.len / m.len : 0
        if (look.len > 0.35) {
          const dx = (Math.cos(m.angle) * look.len) / 2
          const dy = (Math.sin(m.angle) * look.len) / 2
          ctx.globalAlpha = look.a * Math.min(1, stroke * 1.4)
          ctx.strokeStyle = color[m.side]
          ctx.lineWidth = Math.max(0.7, look.r * 0.85)
          ctx.beginPath()
          ctx.moveTo(m.x - dx, m.y - dy)
          ctx.lineTo(m.x + dx, m.y + dy)
          ctx.stroke()
        }
        const dot = look.a * (1 - stroke) * (1 - look.solid)
        if (dot > 0.004) {
          ctx.globalAlpha = dot
          const size = look.r * 5.8
          ctx.drawImage(sprite, m.x - size / 2, m.y - size / 2, size, size)
        }
        if (look.solid > 0) {
          ctx.globalAlpha = look.a * look.solid
          ctx.fillStyle = solid
          ctx.beginPath()
          ctx.arc(m.x, m.y, look.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      for (const p of PLANES) ctxs[p].globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      // Whatever was left is handed over: nothing lingers.
      for (const c of canvases) c!.getContext('2d')!.clearRect(0, 0, c!.width, c!.height)
    }
  }, [running, width, height, matter, gathering, anchor, clock])

  return (
    <>
      {PLANES.map((p) => (
        <canvas
          key={p}
          ref={(el) => {
            refs.current[p] = el
          }}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ width, height, zIndex: z[p], filter: SOFT[p], visibility: running ? 'visible' : 'hidden' }}
        />
      ))}
    </>
  )
}
