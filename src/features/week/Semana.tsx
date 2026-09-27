import { AnimatePresence, animate, m, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, type CSSProperties, type PointerEvent } from 'react'
import { routineForDate } from '../../data/routine'
import { RoutineMissingError } from '../../domain/routine'
import { dateKey, formatClock, minutesOfDay } from '../../domain/time'
import { DAY_PARTS, buildWeek, shortDateLabel, weekRangeLabel, type DayPart, type Week, type WeekDay } from '../../domain/week'
import { useViewport } from '../../hooks/useViewport'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { Fibers } from './Fibers'
import {
  MOBILE_MAX,
  archipelago,
  depthBlur,
  depthOpacity,
  depthSaturation,
  depthScale,
  lensForm,
  network,
  planeOutline,
  smoothOpen,
  smoothPath,
  viewLens,
  type LabelSide,
  type LensForm,
} from './geometry'
import { Lens, PART_AT, selectedView, type LensMode } from './Lens'
import { Modular } from './Modular'
import { Veils } from './Veils'
import { WeekDayscape } from './WeekDayscape'
import { WEEK_FLOW_START, weekFlow } from './weekFlow'

/**
 * SEMANA — ¿cómo está diseñada mi semana?
 *
 * SIETE OBJETOS + UNA RED DE LUZ + UNA ATMÓSFERA COMPARTIDA: a small abstract
 * galaxy of glass. The network connects but does not organize; the
 * information lives in the objects.
 *
 *   1 general    the seven days in one spatial field, near and far
 *   2 selected   the same object comes forward and turns a little toward us;
 *                its matter settles into mañana · tarde · noche
 *   3 opening    the surface loses its limit; the matter stays, cools, separates
 *   4 day        the real DAYSCAPE of that date
 */

interface SemanaProps {
  /** Hide the navigation while a day opens (states 3–4). */
  onImmersive: (immersive: boolean) => void
  /** Today's DAYSCAPE hands off to HOY: mount it underneath. */
  onTodayHandoff: () => void
  /** …and SEMANA is left for HOY. */
  onTodayDone: () => void
}

/** Milliseconds from VER DÍA: the day's DAYSCAPE mounts, then the week gives way. */
const OPEN = { dayscape: 950, gone: 2200 }
const OPEN_REDUCED = { dayscape: 350, gone: 1400 }

/** Stacking inside the field: far days, a veil of mist, fibers crossing, near days. */
const Z = { backFibers: 2, mist: 14, midFibers: 15, chosen: 30, words: 32, matter: 35 }
const zOf = (z: number) => (z >= 0.5 ? 10 + Math.round((1 - z) * 6) : 16 + Math.round((0.5 - z) * 10))

export function Semana(props: SemanaProps) {
  const { now } = useDay()
  const today = dateKey(now)
  const week = useMemo((): Week | RoutineMissingError => {
    try {
      return buildWeek(today, routineForDate)
    } catch (error) {
      if (error instanceof RoutineMissingError) return error
      throw error
    }
  }, [today])

  if (week instanceof RoutineMissingError)
    return (
      <main role="alert" className="semana grid place-items-center px-6">
        <div className="max-w-md space-y-3">
          <p className="label-spaced text-[11px]" style={{ color: 'var(--sm-ink-3)' }}>
            Error de rutina
          </p>
          <p className="text-[17px] leading-relaxed">{week.message}</p>
        </div>
      </main>
    )
  return <WeekField week={week} {...props} />
}

function WeekField({ week, onImmersive, onTodayHandoff, onTodayDone }: SemanaProps & { week: Week }) {
  const { now } = useDay()
  const { level, ambient } = useMotion()
  const reduced = level === 'reducido'
  const { width, height } = useViewport()
  const [flow, dispatch] = useReducer(weekFlow, WEEK_FLOW_START)
  const { phase, selected, dayOpen } = flow
  const opened = flow.opened === null ? null : week.days[flow.opened]
  const timers = useRef<number[]>([])
  const later = useCallback((ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms)), [])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  /* ---------------------------------------------------------------------- */
  /* Composition                                                            */
  /* ---------------------------------------------------------------------- */

  const wide = width >= 1024
  const mobile = width < MOBILE_MAX
  const inset = {
    left: wide ? 104 + 44 : mobile ? 12 : 44,
    right: mobile ? 12 : 56,
    top: mobile ? Math.min(128, Math.round(height * 0.17)) : 168,
    bottom: mobile ? (height < 720 ? 92 : 104) : 74,
  }
  const fieldW = Math.max(240, width - inset.left - inset.right)
  const fieldH = Math.max(320, height - inset.top - inset.bottom)
  const forms = useMemo(() => week.days.map((d, i) => lensForm(d, i)), [week])
  const { arch, sizes, extents, net } = useMemo(() => {
    const arch = archipelago(fieldW, fieldH)
    const sizes = arch.items.map((p) => arch.base * depthScale(p.z))
    // What each piece occupies at rest, as seen.
    const extents = forms.map((f, i) => {
      const b = viewLens(planeOutline(f), sizes[i], f.view, f.thickness).bounds
      return { rx: (b.right - b.left) / 2, ry: (b.bottom - b.top) / 2, top: b.top, bottom: b.bottom }
    })
    return { arch, sizes, extents, net: network(arch, fieldW, fieldH) }
  }, [fieldW, fieldH, forms])

  // The chosen day comes to the middle of the field, nearer, turned a little toward us.
  const target = { x: fieldW * (mobile ? 0.5 : 0.53), y: fieldH * (mobile ? 0.52 : 0.54) }
  const selWidth = mobile ? Math.min(fieldW - 30, 330) : Math.min(470, fieldW * 0.37)

  /* ---------------------------------------------------------------------- */
  /* A little parallax (desktop): near days move more than far ones          */
  /* ---------------------------------------------------------------------- */

  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 30, damping: 16, mass: 1.2 })
  const sy = useSpring(py, { stiffness: 30, damping: 16, mass: 1.2 })
  const parallax = !mobile && !reduced
  const onPointerMove = (e: PointerEvent) => {
    if (!parallax || e.pointerType !== 'mouse') return
    px.set((e.clientX / width - 0.5) * 2)
    py.set((e.clientY / height - 0.5) * 2)
  }
  const backX = useTransform(sx, (v) => v * 3)
  const backY = useTransform(sy, (v) => v * 2)
  const midX = useTransform(sx, (v) => v * 7)
  const midY = useTransform(sy, (v) => v * 4)
  const mistX = useTransform(sx, (v) => v * 10)

  /* ---------------------------------------------------------------------- */
  /* States                                                                 */
  /* ---------------------------------------------------------------------- */

  const select = useCallback((index: number) => dispatch({ type: 'select', index }), [])
  const release = useCallback(() => dispatch({ type: 'release' }), [])
  const open = useCallback(() => {
    if (phase !== 'selected') return
    const t = reduced ? OPEN_REDUCED : OPEN
    dispatch({ type: 'open' })
    later(t.dayscape, () => dispatch({ type: 'mountDay' }))
    later(t.gone, () => dispatch({ type: 'dayShown' }))
  }, [phase, reduced, later])
  // The day is coming apart: the week returns underneath, at rest.
  const back = useCallback(() => {
    dispatch({ type: 'back' })
    later(1000, () => dispatch({ type: 'returned' }))
  }, [later])

  useEffect(() => onImmersive(phase === 'opening' || phase === 'day'), [phase, onImmersive])
  useEffect(() => () => onImmersive(false), [onImmersive])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'selected') release()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, release])

  // The week speaks Deep Ink whatever the hour; the day it opens keeps its own tone.
  const inDay = phase === 'day'
  useEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    if (inDay) return
    const before = meta?.getAttribute('content')
    root.dataset.section = 'semana'
    meta?.setAttribute('content', '#FBFAF8')
    // Once the week covers HOY's atmosphere, that atmosphere stops being painted underneath.
    const cover = window.setTimeout(() => (root.dataset.semanaCover = ''), 1100)
    return () => {
      window.clearTimeout(cover)
      delete root.dataset.section
      delete root.dataset.semanaCover
      if (before) meta?.setAttribute('content', before)
    }
  }, [inDay])

  const range = weekRangeLabel(week.start, week.end)
  useEffect(() => {
    document.title = `Semana · ${range}`
  }, [range])

  const chosen = selected === null ? null : week.days[selected]
  const presentPart = partAt(minutesOfDay(now))
  const opening = phase === 'opening'
  // The chosen glass as it will stand, in field px.
  const stage = useMemo(() => {
    if (selected === null) return null
    const f = forms[selected]
    const zoom = selWidth / (sizes[selected] * f.widthK)
    const b = selectedView(f, sizes[selected]).bounds
    // The glass's own origin, so that what we see is centered on the target.
    const ox = target.x - ((b.left + b.right) / 2) * zoom
    const oy = target.y - ((b.top + b.bottom) / 2) * zoom
    return { zoom, ox, oy, left: ox + b.left * zoom, right: ox + b.right * zoom, top: oy + b.top * zoom, faceBottom: oy + b.faceBottom * zoom, bottom: oy + b.bottom * zoom }
  }, [selected, forms, sizes, selWidth, target.x, target.y])

  const weekday = now.toLocaleDateString('es', { weekday: 'long' })
  const time = formatClock(minutesOfDay(now))

  return (
    <>
      {!inDay && (
        <m.main
          className="semana"
          data-ambient={ambient ? 'on' : 'off'}
          data-motion={level}
          aria-label={`Semana · ${range}`}
          onPointerMove={onPointerMove}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE } }}
          transition={{ duration: phase === 'returning' ? 1 : 0.7, ease: EASE }}
        >
          <Veils />
          {/* A very faint veil in front of everything: light haze, never over the words. */}
          <div aria-hidden className="sm-front" />
          {/* The light cools as the day opens. */}
          <m.div
            aria-hidden
            className="sm-cool"
            initial={false}
            animate={{ opacity: opening ? 0.88 : 0 }}
            transition={{ duration: opening ? 1.1 : 0.6, ease: EASE, delay: opening ? 0.35 : 0 }}
          />

          <m.header
            className="sm-head"
            style={{ left: mobile ? 22 : inset.left, right: mobile ? 22 : inset.right, top: mobile ? 'max(env(safe-area-inset-top), 28px)' : 56 }}
            initial={false}
            animate={{ opacity: opening ? 0 : 1 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div>
              <p className="label-spaced" style={{ fontSize: 10, color: 'var(--sm-ink-3)' }}>
                Semana
              </p>
              <p className="mt-3 font-display text-[26px] leading-none font-light tracking-[-0.025em] sm:text-[31px]" style={{ color: 'var(--sm-ink)' }}>
                {range}
              </p>
            </div>
            <p className="sm-now label-spaced tabular">
              {weekday} <span style={{ color: 'var(--sm-ink-4)' }}>·</span> {time}
            </p>
          </m.header>

          <div className="absolute" style={{ left: inset.left, top: inset.top, width: fieldW, height: fieldH }}>
            {/* A quiet way back from a chosen day: tap the space around it. */}
            {phase === 'selected' && <button type="button" aria-label="Volver a la semana" className="sm-backdrop" onClick={release} />}

            {/* The shared space: orbits and relations behind every day… */}
            <m.div
              className="pointer-events-none absolute inset-0"
              style={{ x: backX, y: backY, zIndex: Z.backFibers }}
              initial={false}
              animate={{ opacity: phase === 'general' || phase === 'returning' ? 1 : phase === 'selected' ? 0.18 : 0 }}
              transition={{ duration: opening ? 0.35 : 0.6, ease: EASE }}
            >
              <Fibers fibers={net.fibers} sparks={net.sparks} layer="back" today={week.todayIndex} still={reduced} />
            </m.div>

            {/* …a veil of mist that passes in front of the far days… */}
            <m.div aria-hidden className="sm-mist" style={{ left: -inset.left, top: -inset.top, width, height, x: mistX, zIndex: Z.mist }}>
              <div className="sm-mist-band" />
            </m.div>

            {/* …and one orbit crossing between far and near. */}
            <m.div
              className="pointer-events-none absolute inset-0"
              style={{ x: midX, y: midY, zIndex: Z.midFibers }}
              initial={false}
              animate={{ opacity: phase === 'general' || phase === 'returning' ? 1 : phase === 'selected' ? 0.12 : 0 }}
              transition={{ duration: opening ? 0.35 : 0.6, ease: EASE }}
            >
              <Fibers fibers={net.fibers} layer="mid" today={week.todayIndex} still={reduced} />
            </m.div>

            {week.days.map((day, i) => {
              const p = arch.items[i]
              const f = forms[i]
              const mode: LensMode =
                selected === null || phase === 'returning' ? 'rest' : selected === i ? (opening ? 'opening' : 'selected') : 'receded'
              const facing = mode === 'selected' || mode === 'opening'
              const zoom = facing && stage ? stage.zoom * (mode === 'opening' ? 1.22 : 1) : mode === 'receded' ? 0.86 : 1
              const pose =
                facing && stage
                  ? { x: stage.ox - p.x, y: stage.oy - p.y, scale: zoom, opacity: 1 }
                  : mode === 'receded'
                    ? { x: (p.x - target.x) * 0.1, y: (p.y - target.y) * 0.1, scale: 0.86, opacity: opening ? 0 : 0.34 }
                    : { x: 0, y: 0, scale: 1, opacity: 1 }
              return (
                <DayObject
                  key={day.date}
                  day={day}
                  form={f}
                  size={sizes[i]}
                  extent={extents[i]}
                  place={p}
                  label={p.label}
                  mobile={mobile}
                  mode={mode}
                  zoom={zoom}
                  pose={pose}
                  reduced={reduced}
                  sx={sx}
                  sy={sy}
                  glow={Math.max(0, f.load - 0.5) * 2 * (1 - p.z)}
                  onSelect={() => (selected === i && phase === 'selected' ? open() : select(i))}
                  index={i}
                />
              )
            })}

            {/* The chosen day, in words, suspended in and around its glass. */}
            <AnimatePresence>
              {chosen && stage && phase === 'selected' && <SelectedDay key={chosen.date} day={chosen} stage={stage} mobile={mobile} reduced={reduced} onOpen={open} />}
            </AnimatePresence>

            {/* OBJETO → MATERIA → ESPACIO: the matter stays, cools and separates in depth. */}
            <AnimatePresence>
              {chosen && stage && opening && (
                <SuspendedMatter key="matter" form={forms[selected!]} x={target.x} y={target.y} w={selWidth} present={presentPart} reduced={reduced} />
              )}
            </AnimatePresence>
          </div>
        </m.main>
      )}

      <AnimatePresence>
        {dayOpen && opened && (
          <WeekDayscape key="day" date={opened.date} dayName={opened.dayName} onBack={back} onHandoff={onTodayHandoff} onDone={onTodayDone} />
        )}
      </AnimatePresence>
    </>
  )
}

function partAt(minute: number): DayPart {
  for (const p of DAY_PARTS) if (minute >= p.from && minute < p.to) return p.part
  return minute < DAY_PARTS[0].from ? 'manana' : 'noche'
}

/* ------------------------------------------------------------------------ */
/* One day: its glass and its words                                          */
/* ------------------------------------------------------------------------ */

interface DayObjectProps {
  day: WeekDay
  form: LensForm
  size: number
  extent: { rx: number; ry: number; top: number; bottom: number }
  place: { x: number; y: number; z: number }
  label: LabelSide
  mobile: boolean
  mode: LensMode
  zoom: number
  pose: { x: number; y: number; scale: number; opacity: number }
  reduced: boolean
  sx: MotionValue<number>
  sy: MotionValue<number>
  glow: number
  onSelect: () => void
  index: number
}

function DayObject({ day, form, size, extent, place, label, mobile, mode, zoom, pose, reduced, sx, sy, glow, onSelect, index }: DayObjectProps) {
  const today = day.tense === 'today'
  const facing = mode === 'selected' || mode === 'opening'
  // Parallax by depth; a chosen day is still.
  const k = useMotionValue(1)
  useEffect(() => {
    const c = animate(k, facing ? 0 : 1, { duration: 0.6, ease: EASE })
    return () => c.stop()
  }, [facing, k])
  const px = useTransform(() => sx.get() * (1 - place.z) * 13 * k.get())
  const py = useTransform(() => sy.get() * (1 - place.z) * 7 * k.get())
  const drift = { '--drift': `${31 + ((index * 7) % 5) * 4}s`, '--drift-delay': `${-index * 5.3}s` } as CSSProperties
  const depth = facing ? { '--blur': '0px', '--sat': 1, '--fade': 1 } : { '--blur': `${depthBlur(place.z).toFixed(2)}px`, '--sat': depthSaturation(place.z).toFixed(2), '--fade': depthOpacity(place.z).toFixed(2) }
  const words: CSSProperties =
    label === 'below'
      ? { left: 0, top: extent.bottom + (mobile ? 12 : 16), transform: 'translateX(-50%)', textAlign: 'center', width: mobile ? 124 : 176 }
      : label === 'right'
        ? { left: extent.rx + 12, top: 0, transform: 'translateY(-50%)', textAlign: 'left', width: 124 }
        : { right: extent.rx + 12, top: 0, transform: 'translateY(-50%)', textAlign: 'right', width: 124 }
  const wordsShown = mode === 'rest' ? 1 : mode === 'receded' && pose.opacity > 0 ? 0.3 : 0
  return (
    <m.div
      // Reduced motion: no travel — the day fades out of one place and into the other.
      key={reduced ? mode : 'glass'}
      className="absolute"
      style={{ left: place.x, top: place.y, zIndex: facing ? 30 : zOf(place.z) }}
      initial={reduced ? { ...pose, opacity: 0 } : false}
      animate={pose}
      transition={{ duration: reduced ? 0.45 : 0.7, ease: EASE }}
    >
      <m.div style={{ x: px, y: py }}>
        <div className="sm-drift" style={drift} data-still={mode !== 'rest' || undefined}>
          <button
            type="button"
            className="sm-lens"
            style={{ width: extent.rx * 2, height: Math.max(extent.bottom - extent.top, 44), marginLeft: -extent.rx, marginTop: extent.top }}
            aria-label={`${day.dayName} ${shortDateLabel(day.date)}${today ? ', hoy' : ''}: ${day.theme}`}
            aria-pressed={facing}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            <span className="sm-lens-glass" style={{ ...depth, top: -extent.top } as CSSProperties}>
              <Lens form={form} width={size} mode={mode} zoom={zoom} today={today} reduced={reduced} glow={glow} breathe={place.z < 0.6 ? 11 + ((index * 5) % 7) * 2.3 : 0} />
            </span>
          </button>
          {/* HOY: the modular point, resting on its glass. */}
          {today && (
            <m.span className="sm-hoy" style={{ top: extent.top - 15 }} initial={false} animate={{ opacity: mode === 'rest' ? 1 : 0 }}>
              <Modular />
            </m.span>
          )}
        </div>

        <m.div
          className="pointer-events-none absolute"
          style={{ ...words, opacity: facing ? 0 : undefined }}
          initial={false}
          animate={{ opacity: wordsShown * (mode === 'rest' ? 0.72 + 0.28 * (1 - place.z) : 1), filter: wordsShown < 1 ? 'blur(1.5px)' : 'blur(0px)' }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="sm-day-name">{day.dayName}</span>
          <span className="sm-day-theme">{day.theme}</span>
        </m.div>
      </m.div>
    </m.div>
  )
}

/* ------------------------------------------------------------------------ */
/* State 2: the day, organized                                               */
/* ------------------------------------------------------------------------ */

interface Stage {
  zoom: number
  left: number
  right: number
  top: number
  faceBottom: number
  bottom: number
}

function SelectedDay({ day, stage, mobile, reduced, onOpen }: { day: WeekDay; stage: Stage; mobile: boolean; reduced: boolean; onOpen: () => void }) {
  const w = stage.right - stage.left
  const h = stage.faceBottom - stage.top
  const show = (delay: number) => ({
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.25, ease: EASE } },
    transition: { duration: 0.55, ease: EASE, delay: reduced ? 0.2 : delay },
  })
  const inside = stage.left + w * (mobile ? 0.19 : 0.2)
  return (
    <div className="sm-selected" aria-live="polite">
      {/* Its name and what it is for float just above the glass, not inside a medallion. */}
      <m.div className="absolute" style={{ left: stage.left + w * 0.06, bottom: `calc(100% - ${(stage.top - (mobile ? 16 : 22)).toFixed(1)}px)`, width: w * 0.94 }} {...show(0.45)}>
        <p className="label-spaced" style={{ fontSize: 10, letterSpacing: '0.34em', color: 'var(--sm-ink)' }}>
          {day.dayName}
          <span style={{ color: 'var(--sm-ink-4)' }}> · {shortDateLabel(day.date)}</span>
        </p>
        <p className="sm-selected-theme">{day.theme}</p>
      </m.div>
      {day.layers.map((l, i) => (
        <m.div key={l.part} className="absolute" style={{ left: inside, top: stage.top + h * PART_AT[l.part], width: w * 0.66 }} {...show(0.62 + i * 0.08)}>
          <div style={{ transform: 'translateY(-50%)' }}>
            <span className="label-spaced block" style={{ fontSize: 9, letterSpacing: '0.34em', color: 'var(--sm-ink-3)' }}>
              {l.label}
            </span>
            <span className="mt-[8px] block text-[14px] leading-snug tracking-[-0.005em]" style={{ color: 'var(--sm-ink)' }}>
              {l.names.join(' · ')}
            </span>
          </div>
        </m.div>
      ))}
      <m.div className="absolute" style={{ right: `calc(100% - ${(stage.right - w * 0.04).toFixed(1)}px)`, top: stage.bottom + (mobile ? 8 : 12) }} {...show(0.9)}>
        <button type="button" className="sm-open ds-continue label-spaced" onClick={onOpen}>
          Ver día <span aria-hidden className="ds-continue-arrow">→</span>
        </button>
      </m.div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* State 3: the surface is gone, the matter stays                            */
/* ------------------------------------------------------------------------ */

/** Three plates of matter drift apart in depth: morning further, night nearer. */
const PLATES: Record<DayPart, { y: number; scale: number; opacity: number }> = {
  manana: { y: -0.3, scale: 0.84, opacity: 0.78 },
  tarde: { y: 0, scale: 1, opacity: 0.95 },
  noche: { y: 0.3, scale: 1.12, opacity: 1 },
}

/** Warm matter, and the cool light it turns into. */
const PLATE_TINT: Record<DayPart, [string, string]> = {
  manana: ['rgba(234, 196, 176, 0.75)', 'rgba(247, 232, 222, 0.35)'],
  tarde: ['rgba(190, 172, 208, 0.75)', 'rgba(232, 224, 240, 0.35)'],
  noche: ['rgba(172, 168, 212, 0.78)', 'rgba(226, 224, 242, 0.35)'],
}

function SuspendedMatter({ form, x, y, w, present, reduced }: { form: LensForm; x: number; y: number; w: number; present: DayPart; reduced: boolean }) {
  const uid = useId().replace(/[:«»]/g, '')
  // Each plate keeps the lens's own outline, seen almost edge-on.
  const plate = useMemo(() => viewLens(planeOutline(form), w / form.widthK, 0.3, 0.02), [form, w])
  const b = plate.bounds
  const pw = b.right - b.left + 40
  const ph = b.bottom - b.top + 40
  const outline = smoothPath(plate.silhouette)
  const far = smoothOpen(plate.far)
  const near = smoothOpen(plate.near)
  const face = useMemo(() => selectedView(form, w / form.widthK).bounds, [form, w])
  const spread = (face.faceBottom - face.top) * 1.75
  return (
    <m.div aria-hidden className="pointer-events-none absolute" style={{ left: x, top: y, width: 0, height: 0, zIndex: Z.matter }} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
      {form.layers.map((l) => {
        const to = PLATES[l.part]
        const from = (PART_AT[l.part] - 0.55) * (face.faceBottom - face.top)
        const amount = 0.3 + 0.7 * l.matter
        return (
          <m.div
            key={l.part}
            className="sm-plate"
            data-part={l.part}
            style={{ width: pw, height: ph, marginLeft: -pw / 2, marginTop: -ph / 2 }}
            initial={{ y: from, scale: 1.1, opacity: 0 }}
            animate={{ y: to.y * spread, scale: to.scale * 1.12, opacity: to.opacity * amount }}
            transition={{ duration: reduced ? 0.4 : 1.15, ease: EASE, delay: reduced ? 0 : 0.18, opacity: { duration: 0.5, delay: 0.1 } }}
          >
            <svg width={pw} height={ph} viewBox={`${b.left - 20} ${b.top - 20} ${pw} ${ph}`} className="overflow-visible">
              <defs>
                <radialGradient id={`${uid}-${l.part}-w`} cx="50%" cy="55%" r="55%">
                  <stop offset="0" stopColor={PLATE_TINT[l.part][0]} />
                  <stop offset="0.7" stopColor={PLATE_TINT[l.part][1]} />
                  <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.55} />
                </radialGradient>
                <radialGradient id={`${uid}-${l.part}-c`} cx="50%" cy="55%" r="55%">
                  <stop offset="0" stopColor="rgba(160, 180, 214, 0.8)" />
                  <stop offset="0.7" stopColor="rgba(214, 224, 240, 0.4)" />
                  <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.6} />
                </radialGradient>
              </defs>
              <path d={outline} fill={`url(#${uid}-${l.part}-w)`} />
              <m.path d={outline} fill={`url(#${uid}-${l.part}-c)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.45 }} />
              <path d={far} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.3} strokeLinecap="round" />
              <path d={near} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round" />
            </svg>
            {l.part === present && (
              <m.b className="sm-plate-now" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.75 }} />
            )}
          </m.div>
        )
      })}
    </m.div>
  )
}
