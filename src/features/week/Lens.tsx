import { animate, m, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { memo, useEffect, useId, useMemo, type CSSProperties } from 'react'
import type { DayPart } from '../../domain/week'
import { EASE } from '../../motion/tokens'
import { planeOutline, smoothOpen, smoothPath, stretch, viewLens, type LensForm, type LensView, type Pt } from './geometry'

/**
 * One day as a hand-molded piece of optical glass, seen in perspective:
 * a milky lavender depth high inside, warmer lighter glass below, an edge band
 * that shows its thickness mostly at the bottom, a fine inset contour, a
 * caustic along its lower edge and a soft shadow. Light falls differently on
 * each of the seven. No card, no pill, no bubble, no saucer.
 *
 *   rest       seen from above at its own angle; its matter one mixed mass
 *   selected   the same piece, nearer and turned a little toward us, a little
 *              flatter; the matter settles into mañana · tarde · noche
 *   opening    the surface loses its limit; the matter is handed to the space
 */
export type LensMode = 'rest' | 'selected' | 'receded' | 'opening'

/** How much of its face a chosen day turns toward us (sine of the elevation): frontal-ish, never flat-on. */
export const SELECTED_VIEW = 0.88
/** A chosen day becomes a little flatter. */
export const SELECTED_FLAT = 0.5

/** Where the three regions of matter settle, as a share of the face's height from its top. */
export const PART_AT: Record<DayPart, number> = { manana: 0.3, tarde: 0.56, noche: 0.81 }

/** The chosen day's geometry (px, before its zoom): what the words inside it are laid on. */
export function selectedView(form: LensForm, width: number): LensView {
  return viewLens(planeOutline(form), width, SELECTED_VIEW, form.thickness * SELECTED_FLAT)
}

/** Aurora Pearl, desaturated. Mañana warm, tarde mauve, noche a cooler lavender. */
const FOG: Record<DayPart | 'depth', [string, string]> = {
  manana: ['rgba(232, 188, 166, 0.95)', 'rgba(241, 213, 195, 0.5)'],
  tarde: ['rgba(176, 156, 196, 0.95)', 'rgba(199, 184, 206, 0.5)'],
  noche: ['rgba(162, 156, 204, 0.92)', 'rgba(216, 208, 231, 0.5)'],
  depth: ['rgba(146, 136, 184, 0.9)', 'rgba(199, 184, 206, 0.35)'],
}

/** A day already lived: the same matter, a touch more silver. */
const FOG_PAST: typeof FOG = {
  manana: ['rgba(214, 196, 190, 0.95)', 'rgba(228, 220, 214, 0.5)'],
  tarde: ['rgba(182, 174, 196, 0.95)', 'rgba(205, 201, 212, 0.5)'],
  noche: ['rgba(174, 174, 200, 0.92)', 'rgba(214, 214, 226, 0.5)'],
  depth: ['rgba(158, 154, 182, 0.9)', 'rgba(204, 200, 212, 0.35)'],
}

/** Where each part's matter floats at rest: low inside the piece, morning to night. */
const REST_X: Record<DayPart, number> = { manana: -0.22, tarde: 0.02, noche: 0.23 }

interface LensProps {
  form: LensForm
  /** Width of the family at this depth, px (the piece adds its own proportion). */
  width: number
  mode: LensMode
  /** Scale the piece is shown at (hairlines stay hairlines). */
  zoom: number
  today: boolean
  reduced: boolean
  /** A near, dense piece lets its light spill a little into the field around it (0–1). */
  glow: number
  /** Seconds its reflections take to breathe, never in step with the others (0: still, far away). */
  breathe: number
}

export const Lens = memo(function Lens({ form, width, mode, zoom, today, reduced, glow, breathe }: LensProps) {
  const uid = useId().replace(/[:«»]/g, '')
  const W = width
  const plane = useMemo(() => planeOutline(form), [form])
  const facing = mode === 'selected' || mode === 'opening'
  const fog = form.tense === 'past' ? FOG_PAST : FOG
  const empty = form.ring > 0.5
  // Only a membrane (Thursday) or a deep, long piece (Sunday) shows its whole inner contour; the others are solid domes.
  const membrane = empty || form.depth > 0

  // The same piece turns toward us: only its view and its thickness change.
  const view = useMotionValue(form.view)
  useEffect(() => {
    const c = animate(view, facing ? SELECTED_VIEW : form.view, { duration: reduced ? 0 : 0.7, ease: EASE })
    return () => c.stop()
  }, [facing, form.view, view, reduced])
  const geo = useTransform(view, (v) => {
    const k = Math.max(0, Math.min(1, (v - form.view) / (SELECTED_VIEW - form.view || 1)))
    return viewLens(plane, W, v, form.thickness * (1 - (1 - SELECTED_FLAT) * k))
  })
  const rest = useMemo(() => viewLens(plane, W, form.view, form.thickness), [plane, W, form])
  const chosen = useMemo(() => viewLens(plane, W, SELECTED_VIEW, form.thickness * SELECTED_FLAT), [plane, W, form])

  const silhouette = useTransform(geo, (g) => smoothPath(g.silhouette))
  const face = useTransform(geo, (g) => smoothPath(g.face))
  // The lower edge band: between the face's lower contour and the piece's lower edge.
  const edgeBand = useTransform(geo, (g) => {
    const n = g.face.length
    const lower = g.face.slice(g.far.length, n)
    return smoothPath([...g.under, ...lower])
  })
  // The base seen through the dome: only the lower part of the inner contour.
  const faceLower = useTransform(geo, (g) => smoothOpen(stretch(g.face.slice(g.far.length), 0.05, 0.95)))
  const lowerLeft = useTransform(geo, (g) => smoothOpen(stretch(g.under, 0.04, 0.46)))
  const caustic = useTransform(geo, (g) => smoothOpen(stretch(g.under, 0.3, 0.9).map(([x, y]) => [x * 0.96, y - 2] as Pt)))
  // Just under the far rim the glass bends the field: a darker lavender line.
  const underRim = useTransform(geo, (g) => {
    const h = g.bounds.bottom - g.bounds.top
    return smoothOpen(stretch(g.far, 0.08, 0.92).map(([x, y]) => [x * 0.93, y + h * 0.1] as Pt))
  })
  const shadowY = useTransform(geo, (g) => g.bounds.bottom + W * 0.03)
  const midY = useTransform(geo, (g) => (g.bounds.top + g.bounds.bottom) / 2)

  const k = 1 / Math.max(zoom, 0.01)
  const shell = mode === 'opening' ? 0 : 1
  const shellT = { duration: mode === 'opening' ? 0.7 : 0.5, ease: EASE }
  const organize = { duration: reduced ? 0 : 0.62, ease: EASE, delay: reduced ? 0 : mode === 'selected' ? 0.24 : 0 }
  const b = rest.bounds
  const pad = 20
  const box = { x: b.left - pad, y: b.top - pad, w: b.right - b.left + pad * 2, h: b.bottom - b.top + pad * 2 + W * 0.12 }
  const svgProps = { width: box.w, height: box.h, viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, className: 'absolute inset-0 overflow-visible' }

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
      <svg aria-hidden {...svgProps}>
        <defs>
          <clipPath id={`${uid}-clip`}>
            <m.path d={silhouette} />
          </clipPath>
          {/* Milky lavender depth high inside, warmer and lighter glass below. */}
          <linearGradient id={`${uid}-body`} x1="0.35" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#EDE6F4" stopOpacity={empty ? 0.16 : 0.5 + form.frost * 0.25} />
            <stop offset="0.4" stopColor="#B9A5D6" stopOpacity={empty ? 0.08 : 0.44 + form.frost * 0.5} />
            <stop offset="0.72" stopColor="#EFD9D2" stopOpacity={empty ? 0.08 : 0.38 + form.frost * 0.3} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={empty ? 0.34 : 0.7} />
          </linearGradient>
          {/* The glass's depth shows at its lower edge: brighter toward the rim. */}
          <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={membrane ? 0.3 : 0.1} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={membrane ? 0.75 : 0.42} />
          </linearGradient>
          {/* Light gathers in the lower glass: soft, never a band. */}
          <linearGradient id={`${uid}-lift`} x1="0" y1="0" x2="0.12" y2="1">
            <stop offset="0.58" stopColor="#FFFFFF" stopOpacity={0} />
            <stop offset="0.86" stopColor="#FFF8F4" stopOpacity={empty ? 0.18 : 0.26} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={empty ? 0.36 : 0.5} />
          </linearGradient>
          {/* The field seen bent through the glass: a soft lavender band, fading at both ends. */}
          <linearGradient id={`${uid}-bent`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9A88C0" stopOpacity={0} />
            <stop offset="0.3" stopColor="#9A88C0" stopOpacity={1} />
            <stop offset="0.72" stopColor="#A898C8" stopOpacity={0.8} />
            <stop offset="1" stopColor="#A898C8" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${uid}-contour`} x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.05} />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.35} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.9} />
          </linearGradient>
          <radialGradient id={`${uid}-warm`} cx="30%" cy="80%" r="52%">
            <stop offset="0" stopColor="#F0C3AA" stopOpacity={empty ? 0.18 : 0.08 + form.fog * 0.5} />
            <stop offset="1" stopColor="#F0C3AA" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-face`} cx="38%" cy="26%" r="62%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={empty ? 0.12 : 0.3} />
            <stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.04} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <stop offset="0.4" stopColor="#E9E2F2" stopOpacity={0.75} />
            <stop offset="1" stopColor={today ? '#C8D5E8' : '#FFFFFF'} stopOpacity={1} />
          </linearGradient>
          {/* The dome reflects the sky: a broad soft light over its upper half. */}
          <radialGradient id={`${uid}-sky`} cx="50%" cy="0%" r="70%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={empty ? 0.3 : 0.7} />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.14} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#8C80AA" stopOpacity={0.1 + form.load * 0.14} />
            <stop offset="0.6" stopColor="#B4A4C4" stopOpacity={0.04 + form.load * 0.05} />
            <stop offset="1" stopColor="#B4A4C4" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#D8C8E4" stopOpacity={0.5} />
            <stop offset="0.5" stopColor="#EAD4CC" stopOpacity={0.22} />
            <stop offset="1" stopColor="#EAD4CC" stopOpacity={0} />
          </radialGradient>
          {(['manana', 'tarde', 'noche', 'depth'] as const).map((p) => (
            <radialGradient key={p} id={`${uid}-fog-${p}`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={fog[p][0]} />
              <stop offset="0.45" stopColor={fog[p][1]} />
              <stop offset="1" stopColor={fog[p][1]} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* A near, dense piece spills a little light around it; a soft shadow grounds every piece. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          {glow > 0.05 && <m.ellipse cx={0} cy={midY} rx={W * 0.85} ry={W * 0.5} fill={`url(#${uid}-glow)`} opacity={glow * 0.55} />}
          <m.ellipse cx={W * 0.03} cy={shadowY} rx={W * 0.42} ry={W * 0.065} fill={`url(#${uid}-shadow)`} />
        </m.g>

        {/* The glass body. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.path d={silhouette} fill={`url(#${uid}-body)`} />
          <m.path d={silhouette} fill={`url(#${uid}-warm)`} />
          <m.path d={silhouette} fill={`url(#${uid}-lift)`} />
        </m.g>

        {/* Suspended matter: at rest one mixed mass inside; facing us, three regions of light. */}
        <g clipPath={`url(#${uid}-clip)`}>
          {form.depth > 0 && (
            <m.ellipse
              fill={`url(#${uid}-fog-depth)`}
              initial={false}
              animate={
                facing
                  ? { cx: 0, cy: (chosen.bounds.top + chosen.bounds.faceBottom) / 2, rx: W * 0.52, ry: (chosen.bounds.faceBottom - chosen.bounds.top) * 0.42, opacity: mode === 'opening' ? 0 : form.depth * 0.2 }
                  : { cx: W * 0.04, cy: rest.bounds.top + (rest.bounds.bottom - rest.bounds.top) * 0.46, rx: W * 0.46, ry: (rest.bounds.bottom - rest.bounds.top) * 0.3, opacity: form.depth * 0.6 }
              }
              transition={organize}
            />
          )}
          {form.layers.map((l, i) => {
            const h = chosen.bounds.faceBottom - chosen.bounds.top
            const restH = rest.bounds.bottom - rest.bounds.top
            const target = facing
              ? { cx: W * (i - 1) * 0.02, cy: chosen.bounds.top + h * PART_AT[l.part], rx: W * 0.42, ry: h * 0.14, opacity: mode === 'opening' ? 0 : 0.12 + 0.88 * l.matter }
              : { cx: W * REST_X[l.part], cy: rest.bounds.top + restH * (0.5 + i * 0.03), rx: W * 0.36 * (0.85 + 0.35 * l.matter), ry: restH * 0.42, opacity: form.fog * (0.28 + 0.34 * l.matter) }
            return <m.ellipse key={l.part} fill={`url(#${uid}-fog-${l.part})`} initial={false} animate={target} transition={organize} />
          })}
        </g>

        {/* Optics: the clear face, the refraction of the field, the edge band, contours and caustic. */}
        <m.g initial={false} animate={{ opacity: shell }} transition={shellT}>
          <m.path d={face} fill={`url(#${uid}-face)`} />
          <m.path d={face} fill={`url(#${uid}-sky)`} />
          {!empty && <m.path d={underRim} fill="none" stroke={`url(#${uid}-bent)`} strokeOpacity={0.07 + form.frost * 0.14} strokeWidth={W * 0.045} strokeLinecap="round" />}
          <m.path d={underRim} fill="none" stroke={`url(#${uid}-bent)`} strokeOpacity={empty ? 0.12 : 0.14 + form.frost * 0.26} strokeWidth={W * 0.01} strokeLinecap="round" />
          {/* The glass seen through its own thickness, only along its lower edge. */}
          <m.path d={edgeBand} fill={`url(#${uid}-edge)`} />
          <m.path className="sm-ring" d={membrane ? face : faceLower} fill="none" stroke={today ? '#D2DDEC' : `url(#${uid}-contour)`} strokeOpacity={membrane ? 0.35 + 0.6 * form.ring : 0.55} strokeWidth={(empty ? 1.1 : 0.8) * k} strokeLinecap="round" />
          <m.path d={lowerLeft} fill="none" stroke="#3A3358" strokeOpacity={0.16} strokeWidth={0.8 * k} />
          <m.path d={caustic} fill="none" stroke="#FFFFFF" strokeOpacity={1} strokeWidth={1.5 * k} strokeLinecap="round" />
          <m.path className="sm-edge" d={silhouette} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={(today ? 1.4 : empty ? 1.5 : 1.2) * k} />
        </m.g>
      </svg>

      {/* Its reflections, on their own layer: they breathe without repainting the glass. */}
      <m.div
        className="sm-light"
        data-breathe={breathe > 0 || undefined}
        style={{ '--breathe': `${breathe.toFixed(1)}s` } as CSSProperties}
        initial={false}
        animate={{ opacity: shell }}
        transition={shellT}
      >
        <svg aria-hidden {...svgProps}>
          <Reflections uid={uid} geo={geo} form={form} W={W} k={k} />
        </svg>
      </m.div>
    </m.div>
  )
})

/** Light falls differently on each piece: a streak, a broad patch, a spark, or almost nothing. */
function Reflections({ uid, geo, form, W, k }: { uid: string; geo: MotionValue<LensView>; form: LensForm; W: number; k: number }) {
  const { kind, at, span } = form.light
  const streak = useTransform(geo, (g) => crescent(g.far, at, span, kind === 'streak' ? 0.16 : 0.1))
  const spot = useTransform(geo, (g) => {
    const [x, y] = g.far[Math.round((g.far.length - 1) * at)]
    return { x: x * 0.82, y: y * 0.72 + (g.bounds.bottom - g.bounds.top) * 0.08 }
  })
  const sx = useTransform(spot, (s) => s.x)
  const sy = useTransform(spot, (s) => s.y)
  const edge = useTransform(geo, (g) => smoothOpen(stretch(g.under, 0.62, 0.92).map(([x, y]) => [x * 0.94, y - 4] as Pt)))
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-patch`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.28} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
      </defs>
      {kind === 'patch' && <m.ellipse cx={sx} cy={sy} rx={W * 0.2} ry={W * 0.07} fill={`url(#${uid}-patch)`} />}
      {(kind === 'streak' || kind === 'patch') && <m.path className="sm-spec" d={streak} fill="#FFFFFF" opacity={kind === 'streak' ? 1 : 0.65} />}
      {kind === 'spark' && (
        <>
          <m.ellipse cx={sx} cy={sy} rx={W * 0.05} ry={W * 0.02} fill={`url(#${uid}-patch)`} />
          <m.ellipse cx={sx} cy={sy} rx={W * 0.016} ry={W * 0.008} fill="#FFFFFF" />
        </>
      )}
      {kind === 'faint' && <m.path d={streak} fill="#FFFFFF" opacity={0.35} />}
      {kind !== 'faint' && <m.path d={edge} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.1 * k} strokeLinecap="round" />}
    </>
  )
}

/** A thin crescent of light along the far rim, centered at `at` (share of the rim), `span` long. */
function crescent(far: Pt[], at: number, span: number, thickness: number): string {
  const n = far.length - 1
  const from = Math.max(1, Math.round(n * (at - span / 2)))
  const to = Math.min(n - 1, Math.round(n * (at + span / 2)))
  const outer: Pt[] = []
  const inner: Pt[] = []
  for (let i = from; i <= to; i++) {
    const u = (i - from) / Math.max(1, to - from)
    const [x, y] = far[i]
    outer.push([x * 0.94, y * 0.86])
    inner.push([x * (0.94 - 0.03 * Math.sin(Math.PI * u)), y * (0.86 - thickness * Math.sin(Math.PI * u))])
  }
  const pts = [...outer, ...inner.reverse()]
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`
}
