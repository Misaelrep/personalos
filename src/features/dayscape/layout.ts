import type { Activity, DayscapeModel, Plane, VisualRole } from './model'

/**
 * DAYSCAPE composition D (approved): radial around AHORA + depth and parallax.
 *
 * AHORA is the perceptual center, not the geometric one. Around it, irregular:
 * the near plane close and low, the middle plane higher and softer, the far
 * plane small and diffuse toward the horizon. The past sits to the upper left,
 * the future spreads right and up. Designed on a 390 × 844 phone and mapped to
 * any viewport; pure and deterministic, so it can be tested without a browser.
 */
export interface Pt {
  x: number
  y: number
}

export interface NameSpot {
  /** Offset of the name box from its activity (px). */
  dx: number
  dy: number
  w: number
  h: number
  align: 'left' | 'right' | 'center'
}

export interface Placed {
  a: Activity
  /** Home position on screen (px), before any drag. */
  x: number
  y: number
  /** Depth: size, presence and softness. */
  scale: number
  opacity: number
  blur: number
  /** Visual radius of the form (px). */
  R: number
  /** Invisible tap radius (px): 44–52 px targets, whatever the size of the symbol. */
  hit: number
  name?: NameSpot
}

export interface DayscapeLayout {
  width: number
  height: number
  anchor: Pt
  /** Design → screen scale: horizontal spread, vertical spread, sizes. */
  kx: number
  ky: number
  ks: number
  items: Placed[]
  /** Where an inspected activity comes forward to. */
  focus: { past: Pt; future: Pt }
}

const DESIGN = { width: 390, height: 844, anchor: { x: 206, y: 486 } }

/** Radius of each role in the near plane (px on the design phone). */
export const BASE: Record<VisualRole | 'current', number> = {
  current: 34,
  major: 21,
  medium: 16,
  micro: 10.5,
  space: 14,
  endpoint: 14,
}

/** Parallax: how much of a drag each plane follows. */
export const PARALLAX: Record<Plane, number> = { fg: 1, mid: 0.52, bg: 0.2 }

const PLANES: Record<Plane, { r: [number, number]; lift: [number, number]; past: [number, number]; future: [number, number] }> = {
  fg: { r: [92, 175], lift: [0, 30], past: [128, 250], future: [22, 140] },
  mid: { r: [140, 230], lift: [50, 130], past: [214, 282], future: [-52, 12] },
  bg: { r: [150, 290], lift: [110, 200], past: [230, 300], future: [-115, -32] },
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/**
 * Size, presence and softness by plane; the past a little dimmer and softer.
 * Everything that is not AHORA stays in the atmosphere: present, never
 * asking for the same attention.
 */
export function depthLook(a: Pick<Activity, 'side' | 'plane' | 'f'>) {
  if (a.side === 'current') return { scale: 1, opacity: 1, blur: 0 }
  const past = a.side === 'past'
  return {
    scale: { fg: 1.12, mid: 0.72, bg: 0.46 }[a.plane] * (1 - 0.12 * a.f),
    opacity: { fg: 0.84, mid: 0.6, bg: 0.42 }[a.plane] * (past ? 0.92 : 1),
    blur: { fg: 0, mid: 0.75, bg: 1.6 }[a.plane] * (past ? 1.2 : 1),
  }
}

export const radiusOf = (a: Pick<Activity, 'side' | 'role'>, scale: number, ks: number) =>
  BASE[a.side === 'current' ? 'current' : a.role] * scale * ks

export function hitRadius(a: Pick<Activity, 'side'>, R: number): number {
  return a.side === 'current' ? 26 : clamp(R * 1.3, 22, 26)
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

/**
 * `nowLabelWidth`: width of AHORA's name (px). On narrow screens the present
 * moves left just enough for its name to stay whole.
 */
export function layoutDayscape(model: DayscapeModel, width: number, height: number, nowLabelWidth = 130): DayscapeLayout {
  const kx = clamp(width / DESIGN.width, 0.82, 2.2)
  const ky = clamp(height / DESIGN.height, 0.7, 1.35)
  const ks = clamp(Math.min(kx, ky * 1.1), 0.85, 1.35)
  const room = width - 4 - nowLabelWidth - 14 - BASE.current * ks
  const anchor = {
    x: Math.max(width * 0.36, Math.min((width * DESIGN.anchor.x) / DESIGN.width, room)),
    y: (height * DESIGN.anchor.y) / DESIGN.height,
  }
  const toScreen = (dx: number, dy: number): Pt => ({ x: anchor.x + dx * kx, y: anchor.y + dy * ky })

  const rnd = seeded(5)
  const groups = new Map<string, Activity[]>()
  for (const a of model.activities) {
    if (a.side === 'current') continue
    const key = a.plane + a.side
    groups.set(key, [...(groups.get(key) ?? []), a])
  }

  // A crowded day draws its secondary forms a little smaller, so it still breathes.
  const density = clamp(Math.sqrt(18 / Math.max(1, model.activities.length - 1)), 0.7, 1)
  const items: (Placed & { fixed?: boolean })[] = model.activities.map((a) => {
    const look = depthLook(a)
    const R = radiusOf(a, look.scale, ks) * (a.side === 'current' ? 1 : density)
    const base = { a, ...look, R, hit: hitRadius(a, R) }
    if (a.side === 'current') return { ...base, ...anchor, fixed: true }
    const group = groups.get(a.plane + a.side)!
    const j = group.indexOf(a)
    const P = PLANES[a.plane]
    const span = a.side === 'past' ? P.past : P.future
    const t = (j + 0.5) / group.length + ((rnd() - 0.5) * 0.5) / group.length
    const angle = ((span[0] + (span[1] - span[0]) * t) * Math.PI) / 180
    const r = P.r[0] + (P.r[1] - P.r[0]) * rnd()
    const lift = P.lift[0] + (P.lift[1] - P.lift[0]) * rnd()
    const jitter = a.plane === 'bg' ? 0 : (j % 2 ? 1 : -1) * (18 + rnd() * 26)
    return { ...base, ...toScreen(Math.cos(angle) * r * 0.92 + jitter, Math.sin(angle) * r - lift) }
  })

  // Nothing overlaps, and AHORA's name keeps clear room to the right of the present.
  const obstacles = [0, 1, 2, 3, 4, 5].flatMap((i) => [
    { x: anchor.x + 64 + i * 25, y: anchor.y - 4, R: 21, fixed: true },
    { x: anchor.x + 64 + i * 25, y: anchor.y + 24, R: 17, fixed: true },
  ])
  const all: { x: number; y: number; R: number; fixed?: boolean }[] = [...items, ...obstacles]
  for (let n = 0; n < 200; n++) {
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const p = all[i]
        const q = all[j]
        const need = (p.R + q.R) * 1.25 + 16
        const dx = q.x - p.x
        const dy = q.y - p.y
        const dist = Math.hypot(dx, dy) || 0.01
        if (dist >= need) continue
        const push = (need - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        if (!p.fixed) {
          p.x -= ux * push
          p.y -= uy * push
        }
        if (!q.fixed) {
          q.x += ux * push
          q.y += uy * push
        }
      }
    for (const p of items) {
      if (p.fixed) continue
      p.x = clamp(p.x, 28 + p.R * 0.5, width - 28 - p.R * 0.5)
      p.y = clamp(p.y, (104 + ((p.a.order + 1) % 5) * 9) * ky, height - 74 * ky)
    }
  }

  const placed: Placed[] = items.map(({ fixed: _fixed, ...p }) => p)
  return {
    width,
    height,
    anchor,
    kx,
    ky,
    ks,
    items: placed,
    focus: { past: toScreen(146 - 206, 262 - 486), future: toScreen(214 - 206, 624 - 486) },
  }
}

/* ------------------------------------------------------------------------ */
/* Temporary names                                                           */
/* ------------------------------------------------------------------------ */

/** Each name takes the size, tone and softness of its plane. */
export const NAME_STYLE: Record<Plane, { size: number; spacing: number; blur: number }> = {
  fg: { size: 10.5, spacing: 0.3, blur: 0 },
  mid: { size: 9.5, spacing: 0.27, blur: 0.3 },
  bg: { size: 8.5, spacing: 0.22, blur: 0.65 },
}

/** Width (px) of a text at a font size, letter spacing (em) and weight. */
export type Measure = (text: string, size: number, spacing: number, weight: number) => number

export const rangeText = (a: Pick<Activity, 'startMin' | 'endMin'>, clock: (m: number) => string) => `${clock(a.startMin)}—${clock(a.endMin)}`

/**
 * Every name next to its own form, never in a column and never over another
 * name or form. Near names choose first; far ones take what is left.
 */
export function placeNames(layout: DayscapeLayout, measure: Measure, clock: (m: number) => string): void {
  const { items, anchor, width, height } = layout
  const current = items.find((p) => p.a.side === 'current')
  const taken = [{ x: anchor.x + (current?.R ?? 34) + 8, y: anchor.y - 34, w: 150, h: 80 }]
  const overlap = (b: Box, t: Box) =>
    Math.max(0, Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x)) * Math.max(0, Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y))
  const rank = { fg: 0, mid: 1, bg: 2 }
  const order = items.filter((p) => p.a.side !== 'current').sort((p, q) => rank[p.a.plane] - rank[q.a.plane] || p.a.z - q.a.z)

  for (const it of order) {
    const st = NAME_STYLE[it.a.plane]
    const w = Math.ceil(Math.max(measure(it.a.label.toUpperCase(), st.size, st.spacing, 500), measure(rangeText(it.a, clock), st.size - 0.5, 0.02, 400))) + 2
    const h = Math.ceil(st.size * 1.25 + 3 + st.size) + 2
    const R = Math.max(it.R * 0.8, 8)
    const cands: { x: number; y: number; align: NameSpot['align'] }[] = []
    for (const g of [6, 14, 26]) {
      const d = R * 0.55 + g * 0.6
      cands.push(
        { x: it.x + R + g, y: it.y - h / 2, align: 'left' },
        { x: it.x - R - g - w, y: it.y - h / 2, align: 'right' },
        { x: it.x + R + g, y: it.y - h * 0.15, align: 'left' },
        { x: it.x + R + g, y: it.y - h * 0.85, align: 'left' },
        { x: it.x - R - g - w, y: it.y - h * 0.15, align: 'right' },
        { x: it.x - R - g - w, y: it.y - h * 0.85, align: 'right' },
        { x: it.x + d, y: it.y - d - h, align: 'left' },
        { x: it.x + d, y: it.y + d, align: 'left' },
        { x: it.x - d - w, y: it.y - d - h, align: 'right' },
        { x: it.x - d - w, y: it.y + d, align: 'right' },
        { x: it.x - w / 2, y: it.y + R + g - 2, align: 'center' },
        { x: it.x - w / 2, y: it.y - R - g - h + 2, align: 'center' },
        { x: it.x - w * 0.2, y: it.y + R + g - 2, align: 'left' },
        { x: it.x - w * 0.8, y: it.y + R + g - 2, align: 'right' },
        { x: it.x - w * 0.2, y: it.y - R - g - h + 2, align: 'left' },
        { x: it.x - w * 0.8, y: it.y - R - g - h + 2, align: 'right' },
      )
    }
    let best = cands[0]
    let bestScore = Infinity
    cands.forEach((c, i) => {
      const b = { x: c.x - 3, y: c.y - 3, w: w + 6, h: h + 6 }
      let score = i * 0.6
      if (b.x < 10 || b.x + b.w > width - 10 || b.y < 64 || b.y + b.h > height - 44) score += 1e6
      for (const t of taken) score += overlap(b, t) * 400
      for (const o of items) if (o !== it) score += overlap(b, { x: o.x - o.R * 0.9, y: o.y - o.R * 0.9, w: o.R * 1.8, h: o.R * 1.8 }) * 25
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    })
    // A crowded day may leave no free place: the name still stays on screen.
    const x = clamp(best.x, 10, width - 10 - w)
    const y = clamp(best.y, 64, height - 44 - h)
    it.name = { dx: x - it.x, dy: y - it.y, w, h, align: best.align }
    taken.push({ x, y, w, h })
  }
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/* ------------------------------------------------------------------------ */
/* Inspection                                                                */
/* ------------------------------------------------------------------------ */

/** Where an activity stands relative to its home: offset, size, presence, softness. */
export interface Pose {
  dx: number
  dy: number
  /** Radius multiplier. */
  grow: number
  opacity: number
  blur: number
}

export const homePose = (p: Placed): Pose => ({ dx: 0, dy: 0, grow: 1, opacity: p.opacity, blur: p.blur })

/**
 * Tapping an activity brings it forward: it comes to a comfortable reading
 * place at the size of the near plane, sharp and fully present. The rest
 * steps back from it, softer, never dark. Its neighbours in time stay a little
 * more present, so a later swipe to the previous / next one has somewhere to go.
 */
export function selectionPoses(layout: DayscapeLayout, selectedId: string): Map<string, Pose> {
  const sel = layout.items.find((p) => p.a.id === selectedId)!
  const target = targetOf(layout, sel)
  const poses = new Map<string, Pose>()
  for (const p of layout.items) {
    if (p === sel) {
      poses.set(p.a.id, { dx: target.x - p.x, dy: target.y - p.y, grow: target.R / p.R, opacity: 1, blur: 0 })
      continue
    }
    const k = 0.1 + 0.12 * (1 - p.a.z)
    let dx = (p.x - target.x) * k
    const dy = (p.y - target.y) * k
    const neighbour = Math.abs(p.a.order - sel.a.order) === 1
    if (p.a.side === 'current') {
      // AHORA keeps its name on screen.
      dx = Math.min(p.x + dx, layout.width - 16 - 150 - 14 - p.R) - p.x
    }
    poses.set(p.a.id, {
      dx,
      dy,
      grow: 1,
      // AHORA stays recognizable while something else is inspected.
      opacity: p.opacity * (1 - (p.a.side === 'current' ? 0.3 : neighbour ? 0.3 : 0.55)),
      blur: p.blur + (neighbour ? 0.35 : 0.8),
    })
  }
  return poses
}

/** Place and size an inspected activity takes. */
export function targetOf(layout: DayscapeLayout, p: Placed): Pt & { R: number } {
  if (p.a.side === 'current') return { x: p.x, y: p.y, R: p.R * 1.12 }
  const focus = p.a.side === 'past' ? layout.focus.past : layout.focus.future
  return {
    x: clamp(focus.x, 90, layout.width - 90),
    y: clamp(focus.y, 150, layout.height - 190),
    R: BASE[p.a.role] * 1.12 * 1.75 * layout.ks,
  }
}

/** The activity under a tap: the nearest one whose invisible target contains the point. */
export function hitTest(items: (Pt & { hit: number; id: string })[], x: number, y: number): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const p of items) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= p.hit && d < bestD) {
      bestD = d
      best = p.id
    }
  }
  return best
}
