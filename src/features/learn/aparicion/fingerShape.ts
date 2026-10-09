/**
 * The shape of the fingertip, as numbers. Local coordinates: the tip at (≈18, 0),
 * the body trailing off to the left (x < 0), the back above (y < 0) and the pad
 * below. The half-width swells over the knuckles and narrows at the joints, and
 * the spine bends a little, so it is not a tube.
 */
export const FINGER_LENGTH = 480

/** Where the joints are, as distance from the tip. */
const JOINTS = [205, 335]

/** Half the width of the finger at distance `d` (≥ 0) from the tip (px, unscaled). */
export function halfWidth(d: number): number {
  const taper = 21 + 22 * (d / FINGER_LENGTH) ** 0.8
  const bulge = JOINTS.reduce((sum, j) => sum + 6 * Math.exp(-(((d - (j - 26)) / 30) ** 2)) - 3.5 * Math.exp(-(((d - j) / 10) ** 2)), 0)
  return taper + bulge
}

/** How far the spine has drifted down at distance `d` (px): a gentle curve. */
export const spine = (d: number) => 0.00013 * d * d

type Pt = [number, number]

const TIP_X = -2

/** The rounded tip, from the back (−90°) round the front to the pad (+90°). */
function tipArc(): Pt[] {
  const arc: Pt[] = []
  for (let a = -90; a <= 90; a += 15) {
    const r = (a * Math.PI) / 180
    arc.push([TIP_X + Math.cos(r) * 20, Math.sin(r) * (a < 0 ? 19.5 : 21)])
  }
  return arc
}

/** The two long edges, each from the tip to the base. */
function edges(step: number): { back: Pt[]; pad: Pt[] } {
  const back: Pt[] = []
  const pad: Pt[] = []
  for (let d = 0; d <= FINGER_LENGTH; d += step) {
    const w = halfWidth(d)
    back.push([TIP_X - d, spine(d) - w * 0.94])
    pad.push([TIP_X - d, spine(d) + w * (d < 70 ? 1.06 : 1.0)])
  }
  return { back, pad }
}

const fmt = (n: number) => Math.round(n * 10) / 10
const poly = (pts: Pt[]) => pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ')

/** The closed outline of the finger: along the back to the tip, round it, and back along the pad. */
export function bodyPath(step = 8): string {
  const { back, pad } = edges(step)
  return `M ${poly([...back].reverse())} L ${poly(tipArc())} L ${poly(pad)} Z`
}

/** The back of the finger, inset, for the long reflection. */
export function backPath(from: number, to: number, inset: number): string {
  const pts: Pt[] = []
  for (let d = from; d <= to; d += 10) pts.push([TIP_X - d, spine(d) - halfWidth(d) * inset])
  return `M ${poly(pts)}`
}

/** The pad's edge, round the tip and along the underside: where the warm light shows. */
export function padPath(to: number): string {
  const pts: Pt[] = []
  for (let d = 0; d <= to; d += 8) pts.push([TIP_X - d, spine(d) + halfWidth(d) * (d < 70 ? 1.06 : 1.0)])
  return `M 15 7 C 12 15 6 20 ${TIP_X} 21 L ${poly(pts.slice(1))}`
}

/** A crease across the finger at distance `d`. */
export function creasePath(d: number): string {
  const w = halfWidth(d)
  const y = spine(d)
  return `M ${TIP_X - d} ${fmt(y - w * 0.8)} Q ${TIP_X - d - 10} ${fmt(y)} ${TIP_X - d} ${fmt(y + w * 0.8)}`
}
