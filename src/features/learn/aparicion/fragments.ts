import { BEATS } from './beats'
import { FRONT_BIRTHS, frontReach, frontSpeed, frontVigor } from './light'
import { bendPx, frontPresence, frontShape, frontShift } from './optics'

/**
 * The fragments of APARICIÓN: pieces of the words the system is made of — not
 * text to read, information that reacts. They are scattered over the glass;
 * each front from the point of contact disturbs them as it really passes through
 * them (and only then), and leaves them a little more in order; then they travel
 * to the dots of the wordmark, the nearest first. Everything here is a pure function
 * of time, so a frame can be drawn at any moment (and a still one for reduced motion).
 */
export const SYSTEM_WORDS = ['aprender', 'explorar', 'conectar', 'comprender', 'recordar', 'aplicar'] as const

/** Deterministic: the sky never changes between renders. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The colour of a piece: white and ice are the glass's own; warm is light that has passed through it; garnet is ink; cool is the fringe. */
export type FragmentTone = 'white' | 'ice' | 'warm' | 'garnet' | 'cool'

/** How far into the glass a piece lies: far ones are small and out of focus, near ones large and bright. */
export type FragmentLayer = 'far' | 'mid' | 'near'

export interface FragmentSeed {
  text: string
  tone: FragmentTone
  layer: FragmentLayer
  /** A whole word, not a syllable: it stays where it is and is drawn in toward the contact, it does not become a dot. */
  word: boolean
  /** 0..1: how large, relative to the range of its layer. */
  size: number
  a: number
  b: number
  c: number
  d: number
}

/** Lengths of a fragment, as weights: mostly one or two letters, now and then a syllable or more. */
const LENGTHS: [number, number][] = [
  [1, 0.44],
  [2, 0.3],
  [3, 0.19],
  [4, 0.07],
]

export function makeFragments(count: number, seed = 11): FragmentSeed[] {
  const r = rng(seed)
  return Array.from({ length: count }, () => {
    const word = SYSTEM_WORDS[Math.floor(r() * SYSTEM_WORDS.length)]
    const whole = r() < 0.07
    let pick = r()
    let length = 1
    for (const [l, w] of LENGTHS) {
      length = l
      if ((pick -= w) <= 0) break
    }
    length = whole ? word.length : Math.min(length, word.length)
    const start = whole ? 0 : Math.floor(r() * (word.length - length + 1))
    const depth = r()
    const layer: FragmentLayer = whole ? 'mid' : depth < 0.26 ? 'far' : depth < 0.76 ? 'mid' : 'near'
    const hue = r()
    const tone: FragmentTone = hue < 0.55 ? 'white' : hue < 0.7 ? 'ice' : hue < 0.8 ? 'warm' : hue < 0.9 ? 'garnet' : 'cool'
    return { text: word.slice(start, start + length), tone, layer, word: whole, size: r(), a: r(), b: r(), c: r(), d: r() }
  })
}

export interface Point {
  x: number
  y: number
}

export interface View {
  w: number
  h: number
}

export interface Placed extends FragmentSeed {
  /** Does it become a dot of the wordmark? (Far pieces and whole words do not: they are drawn in and go out.) */
  converges: boolean
  /** Where it rests while scattered, and where it ends: a dot of the wordmark — or, if it does not converge, a point on the way to the contact. */
  sx: number
  sy: number
  tx: number
  ty: number
  /** Seconds at which it sets off, and how long it takes. */
  start: number
  dur: number
  /** The moments each front passes through it (s, as it is seen: through the glass), and how strong the front is there (0..1). */
  hits: { at: number; strength: number }[]
  /** How far its path bends away from a straight line (px, signed). */
  bend: number
  /** Font size, px. */
  px: number
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const easeInOut = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Gaussian from two uniform numbers (Box–Muller). */
const gauss = (u: number, v: number) => Math.sqrt(-2 * Math.log(Math.max(u, 1e-6))) * Math.cos(2 * Math.PI * v)

const MARGIN = 10

/** The bend of a path, as a fraction of its length: all in one sense, a little more or less each — a field that turns, not noise. */
const swirl = (b: number) => 0.1 + 0.14 * b

/** 0..1 around the contact, from the left (0) turning through the top to the right and back: the order the structure is called in. */
const sweep = (from: Point, contact: Point) => (Math.atan2(from.y - contact.y, from.x - contact.x) + Math.PI) / (2 * Math.PI)

/** Only a few sizes of type, so that the canvas has few sprites to make (and every piece of text of a size shares one). */
const SIZES = [9, 10, 11, 12, 14, 16, 19, 22, 25]
export const snapSize = (px: number) => SIZES.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), SIZES[0])

/** The range of type size of each layer (px, at 390 wide). */
const LAYER_PX: Record<FragmentLayer, [number, number]> = { far: [9, 12], mid: [11, 16], near: [16, 24] }

/**
 * Where each fragment rests. Many gather around the point of contact (where the information is about
 * to react), some lie along the hand's path, some are spread over the whole glass and a few stand in loose
 * columns at the top left, like data that has not arrived anywhere yet. The ones that become the wordmark
 * (mid and near pieces) are matched left to right with its dots; the others — far pieces and whole words — are
 * drawn in toward the contact and go out.
 */
export function placeFragments(seeds: FragmentSeed[], view: View, contact: Point, targets: Point[]): Placed[] {
  const { w, h } = view
  const speed = frontSpeed(view)
  const reach = frontReach(view)
  const scatter = seeds.map((s) => {
    let x: number
    let y: number
    if (s.a < 0.42) {
      x = contact.x + gauss(s.b, s.c) * w * 0.3
      y = contact.y + gauss(s.c, s.d) * h * 0.22
    } else if (s.a < 0.62) {
      const along = s.b * 0.7 * h
      x = contact.x - along * Math.SQRT1_2 + (s.c - 0.5) * w * 0.2
      y = contact.y + along * Math.SQRT1_2 + (s.d - 0.5) * w * 0.14
    } else if (s.a < 0.9) {
      x = w * (0.03 + s.b * 0.94)
      y = h * (0.03 + s.c * 0.8)
    } else {
      x = w * (0.05 + Math.floor(s.b * 5) * 0.065)
      y = h * (0.05 + s.c * 0.5)
    }
    return { x: clamp(x, MARGIN, w - MARGIN), y: clamp(y, MARGIN, h - MARGIN) }
  })

  // When each front really passes through each piece: where the piece is seen (bent by the plate it is behind) and where the front is seen there
  // (its shape toward that angle, and its shift behind that plate) — so what the eye sees is the front crossing the piece, not a timer.
  const hitsOf = (from: Point) => {
    const b = bendPx(from.x, from.y, view)
    return FRONT_BIRTHS.map((birth, index) => {
      const seed = index * 3.7
      let at = birth
      for (let pass = 0; pass < 2; pass++) {
        const refraction = 1 - 0.5 * Math.min(1, (at - birth) / 3.4)
        const dx = from.x - b.dx - contact.x - frontShift(b.slab, view) * refraction
        const dy = from.y - b.dy - contact.y
        at = birth + Math.hypot(dx, dy) / frontShape(Math.atan2(dy, dx), seed) / speed
      }
      const angle = Math.atan2(from.y - b.dy - contact.y, from.x - b.dx - contact.x)
      return { at, strength: frontVigor(index, at) * (0.35 + 0.65 * frontPresence(angle, seed)) }
    })
  }
  const converging = seeds.map((_, i) => i).filter((i) => seeds[i].layer !== 'far' && !seeds[i].word)
  // Left to right: each converging fragment goes to the dot at the same rank, so the flow does not cross itself.
  const order = [...converging].sort((i, j) => scatter[i].x - scatter[j].x)
  const dots = [...targets].sort((p, q) => p.x - q.x)
  const rankOf = new Map(order.map((index, rank) => [index, rank]))

  return seeds.map((s, index) => {
    const from = scatter[index]
    const near = Math.min(1, Math.hypot(from.x - contact.x, from.y - contact.y) / reach)
    const hits = hitsOf(from)
    const [lo, hi] = LAYER_PX[s.layer]
    const px = snapSize(lerp(lo, hi, s.size * s.size)) * clamp(w / 390, 0.9, 1.4)
    const rank = rankOf.get(index)
    if (rank !== undefined && dots.length > 0) {
      const to = dots[Math.min(dots.length - 1, Math.round((rank * (dots.length - 1)) / Math.max(1, order.length - 1)))]
      // The convergence spreads from the contact as the fronts did, and sweeps around it; every one is done by the time the structure is stable.
      const start = BEATS.converge + 0.42 * near + 0.08 * sweep(from, contact) + 0.04 * s.d
      const dur = clamp(0.62 + 0.24 * s.c, 0.45, BEATS.stable + 0.1 - start)
      return { ...s, converges: true, sx: from.x, sy: from.y, tx: to.x, ty: to.y, start, dur, hits, bend: swirl(s.b) * Math.hypot(to.x - from.x, to.y - from.y), px }
    }
    // Drawn in: a third of the way to the contact, over about the same time, and out.
    const start = BEATS.converge + 0.1 + 0.35 * near + 0.06 * sweep(from, contact) + 0.04 * s.d
    const dur = clamp(0.6 + 0.3 * s.c, 0.45, BEATS.stable + 0.1 - start)
    const tx = lerp(from.x, contact.x, 0.3 + 0.1 * s.b)
    const ty = lerp(from.y, contact.y, 0.3 + 0.1 * s.b)
    return { ...s, converges: false, sx: from.x, sy: from.y, tx, ty, start, dur, hits, bend: swirl(s.b) * 0.6 * Math.hypot(tx - from.x, ty - from.y), px }
  })
}

export interface FragmentFrame {
  x: number
  y: number
  alpha: number
  /** 1 → smaller as it becomes a dot. */
  scale: number
  /** 0..1: the wave is passing through it (it brightens, warms and splits into its prismatic fringe). */
  heat: number
  /** How the piece is turned and stretched: toward the contact as it is drawn to it, along its path as it goes to the structure; 1 and 0 at rest. */
  stretch: number
  angle: number
}

/** The band of a front, as it crosses a piece (px at 390 wide): how long the piece is disturbed is this over the front's speed. */
const WAVE_WIDTH = 0.07
/** What one front leaves behind in a piece, at full strength: this much more order (0..1, a share of its way to the structure). */
const ORDER_STEP = 0.045
/** How long a piece takes to settle into that order once the front has passed (s). */
const ORDER_SETTLE = 0.4

/** The fronts in a piece at `t`: how disturbed it is now (the band passing through it), and how much order the ones gone by have left in it. */
export function frontsIn(p: Placed, t: number, view: View): { pulse: number; order: number } {
  const band = (WAVE_WIDTH * view.w) / frontSpeed(view)
  let pulse = 0
  let order = 0
  for (const hit of p.hits) {
    const dt = t - hit.at
    // A front that had spent itself before it got here does nothing here.
    if (hit.strength < 0.02 || dt < -3 * band) continue
    pulse = Math.max(pulse, hit.strength * Math.exp(-((dt / band) ** 2)))
    order += ORDER_STEP * Math.min(1, 0.4 + hit.strength) * smooth(dt / ORDER_SETTLE)
  }
  return { pulse, order }
}

export function fragmentAt(p: Placed, t: number, contact: Point, view: View): FragmentFrame {
  const { w } = view
  const appear = smooth((t - p.d * 0.25) / 0.45)

  // The fronts that have really reached it: the one passing disturbs it; the ones gone by have left it a little more in order.
  const { pulse, order } = frontsIn(p, t, view)

  // While scattered it hangs in the glass: a slow drift — calmer with each front that has passed — that settles as it sets off (far pieces drift more).
  const settle = (1 - smooth((t - p.start) / 0.3)) * Math.max(0.35, 1 - 3.5 * order)
  const sway = p.layer === 'far' ? 3.6 : 2.6
  const fx = Math.sin(t * 0.8 + p.a * 6.283) * sway * settle
  const fy = Math.cos(t * 0.65 + p.b * 6.283) * sway * settle

  const dx = p.sx - contact.x
  const dy = p.sy - contact.y
  const dist = Math.hypot(dx, dy) || 1

  // The glass answers the touch: what is near the contact is drawn toward it, and deformed — stretched along the way it is pulled.
  const amp = smooth((t - 0.42) / 0.18) * (1 - smooth((t - 0.95) / 0.35))
  const lens = amp * Math.exp(-((dist / (0.2 * w)) ** 2))

  // Its way to the structure: the order the fronts left is the first part of it; the convergence carries it the rest of the way.
  const e = easeInOut((t - p.start) / p.dur)
  const progress = order + (1 - order) * e
  // Pushed out by the front as it passes, drawn in by the glass as it settles.
  const push = pulse * w * 0.02 * (1 - e) - lens * 12 * (1 - e)
  const nx = -(p.ty - p.sy)
  const ny = p.tx - p.sx
  const nl = Math.hypot(nx, ny) || 1
  const arc = Math.sin(Math.PI * e) * p.bend * (1 - order)

  const x = lerp(p.sx + fx, p.tx, progress) + (dx / dist) * push + (nx / nl) * arc
  const y = lerp(p.sy + fy, p.ty, progress) + (dy / dist) * push + (ny / nl) * arc

  // The orientation: toward the contact while the glass holds it, a little toward its way once the fronts have ordered it, then along its path as it goes to the structure.
  const flying = p.converges ? Math.sin(Math.PI * clamp((t - p.start) / p.dur, 0, 1)) : 0
  const flow = Math.atan2(p.ty - p.sy, p.tx - p.sx)
  const towards = Math.atan2(-dy, -dx)
  // Angles are folded to ±90° so a letter is never turned upside down.
  const fold = (a: number) => ((((a + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2
  const ordered = p.converges ? order * (1 - flying) : 0
  const turn = fold(towards) * lens * 0.35 + fold(flow) * (flying * 0.28 + ordered * 1.2)
  const stretch = 1 + 0.55 * lens + 0.3 * flying + 0.35 * pulse

  const base = p.layer === 'far' ? 0.42 + 0.2 * p.size : p.layer === 'mid' ? 0.72 + 0.28 * p.size : 0.92
  // The front bends it as it crosses it: a little larger, for a moment.
  const swell = 1 + 0.3 * lens + 0.08 * pulse
  if (p.converges) {
    // It hands itself over to the dot of the wordmark as it arrives; the order the fronts left in it makes it a little surer.
    const arrive = smooth((t - (p.start + p.dur - 0.12)) / 0.26)
    const alpha = appear * (base * (1 + 0.6 * order) + 0.5 * pulse) * (1 - arrive)
    return { x, y, alpha: clamp(alpha, 0, 1), scale: lerp(1, 0.6, e) * swell, heat: pulse, stretch, angle: turn }
  }
  // Drawn in and gone: it fades as it is taken (and a little with each front: it is not part of the structure).
  const gone = smooth((t - (p.start + p.dur * 0.35)) / (p.dur * 0.8))
  const alpha = appear * (base * (1 - 1.2 * order) + 0.4 * pulse) * (1 - gone)
  return { x, y, alpha: clamp(alpha, 0, 1), scale: lerp(1, 0.75, e) * swell, heat: pulse, stretch, angle: turn }
}
