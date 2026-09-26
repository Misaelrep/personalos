import { AnimatePresence, animate, m, motionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from 'framer-motion'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ActiveMatrix } from '../../components/dot/ActiveMatrix'
import { Label } from '../../components/ui/Label'
import { formatClock, formatDuration, minutesOfDay } from '../../domain/time'
import { useDay } from '../../state/DayProvider'
import { useViewport } from '../../hooks/useViewport'
import { EASE } from '../../motion/tokens'
import { Aperture, MODULE_SCALE, makeMotion, visibleRange, type ApertureMotion } from './Aperture'
import { FRONT, seeded } from './atmosphere'
import { EXIT, FORM_S, NOW_LABEL_AFTER, exploreMorphs, nameAt, releaseAtMs, type MorphEvent } from './choreography'
import { nextForm } from './forms'
import {
  PARALLAX,
  hitTest,
  homePose,
  layoutDayscape,
  placeNames,
  rangeText,
  selectionPoses,
  targetOf,
  type DayscapeLayout,
  type Measure,
  type Placed,
} from './layout'
import { MassField, type Pan } from './MassField'
import { MatterCanvas } from './MatterCanvas'
import { assignFates, emitMatter, type Gathering, type Matter } from './matter'
import { stateLabel, type DayscapeModel, type Plane } from './model'
import { ORGANIC, displayed, isMorphing, makeRec, pauseMorph, resumeMorph, startMorph, type MorphRec } from './morph'

/**
 * DAYSCAPE — the whole day at once, around the present.
 *
 * reveal         the day forms in waves, morning first; each activity: form →
 *                Astral Fade → name → time; names stay ~1.5–2 s and dissolve
 * explore        clean field, only AHORA named; drag to look around (parallax),
 *                tap to bring an activity forward; CONTINUAR → from ~14 s
 * settle         CONTINUAR: selection closes, the field returns to its place
 * dematerialize  FORMS → FRAGMENTS → PARTICLE FIELD, far first
 * gather         AHORA breaks last; matter converges; the 3 × 3 module forms
 * handoff        the module lands on HOY's AHORA while HOY emerges
 */
export type DayscapeStage = 'reveal' | 'explore' | 'settle' | 'dematerialize' | 'gather' | 'handoff'

export const DAYSCAPE_STAGES: DayscapeStage[] = ['reveal', 'explore', 'settle', 'dematerialize', 'gather', 'handoff']

const reached = (stage: DayscapeStage, target: DayscapeStage) => DAYSCAPE_STAGES.indexOf(stage) >= DAYSCAPE_STAGES.indexOf(target)

/** Stacking order: each plane, its matter, and the veil of mist in front of the far plane. */
const Z = {
  attract: 5,
  plane: { bg: 10, mid: 30, fg: 40 } as Record<Plane, number>,
  matter: { bg: 11, mid: 31, fg: 41 } as Record<Plane, number>,
  veil: 20,
  glow: 44,
  now: 45,
  haze: 55,
  selected: 60,
  info: 65,
  targets: 70,
  handoff: 75,
}

interface DayscapeProps {
  model: DayscapeModel
  stage: DayscapeStage
  /** Duration multiplier: 1 normal, below 1 for accelerated review. */
  speed: number
  /** Compresses the reveal (review): 1 = the approved schedule. */
  revealScale: number
  /** Temporary names while the day forms. */
  names: boolean
  reduced: boolean
  /** Drag offset, shared with the atmosphere behind. */
  pan: Pan
  /** Contrast of the atmosphere behind (lower while inspecting or leaving). */
  atmosphere: MotionValue<number>
  /** HOY's AHORA shows the 3 × 3 matrix the module can land on. */
  landsOnMatrix: boolean
  /** Any tap or drag: the exploration hint is no longer needed. */
  onInteract: () => void
  /** An activity is being inspected. */
  onInspect?: (open: boolean) => void
}

/** Text width with Inter Tight, letter spacing included. */
let measureContext: CanvasRenderingContext2D | null | undefined
const measureLabel: Measure = (text, size, spacing, weight) => {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * size * (0.62 + spacing)
  measureContext.font = `${weight} ${size}px 'Inter Tight Variable', ui-sans-serif, system-ui, sans-serif`
  return measureContext.measureText(text).width + text.length * spacing * size
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
/** Beyond its limits a drag gives way, softly. */
const rubber = (v: number, limit: number) => (Math.abs(v) <= limit ? v : Math.sign(v) * (limit + (Math.abs(v) - limit) * 0.35))

export const Dayscape = memo(function Dayscape({
  model,
  stage,
  speed,
  revealScale,
  names,
  reduced,
  pan,
  atmosphere,
  landsOnMatrix,
  onInteract,
  onInspect,
}: DayscapeProps) {
  const { width, height } = useViewport()
  const [fontsReady, setFontsReady] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded')
  useEffect(() => {
    if (fontsReady) return
    let alive = true
    document.fonts?.ready.then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [fontsReady])
  // Names are measured again once the typeface is ready (`fontsReady`).
  const layout = useMemo(() => {
    const l = layoutDayscape(model, width, height, measureLabel(model.current.label.toUpperCase(), 13, 0.28, 500))
    placeNames(l, measureLabel, formatClock)
    return l
  }, [model, width, height, fontsReady])
  const current = layout.items.find((p) => p.a.side === 'current')!
  const nowId = current.a.id

  const [recs] = useState(() => new Map<string, MorphRec>(model.activities.map((a) => [a.id, makeRec(a.form)])))
  const [motions] = useState(() => new Map<string, ApertureMotion>(layout.items.map((p) => [p.a.id, makeMotion(p, false)])))
  const mo = (id: string) => motions.get(id)!
  const [extra] = useState(() => ({
    nowLabel: motionValue(0),
    labelDim: motionValue(1),
    module: motionValue(0),
    moduleLabel: motionValue(0),
    glow: motionValue(0),
    attract: { x: motionValue(current.x), y: motionValue(current.y - 120), o: motionValue(0) },
    field: motionValue(1),
  }))

  const stageRef = useRef(stage)
  stageRef.current = stage
  // Every pending timer is cleared when the field goes away.
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const interactive = !reached(stage, 'settle')
  const exiting = reached(stage, 'settle')

  /* ---------------------------------------------------------------------- */
  /* The day forms                                                           */
  /* ---------------------------------------------------------------------- */

  // Once: the reveal never restarts.
  useEffect(() => {
    const anims = layout.items.map((p) =>
      animate(mo(p.a.id).reveal, 1, {
        duration: (reduced ? 0.8 : FORM_S) * speed,
        delay: p.a.revealAt * revealScale * speed,
        ease: reduced ? 'linear' : [0.3, 0.1, 0.3, 1],
      }),
    )
    anims.push(
      animate(extra.nowLabel, 1, {
        duration: 0.6 * speed,
        delay: (current.a.revealAt + NOW_LABEL_AFTER) * revealScale * speed,
        ease: EASE,
      }),
    )
    return () => anims.forEach((a) => a.stop())
  }, [])

  // A resize keeps everyone at home with their depth.
  const selectedRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (selectedRef.current || exiting) return
    for (const p of layout.items) {
      mo(p.a.id).opacity.set(p.opacity)
      mo(p.a.id).blur.set(p.blur)
    }
  }, [layout])

  /* ---------------------------------------------------------------------- */
  /* Inspection                                                              */
  /* ---------------------------------------------------------------------- */

  const [selected, setSelected] = useState<string | null>(null)
  selectedRef.current = selected
  const inspectRef = useRef(onInspect)
  inspectRef.current = onInspect
  useEffect(() => inspectRef.current?.(Boolean(selected)), [selected])

  const release = useCallback(
    (id: string) => {
      // After a moment, the form returns slowly to its own cycle.
      timers.current.push(window.setTimeout(() => {
        const rec = recs.get(id)
        if (rec && selectedRef.current !== id && !reached(stageRef.current, 'settle')) resumeMorph(rec, speed)
      }, 800 * speed))
    },
    [recs, speed],
  )
  const close = useCallback(() => {
    const prev = selectedRef.current
    if (!prev) return
    setSelected(null)
    release(prev)
  }, [release])
  const select = useCallback(
    (id: string) => {
      const prev = selectedRef.current
      if (prev === id) return close()
      if (prev) release(prev)
      // Interaction wins over animation: the form holds still while inspected.
      pauseMorph(recs.get(id)!)
      setSelected(id)
    },
    [close, recs, release],
  )

  // Poses: it comes forward; the rest steps back, softer, still alive.
  useEffect(() => {
    const poses = selected ? selectionPoses(layout, selected) : null
    const t = { duration: (selected ? 0.9 : 0.8) * speed, ease: ORGANIC }
    const anims: AnimationPlaybackControls[] = []
    for (const p of layout.items) {
      const pose = poses?.get(p.a.id) ?? homePose(p)
      const o = mo(p.a.id)
      if (!reduced) {
        anims.push(animate(o.dx, pose.dx, t), animate(o.dy, pose.dy, t), animate(o.grow, pose.grow, t))
        anims.push(animate(o.focus, p.a.id === selected ? 1 : 0, t))
      }
      anims.push(animate(o.opacity, pose.opacity, t), animate(o.blur, pose.blur, t))
    }
    // The camera recenters as the activity comes forward: its place and its words are fixed on screen.
    if (selected && !reduced) {
      stopPan()
      panAnims.current = [animate(pan.x, 0, t), animate(pan.y, 0, t)]
    }
    anims.push(animate(extra.labelDim, selected ? 0.6 : 1, t))
    const leaving = reached(stageRef.current, 'settle')
    anims.push(animate(atmosphere, leaving ? 0.88 : selected ? 0.85 : 1, { duration: 1.2 * speed, ease: EASE }))
    // A mass of pearl-ice light is drawn, very gently, toward what is inspected.
    const sel = selected ? layout.items.find((p) => p.a.id === selected)! : null
    if (sel && !reduced) {
      const target = targetOf(layout, sel)
      anims.push(animate(extra.attract.x, target.x, { duration: 2.6 * speed, ease: EASE }))
      anims.push(animate(extra.attract.y, target.y, { duration: 2.6 * speed, ease: EASE }))
    }
    anims.push(animate(extra.attract.o, sel && !reduced ? 0.9 : 0, { duration: (sel ? 1.6 : 1.4) * speed, ease: EASE }))
    return () => anims.forEach((a) => a.stop())
  }, [selected, layout, reduced, speed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  /* ---------------------------------------------------------------------- */
  /* Drag: look around the day, with parallax                                */
  /* ---------------------------------------------------------------------- */

  const limit = useMemo(() => ({ x: Math.max(90, width * 0.28), y: Math.max(80, height * 0.2) }), [width, height])
  const drag = useRef<{ id: number; x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null)
  const panAnims = useRef<AnimationPlaybackControls[]>([])
  const [dragging, setDragging] = useState(false)
  const stopPan = () => {
    panAnims.current.forEach((a) => a.stop())
    panAnims.current = []
  }

  const screenOf = useCallback(
    (p: Placed) => ({
      x: p.x + pan.x.get() * PARALLAX[p.a.plane] + mo(p.a.id).dx.get(),
      y: p.y + pan.y.get() * PARALLAX[p.a.plane] + mo(p.a.id).dy.get(),
    }),
    [pan],
  )

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    stopPan()
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, px: pan.x.get(), py: pan.y.get(), moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 7) return
      d.moved = true
      setDragging(true)
      onInteract()
      close()
    }
    pan.x.set(rubber(d.px + dx, limit.x))
    pan.y.set(rubber(d.py + dy, limit.y))
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, tap: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved) {
      setDragging(false)
      // It glides a little and settles inside its limits.
      panAnims.current = (['x', 'y'] as const).map((k) =>
        reduced
          ? animate(pan[k], clamp(pan[k].get(), -limit[k], limit[k]), { duration: 0.3 })
          : animate(pan[k], pan[k].get(), {
              type: 'inertia',
              velocity: pan[k].getVelocity(),
              power: 0.25,
              timeConstant: 320,
              min: -limit[k],
              max: limit[k],
              bounceStiffness: 180,
              bounceDamping: 28,
            }),
      )
      return
    }
    if (!tap || !interactive) return
    onInteract()
    const targets = layout.items
      .filter((p) => mo(p.a.id).reveal.get() > 0.4)
      .map((p) => ({ id: p.a.id, hit: p.hit, ...screenOf(p) }))
    const id = hitTest(targets, e.clientX, e.clientY)
    if (id) select(id)
    else close()
  }

  /* ---------------------------------------------------------------------- */
  /* Polymorphic life while exploring: one slow morph at a time              */
  /* ---------------------------------------------------------------------- */

  const exploring = stage === 'explore'
  useEffect(() => {
    if (reduced || !exploring) return
    const plan = exploreMorphs(3600)
    const start = performance.now()
    let next = 0
    const run = (event: MorphEvent) => {
      const candidates = layout.items.filter((p) => {
        const rec = recs.get(p.a.id)!
        const s = screenOf(p)
        return (
          p.a.side !== 'current' &&
          p.a.role !== 'micro' &&
          s.x > 12 &&
          s.x < width - 12 &&
          s.y > 40 &&
          s.y < height - 12 &&
          !isMorphing(rec) &&
          !rec.paused &&
          selectedRef.current !== p.a.id
        )
      })
      if (!candidates.length) return
      const pick = candidates[Math.round(event.target * (candidates.length - 1))]
      const rec = recs.get(pick.a.id)!
      startMorph(rec, nextForm(rec.to), event.duration, speed)
    }
    const id = window.setInterval(() => {
      const t = (performance.now() - start) / 1000 / speed
      while (next < plan.length && plan[next].at <= t) run(plan[next++])
    }, 150)
    return () => window.clearInterval(id)
  }, [reduced, exploring, layout, recs, screenOf, speed, width, height])

  /* ---------------------------------------------------------------------- */
  /* Leaving: FORMS → FRAGMENTS → PARTICLE FIELD → CONVERGENCE → HOY          */
  /* ---------------------------------------------------------------------- */

  const [matter] = useState<Matter>(() => ({ shards: [], motes: [] }))
  const gathering = useRef<Gathering | undefined>(undefined)
  const exitStart = useRef(0)
  const exitClock = useCallback(() => (performance.now() - exitStart.current) / speed, [speed])
  const [matterOn, setMatterOn] = useState(false)

  useEffect(() => {
    if (!exiting) return
    exitStart.current = performance.now()
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms * speed))
    const sec = (ms: number) => (ms / 1000) * speed

    // Calm: inspection closes, the field returns to its place, morphs finish.
    setSelected(null)
    stopPan()
    panAnims.current = [animate(pan.x, 0, { duration: sec(EXIT.calm), ease: EASE }), animate(pan.y, 0, { duration: sec(EXIT.calm), ease: EASE })]
    for (const [id, rec] of recs) if (id !== nowId && isMorphing(rec)) resumeMorph(rec, speed, 0.5)
    animate(atmosphere, 0.88, { duration: sec(900), ease: EASE })
    if (reduced) return

    const anchor = { x: current.x, y: current.y }
    at(EXIT.calm, () => {
      const rand = seeded(11)
      for (const p of layout.items) {
        if (p.a.side === 'current') continue
        const rec = recs.get(p.a.id)!
        emitMatter(
          matter,
          {
            form: rec.to,
            fragments: displayed(rec),
            visible: () => visibleRange(p.a, rec.to),
            x: p.x,
            y: p.y,
            radius: p.R * (p.a.role === 'space' ? 0.9 : 1),
            alpha: Math.max(0.5, p.opacity),
            side: p.a.side,
            plane: p.a.plane,
            start: releaseAtMs(p.a),
          },
          rand,
        )
      }
      setMatterOn(true)
    })
    // Each form lets go at its moment: far first, then middle, then near.
    for (const p of layout.items)
      if (p.a.side !== 'current') animate(mo(p.a.id).release, 1, { duration: 1 * speed, delay: sec(releaseAtMs(p.a)), ease: 'linear' })

    // The present: into its Dissolving configuration, then the last to break.
    const nowRec = recs.get(nowId)!
    at(EXIT.nowMorph, () => startMorph(nowRec, 'dissolving', 0.6, speed))
    at(EXIT.nowBreak, () => {
      emitMatter(
        matter,
        {
          form: 'dissolving',
          fragments: displayed(nowRec),
          visible: () => [0, 1],
          x: anchor.x,
          y: anchor.y,
          radius: current.R,
          alpha: 1,
          side: 'current',
          plane: 'fg',
          start: EXIT.nowBreak,
        },
        seeded(13),
      )
    })
    animate(mo(nowId).release, 1, { duration: 1 * speed, delay: sec(EXIT.nowBreak), ease: 'linear' })
    animate(extra.nowLabel, 0, { duration: sec(450), delay: sec(EXIT.nowBreak + 150), ease: EASE })

    // Convergence: diffuse → recognizable → structured → named. A pearl-silver mass gathers with
    // the matter, then withdraws as the module sharpens, gains contrast and settles.
    const now = mo(nowId)
    animate(now.blur, 1.4, { duration: sec(500), delay: sec(EXIT.nowBreak + 300), ease: EASE })
    animate(extra.glow, 0.85, { duration: sec(700), delay: sec(EXIT.gather - 600), ease: EASE })
    at(EXIT.module[0], () => {
      const span = sec(EXIT.module[1] - EXIT.module[0])
      animate(now.blur, 0, { duration: span, ease: [0.2, 0.6, 0.3, 1] })
      now.grow.jump(1.14)
      animate(now.grow, 1, { duration: span + sec(200), ease: [0.2, 0.7, 0.2, 1] })
      animate(extra.glow, 0.3, { duration: span, delay: sec(300), ease: EASE })
    })
    at(EXIT.gather, () => {
      const pitch = 6 * MODULE_SCALE
      const cells = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: anchor.x + sx * pitch, y: anchor.y + sy * pitch, r: MODULE_SCALE, a: 0.35 })))
      assignFates(matter.motes, anchor, cells, seeded(5))
      gathering.current = { start: EXIT.gather, anchor }
    })
    animate(extra.module, 1, { duration: sec(EXIT.module[1] - EXIT.module[0]), delay: sec(EXIT.module[0]), ease: ORGANIC })
    animate(extra.moduleLabel, 1, { duration: sec(300), delay: sec(EXIT.named), ease: EASE })
  }, [exiting])

  // Reduced motion: the forms fade, the module appears, HOY crossfades in.
  useEffect(() => {
    if (!reduced || !reached(stage, 'dematerialize')) return
    const t = { duration: 0.8 * speed, ease: EASE }
    for (const p of layout.items) animate(mo(p.a.id).opacity, 0, t)
    animate(extra.nowLabel, 0, t)
  }, [reduced, stage === 'dematerialize'])

  const handoff = stage === 'handoff'
  useEffect(() => {
    if (!handoff) return
    // The module is handed to HOY: the field keeps only its light, which fades.
    mo(nowId).opacity.jump(0)
    extra.moduleLabel.jump(0)
    animate(extra.glow, 0, { duration: 0.9 * speed, ease: EASE })
    if (reduced) animate(extra.field, 0, { duration: 0.6 * speed, ease: EASE })
  }, [handoff])

  /* ---------------------------------------------------------------------- */
  /* Drawing                                                                 */
  /* ---------------------------------------------------------------------- */

  const sel = selected ? layout.items.find((p) => p.a.id === selected) ?? null : null
  const target = sel ? (reduced ? { x: sel.x, y: sel.y, R: sel.R } : targetOf(layout, sel)) : null
  const range = (p: Placed) => (p.a.category === 'sleep' && p.a.side === 'current' ? `hasta ${formatClock(p.a.endMin)}` : rangeText(p.a, formatClock))
  const summary = `Resumen visual del día: ${model.activities.length} actividades. Ahora: ${model.current.title}, ${range(current)}.`
  const labelOpacity = useTransform(() => extra.nowLabel.get() * extra.labelDim.get())
  const dust = useMemo(() => dustPoints(width, height), [width, height])

  return (
    <m.div
      className="ds-field"
      data-dragging={dragging || undefined}
      style={{ opacity: extra.field }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
    >
      <p className="sr-only" role="status">
        {summary}
      </p>

      {!reduced && (
        <m.div
          aria-hidden
          className="ds-glow"
          style={{ x: extra.attract.x, y: extra.attract.y, width: 300, height: 260, marginLeft: -150, marginTop: -130, opacity: extra.attract.o, zIndex: Z.attract }}
        />
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: Z.veil }}>
        <MassField layers={[FRONT]} width={width} height={height} reduced={reduced} pan={pan} seed={71} />
      </div>

      {!reduced && (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: Z.veil }}>
          {dust.map((d, i) => (
            <span key={i} className="ds-dust" style={d} />
          ))}
        </div>
      )}

      <m.div
        aria-hidden
        className="ds-glow"
        style={{ left: current.x - 130, top: current.y - 110, width: 260, height: 220, opacity: extra.glow, zIndex: Z.glow }}
      />

      {!reduced && (
        <MatterCanvas
          width={width}
          height={height}
          matter={matter}
          gathering={gathering}
          anchor={current}
          clock={exitClock}
          running={matterOn && !handoff}
          z={Z.matter}
        />
      )}

      <AnimatePresence>
        {sel && target && interactive && (
          <m.div
            key={`haze-${sel.a.id}`}
            aria-hidden
            className="ds-haze"
            style={{ left: target.x - 125, top: target.y + 8 - (target.R * 2 + 150) / 2, width: 250, height: target.R * 2 + 150, zIndex: Z.haze }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.95 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 * speed, ease: EASE }}
          />
        )}
      </AnimatePresence>

      {layout.items.map((p) => {
        const isNow = p.a.side === 'current'
        return (
          <Aperture
            key={p.a.id}
            p={p}
            rec={recs.get(p.a.id)!}
            mo={mo(p.a.id)}
            pan={pan}
            parallax={PARALLAX[p.a.plane]}
            z={p.a.id === selected ? Z.selected : isNow ? Z.now : Z.plane[p.a.plane]}
            maxR={Math.max(p.R * 1.15, targetOf(layout, p).R)}
            reduced={reduced}
            alive={!exiting}
            nameDelay={names && !isNow ? nameAt(p.a) * revealScale : null}
            speed={speed}
            module={isNow ? extra.module : undefined}
          >
            {isNow && (
              <NowLabel
                p={p}
                opacity={labelOpacity}
                module={extra.moduleLabel}
                range={range(p)}
                endMin={p.a.category === 'sleep' ? null : p.a.endMin}
                maxWidth={Math.max(96, width - 2 - (p.x + p.R + 14))}
              />
            )}
          </Aperture>
        )
      })}

      <AnimatePresence>
        {sel && target && interactive && <Inspection key={sel.a.id} p={sel} target={target} speed={speed} range={range(sel)} />}
      </AnimatePresence>

      {interactive && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: Z.targets }}>
          {layout.items.map((p) => (
            <Target key={p.a.id} p={p} mo={mo(p.a.id)} pan={pan} pressed={selected === p.a.id} onSelect={select} range={range(p)} />
          ))}
        </div>
      )}

      {reduced && reached(stage, 'gather') && (
        <m.div
          aria-hidden
          className="absolute text-ink-3"
          style={{ left: current.x - 9, top: current.y - 9, width: 18, height: 18, scale: MODULE_SCALE, zIndex: Z.now }}
          initial={{ opacity: 0 }}
          animate={{ opacity: handoff ? 0 : 1 }}
          transition={{ duration: 0.4 * speed }}
        >
          <ActiveMatrix />
        </m.div>
      )}
      {!reduced && handoff && <Handoff layout={layout} landsOnMatrix={landsOnMatrix} speed={speed} />}
    </m.div>
  )
})

/** AHORA keeps its name: AHORA / activity / time; its module takes the name when it forms. */
/**
 * AHORA keeps its name: AHORA → activity → time → what is left. A soft pearl
 * haze (no edge, no card) lifts it off the atmosphere; its module takes the
 * name when it forms.
 */
function NowLabel({
  p,
  opacity,
  module,
  range,
  endMin,
  maxWidth,
}: {
  p: Placed
  opacity: MotionValue<number>
  module: MotionValue<number>
  range: string
  /** End of the present block (minutes), for the time left; null when it does not apply. */
  endMin: number | null
  maxWidth: number
}) {
  const left = p.R + 14
  return (
    <>
      <m.div aria-hidden className="pointer-events-none absolute isolate" style={{ left, top: -30, width: maxWidth, opacity }}>
        <span className="ds-label-haze" />
        <span className="label-spaced block" style={{ fontSize: 10, fontWeight: 600, color: 'var(--ds-now)' }}>
          Ahora
        </span>
        <span className="label-spaced mt-[8px] block text-ink" style={{ fontSize: 13, letterSpacing: '0.28em', lineHeight: 1.4 }}>
          {p.a.label}
        </span>
        <span className="tabular mt-[8px] block text-[12.5px] leading-none text-ink-2">{range}</span>
        {endMin !== null && <Remaining endMin={endMin} />}
      </m.div>
      <m.div aria-hidden className="pointer-events-none absolute flex" style={{ left: 9 * MODULE_SCALE + 12, top: -5.5, opacity: module }}>
        <Label className="text-ink-2">Ahora</Label>
      </m.div>
    </>
  )
}

/** Information materializes around the Aperture — no card, only a faint refractive haze behind. */
function Inspection({ p, target, speed, range }: { p: Placed; target: { x: number; y: number; R: number }; speed: number; range: string }) {
  const now = p.a.side === 'current'
  const t = { duration: 0.55 * speed, ease: EASE }
  // It dissolves where it is, at once; it appears a moment after its Aperture arrives.
  const enter = {
    initial: { opacity: 0, filter: 'blur(4px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(5px)', transition: { duration: 0.35 * speed, ease: EASE } },
  }
  const center: CSSProperties = { position: 'absolute', left: target.x, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }
  return (
    <m.div className="pointer-events-none absolute inset-0" style={{ zIndex: Z.info }} aria-live="polite">
      {!now && (
        <m.div style={{ ...center, top: target.y - target.R - 42 }} {...enter} transition={{ ...t, delay: 0.3 * speed }}>
          <span className="label-spaced block text-ink" style={{ fontSize: 12, letterSpacing: '0.3em' }}>
            {p.a.title}
          </span>
          <span className="tabular mt-[7px] block text-[12px] text-ink-2">{range}</span>
        </m.div>
      )}
      <m.div style={{ ...center, top: target.y + target.R + 14 }} {...enter} transition={{ ...t, delay: 0.4 * speed }}>
        <span aria-hidden className="block text-[11px]" style={{ color: 'var(--ds-now-line)' }}>
          ✦
        </span>
        <span className="mt-[9px] block text-[13px] leading-tight text-ink-2">{p.a.natureLabel}</span>
        {p.a.alternative && <span className="mt-[5px] block text-[11.5px] leading-tight text-ink-3">{p.a.alternative}</span>}
        <span className="label-spaced mt-[7px] block text-ink-3" style={{ fontSize: 9.5, letterSpacing: '0.3em' }}>
          {stateLabel(p.a)}
        </span>
      </m.div>
    </m.div>
  )
}

/** Invisible 44–52 px target: keyboard and screen readers reach every activity. */
function Target({ p, mo, pan, pressed, onSelect, range }: { p: Placed; mo: ApertureMotion; pan: Pan; pressed: boolean; onSelect: (id: string) => void; range: string }) {
  const k = PARALLAX[p.a.plane]
  const x = useTransform(() => p.x + pan.x.get() * k + mo.dx.get() - p.hit)
  const y = useTransform(() => p.y + pan.y.get() * k + mo.dy.get() - p.hit)
  return (
    <m.button
      type="button"
      className="ds-target"
      style={{ x, y, width: p.hit * 2, height: p.hit * 2 }}
      aria-label={`${p.a.title}, ${range.replace('—', ' a ')}, ${p.a.natureLabel}, ${stateLabel(p.a)}`}
      aria-pressed={pressed}
      onClick={() => onSelect(p.a.id)}
    />
  )
}

/** "1 h 46 min restantes", as HOY says it, from the app clock: it stays true while DAYSCAPE is open. */
function Remaining({ endMin }: { endMin: number }) {
  const { now } = useDay()
  const left = endMin - minutesOfDay(now)
  return (
    <span className="tabular mt-[6px] block text-[11px] leading-none text-ink-3">
      {left < 1 ? 'terminando' : `${formatDuration(left)} restantes`}
    </span>
  )
}

/** What is left of the message as the field begins: a few pearl points that go. */
function dustPoints(width: number, height: number): CSSProperties[] {
  const rand = seeded(21)
  return Array.from({ length: 26 }, () => {
    const a = rand() * Math.PI * 2
    return {
      left: width * 0.13 + rand() * width * 0.74,
      top: height * 0.41 + (rand() - 0.5) * 120,
      '--lx': `${(Math.cos(a) * 14).toFixed(1)}px`,
      '--ly': `${(-18 - rand() * 22).toFixed(1)}px`,
      animationDelay: `${(rand() * 0.5).toFixed(2)}s`,
    } as CSSProperties
  })
}

/**
 * AHORA → HOY. The module and its name land exactly on HOY's AHORA marker
 * while HOY emerges underneath; the module takes HOY's own blue on the way.
 */
function Handoff({ layout, landsOnMatrix, speed }: { layout: DayscapeLayout; landsOnMatrix: boolean; speed: number }) {
  const { anchor } = layout
  const [target, setTarget] = useState<{ matrix: DOMRect; label: DOMRect } | null>(null)
  const [accent, setAccent] = useState<string | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    const find = () => {
      const matrix = document.querySelector('[data-now-matrix]')
      const label = document.querySelector('[data-now-label]')
      if (matrix && label) {
        setTarget({ matrix: matrix.getBoundingClientRect(), label: label.getBoundingClientRect() })
        // One painted frame in AHORA's ice blue first, so the color can travel.
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || null
        frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setAccent(accent))))
      } else frame = requestAnimationFrame(find)
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [])

  const t = { duration: 0.62 * speed, ease: EASE }
  const labelLeft = anchor.x + 9 * MODULE_SCALE + 12
  const labelTop = anchor.y - 5.5
  const tint = { '--accent': accent ?? 'var(--ds-now)', transition: `--accent ${0.62 * speed}s ease` } as CSSProperties
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: Z.handoff }}>
      <m.div
        className="absolute text-ink-3"
        style={{ left: anchor.x - 9, top: anchor.y - 9, width: 18, height: 18, ...tint }}
        initial={{ x: 0, y: 0, scale: MODULE_SCALE, opacity: 1 }}
        animate={
          target
            ? {
                x: target.matrix.left + target.matrix.width / 2 - anchor.x,
                y: target.matrix.top + target.matrix.height / 2 - anchor.y,
                scale: 1,
                opacity: landsOnMatrix ? 1 : 0,
              }
            : { x: 0, y: 0, scale: MODULE_SCALE, opacity: 1 }
        }
        transition={t}
      >
        <ActiveMatrix />
      </m.div>
      <m.div
        className="absolute flex"
        style={{ left: labelLeft, top: labelTop }}
        initial={{ x: 0, y: 0, opacity: 1 }}
        animate={target ? { x: target.label.left - labelLeft, y: target.label.top - labelTop, opacity: 1 } : { x: 0, y: 0, opacity: 1 }}
        transition={t}
      >
        <Label className="text-ink-2">Ahora</Label>
      </m.div>
    </div>
  )
}
