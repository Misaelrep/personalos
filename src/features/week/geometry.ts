import type { DayPart, WeekDay, WeekTense } from '../../domain/week'

/**
 * SEMANA — ARCHIPIÉLAGO MINIMAL. Seven molded optical-glass lenses, one light
 * network, one shared atmosphere. Pure: it only turns the week into forms and
 * places; the components draw them.
 *
 * A day's load never changes its size much (all seven are nearly the same
 * scale). It is read in the glass itself:
 *   thickness   how deep the lens is (the edge seen under its face)
 *   frost       how clear or frosted the glass is
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
  /** Width relative to the common lens width (≈ 1: the seven share one scale). */
  widthK: number
  /** Frontal height / width. */
  aspect: number
  /** Superellipse exponent: 2 an ellipse, higher a fuller, tenser edge. */
  exponent: number
  /** Asymmetry of the edge (0–0.04). */
  asym: number
  /** Edge thickness, fraction of the width. */
  thickness: number
  /** Opacity of the glass body. */
  frost: number
  /** Interior fog, 0–1. */
  fog: number
  /** Optical ring, 0–1. */
  ring: number
  /** Continuous deep interior (Sunday), 0–1. */
  depth: number
  /** Tilt back from the viewer in the overview (deg): the lens is seen at three quarters. */
  lean: number
  /** Inclination in the plane (deg). */
  tilt: number
  /** Normalized load, 0–1. */
  load: number
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
    widthK: long ? 1.16 : empty ? 1.02 : 0.98 + rand() * 0.05,
    aspect: long ? 0.7 : empty ? 0.9 : 0.8 + rand() * 0.06,
    exponent: empty ? 2.02 : 2.06 + shaped * 0.2 + rand() * 0.06,
    asym: 0.012 + rand() * 0.018,
    thickness: empty ? 0.018 : 0.025 + shaped * 0.115 + (long ? 0.015 : 0),
    frost: empty ? 0.02 : 0.05 + shaped * 0.36,
    fog: empty ? 0.08 : 0.16 + deep * 0.84,
    ring: empty ? 0.85 : 0.35 - shaped * 0.15,
    depth: long ? 0.85 : 0,
    lean: 50 + rand() * 8,
    tilt: (rand() - 0.5) * 12,
    load,
    layers: day.layers.map((l) => ({ part: l.part, matter: clamp01(l.matter), density: clamp01(l.density) })),
    tense: day.tense,
  }
}

/** Superellipse outline with a slight, stable asymmetry. Local coordinates, centered. */
export function lensOutline(w: number, h: number, exponent: number, asym: number, seed: number, points = 72): [number, number][] {
  const rand = seeded(seed)
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const out: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const r = 1 + asym * Math.sin(t + p1) + asym * 0.6 * Math.sin(2 * t + p2)
    // The lower half a touch fuller: molded glass settles.
    const sag = s > 0 ? 1 + asym * 0.8 : 1
    out.push([(w / 2) * Math.sign(c) * Math.abs(c) ** (2 / exponent) * r, (h / 2) * Math.sign(s) * Math.abs(s) ** (2 / exponent) * r * sag])
  }
  return out
}

/** Closed smooth path through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length
  const f = (v: number) => v.toFixed(2)
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`
  }
  return `${d}Z`
}

/**
 * The lens seen with its thickness: the face's upper half joined to the lower
 * half of the face moved down by `t` — the molded edge under the face.
 */
export function extrudedPath(face: [number, number][], t: number): string {
  const up = face.filter(([, y]) => y <= 0).sort((a, b) => a[0] - b[0])
  const low = face
    .filter(([, y]) => y > 0)
    .map(([x, y]) => [x, y + t] as [number, number])
    .sort((a, b) => b[0] - a[0])
  const pts = [...up, ...low]
  const f = (v: number) => v.toFixed(2)
  return `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}Z`
}

/* ------------------------------------------------------------------------ */
/* Archipelago: where each day floats                                         */
/* ------------------------------------------------------------------------ */

export interface Placement {
  /** Center, px inside the field. */
  x: number
  y: number
  /** Depth: 0 near → 1 far. */
  z: number
  /** Where the day's words sit. */
  label: 'below' | 'left' | 'right'
}

export interface Archipelago {
  /** Common lens width (px). */
  base: number
  items: Placement[]
  mobile: boolean
}

/**
 * Desktop: a wide, suspended field — the week still reads Monday → Sunday
 * from left to right, but no two days share a line or a column.
 */
const WIDE: Omit<Placement, 'label'>[] = [
  { x: 0.085, y: 0.3, z: 0.35 },
  { x: 0.23, y: 0.7, z: 0.12 },
  { x: 0.37, y: 0.17, z: 0.5 },
  { x: 0.505, y: 0.55, z: 0.42 },
  { x: 0.645, y: 0.13, z: 0.25 },
  { x: 0.765, y: 0.66, z: 0.05 },
  { x: 0.91, y: 0.33, z: 0.3 },
]

/**
 * Mobile: its own composition, not a miniature. The order is recognizable top
 * to bottom, but each day is offset sideways, at its own depth, and the words
 * sit beside the glass — never a list.
 */
const NARROW: Placement[] = [
  { x: 0.31, y: 0.055, z: 0.35, label: 'right' },
  { x: 0.7, y: 0.2, z: 0.1, label: 'left' },
  { x: 0.37, y: 0.335, z: 0.55, label: 'right' },
  { x: 0.72, y: 0.49, z: 0.3, label: 'left' },
  { x: 0.28, y: 0.625, z: 0.15, label: 'right' },
  { x: 0.64, y: 0.775, z: 0, label: 'left' },
  { x: 0.4, y: 0.93, z: 0.4, label: 'right' },
]

export const MOBILE_MAX = 720

export function archipelago(width: number, height: number): Archipelago {
  const mobile = width < MOBILE_MAX
  if (mobile) {
    const base = Math.max(96, Math.min(132, width * 0.33, height * 0.17))
    return { base, mobile, items: NARROW.map((p) => ({ ...p, x: p.x * width, y: p.y * height })) }
  }
  const base = Math.max(120, Math.min(188, width / 7.4, height * 0.27))
  return { base, mobile, items: WIDE.map((p) => ({ ...p, x: p.x * width, y: p.y * height, label: 'below' })) }
}

/** Near lenses a touch larger; far ones a touch smaller and fainter. Never a size ranking. */
export const depthScale = (z: number) => 1.04 - z * 0.12

/* ------------------------------------------------------------------------ */
/* The light network                                                          */
/* ------------------------------------------------------------------------ */

export interface Fiber {
  from: number
  to: number
  /** Cubic Bézier, px. */
  d: string
  /** Share of the curve that exists (the rest is missing: incomplete trajectories). */
  drawn: number
  /** Where along the curve the drawn stretch begins (0–1). */
  offset: number
  /** Seconds: breathing, glint, curvature — never in step. */
  breathe: number
  glint: number
  sway: number
  delay: number
}

/** Consecutive days, plus two long, faint arcs. Never all-to-all. */
export const FIBER_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [0, 2],
  [4, 6],
]

/** Point on a lens's rim toward `(tx, ty)`, a little outside the glass. */
function rimPoint(p: { x: number; y: number }, rx: number, ry: number, tx: number, ty: number, gap: number): [number, number] {
  const a = Math.atan2(ty - p.y, tx - p.x)
  return [p.x + Math.cos(a) * (rx + gap), p.y + Math.sin(a) * (ry + gap)]
}

export function fibers(arch: Archipelago, radii: { rx: number; ry: number }[]): Fiber[] {
  const rand = seeded(5)
  return FIBER_PAIRS.map(([from, to], k) => {
    const A = arch.items[from]
    const B = arch.items[to]
    const long = to - from > 1
    const gap = arch.mobile ? 8 : 12
    const [x0, y0] = rimPoint(A, radii[from].rx, radii[from].ry, B.x, B.y, gap)
    const [x1, y1] = rimPoint(B, radii[to].rx, radii[to].ry, A.x, A.y, gap)
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    // Alternating bows; the long arcs swing wider, away from the days they skip.
    const side = long ? (from === 0 ? -1 : 1) : k % 2 ? 1 : -1
    const bow = len * (long ? 0.34 : 0.2 + rand() * 0.1) * side
    const nx = -dy / len
    const ny = dx / len
    const c1 = [x0 + dx * 0.28 + nx * bow * 1.05, y0 + dy * 0.28 + ny * bow * 1.05]
    const c2 = [x0 + dx * 0.74 + nx * bow * 0.78, y0 + dy * 0.74 + ny * bow * 0.78]
    const f = (v: number) => v.toFixed(1)
    return {
      from,
      to,
      d: `M${f(x0)},${f(y0)} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(x1)},${f(y1)}`,
      drawn: long ? 0.46 + rand() * 0.14 : 0.66 + rand() * 0.24,
      offset: long ? 0.2 + rand() * 0.2 : rand() * 0.14,
      breathe: 20 + rand() * 40,
      glint: 26 + rand() * 34,
      sway: 30 + rand() * 30,
      delay: -rand() * 60,
    }
  })
}
