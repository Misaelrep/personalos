import { useEffect, useRef } from 'react'
import type { SceneColors } from '../atmosphere/themes'
import { FRAGMENTS_END } from './beats'
import { rgba } from './color'
import { fragmentAt, makeFragments, placeFragments, type FragmentTone, type Placed } from './fragments'
import { contactPoint, expectedWordmarkRect, wordmarkDots } from './geometry'
import { bloomAt, flareAt, ringsAt, surgeAt } from './light'

/** The moment a still composition is drawn at: scattered and fully there, before the wave. */
const STILL_AT = 0.48
const FONT = '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif'
/** Letters of a whole word are set a little apart. */
const WORD_SPACING = 0.16

type Tone = FragmentTone

/**
 * Everything that moves in the light stage, on one canvas: the light where the hand touches the glass
 * (a flare with its four spikes, a surge of red, the bloom), the rings of the wave, and the fragments —
 * pieces of the system's words, far and near, sharp and out of focus — that go to the dots of the wordmark
 * or are drawn into the contact. Each piece of text is turned into a sprite once and then only moved, so a
 * frame is a few gradient fills and image draws — no layout, no filters — and it stops by itself when the
 * last fragment is gone. With `still` it draws one frame.
 */
export function SceneCanvas({ scene, still }: { scene: SceneColors; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const view = { w: window.innerWidth, h: window.innerHeight }
    // The canvas is redrawn every frame, so it is kept at a modest resolution: the light is soft, and the pieces of type are small.
    const dpr = Math.min(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(view.w * dpr)
    canvas.height = Math.round(view.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const contact = contactPoint(view)
    const seeds = makeFragments(view.w < 640 ? 230 : 340)
    let placed: Placed[] = placeFragments(seeds, view, contact, wordmarkDots(expectedWordmarkRect(view)))
    let measured = false
    // Far pieces first, then mid, then near: what is deeper in the glass is behind.
    const LAYER_ORDER = { far: 0, mid: 1, near: 2 } as const
    const drawOrder = (list: Placed[]) => [...list].sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer])
    let ordered = drawOrder(placed)

    // —— sprites ——
    // Each distinct piece of text is drawn once into a small canvas — no blur, no shadow filter, so it costs next to
    // nothing to make — and then only moved. Out-of-focus pieces are drawn small and shown large: the smoothing is the blur.
    const sprites = new Map<string, HTMLCanvasElement>()
    const colors: Record<Tone, { fill: string; edge: string | null }> = {
      white: { fill: scene.white, edge: rgba(scene.steel, 0.7) },
      ice: { fill: scene.ice, edge: rgba(scene.steel, 0.6) },
      warm: { fill: scene.ember, edge: rgba(scene.vermilion, 0.7) },
      garnet: { fill: scene.garnet, edge: null },
      cool: { fill: scene.cyan, edge: null },
    }
    const soft = (p: Placed) => p.layer === 'far' || p.c < 0.08
    const SOFT_SCALE = 0.3
    const keyOf = (p: Placed, tone: Tone) => `${p.text}|${p.px}|${tone}|${soft(p) ? 's' : 'f'}`
    const probe = document.createElement('canvas').getContext('2d')!
    const make = (p: Placed, tone: Tone) => {
      const key = keyOf(p, tone)
      let s = sprites.get(key)
      if (s) return s
      const pad = 6
      const k = soft(p) ? SOFT_SCALE : 1
      const weight = p.layer === 'near' ? 400 : 300
      probe.font = `${weight} ${p.px}px ${FONT}`
      const gap = p.word ? p.px * WORD_SPACING : 0
      const w = Math.ceil(probe.measureText(p.text).width + gap * (p.text.length - 1)) + pad * 2
      const h = Math.ceil(p.px * 1.3) + pad * 2
      s = document.createElement('canvas')
      s.width = Math.max(1, Math.round(w * dpr * k))
      s.height = Math.max(1, Math.round(h * dpr * k))
      const c = s.getContext('2d')!
      c.scale(dpr * k, dpr * k)
      c.font = `${weight} ${p.px}px ${FONT}`
      c.textBaseline = 'middle'
      const { fill, edge } = colors[tone]
      const put = (color: string, dx: number) => {
        c.fillStyle = color
        if (!p.word) {
          c.fillText(p.text, pad + dx, h / 2 + dx)
          return
        }
        let x = pad + dx
        for (const ch of p.text) {
          c.fillText(ch, x, h / 2 + dx)
          x += probe.measureText(ch).width + gap
        }
      }
      if (edge) put(edge, 0.7)
      put(fill, 0)
      sprites.set(key, s)
      return s
    }
    // The sprites are made a few at a time, a few milliseconds per frame, in the order the pieces appear; a piece whose
    // sprite is not ready yet is simply not drawn that frame (they fade in over the first half second anyway).
    let queue: [Placed, Tone][] = []
    const enqueue = () => {
      queue = [...placed].sort((a, b) => a.d - b.d).map((p) => [p, p.tone])
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
      const s = sprites.get(keyOf(p, tone)) ?? (tone === p.tone || performance.now() > until ? null : make(p, tone))
      if (!s) return
      const w = s.width / (dpr * (soft(p) ? SOFT_SCALE : 1))
      const h = s.height / (dpr * (soft(p) ? SOFT_SCALE : 1))
      ctx.globalAlpha = alpha
      ctx.drawImage(s, x - (w * k) / 2, y - (h * k) / 2, w * k, h * k)
    }
    enqueue()

    // —— a frame ——
    const glow = (x: number, y: number, radius: number, alpha: number, stops: [number, string, number][]) => {
      if (alpha <= 0.002 || radius <= 0.5) return
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
      for (const [at, color, a] of stops) g.addColorStop(at, rgba(color, a))
      ctx.globalAlpha = alpha
      ctx.fillStyle = g
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }

    /** Four thin spikes of light through the contact: the glass diffracting the point it is touched at. */
    const spikes = (alpha: number, length: number) => {
      if (alpha <= 0.01 || length < 2) return
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const g = ctx.createLinearGradient(contact.x - dx * length, contact.y - dy * length, contact.x + dx * length, contact.y + dy * length)
        g.addColorStop(0, rgba(scene.white, 0))
        g.addColorStop(0.5, rgba(scene.white, 0.95))
        g.addColorStop(1, rgba(scene.white, 0))
        ctx.globalAlpha = alpha
        ctx.fillStyle = g
        ctx.fillRect(contact.x - (dx ? length : 0.9), contact.y - (dy ? length : 0.9), dx ? length * 2 : 1.8, dy ? length * 2 : 1.8)
      }
    }

    const draw = (t: number, rest: boolean) => {
      ctx.clearRect(0, 0, view.w, view.h)
      const vmin = Math.min(view.w, view.h)

      // The light at the point of contact…
      const flare = rest ? { alpha: 0.9, radius: 0.15 * vmin } : flareAt(t, view)
      glow(contact.x, contact.y, flare.radius, flare.alpha, [
        [0, scene.hot, 1],
        [0.14, scene.ember, 0.8],
        [0.38, scene.vermilion, 0.42],
        [1, scene.vermilion, 0],
      ])
      if (!rest) {
        // …the red that surges out of it for a moment, as the information reacts…
        const surge = surgeAt(t, view)
        glow(contact.x, contact.y, surge.radius, surge.alpha, [
          [0, scene.ember, 0.9],
          [0.3, scene.vermilion, 0.62],
          [0.7, scene.coral, 0.22],
          [1, scene.vermilion, 0],
        ])
        const bloom = bloomAt(t, view)
        glow(contact.x, contact.y, bloom.radius, bloom.alpha, [
          [0, scene.white, 0.95],
          [0.2, scene.hot, 0.8],
          [0.5, scene.ember, 0.4],
          [1, scene.ember, 0],
        ])
        spikes(Math.min(1, flare.alpha) * 0.85, 0.19 * vmin * Math.min(1, flare.radius / (0.12 * vmin)))
        // …and the wave: each ring is a band of light, thick and soft, bright on its inner edge, with a warm
        // fringe outside and a cool one inside — the way a lens would bend the glass as the wave goes through it.
        for (const ring of ringsAt(t, view)) {
          const width = 3 + ring.radius * 0.045
          for (const [color, a, dr] of [
            [scene.vermilion, 0.5, width * 0.55],
            [scene.cyan, 0.5, -width * 0.55],
            [scene.white, 0.95, 0],
          ] as const) {
            const r = Math.max(1, ring.radius + dr)
            const g = ctx.createRadialGradient(contact.x, contact.y, Math.max(0, r - width), contact.x, contact.y, r + width)
            g.addColorStop(0, rgba(color, 0))
            g.addColorStop(0.62, rgba(color, a))
            g.addColorStop(1, rgba(color, 0))
            ctx.globalAlpha = ring.alpha
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(contact.x, contact.y, r + width, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // The fragments, deepest first.
      for (const p of ordered) {
        const f = fragmentAt(p, t, contact, view)
        if (f.alpha < 0.01) continue
        // The prismatic split: where the wave passes, the piece parts into a warm and a cool ghost.
        if (f.heat > 0.25 && p.layer !== 'far') {
          const off = 2.2 * f.heat
          drawSprite(p, 'warm', f.x - off, f.y, f.alpha * 0.55 * f.heat, f.scale)
          drawSprite(p, 'cool', f.x + off, f.y, f.alpha * 0.5 * f.heat, f.scale)
        }
        // In flight, a short trail: the eye follows the structure forming.
        if (p.converges && t > p.start && t < p.start + p.dur) {
          const g = fragmentAt(p, t - 0.06, contact, view)
          drawSprite(p, p.tone, g.x, g.y, g.alpha * 0.3, g.scale)
        }
        // The near pieces carry a halo: the same letter, larger and faint, under it.
        if (p.layer === 'near') drawSprite(p, p.tone, f.x, f.y, f.alpha * 0.18, f.scale * 1.5)
        drawSprite(p, p.tone, f.x, f.y, f.alpha, f.scale)
      }
      ctx.globalAlpha = 1
    }

    let frame = 0
    let cancelled = false
    const start = () => {
      if (cancelled) return
      if (still) {
        prepare(1000)
        draw(STILL_AT, true)
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
            ordered = drawOrder(placed)
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
