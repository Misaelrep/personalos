import type { DayPart, WeekDay, WeekTense } from '../../domain/week'

/**
 * SEMANA — seven sculptural pieces of optical glass suspended in one field.
 * Pure: it only turns the week into forms, places and a light network; the
 * components draw them.
 *
 * Each day is a hand-molded glass pebble: seven real outlines of one family
 * (never an ellipse deformed by a formula), seen in perspective. Its top face
 * is inset from its edge — thin at the top, thick at the bottom — so the
 * glass shows its depth only at certain edges, as molded glass does.
 *
 * A day's load is read in the glass, never in a number:
 *   thickness   how deep the piece is (the edge band under its face)
 *   frost       how milky the glass is
 *   fog         the matter suspended inside (deep work)
 *   ring        the inner contour of an almost empty piece (Thursday: a membrane)
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

/**
 * Seven pebbles, Monday → Sunday: one family, seven individuals. Each is set
 * by hand — its proportion, which end is fuller, how tense its top, how heavy
 * its lower curve, how far its axis leans, a slight irregularity — and becomes
 * its own control outline (never one ellipse deformed by a formula for all).
 */
interface Pebble {
  /** Depth / width in its own plane. */
  aspect: number
  /** One end fuller: − the left, + the right. */
  egg: number
  /** Tension of the far edge (flatter top). */
  top: number
  /** Weight of the near edge (fuller lower curve). */
  bottom: number
  /** The axis leans a little. */
  lean: number
  /** A slight, hand-made irregularity. */
  bumps: [number, number]
}

const PEBBLES: Pebble[] = [
  // Lunes: compact, fuller on the left.
  { aspect: 0.74, egg: -0.13, top: 0.02, bottom: 0.05, lean: 0.03, bumps: [0.018, 1.1] },
  // Martes: flatter, a little inclined.
  { aspect: 0.64, egg: 0.13, top: 0.05, bottom: 0.02, lean: -0.07, bumps: [0.014, 2.3] },
  // Miércoles: more open at its right end.
  { aspect: 0.7, egg: 0.13, top: 0.03, bottom: 0.04, lean: 0.02, bumps: [0.016, 0.4] },
  // Jueves: long and fine, a membrane; rounder on the left.
  { aspect: 0.72, egg: -0.06, top: 0.02, bottom: 0.02, lean: 0, bumps: [0.012, 3.1] },
  // Viernes: compact, slightly twisted.
  { aspect: 0.74, egg: 0.15, top: 0.03, bottom: 0.03, lean: 0.07, bumps: [0.02, 1.7] },
  // Sábado: fuller and deeper, a heavier lower curve, its right end narrower.
  { aspect: 0.8, egg: -0.11, top: 0.03, bottom: 0.1, lean: -0.02, bumps: [0.016, 5.2] },
  // Domingo: longer and deeper.
  { aspect: 0.56, egg: 0.06, top: 0.02, bottom: 0.06, lean: 0.02, bumps: [0.014, 4.4] },
]

/** A pebble's control outline: 12 points, clockwise from the left end; negative y is the far edge. */
function pebbleOutline(p: Pebble): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 12; i++) {
    const t = Math.PI + (i / 12) * Math.PI * 2
    const r = 1 + p.bumps[0] * Math.sin(3 * t + p.bumps[1]) + p.bumps[0] * 0.6 * Math.sin(5 * t + p.bumps[1] * 2)
    const x = 0.5 * Math.cos(t) * r
    let y = (p.aspect / 2) * Math.sin(t) * r
    y *= 1 + p.egg * (x / 0.5)
    y *= y < 0 ? 1 - p.top : 1 + p.bottom
    pts.push([x, y + p.lean * x])
  }
  return pts
}

export const OUTLINES: Pt[][] = PEBBLES.map(pebbleOutline)

export interface FogLayer {
  part: DayPart
  /** 0–1: how much matter the part holds. */
  matter: number
  density: number
}

export type LightKind = 'streak' | 'patch' | 'spark' | 'faint'

export interface LensForm {
  seed: number
  /** Which of the seven outlines. */
  shape: number
  /** Width relative to the family's common width. */
  widthK: number
  /** Orientation in its own plane (rad): each piece is seen from its own angle. */
  rot: number
  /** How much of its face we see at rest (sine of the view elevation). */
  view: number
  /** Inclination on screen (deg). */
  tilt: number
  /** Thickness of the piece, fraction of the width. */
  thickness: number
  /** Milkiness of the glass. */
  frost: number
  /** Interior fog, 0–1. */
  fog: number
  /** Inner contour of an almost empty piece, 0–1. */
  ring: number
  /** Continuous deep interior (Sunday), 0–1. */
  depth: number
  /** Normalized load, 0–1. */
  load: number
  /** How the light falls on it: never twice the same. */
  light: { kind: LightKind; at: number; span: number; band: number }
  layers: FogLayer[]
  tense: WeekTense
}

const LIGHTS: LensForm['light'][] = [
  { kind: 'patch', at: 0.3, span: 0.24, band: 0.3 },
  { kind: 'spark', at: 0.78, span: 0.14, band: 0.26 },
  { kind: 'streak', at: 0.62, span: 0.3, band: 0.34 },
  { kind: 'faint', at: 0.5, span: 0.36, band: 0.24 },
  { kind: 'streak', at: 0.36, span: 0.22, band: 0.3 },
  { kind: 'streak', at: 0.7, span: 0.34, band: 0.28 },
  { kind: 'patch', at: 0.24, span: 0.3, band: 0.32 },
]

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
    shape: index % OUTLINES.length,
    widthK: long ? 1.08 : empty ? 1.04 : 0.96 + rand() * 0.05,
    rot: (rand() - 0.5) * 0.22,
    view: empty ? 0.38 : 0.5 + rand() * 0.06,
    tilt: (rand() - 0.5) * 7,
    thickness: empty ? 0.02 : 0.1 + shaped * 0.13 + (long ? 0.03 : 0),
    frost: empty ? 0.02 : 0.08 + shaped * 0.3,
    fog: empty ? 0.06 : 0.16 + deep * 0.84,
    ring: empty ? 0.9 : 0.4,
    depth: long ? 0.85 : 0,
    load,
    light: LIGHTS[index % LIGHTS.length],
    layers: day.layers.map((l) => ({ part: l.part, matter: clamp01(l.matter), density: clamp01(l.density) })),
    tense: day.tense,
  }
}

/* ------------------------------------------------------------------------ */
/* The piece: its outline in its own plane, and how it is seen                */
/* ------------------------------------------------------------------------ */

/** Closed Catmull-Rom through control points, sampled. */
function closedSpline(ctrl: Pt[], per: number): Pt[] {
  const n = ctrl.length
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n]
    const p1 = ctrl[i]
    const p2 = ctrl[(i + 1) % n]
    const p3 = ctrl[(i + 2) % n]
    for (let k = 0; k < per; k++) {
      const t = k / per
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  return out
}

/** The piece's outline in its own plane, width ≈ widthK, from its own control points. */
export function planeOutline(f: LensForm): Pt[] {
  const cr = Math.cos(f.rot)
  const sr = Math.sin(f.rot)
  return closedSpline(OUTLINES[f.shape], 9).map(([x, y]) => {
    const px = x * f.widthK
    const py = y * f.widthK
    return [px * cr - py * sr, px * sr + py * cr]
  })
}

export interface LensView {
  /** The whole piece as seen (its lower curve carried down by the thickness). */
  silhouette: Pt[]
  /** The top face's contour: inset from the edge, thin above, thick below. */
  face: Pt[]
  /** Far edge, left → right. */
  far: Pt[]
  /** Near edge before the thickness, left → right. */
  near: Pt[]
  /** The piece's lower edge, left → right. */
  under: Pt[]
  bounds: { left: number; right: number; top: number; faceBottom: number; bottom: number }
}

/**
 * The piece of width `W` px seen at `view` (sine of the elevation: 0 edge-on,
 * 1 facing us). The far edge bounds it above; below, its thickness fills the
 * lower curve — deepest in the middle, vanishing at both ends. The face is the
 * outline pulled toward a point high inside the piece, so the edge band is
 * thin above and thick below.
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
  const side = Math.sqrt(Math.max(0, 1 - view * view))
  const drop = thickness * W * side
  // Blunt at both ends: a pebble keeps its thickness almost to its tips, never an almond.
  const profile = (x: number) => Math.max(0, 1 - ((x - mid) / half) ** 2) ** 0.3
  // A pebble, not a bowl: its dome rises above the rim as its lower curve falls below it.
  const dome: Pt[] = far.map(([x, y]) => [x, y - drop * 0.42 * profile(x)])
  const under: Pt[] = near.map(([x, y]) => [x, y + drop * 0.58 * profile(x)])
  const silhouette = [...dome, ...under.slice().reverse()]
  const ys = (c: Pt[]) => c.map((p) => p[1])
  const top = Math.min(...ys(dome))
  const bottom = Math.max(...ys(under))
  // The face: the outline pulled toward a point high inside; the band shows the glass's depth.
  const band = Math.min(0.24, 0.035 + thickness * 0.9 * (0.4 + side))
  const cx = mid + half * 0.06
  const cy = top + (bottom - top) * 0.3
  const face: Pt[] = silhouette.map(([x, y]) => [cx + (x - cx) * (1 - band * 0.7), cy + (y - cy) * (1 - band)])
  return {
    silhouette,
    face,
    far: dome,
    near,
    under,
    bounds: { left, right, top, faceBottom: Math.max(...ys(face)), bottom },
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
  /** Common piece width (px) at depth 0. */
  base: number
  items: Placement[]
  mobile: boolean
}

/**
 * Desktop, after the approved reference: no center, no ring. Tuesday and
 * Wednesday far and small; Monday, Thursday and Friday in the middle ground
 * (Thursday low, in open air); Saturday and Sunday near, together on the right.
 * Large voids, a near pair, isolated pieces.
 */
const WIDE: Omit<Placement, 'label'>[] = [
  { x: 0.085, y: 0.42, z: 0.6 },
  { x: 0.325, y: 0.16, z: 0.86 },
  { x: 0.455, y: 0.46, z: 0.8 },
  { x: 0.235, y: 0.71, z: 0.42 },
  { x: 0.58, y: 0.77, z: 0.54 },
  { x: 0.775, y: 0.52, z: 0.14 },
  { x: 0.905, y: 0.17, z: 0.05 },
]

/**
 * Mobile: a vertical field, not a list — the eye goes left, right, center,
 * left, right, center, right; deep, middle and near pieces alternate.
 */
const NARROW: Placement[] = [
  { x: 0.21, y: 0.07, z: 0.78, label: 'right' },
  { x: 0.76, y: 0.17, z: 0.45, label: 'below' },
  { x: 0.47, y: 0.35, z: 0.14, label: 'below' },
  { x: 0.18, y: 0.53, z: 0.48, label: 'below' },
  { x: 0.8, y: 0.53, z: 0.84, label: 'below' },
  { x: 0.38, y: 0.66, z: 0.04, label: 'below' },
  { x: 0.75, y: 0.9, z: 0.3, label: 'left' },
]

export const MOBILE_MAX = 720

export function archipelago(width: number, height: number): Archipelago {
  const mobile = width < MOBILE_MAX
  if (mobile) {
    const base = Math.max(92, Math.min(124, width * 0.31, height * 0.19))
    return { base, mobile, items: NARROW.map((p) => ({ ...p, x: p.x * width, y: p.y * height })) }
  }
  const base = Math.max(140, Math.min(280, width * 0.212, height * 0.42))
  return { base, mobile, items: WIDE.map((p) => ({ ...p, x: p.x * width, y: p.y * height, label: 'below' })) }
}

/** Near pieces larger, far ones smaller: depth, never a ranking of load. */
export const depthScale = (z: number) => 1.06 - z * 0.46
/** Far pieces soften and lose a little color, contrast and refraction. */
export const depthBlur = (z: number) => Math.max(0, z - 0.6) * 1.3
export const depthSaturation = (z: number) => 1 - z * 0.24
export const depthOpacity = (z: number) => 1 - z * 0.12

/* ------------------------------------------------------------------------ */
/* The light network                                                          */
/* ------------------------------------------------------------------------ */

export interface Fiber {
  /** Smooth path, px in the field. Also the path the glint travels. */
  d: string
  kind: 'fiber' | 'branch'
  /** 'back' passes behind every piece; 'mid' crosses between far and near pieces. */
  layer: 'back' | 'mid'
  /** Days it passes near (none for the fibers that only join regions). */
  near: number[]
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

/** An open fiber: a free curve through the field (normalized), never an orbit. */
interface Course {
  pts: Pt[]
  layer: 'back' | 'mid'
  near: number[]
  drawn: number
  offset: number
  base: number
  sparks: number[]
  /** A part of its light leaves at this point and fades on its own. */
  branch?: { at: number; pts: Pt[] }
}

const COURSES_WIDE: Course[] = [
  // Enters from the left edge, rises toward Tuesday and never quite reaches it.
  { pts: [[-0.03, 0.34], [0.06, 0.25], [0.17, 0.19], [0.27, 0.16]], layer: 'back', near: [0, 1], drawn: 0.9, offset: 0.04, base: 0.7, sparks: [0.62] },
  // Low and long: under Thursday and Friday, then turns up toward Saturday and fades.
  { pts: [[0.02, 0.56], [0.1, 0.75], [0.26, 0.87], [0.44, 0.9], [0.6, 0.88], [0.7, 0.8], [0.73, 0.69]], layer: 'back', near: [3, 4, 5], drawn: 0.86, offset: 0.05, base: 0.68, sparks: [0.36, 0.82] },
  // From Wednesday's air, up and over, bending toward Sunday: crosses between far and near.
  { pts: [[0.5, 0.36], [0.58, 0.26], [0.68, 0.2], [0.78, 0.2], [0.84, 0.16]], layer: 'mid', near: [2, 6], drawn: 0.84, offset: 0.08, base: 0.66, sparks: [0.46] },
  // Monday toward Wednesday; halfway, part of the light turns down toward Friday's region.
  {
    pts: [[0.14, 0.48], [0.22, 0.55], [0.32, 0.56], [0.4, 0.5]],
    layer: 'back',
    near: [0, 2],
    drawn: 0.92,
    offset: 0.02,
    base: 0.5,
    sparks: [0.88],
    branch: { at: 0.55, pts: [[0.3, 0.565], [0.37, 0.62], [0.45, 0.65], [0.51, 0.66]] },
  },
  // Joins two regions without touching a piece: down the right side, past Saturday.
  { pts: [[0.99, 0.3], [0.97, 0.48], [0.92, 0.66], [0.84, 0.8], [0.74, 0.9]], layer: 'back', near: [], drawn: 0.8, offset: 0.1, base: 0.58, sparks: [0.3] },
  // Friday → Saturday, short, never arrives.
  { pts: [[0.64, 0.72], [0.68, 0.65], [0.71, 0.6]], layer: 'back', near: [4, 5], drawn: 0.7, offset: 0, base: 0.5, sparks: [0.2] },
]

const COURSES_NARROW: Course[] = [
  // Across the top, between Monday and Tuesday, bending toward the near Wednesday.
  { pts: [[-0.04, 0.2], [0.14, 0.24], [0.34, 0.24], [0.5, 0.2], [0.62, 0.14]], layer: 'back', near: [0, 1], drawn: 0.86, offset: 0.06, base: 0.52, sparks: [0.4] },
  // From the right edge down across the middle toward Thursday; splits toward Saturday.
  {
    pts: [[1.03, 0.3], [0.9, 0.38], [0.7, 0.43], [0.46, 0.47], [0.28, 0.5]],
    layer: 'mid',
    near: [2, 3],
    drawn: 0.88,
    offset: 0.04,
    base: 0.5,
    sparks: [0.3],
    branch: { at: 0.6, pts: [[0.62, 0.445], [0.58, 0.5], [0.55, 0.55], [0.53, 0.58]] },
  },
  // Low sweep under Saturday toward Sunday.
  { pts: [[0.02, 0.64], [0.12, 0.78], [0.3, 0.86], [0.5, 0.88], [0.6, 0.86]], layer: 'back', near: [3, 5, 6], drawn: 0.84, offset: 0.06, base: 0.5, sparks: [0.2, 0.62] },
  // Down the right side: joins Friday's region to Sunday's without touching either.
  { pts: [[0.98, 0.6], [0.95, 0.7], [0.9, 0.78]], layer: 'back', near: [], drawn: 0.8, offset: 0.1, base: 0.42, sparks: [0.6] },
]

const toField = (pts: Pt[], W: number, H: number): Pt[] => pts.map(([x, y]) => [x * W, y * H])

/**
 * The network of a composition: open fibers that bend and change direction,
 * pass near pieces, split, get lost, join regions; a few small concentrations
 * of light on them. Never a closed curve, never a diagram.
 */
export function network(arch: Archipelago, width: number, height: number): { fibers: Fiber[]; sparks: Spark[] } {
  const rand = seeded(arch.mobile ? 23 : 5)
  const timing = () => ({ breathe: 20 + rand() * 40, glint: 24 + rand() * 34, sway: 30 + rand() * 30, delay: -rand() * 60 })
  const fibers: Fiber[] = []
  const sparks: Spark[] = []
  for (const c of arch.mobile ? COURSES_NARROW : COURSES_WIDE) {
    const pts = toField(c.pts, width, height)
    fibers.push({ d: smoothOpen(pts), kind: 'fiber', layer: c.layer, near: c.near, drawn: c.drawn, offset: c.offset, width: 0.95, base: Math.min(1, c.base + 0.12), ...timing() })
    for (const at of c.sparks) {
      const i = at * (pts.length - 1)
      const a = pts[Math.floor(i)]
      const b = pts[Math.min(pts.length - 1, Math.floor(i) + 1)]
      const t = i - Math.floor(i)
      sparks.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, size: 4 + rand() * 3.5, dur: 10 + rand() * 12, delay: -rand() * 22 })
    }
    if (c.branch)
      fibers.push({ d: smoothOpen(toField(c.branch.pts, width, height)), kind: 'branch', layer: c.layer, near: [], drawn: 0.9, offset: 0, width: 0.6, base: c.base * 0.7, ...timing() })
  }
  return { fibers, sparks }
}
