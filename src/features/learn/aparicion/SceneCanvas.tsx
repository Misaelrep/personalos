import { useEffect, useRef } from 'react'
import type { SceneColors } from '../atmosphere/themes'
import { FRAGMENTS_END } from './beats'
import { rgba } from './color'
import { fingerSvg, FINGER_BOX } from './fingerSvg'
import { fragmentAt, makeFragments, placeFragments, type Placed } from './fragments'
import { contactPoint, expectedWordmarkRect, wordmarkDots } from './geometry'
import { bloomAt, fingerAt, fingerScale, flareAt, ringsAt } from './light'

/** The moment a still composition is drawn at: scattered and fully there, before the wave. */
const STILL_AT = 0.48
const FONT = '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif'

type Tone = 'main' | 'warm' | 'cool'

/**
 * Everything that moves in the light stage, on one canvas: the flare where the finger lands,
 * the bloom, the three rings of the wave, the fingertip, and the fragments that go to the dots
 * of the wordmark. The fingertip and each piece of text are turned into sprites once and then
 * only moved, so a frame is a few gradient fills and image draws — no layout, no filters — and it
 * stops by itself when the last fragment has become a dot. With `still` it draws one frame.
 */
export function SceneCanvas({ scene, still }: { scene: SceneColors; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const view = { w: window.innerWidth, h: window.innerHeight }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(view.w * dpr)
    canvas.height = Math.round(view.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const contact = contactPoint(view)
    const scale = fingerScale(view)
    const seeds = makeFragments(view.w < 640 ? 120 : 180)
    let placed: Placed[] = placeFragments(seeds, view, contact, wordmarkDots(expectedWordmarkRect(view)))
    let measured = false

    // —— sprites ——
    // Each distinct piece of text is drawn once into a small canvas — no blur, no shadow filter, so it costs next to
    // nothing to make — and then only moved. Out-of-focus pieces are drawn small and shown large: the smoothing is the blur.
    const sprites = new Map<string, HTMLCanvasElement>()
    const colors: Record<Tone, { fill: string; edge: string }> = {
      main: { fill: scene.white, edge: rgba(scene.steel, 0.78) },
      warm: { fill: scene.ember, edge: rgba(scene.vermilion, 0.7) },
      cool: { fill: scene.cyan, edge: rgba(scene.cyan, 0) },
    }
    const soft = (p: Placed) => p.c < 0.16
    const SOFT_SCALE = 0.3
    const keyOf = (p: Placed, tone: Tone) => `${p.text}|${p.px}|${tone}|${soft(p) ? 's' : 'f'}`
    const make = (p: Placed, tone: Tone) => {
      const key = keyOf(p, tone)
      let s = sprites.get(key)
      if (s) return s
      const pad = 6
      const k = soft(p) ? SOFT_SCALE : 1
      const probe = document.createElement('canvas').getContext('2d')!
      probe.font = `300 ${p.px}px ${FONT}`
      const w = Math.ceil(probe.measureText(p.text).width) + pad * 2
      const h = Math.ceil(p.px * 1.3) + pad * 2
      s = document.createElement('canvas')
      s.width = Math.max(1, Math.round(w * dpr * k))
      s.height = Math.max(1, Math.round(h * dpr * k))
      const c = s.getContext('2d')!
      c.scale(dpr * k, dpr * k)
      c.font = `300 ${p.px}px ${FONT}`
      c.textBaseline = 'middle'
      c.fillStyle = colors[tone].edge
      c.fillText(p.text, pad + 0.7, h / 2 + 0.7)
      c.fillStyle = colors[tone].fill
      c.fillText(p.text, pad, h / 2)
      sprites.set(key, s)
      return s
    }
    // The sprites are made a few at a time, a few milliseconds per frame, in the order the pieces appear; a piece whose
    // sprite is not ready yet is simply not drawn that frame (they fade in over the first half second anyway).
    let queue: [Placed, Tone][] = []
    const enqueue = () => {
      queue = [...placed].sort((a, b) => a.d - b.d).map((p) => [p, (p.warm ? 'warm' : 'main') as Tone])
    }
    let until = 0
    const prepare = (budgetMs: number) => {
      until = performance.now() + budgetMs
      while (queue.length && performance.now() < until) {
        const [p, tone] = queue.shift()!
        make(p, tone)
      }
    }
    const drawSprite = (p: Placed, tone: Tone, x: number, y: number, alpha: number, k: number) => {
      const s = sprites.get(keyOf(p, tone)) ?? (tone === (p.warm ? 'warm' : 'main') || performance.now() > until ? null : make(p, tone))
      if (!s) return
      const w = s.width / (dpr * (soft(p) ? SOFT_SCALE : 1))
      const h = s.height / (dpr * (soft(p) ? SOFT_SCALE : 1))
      ctx.globalAlpha = alpha
      ctx.drawImage(s, x - (w * k) / 2, y - (h * k) / 2, w * k, h * k)
    }

    // The fingertip: drawn once, at the size it will be shown, into a sprite.
    enqueue()
    let finger: HTMLCanvasElement | null = null
    const img = new Image()
    img.onload = () => {
      const f = document.createElement('canvas')
      f.width = Math.round(FINGER_BOX.width * scale * dpr)
      f.height = Math.round(FINGER_BOX.height * scale * dpr)
      f.getContext('2d')?.drawImage(img, 0, 0, f.width, f.height)
      finger = f
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fingerSvg(scene, scale * dpr))}`

    // —— a frame ——
    const glow = (x: number, y: number, radius: number, alpha: number, stops: [number, string, number][]) => {
      if (alpha <= 0.002 || radius <= 0.5) return
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
      for (const [at, color, a] of stops) g.addColorStop(at, rgba(color, a))
      ctx.globalAlpha = alpha
      ctx.fillStyle = g
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }

    const draw = (t: number, rest: boolean) => {
      ctx.clearRect(0, 0, view.w, view.h)

      // The light at the point of contact…
      const flare = rest ? { alpha: 0.9, radius: 0.15 * Math.min(view.w, view.h) } : flareAt(t, view)
      glow(contact.x, contact.y, flare.radius, flare.alpha, [
        [0, scene.hot, 1],
        [0.14, scene.ember, 0.8],
        [0.38, scene.vermilion, 0.42],
        [1, scene.vermilion, 0],
      ])
      if (!rest) {
        const bloom = bloomAt(t, view)
        glow(contact.x, contact.y, bloom.radius, bloom.alpha, [
          [0, scene.white, 0.95],
          [0.2, scene.hot, 0.8],
          [0.5, scene.ember, 0.4],
          [1, scene.ember, 0],
        ])
        // …and the wave: each ring is white, with a warm edge outside and a cool one inside (a prismatic split).
        for (const ring of ringsAt(t, view)) {
          ctx.lineWidth = 1.6
          for (const [color, a, dr] of [
            [scene.vermilion, 0.55, 2],
            [scene.cyan, 0.6, -2],
            [scene.white, 0.95, 0],
          ] as const) {
            ctx.globalAlpha = ring.alpha
            ctx.strokeStyle = rgba(color, a)
            ctx.beginPath()
            ctx.arc(contact.x, contact.y, Math.max(0, ring.radius + dr), 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }

      // The finger, tip at the contact, its body trailing off down and to the left.
      const pose = rest ? { alpha: 1, away: 0 } : fingerAt(t)
      if (finger && pose.alpha > 0.002) {
        const travel = 150 * scale * pose.away
        ctx.save()
        ctx.globalAlpha = pose.alpha
        ctx.translate(contact.x - travel, contact.y + travel)
        ctx.rotate(-Math.PI / 4)
        ctx.drawImage(finger, -FINGER_BOX.tipX * scale, -FINGER_BOX.tipY * scale, FINGER_BOX.width * scale, FINGER_BOX.height * scale)
        ctx.restore()
      }

      // The fragments.
      for (const p of placed) {
        const f = fragmentAt(p, t, contact, view)
        if (f.alpha < 0.01) continue
        const own: Tone = p.warm ? 'warm' : 'main'
        // The prismatic split: where the wave passes, the piece parts into a warm and a cool ghost.
        if (f.heat > 0.25) {
          const off = 2.2 * f.heat
          drawSprite(p, 'warm', f.x - off, f.y, f.alpha * 0.55 * f.heat, f.scale)
          drawSprite(p, 'cool', f.x + off, f.y, f.alpha * 0.5 * f.heat, f.scale)
        }
        // In flight, a short trail: the eye follows the structure forming.
        if (t > p.start && t < p.start + p.dur) {
          const g = fragmentAt(p, t - 0.06, contact, view)
          drawSprite(p, own, g.x, g.y, g.alpha * 0.3, g.scale)
        }
        drawSprite(p, own, f.x, f.y, f.alpha, f.scale)
      }
      ctx.globalAlpha = 1
    }

    let frame = 0
    let cancelled = false
    const start = () => {
      if (cancelled) return
      if (still) {
        // The finger and its sprite are ready a moment after the first draw: draw again when it is.
        const stillFrame = () => {
          prepare(1000)
          draw(STILL_AT, true)
        }
        stillFrame()
        img.addEventListener('load', () => requestAnimationFrame(stillFrame))
        return
      }
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = (now - t0) / 1000
        // The wordmark exists from its stage on: aim at its real dots as soon as they can be measured.
        if (!measured && t > 0.4) {
          const el = document.querySelector('[data-learn-wordmark]')
          if (el) {
            const r = el.getBoundingClientRect()
            placed = placeFragments(seeds, view, contact, wordmarkDots({ left: r.left, top: r.top, width: r.width, height: r.height }))
            measured = true
            enqueue()
          }
        }
        if (t >= FRAGMENTS_END) {
          ctx.clearRect(0, 0, view.w, view.h)
          return
        }
        prepare(8)
        draw(t, false)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    // Draw with the real face of the type, not a stand-in.
    const fonts = document.fonts
    if (!fonts || fonts.check(`300 14px ${FONT}`)) start()
    else Promise.race([fonts.load(`300 14px ${FONT}`, 'aeprn'), new Promise((r) => setTimeout(r, 400))]).then(start, start)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [scene, still])

  return <canvas ref={ref} aria-hidden className="apa-canvas" />
}
