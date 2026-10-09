import { BEATS, FRAGMENTS_END } from './beats'

/**
 * The fragments of APARICIÓN: pieces of the words the system is made of — not
 * text to read, information that reacts. They are scattered over the glass,
 * a wave from the point of contact pushes them, and they travel to the dots of
 * the wordmark. Everything here is a pure function of time, so a frame can be
 * drawn at any moment (and a still one for reduced motion).
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

export interface FragmentSeed {
  text: string
  /** Warm (vermilion/ember) instead of ice. */
  warm: boolean
  /** 0..1: how large, relative to the range. */
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
    let pick = r()
    let length = 1
    for (const [l, w] of LENGTHS) {
      length = l
      if ((pick -= w) <= 0) break
    }
    length = Math.min(length, word.length)
    const start = Math.floor(r() * (word.length - length + 1))
    return { text: word.slice(start, start + length), warm: r() < 0.16, size: r(), a: r(), b: r(), c: r(), d: r() }
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
  /** Where it rests while scattered, and where it ends: a dot of the wordmark. */
  sx: number
  sy: number
  tx: number
  ty: number
  /** Seconds at which it sets off, and how long it takes. */
  start: number
  dur: number
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

/** Only a few sizes of type, so that the canvas has few sprites to make (and every piece of text of a size shares one). */
const SIZES = [12, 15, 19, 24]
export const snapSize = (px: number) => SIZES.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), SIZES[0])

/**
 * Where each fragment rests. Most gather around the point of contact (where the
 * information is about to react), some lie along the path of the finger, and a few
 * stand in loose columns at the top left, like data that has not arrived anywhere yet.
 */
export function placeFragments(seeds: FragmentSeed[], view: View, contact: Point, targets: Point[]): Placed[] {
  const { w, h } = view
  const scatter = seeds.map((s) => {
    let x: number
    let y: number
    if (s.a < 0.56) {
      x = contact.x + gauss(s.b, s.c) * w * 0.27
      y = contact.y + gauss(s.c, s.d) * h * 0.2
    } else if (s.a < 0.74) {
      const along = s.b * 0.62 * h
      x = contact.x - along * Math.SQRT1_2 + (s.c - 0.5) * w * 0.16
      y = contact.y + along * Math.SQRT1_2 + (s.d - 0.5) * w * 0.12
    } else {
      x = w * (0.05 + Math.floor(s.b * 5) * 0.065)
      y = h * (0.05 + s.c * 0.5)
    }
    return { x: clamp(x, MARGIN, w - MARGIN), y: clamp(y, MARGIN, h - MARGIN) }
  })

  // Left to right: each fragment goes to the dot at the same rank, so the flow does not cross itself.
  const order = scatter.map((_, i) => i).sort((i, j) => scatter[i].x - scatter[j].x)
  const dots = [...targets].sort((p, q) => p.x - q.x)
  const maxDist = Math.max(1, ...scatter.map((p) => Math.hypot(p.x - contact.x, p.y - contact.y)))

  const placed = new Array<Placed>(seeds.length)
  order.forEach((index, rank) => {
    const s = seeds[index]
    const from = scatter[index]
    const to = dots.length === 0 ? from : dots[Math.min(dots.length - 1, Math.round((rank * (dots.length - 1)) / Math.max(1, seeds.length - 1)))]
    const near = Math.hypot(from.x - contact.x, from.y - contact.y) / maxDist
    // The nearer to the contact, the sooner it reacts; every one is done by the time the structure is stable.
    const start = BEATS.reorganize + 0.22 * near + 0.1 * s.d
    const dur = clamp(0.58 + 0.24 * s.c, 0.4, BEATS.stable + 0.1 - start)
    placed[index] = {
      ...s,
      sx: from.x,
      sy: from.y,
      tx: to.x,
      ty: to.y,
      start,
      dur,
      bend: (s.b - 0.5) * 0.22 * Math.hypot(to.x - from.x, to.y - from.y),
      px: snapSize(lerp(12, 24, s.size * s.size)) * clamp(w / 390, 0.9, 1.4),
    }
  })
  return placed
}

export interface FragmentFrame {
  x: number
  y: number
  alpha: number
  /** 1 → smaller as it becomes a dot. */
  scale: number
  /** 0..1: the wave is passing through it (it brightens, warms and splits into its prismatic fringe). */
  heat: number
}

/** The wave: leaves the contact at BEATS.wave and crosses the glass at this many viewport widths per second. */
const WAVE_SPEED = 0.85
const WAVE_WIDTH = 0.07

export function fragmentAt(p: Placed, t: number, contact: Point, view: View): FragmentFrame {
  const { w } = view
  const appear = smooth((t - p.d * 0.25) / 0.45)

  // While scattered it hangs in the glass: a slow drift that settles as it sets off.
  const settle = 1 - smooth((t - p.start) / 0.3)
  const fx = Math.sin(t * 0.8 + p.a * 6.283) * 2.6 * settle
  const fy = Math.cos(t * 0.65 + p.b * 6.283) * 2.6 * settle

  // The wave from the point of contact: a ring of push that passes through.
  const dx = p.sx - contact.x
  const dy = p.sy - contact.y
  const dist = Math.hypot(dx, dy) || 1
  const radius = Math.max(0, t - BEATS.wave) * WAVE_SPEED * w
  const pulse = t < BEATS.wave ? 0 : Math.exp(-(((dist - radius) / (WAVE_WIDTH * w)) ** 2))

  const e = easeInOut((t - p.start) / p.dur)
  const push = pulse * w * 0.022 * (1 - e)
  const nx = -(p.ty - p.sy)
  const ny = p.tx - p.sx
  const nl = Math.hypot(nx, ny) || 1
  const arc = Math.sin(Math.PI * e) * p.bend

  const x = lerp(p.sx + fx, p.tx, e) + (dx / dist) * push + (nx / nl) * arc
  const y = lerp(p.sy + fy, p.ty, e) + (dy / dist) * push + (ny / nl) * arc

  // It hands itself over to the dot of the wordmark as it arrives.
  const arrive = smooth((t - (p.start + p.dur - 0.12)) / 0.26)
  const base = 0.72 + 0.28 * p.size
  const alpha = appear * (base + 0.5 * pulse) * (1 - arrive)
  return { x, y, alpha: clamp(alpha, 0, 1), scale: lerp(1, 0.6, e), heat: pulse }
}

/** After FRAGMENTS_END nothing is left to draw. */
export const fragmentsDone = (t: number) => t >= FRAGMENTS_END
