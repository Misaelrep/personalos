import { animate, m, useMotionValue, useTransform } from 'framer-motion'
import { memo, useEffect, useId, useMemo } from 'react'
import type { DayPart } from '../../domain/week'
import { EASE } from '../../motion/tokens'
import { planeOutline, smoothOpen, smoothPath, stretch, viewLens, type LensForm, type LensView, type Pt } from './geometry'

/**
 * One day as an irregular lens of sculptural optical glass, seen in
 * perspective: a Fresnel rim, the top surface and, under it, the thickness of
 * the dome; matter suspended inside; reflections that fall differently on
 * each of the seven. No card, no pill, no bubble.
 *
 *   rest       seen from above at its own angle; its matter one mixed mass
 *   selected   the same object, nearer and turned a little toward us, a little
 *              flatter; the matter settles into mañana · tarde · noche
 *   opening    the surface loses its limit; the matter is handed to the space
 */
export type LensMode = 'rest' | 'selected' | 'receded' | 'opening'

/** How much of its face a chosen day turns toward us (sine of the elevation): frontal-ish, never flat-on. */
export const SELECTED_VIEW = 0.84
/** A chosen day becomes a little flatter. */
export const SELECTED_FLAT = 0.55

/** Where the three regions of matter settle, as a share of the face's height from its top. */
export const PART_AT: Record<DayPart, number> = { manana: 0.3, tarde: 0.56, noche: 0.81 }

/** The chosen day's geometry (px, before its zoom): what the words inside it are laid on. */
export function selectedView(form: LensForm, width: number): LensView {
  return viewLens(planeOutline(form), width, SELECTED_VIEW, form.thickness * SELECTED_FLAT)
}

/** Aurora Pearl, desaturated. Mañana warm, tarde mauve, noche a cooler lavender. */
const FOG: Record<DayPart | 'depth', [string, string]> = {
  manana: ['rgba(230, 186, 164, 0.95)', 'rgba(241, 213, 195, 0.5)'],
  tarde: ['rgba(178, 158, 196, 0.95)', 'rgba(199, 184, 206, 0.5)'],
  noche: ['rgba(164, 158, 204, 0.92)', 'rgba(216, 208, 231, 0.5)'],
  depth: ['rgba(146, 136, 184, 0.9)', 'rgba(199, 184, 206, 0.35)'],
}

/** A day already lived: the same matter, a touch more silver. */
const FOG_PAST: typeof FOG = {
  manana: ['rgba(214, 196, 190, 0.95)', 'rgba(228, 220, 214, 0.5)'],
  tarde: ['rgba(182, 174, 196, 0.95)', 'rgba(205, 201, 212, 0.5)'],
  noche: ['rgba(174, 174, 200, 0.92)', 'rgba(214, 214, 226, 0.5)'],
  depth: ['rgba(158, 154, 182, 0.9)', 'rgba(204, 200, 212, 0.35)'],
}

/** Where each part's matter floats at rest: low inside the dome, morning to night. */
const REST_X: Record<DayPart, number> = { manana: -0.22, tarde: 0.02, noche: 0.23 }

interface LensProps {
  form: LensForm
  /** Width of the family at this depth, px (the lens adds its own proportion). */
  width: number
  mode: LensMode
  /** Scale the lens is shown at (hairlines stay hairlines). */
  zoom: number
  today: boolean
  reduced: boolean
}

export const Lens = memo(function Lens({ form, width, mode, zoom, today, reduced }: LensProps) {
  const uid = useId().replace(/[:«»]/g, '')
  const W = width
  const plane = useMemo(() => planeOutline(form), [form])
  const facing = mode === 'selected' || mode === 'opening'
  const fog = form.tense === 'past' ? FOG_PAST : FOG

  // The same object turns toward us: only its view and its thickness change.
  const view = useMotionValue(form.view)
  useEffect(() => {
    const c = animate(view, facing ? SELECTED_VIEW : form.view, { duration: reduced ? 0 : 0.7, ease: EASE })
    return () => c.stop()
  }, [facing, form.view, view, reduced])
  const geo = useTransform(view, (v) => {
    const k = (v - form.view) / (SELECTED_VIEW - form.view || 1)
    return viewLens(plane, W, v, form.thickness * (1 - (1 - SELECTED_FLAT) * Math.max(0, Math.min(1, k))))
  })
  const rest = useMemo(() => viewLens(plane, W, form.view, form.thickness), [plane, W, form])
  const chosen = useMemo(() => viewLens(plane, W, SELECTED_VIEW, form.thickness * SELECTED_FLAT), [plane, W, form])

  const silhouette = useTransform(geo, (g) => smoothPath(g.silhouette))
  const face = useTransform(geo, (g) => smoothPath(g.face))
  const underBand = useTransform(geo, (g) => smoothPath([...g.near, ...g.under.slice().reverse()]))
  const nearEdge = useTransform(geo, (g) => smoothOpen(stretch(g.near, 0.12, 0.88)))
  const underEdge = useTransform(geo, (g) => smoothOpen(stretch(g.under, 0.06, 0.94)))
  const caustic = useTransform(geo, (g) => smoothOpen(stretch(g.under, 0.18, 0.82).map(([x, y]) => [x * 0.97, y - 2.2] as Pt)))
  const farRim = useTransform(geo, (g) => smoothOpen(g.far))
  const ring = useTransform(geo, (g) => smoothPath(g.face.map(([x, y]) => [x * 0.82, y * 0.8 + (g.bounds.faceBottom + g.bounds.top) * 0.1] as Pt)))
  const band = useTransform(geo, (g) => {
    const h = g.bounds.faceBottom - g.bounds.top
    return smoothOpen(stretch(g.far, 0.14, 0.86).map(([x, y]) => [x * 0.8, y * 0.5 + h * form.light.band] as Pt))
  })
  const spec = useTransform(geo, (g) => crescent(g.far, form.light.at, form.light.span))
  const shadowY = useTransform(geo, (g) => g.bounds.bottom + W * 0.035)
  const hot = useTransform(geo, (g) => {
    const i = Math.round((g.far.length - 1) * (form.light.second > 0.5 ? 0.8 : 0.24))
    const [x, y] = g.far[i]
    return { x: x * 0.86, y: y * 0.78 }
  })
  const hotX = useTransform(hot, (h) => h.x)
  const hotY = useTransform(hot, (h) => h.y)

  const k = 1 / Math.max(zoom, 0.01)
  const shell = mode === 'opening' ? 0 : 1
  const shellT = { duration: mode === 'opening' ? 0.7 : 0.5, ease: EASE }
  const organize = { duration: reduced ? 0 : 0.62, ease: EASE, delay: reduced ? 0 : mode === 'selected' ? 0.24 : 0 }
  const b = rest.bounds
  const pad = 16
  const box = { x: b.left - pad, y: b.top - pad, w: b.right - b.left + pad * 2, h: b.bottom - b.top + pad * 2 + W * 0.1 }

  return (
    <m.div
      className="sm-glass"
      data-tense={form.tense}
      data-today={today || undefined}
      style={{ width: box.w, height: box.h, marginLeft: box.x, marginTop: box.y, originX: -box.x / box.w, originY: -box.y / box.h }}
      initial={false}
      animate={{ rotate: facing ? form.tilt * 0.35 : form.tilt }}
      transition={{ duration: reduced ? 0 : 0.7, ease: EASE }}
    >
      <svg aria-hidden width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="overflow-visible">
        <defs>
          <clipPath id={`${uid}-clip`}>
            <m.path d={silhouette} />
          </clipPath>
          {/* Fresnel: clear at the heart, brighter toward the rim; the dome's lower glass holds the tint. */}
          <radialGradient id={`${uid}-body`} cx="50%" cy="70%" r="66%">
            <stop offset="0" stopColor="#BFAFD6" stopOpacity={0.16 + form.frost * 0.95} />
            <stop offset="0.5" stopColor="#E6DCEE" stopOpacity={0.08 + form.frost * 0.55} />
            <stop offset="0.84" stopColor="#F6F2F8" stopOpacity={0.16 + form.frost * 0.3} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.5} />
          </radialGradient>
          {/* The dome catches the light high on its near side. */}
          <radialGradient id={`${uid}-dome`} cx={form.light.second > 0.5 ? '64%' : '36%'} cy="30%" r="42%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.12} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-near`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={today ? '#C4D1E4' : '#FFFFFF'} stopOpacity={0} />
            <stop offset="0.5" stopColor={today ? '#C4D1E4' : '#FFFFFF'} stopOpacity={1} />
            <stop offset="1" stopColor={today ? '#C4D1E4' : '#FFFFFF'} stopOpacity={0} />
          </linearGradient>
          <radialGradient id={`${uid}-warm`} cx="24%" cy="74%" r="46%">
            <stop offset="0" stopColor="#EFC5AE" stopOpacity={0.1 + form.fog * 0.46} />
            <stop offset="1" stopColor="#EFC7B2" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-face`} x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
            <stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.07} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${uid}-under`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B4A6CE" stopOpacity={0.05 + form.load * 0.16} />
            <stop offset="0.75" stopColor="#9E90C0" stopOpacity={0.1 + form.load * 0.26} />
            <stop offset="1" stopColor="#C9BEDD" stopOpacity={0.2 + form.load * 0.2} />
          </linearGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.98} />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.62} />
            <stop offset="1" stopColor={today ? '#B7C6DC' : '#E6DDEE'} stopOpacity={0.8} />
          </linearGradient>
          <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <stop offset={form.light.second > 0.5 ? 0.35 : 0.6} stopColor="#FFFFFF" stopOpacity={0.9} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </linearGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#8E86A8" stopOpacity={0.12 + form.load * 0.16} />
            <stop offset="0.6" stopColor="#B7A8C4" stopOpacity={0.05 + form.load * 0.06} />
            <stop offset="1" stopColor="#B7A8C4" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-hot`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          {(['manana', 'tarde', 'noche', 'depth'] as const).map((p) => (
            <radialGradient key={p} id={`${uid}-fog-${p}`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={fog[p][0]} />
              <stop offset="0.45" stopColor={fog[p][1]} />
              <stop offset="1" stopColor={fog[p][1]} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* A soft lavender shadow grounds it in the shared space — never a hard one. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.ellipse cx={0} cy={shadowY} rx={W * 0.4} ry={W * 0.06} fill={`url(#${uid}-shadow)`} />
        </m.g>

        {/* The glass body. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.path d={silhouette} fill={`url(#${uid}-body)`} stroke="#8C82AA" strokeOpacity={0.16} strokeWidth={0.6 * k} />
          <m.path d={silhouette} fill={`url(#${uid}-warm)`} />
        </m.g>

        {/* Suspended matter: at rest one mixed mass low in the dome; facing us, three regions of light. */}
        <g clipPath={`url(#${uid}-clip)`}>
          {form.depth > 0 && (
            <m.ellipse
              fill={`url(#${uid}-fog-depth)`}
              initial={false}
              animate={
                facing
                  ? { cx: 0, cy: (chosen.bounds.top + chosen.bounds.faceBottom) / 2, rx: W * 0.52, ry: (chosen.bounds.faceBottom - chosen.bounds.top) * 0.42, opacity: mode === 'opening' ? 0 : form.depth * 0.2 }
                  : { cx: 0, cy: (rest.bounds.faceBottom + rest.bounds.bottom) * 0.45, rx: W * 0.5, ry: (rest.bounds.bottom - rest.bounds.top) * 0.4, opacity: form.depth * 0.7 }
              }
              transition={organize}
            />
          )}
          {form.layers.map((l, i) => {
            const h = chosen.bounds.faceBottom - chosen.bounds.top
            const restH = rest.bounds.bottom - rest.bounds.top
            const target = facing
              ? { cx: W * (i - 1) * 0.02, cy: chosen.bounds.top + h * PART_AT[l.part], rx: W * 0.42, ry: h * 0.14, opacity: mode === 'opening' ? 0 : 0.12 + 0.88 * l.matter }
              : { cx: W * REST_X[l.part], cy: rest.bounds.top + restH * 0.62, rx: W * 0.32 * (0.85 + 0.35 * l.matter), ry: restH * 0.44, opacity: form.fog * (0.55 + 0.45 * l.matter) }
            return <m.ellipse key={l.part} fill={`url(#${uid}-fog-${l.part})`} initial={false} animate={target} transition={organize} />
          })}
        </g>

        {/* Optics: the top surface, the dome's lower glass, rings, reflections and the luminous rim. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.path d={face} fill={`url(#${uid}-face)`} />
          <m.path d={face} fill={`url(#${uid}-dome)`} />
          <m.path d={underBand} fill={`url(#${uid}-under)`} />
          <m.path className="sm-ring" d={ring} fill="none" stroke="#FFFFFF" strokeOpacity={0.85 * form.ring} strokeWidth={0.8 * k} />
          <m.path className="sm-band" d={band} fill="none" stroke={`url(#${uid}-band)`} strokeOpacity={0.3} strokeWidth={W * 0.075} strokeLinecap="round" />
          <m.path d={nearEdge} fill="none" stroke={`url(#${uid}-near)`} strokeOpacity={today ? 0.7 : 0.42} strokeWidth={0.9 * k} />
          <m.path d={underEdge} fill="none" stroke="#172034" strokeOpacity={0.13} strokeWidth={0.7 * k} />
          <m.path d={caustic} fill="none" stroke="#FFFFFF" strokeOpacity={0.88} strokeWidth={1.3 * k} strokeLinecap="round" />
          <m.path className="sm-edge" d={farRim} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={(today ? 1.4 : 1.15) * k} strokeLinecap="round" />
          <m.path className="sm-spec" d={spec} fill="#FFFFFF" />
          <m.ellipse className="sm-spec-dot" cx={hotX} cy={hotY} rx={W * 0.045} ry={W * 0.018} fill={`url(#${uid}-hot)`} />
        </m.g>
      </svg>
    </m.div>
  )
})

/** A thin crescent of light along the far rim, centered at `at` (share of the rim), `span` long. */
function crescent(far: Pt[], at: number, span: number): string {
  const n = far.length - 1
  const from = Math.max(1, Math.round(n * (at - span / 2)))
  const to = Math.min(n - 1, Math.round(n * (at + span / 2)))
  const outer: Pt[] = []
  const inner: Pt[] = []
  for (let i = from; i <= to; i++) {
    const u = (i - from) / Math.max(1, to - from)
    const [x, y] = far[i]
    outer.push([x * 0.93, y * 0.84])
    const s = 0.93 - 0.05 * Math.sin(Math.PI * u)
    inner.push([x * s, y * (0.84 - 0.2 * Math.sin(Math.PI * u))])
  }
  const pts = [...outer, ...inner.reverse()]
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`
}
