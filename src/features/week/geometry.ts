import type { DayPart, WeekDay, WeekTense } from '../../domain/week'

/**
 * SEMANA — a small abstract galaxy of seven glass objects. Pure: it only turns
 * the week into forms, places and a light network; the components draw them.
 *
 * Each day is an irregular sculptural lens: one family, seven individuals.
 * Its outline lives in its own plane (a tenser far edge, a fuller near edge,
 * one end a little wider, a slight twist) and is seen in perspective, so the
 * same object can turn toward us without ever becoming a circle.
 *
 * A day's load is read in the glass, never in a number:
 *   thickness   how deep the dome is (the glass seen under its face)
 *   frost       how clear or clouded the glass is
 *   fog         the matter suspended inside (deep work)
 *   ring        the optical ring of an almost empty lens (Thursday: space)
 *   depth       one continuous, deeper interior (Sunday: a long period)
 */

/** Weighted minutes of a full day of maximum load (≈ Saturday). Fixed, so a week never rescales another. */
export const LOAD_REFERENCE = 720
/** Deep-work minutes of the densest day (≈ Saturday). */
export const DEEP_REFERENCE = 580
/** A focus period this long makes a day read deep (Sunday's 13:00–16:00). */
export const LONG_DEEP_MIN = 150

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export type Pt = [number, number]

/** Deterministic noise per day: the same day always has the same glass. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export interface FogLayer {
  part: DayPart
  /** 0–1: how much matter the part holds. */
  matter: number
  density: number
}

export interface LensForm {
  seed: number
  /** Width relative to the family's common width. */
  widthK: number
  /** Depth / width of the outline in its own plane. */
  aspect: number
  /** Tension of the far and near edges (superellipse exponents: 2 an ellipse, higher tenser). */
  nFar: number
  nNear: number
  /** One end a little wider (−: left, +: right). */
  wide: number
  /** Slight torsion of the outline. */
  twist: number
  /** Orientation in its own plane (rad): each lens is seen from its own angle. */
  rot: number
  /** Irregularity of the edge. */
  asym: number
  /** How much of its face we see at rest (sine of the view elevation). */
  view: number
  /** Inclination on screen (deg). */
  tilt: number
  /** Thickness of the dome, fraction of the width. */
  thickness: number
  /** Opacity of the glass body. */
  frost: number
  /** Interior fog, 0–1. */
  fog: number
  /** Optical ring, 0–1. */
  ring: number
  /** Continuous deep interior (Sunday), 0–1. */
  depth: number
  /** Normalized load, 0–1. */
  load: number
  /** Where the reflections fall: never twice the same. */
  light: { at: number; span: number; second: number; band: number }
  layers: FogLayer[]
  tense: WeekTense
}

/** Load → glass. Eased so the heavy days separate from the ordinary ones without growing. */
export function lensForm(day: WeekDay, index: number): LensForm {
  const rand = seeded(97 + index * 131)
  const load = clamp01(day.load / LOAD_REFERENCE)
  const shaped = load ** 2.2
  const deep = clamp01(day.minutes.deep / DEEP_REFERENCE) ** 1.4
  const long = day.maxDeep >= LONG_DEEP_MIN
  const empty = day.minutes.deep === 0
  return {
    seed: 11 + index * 7,
    widthK: long ? 1.18 : empty ? 1.06 : 0.95 + rand() * 0.08,
    aspect: long ? 0.62 : empty ? 0.8 : 0.76 + rand() * 0.1,
    nFar: 2.08 + rand() * 0.3,
    nNear: empty ? 2.05 : 1.9 + rand() * 0.2,
    wide: (rand() - 0.5) * 0.26,
    twist: (rand() - 0.5) * 0.18,
    rot: (rand() - 0.5) * 0.34,
    asym: 0.014 + rand() * 0.02,
    view: empty ? 0.4 : 0.44 + rand() * 0.06,
    tilt: (rand() - 0.5) * 9,
    thickness: empty ? 0.014 : 0.05 + shaped * 0.17 + (long ? 0.02 : 0),
    frost: empty ? 0.02 : 0.06 + shaped * 0.32,
    fog: empty ? 0.06 : 0.16 + deep * 0.84,
    ring: empty ? 0.9 : 0.3 - shaped * 0.15,
    depth: long ? 0.85 : 0,
    load,
    light: { at: 0.52 + rand() * 0.3, span: 0.16 + rand() * 0.14, second: rand(), band: 0.2 + rand() * 0.2 },
    layers: day.layers.map((l) => ({ part: l.part, matter: clamp01(l.matter), density: clamp01(l.density) })),
    tense: day.tense,
  }
}

/* ------------------------------------------------------------------------ */
/* The lens: its outline in its own plane, and how it is seen                 */
/* ------------------------------------------------------------------------ */

/** Outline in the lens's own plane, width 1 (× widthK): a tenser far edge, a fuller near edge. */
export function planeOutline(f: LensForm, points = 84): Pt[] {
  const rand = seeded(f.seed)
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const p3 = rand() * Math.PI * 2
  const a = f.widthK / 2
  const b = (f.widthK * f.aspect) / 2
  const cr = Math.cos(f.rot)
  const sr = Math.sin(f.rot)
  const out: Pt[] = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const n = s < 0 ? f.nFar : f.nNear
    const r = 1 + f.asym * Math.sin(2 * t + p1) + f.asym * 0.7 * Math.sin(3 * t + p2) + f.asym * 0.4 * Math.sin(5 * t + p3)
    let x = a * Math.sign(c) * Math.abs(c) ** (2 / n) * r
    let y = b * Math.sign(s) * Math.abs(s) ** (2 / n) * r
    y *= 1 + f.wide * (x / a)
    x += f.twist * y
    out.push([x * cr - y * sr, x * sr + y * cr])
  }
  return out
}

export interface LensView {
  /** The whole glass as seen (the dome's underside included). */
  silhouette: Pt[]
  /** The top surface: far edge + near edge. */
  face: Pt[]
  /** Far edge, left → right. */
  far: Pt[]
  /** Near edge of the face, left → right. */
  near: Pt[]
  /** Near edge carried down by the thickness: the glass's lower edge, left → right. */
  under: Pt[]
  bounds: { left: number; right: number; top: number; faceBottom: number; bottom: number }
}

/**
 * The lens of width `W` px seen at `view` (sine of the elevation: 0 edge-on,
 * 1 facing us). The far edge bounds it above; below, its thickness shows under
 * the near edge — deepest at the middle, vanishing at both ends, like a dome.
 */
export function viewLens(plane: Pt[], W: number, view: number, thickness: number): LensView {
  const pts: Pt[] = plane.map(([x, y]) => [x * W, y * W * view])
  const n = pts.length
  let iL = 0
  let iR = 0
  for (let i = 1; i < n; i++) {
    if (pts[i][0] < pts[iL][0]) iL = i
    if (pts[i][0] > pts[iR][0]) iR = i
  }
  const chain = (from: number, to: number) => {
    const c: Pt[] = []
    for (let i = from; ; i = (i + 1) % n) {
      c.push(pts[i])
      if (i === to) break
    }
    return c
  }
  const A = chain(iL, iR)
  const B = chain(iR, iL).reverse()
  const avg = (c: Pt[]) => c.reduce((s, p) => s + p[1], 0) / c.length
  const [far, near] = avg(A) < avg(B) ? [A, B] : [B, A]
  const left = pts[iL][0]
  const right = pts[iR][0]
  const mid = (left + right) / 2
  const half = (right - left) / 2 || 1
  const drop = thickness * W * Math.sqrt(Math.max(0, 1 - view * view))
  const under: Pt[] = near.map(([x, y]) => [x, y + drop * Math.sqrt(Math.max(0, 1 - ((x - mid) / half) ** 2))])
  const face = [...far, ...near.slice().reverse()]
  const silhouette = [...far, ...under.slice().reverse()]
  const ys = (c: Pt[]) => c.map((p) => p[1])
  return {
    silhouette,
    face,
    far,
    near,
    under,
    bounds: { left, right, top: Math.min(...ys(far)), faceBottom: Math.max(...ys(near)), bottom: Math.max(...ys(under)) },
  }
}

const f2 = (v: number) => v.toFixed(2)

/** Closed smooth path through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(pts: Pt[]): string {
  const n = pts.length
  let d = `M${f2(pts[0][0])},${f2(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)},${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)},${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])},${f2(p2[1])}`
  }
  return `${d}Z`
}

/** Open smooth path through points. */
export function smoothOpen(pts: Pt[]): string {
  const n = pts.length
  let d = `M${f2(pts[0][0])},${f2(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)},${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)},${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])},${f2(p2[1])}`
  }
  return d
}

/** A stretch of a chain (fractions of its length by index), optionally scaled and moved. */
export function stretch(chain: Pt[], from: number, to: number, s = 1, dy = 0): Pt[] {
  const n = chain.length - 1
  return chain.slice(Math.round(n * from), Math.round(n * to) + 1).map(([x, y]) => [x * s, y * s + dy])
}

/* ------------------------------------------------------------------------ */
/* The field: where each day floats                                           */
/* ------------------------------------------------------------------------ */

export type LabelSide = 'below' | 'left' | 'right'

export interface Placement {
  /** Center, px inside the field. */
  x: number
  y: number
  /** Depth: 0 near → 1 far. */
  z: number
  label: LabelSide
}

export interface Archipelago {
  /** Common lens width (px) at depth 0. */
  base: number
  items: Placement[]
  mobile: boolean
}

/**
 * Desktop: a small galaxy, not a row or a ring. The week drifts left → right
 * with an eddy (Thursday falls back into open air, low on the left); the near,
 * denser cluster sits right (Saturday, Sunday); Tuesday floats far and small.
 */
const WIDE: Omit<Placement, 'label'>[] = [
  { x: 0.105, y: 0.44, z: 0.55 },
  { x: 0.31, y: 0.2, z: 0.78 },
  { x: 0.425, y: 0.5, z: 0.6 },
  { x: 0.235, y: 0.76, z: 0.22 },
  { x: 0.545, y: 0.82, z: 0.42 },
  { x: 0.715, y: 0.56, z: 0.04 },
  { x: 0.845, y: 0.22, z: 0.1 },
]

/**
 * Mobile: its own field, read in loose pairs at different depths — never one
 * day per line. Offsets are wide, near days larger, far days smaller and softer.
 */
const NARROW: Placement[] = [
  { x: 0.22, y: 0.06, z: 0.62, label: 'right' },
  { x: 0.7, y: 0.17, z: 0.3, label: 'below' },
  { x: 0.3, y: 0.37, z: 0.3, label: 'below' },
  { x: 0.8, y: 0.41, z: 0.8, label: 'below' },
  { x: 0.2, y: 0.58, z: 0.55, label: 'below' },
  { x: 0.68, y: 0.645, z: 0.02, label: 'below' },
  { x: 0.33, y: 0.9, z: 0.14, label: 'right' },
]

export const MOBILE_MAX = 720

export function archipelago(width: number, height: number): Archipelago {
  const mobile = width < MOBILE_MAX
  if (mobile) {
    const base = Math.max(84, Math.min(112, width * 0.28, height * 0.17))
    return { base, mobile, items: NARROW.map((p) => ({ ...p, x: p.x * width, y: p.y * height })) }
  }
  const base = Math.max(130, Math.min(250, width * 0.168, height * 0.36))
  return { base, mobile, items: WIDE.map((p) => ({ ...p, x: p.x * width, y: p.y * height, label: 'below' })) }
}

/** Near days a little larger, far days smaller: depth, never a ranking of load. */
export const depthScale = (z: number) => 1.08 - z * 0.52
/** Far days soften and lose a little color and contrast. */
export const depthBlur = (z: number) => Math.max(0, z - 0.5) * 2.2
export const depthSaturation = (z: number) => 1 - z * 0.3
export const depthOpacity = (z: number) => 1 - z * 0.28

/* ------------------------------------------------------------------------ */
/* The light network                                                          */
/* ------------------------------------------------------------------------ */

export interface Fiber {
  /** Smooth path, px in the field. Also the path the glint travels. */
  d: string
  kind: 'orbit' | 'relation' | 'branch'
  /** 'back' passes behind every day; 'mid' crosses between far and near days. */
  layer: 'back' | 'mid'
  /** Days it relates (none for the orbits). */
  touches: number[]
  /** Share of the curve that exists, and where it starts (incomplete trajectories). */
  drawn: number
  offset: number
  /** Core stroke width and resting presence. */
  width: number
  base: number
  /** Seconds: breathing, glint, curvature — never in step. */
  breathe: number
  glint: number
  sway: number
  delay: number
}

export interface Spark {
  x: number
  y: number
  size: number
  dur: number
  delay: number
}

/** An open orbit: part of a tilted ellipse (normalized to the field). */
interface Orbit {
  cx: number
  cy: number
  rx: number
  ry: number
  rot: number
  from: number
  to: number
  layer: 'back' | 'mid'
  drawn: number
  sparks: number[]
}

const ORBITS_WIDE: Orbit[] = [
  { cx: 0.48, cy: 0.55, rx: 0.47, ry: 0.4, rot: -5, from: 150, to: 425, layer: 'back', drawn: 0.9, sparks: [0.14, 0.43, 0.7, 0.9] },
  { cx: 0.4, cy: 0.49, rx: 0.2, ry: 0.2, rot: 8, from: 195, to: 470, layer: 'mid', drawn: 0.84, sparks: [0.28, 0.62] },
  { cx: 0.77, cy: 0.42, rx: 0.13, ry: 0.19, rot: 24, from: 118, to: 262, layer: 'back', drawn: 0.9, sparks: [0.5] },
]

const ORBITS_NARROW: Orbit[] = [
  { cx: 0.5, cy: 0.5, rx: 0.62, ry: 0.36, rot: 62, from: 160, to: 450, layer: 'back', drawn: 0.9, sparks: [0.2, 0.52, 0.83] },
  { cx: 0.46, cy: 0.62, rx: 0.4, ry: 0.13, rot: -14, from: 180, to: 420, layer: 'mid', drawn: 0.82, sparks: [0.35, 0.74] },
]

/** Relations between days: a few, curved; one splits, one never quite arrives. */
interface Relation {
  from: number
  to: number
  bow: number
  drawn: number
  split?: boolean
}

const RELATIONS_WIDE: Relation[] = [
  { from: 2, to: 3, bow: -0.28, drawn: 0.92, split: true },
  { from: 4, to: 5, bow: 0.26, drawn: 0.9 },
  { from: 5, to: 6, bow: -0.32, drawn: 0.64 },
]

const RELATIONS_NARROW: Relation[] = [
  { from: 0, to: 1, bow: 0.3, drawn: 0.72 },
  { from: 2, to: 3, bow: -0.3, drawn: 0.9, split: true },
  { from: 4, to: 5, bow: 0.26, drawn: 0.88 },
]

function orbitPoints(o: Orbit, W: number, H: number, samples = 48): Pt[] {
  const r = (o.rot * Math.PI) / 180
  const pts: Pt[] = []
  for (let i = 0; i <= samples; i++) {
    const t = ((o.from + ((o.to - o.from) * i) / samples) * Math.PI) / 180
    const x = o.rx * W * Math.cos(t)
    const y = o.ry * H * Math.sin(t)
    pts.push([o.cx * W + x * Math.cos(r) - y * Math.sin(r), o.cy * H + x * Math.sin(r) + y * Math.cos(r)])
  }
  return pts
}

/** Point on a glass's outline toward `(tx, ty)`, a little outside it. */
function rimPoint(p: { x: number; y: number }, rx: number, ry: number, tx: number, ty: number, gap: number): Pt {
  const a = Math.atan2(ty - p.y, tx - p.x)
  return [p.x + Math.cos(a) * (rx + gap), p.y + Math.sin(a) * (ry + gap)]
}

const cubicAt = (p: Pt[], t: number): Pt => {
  const u = 1 - t
  return [
    u ** 3 * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t ** 3 * p[3][0],
    u ** 3 * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t ** 3 * p[3][1],
  ]
}

const cubicPath = (p: Pt[]) => `M${f2(p[0][0])},${f2(p[0][1])} C${f2(p[1][0])},${f2(p[1][1])} ${f2(p[2][0])},${f2(p[2][1])} ${f2(p[3][0])},${f2(p[3][1])}`

/**
 * The network of a composition: open orbits through the whole field (the
 * shared space), a few relations between days (one splits, one never quite
 * arrives), and small concentrations of light on the orbits.
 */
export function network(arch: Archipelago, extents: { rx: number; ry: number }[], width: number, height: number): { fibers: Fiber[]; sparks: Spark[] } {
  const rand = seeded(arch.mobile ? 23 : 5)
  const timing = () => ({ breathe: 20 + rand() * 40, glint: 24 + rand() * 34, sway: 30 + rand() * 30, delay: -rand() * 60 })
  const fibers: Fiber[] = []
  const sparks: Spark[] = []

  for (const o of arch.mobile ? ORBITS_NARROW : ORBITS_WIDE) {
    const pts = orbitPoints(o, width, height)
    fibers.push({ d: smoothOpen(pts), kind: 'orbit', layer: o.layer, touches: [], drawn: o.drawn, offset: (1 - o.drawn) * rand(), width: 0.85, base: 0.55, ...timing() })
    for (const at of o.sparks) {
      const [x, y] = pts[Math.round(at * (pts.length - 1))]
      sparks.push({ x, y, size: 3 + rand() * 3, dur: 7 + rand() * 9, delay: -rand() * 16 })
    }
  }

  for (const r of arch.mobile ? RELATIONS_NARROW : RELATIONS_WIDE) {
    const A = arch.items[r.from]
    const B = arch.items[r.to]
    const gap = arch.mobile ? 8 : 12
    const s = rimPoint(A, extents[r.from].rx, extents[r.from].ry, B.x, B.y, gap)
    const e = rimPoint(B, extents[r.to].rx, extents[r.to].ry, A.x, A.y, gap)
    const dx = e[0] - s[0]
    const dy = e[1] - s[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const bow = len * r.bow
    const cubic: Pt[] = [s, [s[0] + dx * 0.3 + nx * bow, s[1] + dy * 0.3 + ny * bow], [s[0] + dx * 0.72 + nx * bow * 0.8, s[1] + dy * 0.72 + ny * bow * 0.8], e]
    fibers.push({ d: cubicPath(cubic), kind: 'relation', layer: 'back', touches: [r.from, r.to], drawn: r.drawn, offset: 0, width: 0.8, base: 0.6, ...timing() })
    if (r.split) {
      // Part of the light leaves the fiber and fades on its own.
      const t0 = 0.46
      const p = cubicAt(cubic, t0)
      const q = cubicAt(cubic, t0 + 0.05)
      const tx = q[0] - p[0]
      const ty = q[1] - p[1]
      const tl = Math.hypot(tx, ty) || 1
      const ang = (r.bow > 0 ? -1 : 1) * 0.5
      const ux = (tx / tl) * Math.cos(ang) - (ty / tl) * Math.sin(ang)
      const uy = (tx / tl) * Math.sin(ang) + (ty / tl) * Math.cos(ang)
      const L = len * 0.42
      const branch: Pt[] = [p, [p[0] + ux * L * 0.35, p[1] + uy * L * 0.35], [p[0] + ux * L * 0.7 + nx * L * 0.1, p[1] + uy * L * 0.7 + ny * L * 0.1], [p[0] + ux * L, p[1] + uy * L]]
      fibers.push({ d: cubicPath(branch), kind: 'branch', layer: 'back', touches: [r.from], drawn: 0.9, offset: 0, width: 0.55, base: 0.34, ...timing() })
    }
  }
  return { fibers, sparks }
}
