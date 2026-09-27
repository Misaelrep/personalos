import { AnimatePresence, m } from 'framer-motion'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { routineForDate } from '../../data/routine'
import { RoutineMissingError } from '../../domain/routine'
import { dateKey, minutesOfDay } from '../../domain/time'
import { DAY_PARTS, buildWeek, shortDateLabel, weekRangeLabel, type DayPart, type Week, type WeekDay } from '../../domain/week'
import { useViewport } from '../../hooks/useViewport'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { Fibers } from './Fibers'
import { MOBILE_MAX, archipelago, depthScale, fibers, lensForm, type LensForm } from './geometry'
import { Lens, PART_Y, SELECTED_ASPECT, type LensMode } from './Lens'
import { Modular } from './Modular'
import { Veils } from './Veils'
import { WeekDayscape } from './WeekDayscape'
import { WEEK_FLOW_START, weekFlow } from './weekFlow'

/**
 * SEMANA — ¿cómo está diseñada mi semana?
 *
 * SIETE OBJETOS + UNA RED DE LUZ + UNA ATMÓSFERA COMPARTIDA. The network
 * connects but does not organize; the information lives in the objects.
 *
 *   1 general    the seven days, their names and what each is for
 *   2 selected   one day comes forward, faces us and organizes its matter
 *   3 opening    the glass loses cohesion; the matter stays, cools, separates
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
  const [hovered, setHovered] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  const later = useCallback((ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms)), [])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  /* ---------------------------------------------------------------------- */
  /* Composition                                                            */
  /* ---------------------------------------------------------------------- */

  const wide = width >= 1024
  const mobile = width < MOBILE_MAX
  const inset = {
    left: wide ? 104 + 44 : mobile ? 14 : 44,
    right: mobile ? 14 : 64,
    top: mobile ? 132 : 176,
    bottom: mobile ? 100 : 96,
  }
  const fieldW = Math.max(240, width - inset.left - inset.right)
  const fieldH = Math.max(320, height - inset.top - inset.bottom)
  const forms = useMemo(() => week.days.map((d, i) => lensForm(d, i)), [week])
  const { arch, sizes, extents, network } = useMemo(() => {
    const arch = archipelago(fieldW, fieldH)
    const sizes = arch.items.map((p) => arch.base * depthScale(p.z))
    // What each glass occupies at rest, seen at three quarters.
    const extents = forms.map((f, i) => {
      const W = sizes[i] * f.widthK
      const cos = Math.cos((f.lean * Math.PI) / 180)
      return { rx: W / 2, ry: (W * f.aspect * cos) / 2, below: (W * f.aspect * cos) / 2 + W * f.thickness * cos }
    })
    return { arch, sizes, extents, network: fibers(arch, extents) }
  }, [fieldW, fieldH, forms])

  // The chosen day comes to the middle of the field, facing us.
  const target = { x: fieldW / 2, y: mobile ? fieldH * 0.46 : fieldH * 0.5 + 6 }
  const selW = mobile ? Math.min(fieldW - 10, 340, (height - 230) / SELECTED_ASPECT) : Math.min(430, (fieldH * 0.98) / SELECTED_ASPECT, fieldW * 0.38)
  const selH = selW * SELECTED_ASPECT

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
  const showField = !inDay
  const opening = phase === 'opening'

  return (
    <>
      {showField && (
        <m.main
          className="semana"
          data-ambient={ambient ? 'on' : 'off'}
          data-motion={level}
          aria-label={`Semana · ${range}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE } }}
          transition={{ duration: phase === 'returning' ? 1 : 0.7, ease: EASE }}
        >
          <Veils />
          {/* The light cools as the day opens. */}
          <m.div
            aria-hidden
            className="sm-cool"
            initial={false}
            animate={{ opacity: opening ? 0.88 : 0 }}
            transition={{ duration: opening ? 1.1 : 0.6, ease: EASE, delay: opening ? 0.35 : 0 }}
          />

          <m.header
            className="absolute"
            style={{ left: mobile ? 22 : inset.left, top: mobile ? 'max(env(safe-area-inset-top), 30px)' : 58 }}
            initial={false}
            animate={{ opacity: opening ? 0 : 1 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <p className="label-spaced" style={{ fontSize: 10.5, color: 'var(--sm-ink-3)' }}>
              Semana
            </p>
            <p className="mt-3 font-display text-[27px] leading-none font-light tracking-[-0.025em] sm:text-[32px]" style={{ color: 'var(--sm-ink)' }}>
              {range}
            </p>
          </m.header>

          <div className="absolute" style={{ left: inset.left, top: inset.top, width: fieldW, height: fieldH }}>
            {/* A quiet way back from a chosen day: tap the space around it. */}
            {phase === 'selected' && <button type="button" aria-label="Volver a la semana" className="sm-backdrop" onClick={release} />}

            <m.div
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: phase === 'general' || phase === 'returning' ? 1 : phase === 'selected' ? 0.16 : 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Fibers fibers={network} still={reduced} />
            </m.div>

            {week.days.map((day, i) => {
              const p = arch.items[i]
              const f = forms[i]
              const mode: LensMode =
                selected === null || phase === 'returning' ? 'rest' : selected === i ? (opening ? 'opening' : 'selected') : 'receded'
              const W = sizes[i] * f.widthK
              const zoom = mode === 'selected' ? selW / W : mode === 'opening' ? (selW / W) * 1.24 : mode === 'receded' ? 0.84 : 1
              const pose =
                mode === 'selected' || mode === 'opening'
                  ? { x: target.x - p.x, y: target.y - p.y, scale: zoom, opacity: 1, filter: 'blur(0px)' }
                  : mode === 'receded'
                    ? {
                        x: (p.x - target.x) * 0.12,
                        y: (p.y - target.y) * 0.12,
                        scale: 0.84,
                        opacity: opening ? 0 : 0.3,
                        filter: 'blur(1.4px)',
                      }
                    : { x: 0, y: 0, scale: 1, opacity: hovered === i ? 1 : 1 - p.z * 0.16, filter: 'blur(0px)' }
              return (
                <DayObject
                  key={day.date}
                  day={day}
                  form={f}
                  size={sizes[i]}
                  extent={extents[i]}
                  place={p}
                  label={arch.mobile ? p.label : 'below'}
                  mode={mode}
                  zoom={zoom}
                  pose={pose}
                  reduced={reduced}
                  wordsShown={mode === 'rest' ? 1 : mode === 'receded' && !opening ? 0.22 : 0}
                  onSelect={() => (selected === i && phase === 'selected' ? open() : select(i))}
                  onHover={(on) => setHovered(on ? i : (h) => (h === i ? null : h))}
                  index={i}
                />
              )
            })}

            {/* The chosen day, in words, inside its glass. */}
            <AnimatePresence>
              {chosen && phase === 'selected' && (
                <SelectedDay key={chosen.date} day={chosen} x={target.x} y={target.y} w={selW} h={selH} reduced={reduced} onOpen={open} />
              )}
            </AnimatePresence>

            {/* OBJETO → MATERIA → ESPACIO: the matter stays, cools and separates in depth. */}
            <AnimatePresence>
              {chosen && opening && (
                <SuspendedMatter key="matter" form={forms[selected!]} x={target.x} y={target.y} w={selW} h={selH} present={presentPart} reduced={reduced} />
              )}
            </AnimatePresence>
          </div>
        </m.main>
      )}

      <AnimatePresence>
        {dayOpen && opened && (
          <WeekDayscape
            key="day"
            date={opened.date}
            dayName={opened.dayName}
            onBack={back}
            onHandoff={onTodayHandoff}
            onDone={onTodayDone}
          />
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
  extent: { rx: number; ry: number; below: number }
  place: { x: number; y: number; z: number }
  label: 'below' | 'left' | 'right'
  mode: LensMode
  zoom: number
  pose: { x: number; y: number; scale: number; opacity: number; filter: string }
  reduced: boolean
  /** Opacity of the day's name and function. */
  wordsShown: number
  onSelect: () => void
  onHover: (on: boolean) => void
  index: number
}

function DayObject({ day, form, size, extent, place, label, mode, zoom, pose, reduced, wordsShown, onSelect, onHover, index }: DayObjectProps) {
  const today = day.tense === 'today'
  const facing = mode === 'selected' || mode === 'opening'
  const drift = { '--drift': `${31 + ((index * 7) % 5) * 4}s`, '--drift-delay': `${-index * 5.3}s` } as CSSProperties
  const words: CSSProperties =
    label === 'below'
      ? { left: 0, top: extent.below + 18, transform: 'translateX(-50%)', textAlign: 'center', width: 190 }
      : label === 'right'
        ? { left: extent.rx + 14, top: 0, transform: 'translateY(-50%)', textAlign: 'left', width: 158 }
        : { right: extent.rx + 14, top: 0, transform: 'translateY(-50%)', textAlign: 'right', width: 158 }
  return (
    <m.div
      // Reduced motion: no travel — the day fades out of one place and into the other.
      key={reduced ? mode : 'glass'}
      className="absolute"
      style={{ left: place.x, top: place.y, zIndex: facing ? 30 : Math.round(20 - place.z * 10) }}
      initial={reduced ? { ...pose, opacity: 0 } : false}
      animate={pose}
      transition={{ duration: reduced ? 0.45 : 0.7, ease: EASE }}
    >
      <div className="sm-drift" style={drift} data-still={mode === 'receded' || undefined}>
        <button
          type="button"
          className="sm-lens"
          style={{ width: extent.rx * 2, height: Math.max(extent.ry * 2 + 10, 44), marginLeft: -extent.rx, marginTop: -extent.ry - 5 }}
          aria-label={`${day.dayName} ${shortDateLabel(day.date)}${today ? ', hoy' : ''}: ${day.theme}`}
          aria-pressed={facing}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
          onPointerLeave={() => onHover(false)}
        >
          <span className="sm-lens-glass" style={{ top: extent.ry + 5 }}>
            <Lens form={form} width={size} mode={mode} zoom={zoom} today={today} reduced={reduced} />
          </span>
        </button>
      </div>

      <m.div
        className="pointer-events-none absolute"
        style={words}
        initial={false}
        animate={{ opacity: wordsShown, filter: wordsShown < 1 ? 'blur(1.5px)' : 'blur(0px)' }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <span className={`sm-day-name ${label === 'left' ? 'justify-end' : label === 'right' ? 'justify-start' : 'justify-center'}`}>
          {today && <Modular />}
          {day.dayName}
        </span>
        <span className="sm-day-theme">{day.theme}</span>
      </m.div>
    </m.div>
  )
}

/* ------------------------------------------------------------------------ */
/* State 2: the day, organized                                               */
/* ------------------------------------------------------------------------ */

function SelectedDay({ day, x, y, w, h, reduced, onOpen }: { day: WeekDay; x: number; y: number; w: number; h: number; reduced: boolean; onOpen: () => void }) {
  const at = (f: number): CSSProperties => ({ position: 'absolute', left: 0, right: 0, top: `calc(50% + ${(f * h).toFixed(1)}px)`, transform: 'translateY(-50%)' })
  const show = (delay: number) => ({
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.25, ease: EASE } },
    transition: { duration: 0.5, ease: EASE, delay: reduced ? 0.2 : delay },
  })
  return (
    <div className="sm-selected" style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }} aria-live="polite">
      <m.div style={at(-0.37)} {...show(0.5)}>
        <p className="label-spaced text-center" style={{ fontSize: 10.5, letterSpacing: '0.34em', color: 'var(--sm-ink)' }}>
          {day.tense === 'today' && <Modular />} {day.dayName}
          <span style={{ color: 'var(--sm-ink-4)' }}> · {shortDateLabel(day.date)}</span>
        </p>
      </m.div>
      <m.div style={at(-0.265)} {...show(0.58)}>
        <p className="sm-selected-theme">{day.theme}</p>
      </m.div>
      {day.layers.map((l, i) => (
        <m.div key={l.part} style={at(PART_Y[l.part])} {...show(0.66 + i * 0.07)}>
          <p className="text-center">
            <span className="label-spaced block" style={{ fontSize: 9, letterSpacing: '0.34em', color: 'var(--sm-ink-3)' }}>
              {l.label}
            </span>
            <span className="mt-[7px] block px-6 text-[13.5px] leading-snug tracking-[-0.005em]" style={{ color: 'var(--sm-ink)' }}>
              {l.names.join(' · ')}
            </span>
          </p>
        </m.div>
      ))}
      <m.div style={{ ...at(0.39), display: 'flex', justifyContent: 'center' }} {...show(0.9)}>
        <button type="button" className="sm-open ds-continue label-spaced" onClick={onOpen}>
          Ver día <span aria-hidden className="ds-continue-arrow">→</span>
        </button>
      </m.div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* State 3: the shell is gone, the matter stays                              */
/* ------------------------------------------------------------------------ */

const DEPTH_OF: Record<DayPart, { y: number; scale: number; opacity: number }> = {
  manana: { y: -0.27, scale: 0.8, opacity: 0.7 },
  tarde: { y: 0.0, scale: 1, opacity: 0.95 },
  noche: { y: 0.27, scale: 1.16, opacity: 1 },
}

function SuspendedMatter({ form, x, y, w, h, present, reduced }: { form: LensForm; x: number; y: number; w: number; h: number; present: DayPart; reduced: boolean }) {
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: x, top: y, width: 0, height: 0, zIndex: 35 }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      {form.layers.map((l) => {
        const from = PART_Y[l.part] * h * 1.24
        const to = DEPTH_OF[l.part]
        const lw = w * 0.96
        const lh = h * 0.2
        const amount = 0.25 + 0.75 * l.matter
        return (
          <m.div
            key={l.part}
            className="sm-stratum"
            data-part={l.part}
            style={{ width: lw, height: lh, marginLeft: -lw / 2, marginTop: -lh / 2 }}
            initial={{ y: from, scale: 1, opacity: 0 }}
            animate={{ y: to.y * h * 1.3, scale: to.scale * 1.12, opacity: to.opacity * amount }}
            transition={{ duration: reduced ? 0.4 : 1.15, ease: EASE, delay: reduced ? 0 : 0.2, opacity: { duration: 0.5, delay: 0.1 } }}
          >
            <m.i className="sm-stratum-cool" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.45 }} />
            {l.part === present && (
              <m.b className="sm-stratum-now" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.75 }} />
            )}
          </m.div>
        )
      })}
    </m.div>
  )
}
