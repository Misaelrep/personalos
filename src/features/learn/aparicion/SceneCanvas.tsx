import { useEffect, useRef } from 'react'
import type { SceneColors } from '../atmosphere/themes'
import { FRAGMENTS_END } from './beats'
import { rgba } from './color'
import { fragmentAt, makeFragments, placeFragments, type FragmentTone, type Placed } from './fragments'
import { contactPoint, expectedWordmarkRect, wordmarkDots } from './geometry'
import { bloomAt, flareAt, frontsAt, surgeAt, type Front } from './light'
import { SLABS, bendPx, waveRadius, waveStrength } from './optics'

/** The moment a still composition is drawn at: scattered and fully there, before the wave. */
const STILL_AT = 0.48
const FONT = '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif'
/** Letters of a whole word are set a little apart. */
const WORD_SPACING = 0.16

type Tone = FragmentTone

/**
 * Everything that moves in the light stage, on one canvas: the small light where the finger touches the glass
 * (stretched along the plate it lands on, with its color parted), the glass's answer — an irregular, broken front of
 * refraction, and a magnified copy of the information inside the first one — and the fragments: pieces of the system's words,
 * far and near, sharp and out of focus, that are drawn toward the contact and deformed by it, then line up with the flow that carries them
 * to the dots of the wordmark. Behind a plate of the glass every piece is bent like everything else (optics.ts). Each piece of text is turned
 * into a sprite once and then only moved, so a frame is a few gradient fills and image draws — no layout, no filters — and it stops by itself when
 * the last fragment is gone. With `still` it draws one frame.
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
    const drawSprite = (p: Placed, tone: Tone, x: number, y: number, alpha: number, k: number, angle = 0, stretch = 1) => {
      const s = sprites.get(keyOf(p, tone)) ?? (tone === p.tone || performance.now() > until ? null : make(p, tone))
      if (!s) return
      const w = s.width / (dpr * (soft(p) ? SOFT_SCALE : 1))
      const h = s.height / (dpr * (soft(p) ? SOFT_SCALE : 1))
      ctx.globalAlpha = alpha
      if (angle === 0 && stretch === 1) {
        ctx.drawImage(s, x - (w * k) / 2, y - (h * k) / 2, w * k, h * k)
        return
      }
      // Turned and stretched along its own length: the piece lines up with what carries it.
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.setTransform(dpr * cos * stretch, dpr * sin * stretch, -dpr * sin, dpr * cos, dpr * x, dpr * y)
      ctx.drawImage(s, -(w * k) / 2, -(h * k) / 2, w * k, h * k)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    enqueue()

    // —— a frame ——
    /** A glow, optionally squeezed or stretched (sx, sy): the light of the contact runs along the plate it lands on, it is not a disc. */
    const glow = (x: number, y: number, radius: number, alpha: number, stops: [number, string, number][], sx = 1, sy = 1) => {
      if (alpha <= 0.002 || radius <= 0.5) return
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      for (const [at, color, a] of stops) g.addColorStop(at, rgba(color, a))
      ctx.globalAlpha = alpha
      ctx.fillStyle = g
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(sx, sy)
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
      ctx.restore()
    }

    /** The front of the glass's answer: not a ring — a band of deformed light whose radius wanders, which is not there all the way round and breaks into pieces, with its colors parted. */
    const ARCS = 24
    const front = (f: Front, t: number) => {
      const width = 1.2 + f.radius * 0.012
      const at = (k: number) => {
        const a = (k / ARCS) * Math.PI * 2
        return { a, s: waveStrength(a, t, f.seed) }
      }
      for (const [color, alpha, dr, thick] of [
        [scene.white, 0.08, 0, 7],
        [scene.vermilion, 0.5, width * 1.6, 1],
        [scene.cyan, 0.5, -width * 1.6, 1],
        [scene.white, 0.75, 0, 1.1],
      ] as const) {
        ctx.strokeStyle = rgba(color, 1)
        ctx.lineCap = 'round'
        let from = at(0)
        for (let k = 1; k <= ARCS; k++) {
          const to = at(k)
          const s = Math.min(from.s, to.s)
          if (s > 0.3) {
            ctx.globalAlpha = f.alpha * alpha * s * s
            ctx.lineWidth = width * thick * (0.5 + 0.8 * s)
            ctx.beginPath()
            const steps = 2
            for (let j = 0; j <= steps; j++) {
              const aa = from.a + ((to.a - from.a) * j) / steps
              const rr = waveRadius(aa, t, f.radius, f.seed) + dr
              const px = contact.x + Math.cos(aa) * rr
              const py = contact.y + Math.sin(aa) * rr
              if (j === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()
          }
          from = to
        }
      }
    }

    /** Inside the first front the glass is a lens: the information there is seen again, larger and a little to one side — a small zone, repeated. */
    let matrix: HTMLCanvasElement | null = null
    const lens = (f: Front, t: number) => {
      matrix ??= document.querySelector<HTMLCanvasElement>('.apa-matrix')
      if (!matrix || !matrix.width) return
      ctx.save()
      ctx.beginPath()
      const N = 36
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2
        const r = waveRadius(a, t, f.radius, f.seed) * 0.82
        const px = contact.x + Math.cos(a) * r
        const py = contact.y + Math.sin(a) * r
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.clip()
      ctx.globalAlpha = Math.min(0.38, f.alpha * 0.9)
      const k = 1.22
      // Only the part of the information the lens covers is drawn, not the whole canvas: a frame must stay cheap.
      const R = f.radius * 1.4
      const sx = Math.max(0, (contact.x - R) * (matrix.width / view.w))
      const sy = Math.max(0, (contact.y - R) * (matrix.height / view.h))
      const sw = Math.min(matrix.width - sx, (2 * R * matrix.width) / view.w)
      const sh = Math.min(matrix.height - sy, (2 * R * matrix.height) / view.h)
      if (sw > 1 && sh > 1) {
        const ox = (sx * view.w) / matrix.width
        const oy = (sy * view.h) / matrix.height
        ctx.drawImage(matrix, sx, sy, sw, sh, contact.x + (ox - contact.x) * k + 5, contact.y + (oy - contact.y) * k - 4, ((sw * view.w) / matrix.width) * k, ((sh * view.h) / matrix.height) * k)
      }
      ctx.restore()
    }

    const draw = (t: number, rest: boolean) => {
      ctx.clearRect(0, 0, view.w, view.h)
      const vmin = Math.min(view.w, view.h)

      // The light at the point of contact: small, a core of white-hot light that runs along the plate it lands on, its colors parted a little…
      const flare = rest ? { alpha: 0.9, radius: 0.09 * vmin } : flareAt(t, view)
      const split = Math.max(6, flare.radius * 0.45)
      glow(contact.x - split, contact.y, flare.radius * 1.1, flare.alpha * 0.55, [[0, scene.cyan, 0.9], [0.5, scene.cyan, 0.3], [1, scene.cyan, 0]], 0.6, 1.5)
      glow(contact.x + split, contact.y, flare.radius * 1.1, flare.alpha * 0.55, [[0, scene.vermilion, 0.95], [0.5, scene.vermilion, 0.34], [1, scene.vermilion, 0]], 0.6, 1.5)
      glow(
        contact.x,
        contact.y,
        flare.radius * 1.9,
        flare.alpha,
        [
          [0, scene.white, 1],
          [0.16, scene.hot, 0.8],
          [0.4, scene.ice, 0.4],
          [1, scene.ice, 0],
        ],
        0.42,
        2.4,
      )
      glow(contact.x, contact.y, flare.radius * 0.7, flare.alpha, [[0, scene.white, 1], [0.5, scene.hot, 0.7], [1, scene.hot, 0]])
      // The point itself: a small, hard core, and a sliver of light along the plate through it — the touch, seen through the glass.
      if (flare.alpha > 0.02) {
        glow(contact.x, contact.y, Math.max(4, flare.radius * 0.26), flare.alpha, [[0, scene.white, 1], [0.55, scene.white, 0.95], [1, scene.hot, 0]])
        const len = 0.1 * vmin * Math.min(1, flare.radius / (0.06 * vmin))
        const sliver = ctx.createLinearGradient(0, contact.y - len, 0, contact.y + len)
        sliver.addColorStop(0, rgba(scene.white, 0))
        sliver.addColorStop(0.5, rgba(scene.white, 0.95))
        sliver.addColorStop(1, rgba(scene.white, 0))
        ctx.globalAlpha = flare.alpha * 0.9
        ctx.fillStyle = sliver
        ctx.fillRect(contact.x - 0.75, contact.y - len, 1.5, len * 2)
      }
      if (!rest) {
        // …the heat the glass takes from it for a moment, as the information reacts, also along the plate…
        const surge = surgeAt(t, view)
        glow(contact.x, contact.y, surge.radius, surge.alpha, [[0, scene.ember, 0.9], [0.3, scene.vermilion, 0.55], [0.7, scene.coral, 0.2], [1, scene.vermilion, 0]], 0.55, 1.7)
        const bloom = bloomAt(t, view)
        glow(contact.x, contact.y, bloom.radius, bloom.alpha, [[0, scene.white, 0.9], [0.25, scene.hot, 0.65], [0.55, scene.ember, 0.3], [1, scene.ember, 0]], 0.7, 1.35)
        // …and the glass answers: a lens opens at the point and its fronts go out — wandering, broken, with their colors parted.
        const fronts = frontsAt(t, view)
        if (fronts[0]) lens(fronts[0], t)
        for (const f of fronts) front(f, t)
      }

      // The fragments, deepest first.
      for (const p of ordered) {
        const f = fragmentAt(p, t, contact, view)
        // The point of contact is left clear: the light there is what is seen, the pieces gather around it.
        f.alpha *= 1 - 0.85 * Math.exp(-(((f.x - contact.x) / 34) ** 2 + ((f.y - contact.y) / 34) ** 2)) * Math.min(1, t / 0.6)
        if (f.alpha < 0.01) continue
        // Behind a plate of the glass the piece is seen from a little to one side, a little larger (or smaller), and split into its colors.
        const b = bendPx(f.x, f.y, view)
        const inside = b.weight > 0
        const x = f.x - b.dx
        const y = f.y - b.dy
        const k = f.scale * (inside ? 1 + 0.16 * b.weight * (SLABS[b.slab].k > 0 ? 1 : -0.25) : 1)
        // The prismatic split: where the wave passes, or the plate bends it, the piece parts into a warm and a cool ghost.
        const parted = Math.max(f.heat, 0.9 * b.weight)
        if (parted > 0.25 && p.layer !== 'far') {
          const off = 2.2 * f.heat + (inside ? Math.max(1.6, b.ca * 1.6) : 0)
          drawSprite(p, 'warm', x - off, y, f.alpha * 0.55 * parted, k, f.angle, f.stretch)
          drawSprite(p, 'cool', x + off, y, f.alpha * 0.5 * parted, k, f.angle, f.stretch)
        }
        // A small zone, repeated: a fainter copy, higher and to one side, of some of what is behind a plate.
        if (inside && p.a > 0.55 && p.layer !== 'far') drawSprite(p, p.tone, x + (SLABS[b.slab].k > 0 ? 11 : -11), y - 17, f.alpha * 0.2, k)
        // In flight, a short trail: the eye follows the structure forming.
        if (p.converges && t > p.start && t < p.start + p.dur) {
          const g = fragmentAt(p, t - 0.06, contact, view)
          drawSprite(p, p.tone, g.x - b.dx, g.y - b.dy, g.alpha * 0.3, g.scale, g.angle, g.stretch)
        }
        // The near pieces carry a halo: the same letter, larger and faint, under it.
        if (p.layer === 'near') drawSprite(p, p.tone, x, y, f.alpha * 0.18, k * 1.5, f.angle, f.stretch)
        drawSprite(p, p.tone, x, y, f.alpha, k, f.angle, f.stretch)
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
