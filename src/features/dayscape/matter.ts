import { BREAKUP, lengthOf, pointAt, type FormId, type Fragment, type P } from './forms'
import type { Plane, TemporalSide } from './model'

/**
 * ONE MATTER — how DAYSCAPE comes apart when the day is left for HOY.
 *
 *   FORMS → FRAGMENTS → PARTICLE FIELD → CONVERGENCE
 *
 * A form first opens into its own pieces (shards: parts of its fragments that
 * drift apart and turn, each form in its own way); the shards erode into
 * microfragments (tiny strokes of the same matter), which settle into points;
 * the points hang in depth for a moment and then converge on AHORA. No
 * explosion: everything moves a few pixels per second, softly damped.
 *
 * Pure bookkeeping, deterministic with a seeded random; drawing lives in the
 * canvas component. Times are exit milliseconds (from CONTINUAR).
 */
export interface Shard {
  /** The fragment (unit space) and the part of it this shard carries. */
  frag: Fragment
  s0: number
  s1: number
  /** Center and radius of the form it belonged to (px). */
  cx: number
  cy: number
  radius: number
  /** Where it drifts (unit vector) and how far (px) by the end of its life. */
  dir: P
  push: number
  /** Turn around the form's center (rad) by the end of its life. */
  spin: number
  /** Erosion: from both ends, or from its inner end outward. */
  erode: 'ends' | 'inner'
  born: number
  /** Starts to erode… */
  erodeAt: number
  /** …and is gone. */
  end: number
  width: number
  stroke: number
  fill: number
  /** Presence of the form it came from. */
  alpha: number
  side: TemporalSide
  plane: Plane
}

export type Fate = 'fade' | 'absorb' | 'module'

export interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  /** A microfragment is a short stroke (px) that shrinks into a point. */
  len: number
  angle: number
  spin: number
  /** How long (ms) it stays a stroke before it is only a point. */
  lenLife: number
  r: number
  a: number
  born: number
  seed: number
  /** A few catch the light for an instant: silver reflections. */
  glint: boolean
  side: TemporalSide
  plane: Plane
  fate: Fate
  cell?: { x: number; y: number; r: number; a: number }
  sx: number
  sy: number
  delay: number
  dur: number
}

export interface Matter {
  shards: Shard[]
  motes: Mote[]
}

export interface Source {
  form: FormId
  /** The shape it has at that moment (a morph may be halfway). */
  fragments: Fragment[]
  /** Visible part of each fragment ([start, end] along it): the past is already eroded. */
  visible: (i: number) => [number, number]
  x: number
  y: number
  radius: number
  alpha: number
  side: TemporalSide
  plane: Plane
  /** Exit ms when it lets go. */
  start: number
}

/** Matter per plane: more, larger and sharper near; fewer, smaller and fainter far. */
const DENSITY: Record<Plane, { motes: number; size: number; len: number }> = {
  fg: { motes: 1.6, size: 1.2, len: 1 },
  mid: { motes: 1.1, size: 0.95, len: 0.75 },
  bg: { motes: 0.7, size: 0.72, len: 0.55 },
}

/** How long a shard lives before it is only microfragments (ms). */
export const SHARD_MS = { erode: 380, life: 950 } as const

export const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const unit = (x: number, y: number): P => {
  const len = Math.hypot(x, y)
  return len < 1e-6 ? [0, -1] : [x / len, y / len]
}

function tangentAt(f: Fragment, t: number): P {
  const u = 1 - t
  const [a, b, c, d] = f.p
  const x = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0])
  const y = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1])
  return unit(x, y)
}

/** Progress of a shard's drift (0 → 1) at time t. */
export const shardDrift = (s: Shard, t: number) => easeOut(clamp01((t - s.born) / (s.end - s.born)))

/** Visible part of a shard at time t, as [from, to] along its fragment (empty once eroded). */
export function shardRange(s: Shard, t: number): [number, number] {
  const q = clamp01((t - s.erodeAt) / (s.end - s.erodeAt))
  const span = s.s1 - s.s0
  if (s.erode === 'inner') return [s.s0 + span * q, s.s1]
  return [s.s0 + (span * q) / 2, s.s1 - (span * q) / 2]
}

/** A point of a shard on screen at time t (s along its fragment). */
export function shardPoint(s: Shard, along: number, t: number): P {
  const e = shardDrift(s, t)
  const q = pointAt(s.frag, along)
  const a = s.spin * e
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [
    s.cx + (q[0] * cos - q[1] * sin) * s.radius + s.dir[0] * s.push * e,
    s.cy + (q[0] * sin + q[1] * cos) * s.radius + s.dir[1] * s.push * e,
  ]
}

/** Velocity (px/s) a microfragment takes when it leaves its shard, form by form. */
function releaseVelocity(form: FormId, tangent: P, out: P, axis: P, rand: () => number): P {
  const jitter = (k: number): P => {
    const a = rand() * Math.PI * 2
    return [Math.cos(a) * k, Math.sin(a) * k]
  }
  switch (form) {
    case 'cardinal': {
      // Corners separate: straight out.
      const k = 15 + rand() * 14
      const j = jitter(5)
      return [out[0] * k + j[0], out[1] * k + j[1]]
    }
    case 'orbit': {
      // Keeps travelling along its curvature before it loses cohesion.
      const k = 24 + rand() * 16
      return [tangent[0] * k + out[0] * 4, tangent[1] * k + out[1] * 4]
    }
    case 'dissolving': {
      const j = jitter(7 + rand() * 11)
      return [j[0] + out[0] * 3, j[1] + out[1] * 3]
    }
    case 'axis': {
      // Along its own axis.
      const k = 13 + rand() * 14
      const j = jitter(4)
      return [axis[0] * k + j[0], axis[1] * k + j[1]]
    }
    case 'prism': {
      // Laminae drift apart slowly.
      const k = 8 + rand() * 8
      const j = jitter(4)
      return [out[0] * k + j[0], out[1] * k + j[1]]
    }
  }
}

function mote(
  x: number,
  y: number,
  v: P,
  src: Source,
  born: number,
  rand: () => number,
  angle: number,
  scale = 1,
): Mote {
  const d = DENSITY[src.plane]
  return {
    x,
    y,
    vx: v[0],
    vy: v[1],
    len: (2.4 + rand() * 3) * d.len * scale,
    angle,
    spin: (rand() - 0.5) * 3,
    lenLife: 450 + rand() * 380,
    r: (0.65 + rand() * 0.5) * d.size,
    a: src.alpha * (0.55 + rand() * 0.35),
    born,
    seed: rand() * 1000,
    glint: rand() < 0.16,
    side: src.side,
    plane: src.plane,
    fate: 'fade',
    sx: x,
    sy: y,
    delay: 0,
    dur: 1000,
  }
}

/** Turn a form into matter, in its own way. */
export function emitMatter(out: Matter, src: Source, rand: () => number): void {
  const { spread, spin } = BREAKUP[src.form]
  const d = DENSITY[src.plane]
  src.fragments.forEach((f, i) => {
    if (f.stroke < 0.05 && f.fill < 0.03) return
    const [v0, v1] = src.visible(i)
    if (v1 - v0 < 0.04) return
    const length = lengthOf(f) * (v1 - v0) * src.radius
    const pieces = Math.min(5, Math.max(1, Math.round(length / 7)))
    const axis = unit(f.p[3][0] - f.p[0][0], f.p[3][1] - f.p[0][1])
    for (let k = 0; k < pieces; k++) {
      // Pieces keep a hairline gap between them.
      const s0 = v0 + ((v1 - v0) * (k + 0.06)) / pieces
      const s1 = v0 + ((v1 - v0) * (k + 0.94)) / pieces
      const mid = pointAt(f, (s0 + s1) / 2)
      const out0 = unit(mid[0] + (rand() - 0.5) * 0.3, mid[1] + (rand() - 0.5) * 0.3)
      const born = src.start + rand() * 110
      const shard: Shard = {
        frag: f,
        s0,
        s1,
        cx: src.x,
        cy: src.y,
        radius: src.radius,
        dir: out0,
        push: spread * src.radius * (0.9 + rand() * 0.6) + 5 + rand() * 6,
        spin: ((spin + (rand() - 0.5) * 24) * Math.PI) / 180,
        erode: src.form === 'axis' ? 'inner' : 'ends',
        born,
        erodeAt: born + SHARD_MS.erode * (0.85 + rand() * 0.3),
        end: born + SHARD_MS.life * (0.9 + rand() * 0.25),
        width: f.width,
        stroke: f.stroke,
        fill: f.fill,
        alpha: src.alpha,
        side: src.side,
        plane: src.plane,
      }
      out.shards.push(shard)

      // As it erodes it sheds microfragments where it is losing matter.
      const pieceLength = length / pieces
      const n = Math.max(2, Math.round((pieceLength / 2.6) * d.motes))
      for (let j = 0; j < n; j++) {
        const q = (j + 0.5 + (rand() - 0.5) * 0.6) / n
        const t = shard.born + 120 + q * (shard.end - shard.born - 120)
        const [a, b] = shardRange(shard, t)
        // The point being lost: an end of what is left (the inner end for axes).
        const along = shard.erode === 'inner' ? a : rand() < 0.5 ? a : b
        const [x, y] = shardPoint(shard, along, t)
        const e = shardDrift(shard, t)
        const tangent = tangentAt(f, along)
        const rot = shard.spin * e
        const tx = tangent[0] * Math.cos(rot) - tangent[1] * Math.sin(rot)
        const ty = tangent[0] * Math.sin(rot) + tangent[1] * Math.cos(rot)
        const outDir = unit(x - src.x, y - src.y)
        const v = releaseVelocity(src.form, [tx, ty], outDir, axis, rand)
        out.motes.push(mote(x, y, v, src, t, rand, Math.atan2(ty, tx), src.form === 'prism' ? 1.3 : 1))
      }
    }
  })

  // Its light breaks too: a few loose points in the Astral Fade around it.
  const dust = Math.round(4 + 6 * d.motes)
  for (let j = 0; j < dust; j++) {
    const a = rand() * Math.PI * 2
    const r = src.radius * (0.9 + rand() * 1.4)
    const v: P = [Math.cos(a) * (3 + rand() * 6), Math.sin(a) * (3 + rand() * 6)]
    const m = mote(src.x + Math.cos(a) * r, src.y + Math.sin(a) * r * 0.8, v, src, src.start + 150 + rand() * 650, rand, a, 0)
    m.a *= 0.55
    out.motes.push(m)
  }
}

/**
 * Convergence on AHORA: the four nearest points complete the corners of the
 * AHORA module, about a quarter of the rest is absorbed by the present, the
 * rest dissolves where it is.
 */
export function assignFates(motes: Mote[], anchor: { x: number; y: number }, cells: Mote['cell'][], rand: () => number): void {
  const alive = motes.filter((m) => m.fate === 'fade')
  const d = (m: Mote) => Math.hypot(m.x - anchor.x, m.y - anchor.y)
  const sorted = [...alive].sort((p, q) => d(p) - d(q))
  const survivors = sorted.slice(0, cells.length)
  const angle = (p: { x: number; y: number }) => Math.atan2(p.y - anchor.y, p.x - anchor.x)
  const ordered = [...cells].sort((a, b) => angle(a!) - angle(b!))
  ;[...survivors]
    .sort((a, b) => angle(a) - angle(b))
    .forEach((m, i) => {
      m.fate = 'module'
      m.cell = ordered[i]
      m.delay = 100
      m.dur = 900
    })
  const rest = sorted.slice(cells.length)
  const absorbed = Math.round(rest.length * 0.25)
  rest.forEach((m, i) => {
    if (i < absorbed) {
      m.fate = 'absorb'
      m.delay = rand() * 250
      m.dur = 650 + rand() * 250
    } else {
      m.fate = 'fade'
      m.delay = rand() * 250
      m.dur = 450 + rand() * 350
    }
  })
  for (const m of motes) {
    m.sx = m.x
    m.sy = m.y
  }
}

export interface Gathering {
  start: number
  anchor: { x: number; y: number }
}

/** Depth: while the particle field hangs, each plane drifts at its own pace. */
const PLANE_DRIFT: Record<Plane, number> = { fg: 8, mid: 4.5, bg: 2 }

/** Advance the matter to time `t` (dt in ms). */
export function stepMatter(motes: Mote[], t: number, dt: number, anchor: { x: number; y: number }, gathering?: Gathering): void {
  const damp = Math.exp((-dt / 1000) * 1.2)
  for (const m of motes) {
    if (t < m.born) continue
    const g = gathering && t >= gathering.start ? clamp01((t - gathering.start - m.delay) / m.dur) : -1
    if (g >= 0 && m.fate !== 'fade') {
      const e = easeInOut(g)
      const target = m.fate === 'module' && m.cell ? m.cell : gathering!.anchor
      m.x = m.sx + (target.x - m.sx) * e
      m.y = m.sy + (target.y - m.sy) * e
      continue
    }
    m.vx *= damp
    m.vy *= damp
    m.angle += (m.spin * dt) / 1000
    // Slow, individual drift, and a slow opening away from the present: depth, not explosion.
    const out = unit(m.x - anchor.x, m.y - anchor.y)
    const k = (PLANE_DRIFT[m.plane] * dt) / 1000
    const wander = 0.0032 * dt
    m.x += (m.vx * dt) / 1000 + out[0] * k + Math.sin(t * 0.0009 + m.seed) * wander
    m.y += (m.vy * dt) / 1000 + out[1] * k + Math.cos(t * 0.0008 + m.seed * 1.3) * wander
  }
}

/** Visible stroke length, radius and alpha at time `t`; module points also report how solid they are. */
export function moteLook(m: Mote, t: number, gathering?: Gathering): { len: number; r: number; a: number; solid: number } {
  if (t < m.born) return { len: 0, r: 0, a: 0, solid: 0 }
  const age = t - m.born
  const len = m.len * (1 - clamp01(age / m.lenLife)) ** 1.4
  // Silver reflections: now and then a point catches the light.
  const shine = m.glint ? 1 + 0.9 * Math.max(0, Math.sin(t * 0.004 + m.seed)) ** 6 : 1
  const a = Math.min(1, m.a * Math.min(1, age / 140) * shine)
  const r = m.r
  if (!gathering || t < gathering.start) return { len, r, a, solid: 0 }
  const e = easeInOut(clamp01((t - gathering.start - m.delay) / m.dur))
  if (m.fate === 'module' && m.cell) return { len: 0, r: r + (m.cell.r - r) * e, a: a + (m.cell.a - a) * e, solid: clamp01((e - 0.55) / 0.45) }
  if (m.fate === 'absorb') return { len: len * (1 - e), r: r * (1 - 0.6 * e), a: a * (1 - e * e * e), solid: 0 }
  return { len: len * (1 - e), r: r * (1 + 0.6 * e), a: a * (1 - e), solid: 0 }
}
