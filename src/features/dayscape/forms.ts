/**
 * POLYMORPHIC APERTURE SYSTEM — one visual matter, five configurations.
 *
 * Every form is the same material: six fragments, each a cubic curve around a
 * modular core. A form is only an arrangement of those fragments, so any form
 * can MORPH into any other by moving the same fragments; nothing fades out to
 * be replaced. A fragment can be a hairline (stroke), a lamina of light (fill)
 * or collapse to a single point (a form that "loses" fragments).
 *
 * The form says nothing about the kind of activity: it is the dynamic state of
 * the matter. Block meaning stays in size, distance, depth, halo, density,
 * opacity and real state.
 *
 * Unit space: radius 1 around the core, y pointing down, angles clockwise.
 */
export type FormId = 'cardinal' | 'orbit' | 'dissolving' | 'axis' | 'prism'

/** A · B · C · D · E */
export const FORMS: FormId[] = ['cardinal', 'orbit', 'dissolving', 'axis', 'prism']

/** How the matter travels: Cardinal → Orbit → Prism → Axis → Dissolving (→ Cardinal). */
export const MORPH_CHAIN: FormId[] = ['cardinal', 'orbit', 'prism', 'axis', 'dissolving']

export const nextForm = (form: FormId): FormId => MORPH_CHAIN[(MORPH_CHAIN.indexOf(form) + 1) % MORPH_CHAIN.length]

export type P = readonly [number, number]

export interface Fragment {
  /** Cubic Bézier: start, control, control, end. */
  p: readonly [P, P, P, P]
  /** Hairline presence, 0–1. */
  stroke: number
  /** Lamina (facet) presence, 0–1. */
  fill: number
  /** Stroke width factor. */
  width: number
}

export const FRAGMENTS = 6

const DEG = Math.PI / 180
const polar = (r: number, deg: number): P => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)]
const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function line(a: P, b: P, stroke: number, width = 1): Fragment {
  return { p: [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b], stroke, fill: 0, width }
}

/** Arc of radius r from a0 to a1 (degrees, clockwise), as one cubic. */
function arc(r: number, a0: number, a1: number, stroke: number, width = 1): Fragment {
  const k = (4 / 3) * Math.tan(((a1 - a0) * DEG) / 4) * r
  const s = polar(r, a0)
  const e = polar(r, a1)
  const t0: P = [-Math.sin(a0 * DEG), Math.cos(a0 * DEG)]
  const t1: P = [-Math.sin(a1 * DEG), Math.cos(a1 * DEG)]
  return { p: [s, [s[0] + t0[0] * k, s[1] + t0[1] * k], [e[0] - t1[0] * k, e[1] - t1[1] * k], e], stroke, fill: 0, width }
}

/** An incomplete corner, turned `quarter` × 90° clockwise from the top-right one. */
function corner(quarter: number, stroke: number, s = 0.72, length = 0.32): Fragment {
  const turn = (q: P): P => {
    let [x, y] = q
    for (let i = 0; i < quarter; i++) [x, y] = [-y, x]
    return [x, y]
  }
  const c = turn([s, -s])
  return { p: [turn([s - length, -s]), c, c, turn([s, -(s - length)])], stroke, fill: 0, width: 1 }
}

/**
 * A translucent facet: a cut edge of glass from (a0, r0) to (a1, r1), bowed
 * toward the core, so its fill reads as a thin lamina of light.
 */
function facet(a0: number, r0: number, a1: number, r1: number, bow: number, fill: number, stroke: number): Fragment {
  const s = polar(r0, a0)
  const e = polar(r1, a1)
  const m = mix(s, e, 0.5)
  const len = Math.hypot(m[0], m[1]) || 1
  const inward: P = [(-m[0] / len) * bow, (-m[1] / len) * bow]
  const c1 = mix(s, e, 0.3)
  const c2 = mix(s, e, 0.7)
  return {
    p: [s, [c1[0] + inward[0], c1[1] + inward[1]], [c2[0] + inward[0], c2[1] + inward[1]], e],
    stroke,
    fill,
    width: 0.8,
  }
}

/** A fragment gathered into a single point: present in the matter, not drawn. */
function seed(r: number, deg: number): Fragment {
  const q = polar(r, deg)
  return { p: [q, q, q, q], stroke: 0, fill: 0, width: 1 }
}

/*
 * Fragment i of every form sits near the same angle (≈ −60°, 0°, 60°, 120°,
 * 180°, 240°), so a morph moves each piece to a nearby place.
 */
export const SHAPES: Record<FormId, Fragment[]> = {
  // A — CARDINAL PERLADO: four open corners, architectural, very low contrast.
  cardinal: [corner(0, 0.6), seed(0.78, 0), corner(1, 0.6), corner(2, 0.6), seed(0.78, 180), corner(3, 0.6)],

  // B — ÓRBITA ASTRAL HIELO: incomplete arcs on slightly different radii. Never a closed circle.
  orbit: [
    arc(0.9, -100, -35, 0.7),
    arc(0.7, -8, 30, 0.45),
    arc(0.9, 52, 128, 0.62),
    arc(0.92, 146, 166, 0.38),
    arc(0.6, 186, 222, 0.35),
    arc(0.9, 205, 246, 0.55),
  ],

  // C — APERTURA HIELO DISOLVENTE: irregular, asymmetric, already coming apart.
  dissolving: [
    arc(0.95, -92, -55, 0.7),
    line([0.6, -0.2], [0.9, 0.06], 0.42),
    arc(0.84, 44, 70, 0.62),
    arc(0.98, 116, 128, 0.34, 0.8),
    line([-0.94, 0.14], [-0.8, -0.18], 0.55),
    arc(0.78, 218, 240, 0.4, 0.9),
  ],

  // D — EJE AZUL-PLATA: incomplete axes that slide past the center, a parallel
  // trace beside two of them: precise, architectural, never a crosshair.
  axis: [
    line([0.12, -0.35], [0.12, -0.95], 0.7),
    line([0.45, -0.1], [0.95, -0.1], 0.6),
    line([0.45, 0.07], [0.72, 0.07], 0.34, 0.8),
    line([-0.06, 0.4], [-0.06, 0.92], 0.62),
    line([-0.4, 0.13], [-0.9, 0.13], 0.58),
    line([-0.22, 0.52], [-0.22, 0.76], 0.34, 0.8),
  ],

  // E — PRISMA PERLADO HIELO: an incomplete cut-glass outline whose facets
  // hold thin translucent laminae. Not a solid polygon, not a diamond.
  prism: [
    facet(-100, 0.9, -38, 0.86, 0.32, 0.16, 0.38),
    facet(-22, 0.8, 22, 0.9, 0.22, 0.1, 0.3),
    facet(38, 0.92, 98, 0.82, 0.34, 0.17, 0.36),
    facet(120, 0.78, 150, 0.9, 0.18, 0.09, 0.28),
    facet(168, 0.9, 218, 0.86, 0.3, 0.14, 0.34),
    facet(232, 0.76, 256, 0.88, 0.16, 0.08, 0.26),
  ],
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** The same fragment, part of the way from one configuration to another. */
export function between(a: Fragment, b: Fragment, t: number): Fragment {
  return {
    p: [mix(a.p[0], b.p[0], t), mix(a.p[1], b.p[1], t), mix(a.p[2], b.p[2], t), mix(a.p[3], b.p[3], t)],
    stroke: lerp(a.stroke, b.stroke, t),
    fill: lerp(a.fill, b.fill, t),
    width: lerp(a.width, b.width, t),
  }
}

/* ------------------------------------------------------------------------ */
/* Dematerialization                                                         */
/* ------------------------------------------------------------------------ */

/**
 * How each form comes apart. Corners separate; arcs keep orbiting; open
 * segments erode from their ends; axes break from the center outward; facets
 * drift apart like small laminae of light.
 */
export const BREAKUP: Record<FormId, { spread: number; spin: number }> = {
  cardinal: { spread: 0.38, spin: 0 },
  orbit: { spread: 0.12, spin: 42 },
  dissolving: { spread: 0.16, spin: 0 },
  axis: { spread: 0.34, spin: 0 },
  prism: { spread: 0.3, spin: 0 },
}

export function centroid(f: Fragment): P {
  return [(f.p[0][0] + f.p[1][0] + f.p[2][0] + f.p[3][0]) / 4, (f.p[0][1] + f.p[1][1] + f.p[2][1] + f.p[3][1]) / 4]
}

/** A fragment moved by the breakup of its form (b: 0 → 1). */
export function burst(f: Fragment, form: FormId, b: number): Fragment {
  if (b <= 0) return f
  const { spread, spin } = BREAKUP[form]
  const [cx, cy] = centroid(f)
  const len = Math.hypot(cx, cy) || 1
  const dx = (cx / len) * spread * b
  const dy = (cy / len) * spread * b
  const a = spin * b * DEG
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const move = ([x, y]: P): P => [x * cos - y * sin + dx, x * sin + y * cos + dy]
  return { ...f, p: [move(f.p[0]), move(f.p[1]), move(f.p[2]), move(f.p[3])] }
}

/** Point on the cubic at t. */
export function pointAt(f: Fragment, t: number): P {
  const u = 1 - t
  const [a, b, c, d] = f.p
  const w0 = u * u * u
  const w1 = 3 * u * u * t
  const w2 = 3 * u * t * t
  const w3 = t * t * t
  return [w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0], w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1]]
}

/** Approximate length of the fragment in unit space. */
export function lengthOf(f: Fragment): number {
  let total = 0
  let prev = pointAt(f, 0)
  for (let i = 1; i <= 8; i++) {
    const q = pointAt(f, i / 8)
    total += Math.hypot(q[0] - prev[0], q[1] - prev[1])
    prev = q
  }
  return total
}

export function pathOf(f: Fragment, cx: number, cy: number, r: number): string {
  const [a, b, c, d] = f.p
  const x = (q: P) => (cx + q[0] * r).toFixed(2)
  const y = (q: P) => (cy + q[1] * r).toFixed(2)
  return `M${x(a)} ${y(a)}C${x(b)} ${y(b)} ${x(c)} ${y(c)} ${x(d)} ${y(d)}`
}
