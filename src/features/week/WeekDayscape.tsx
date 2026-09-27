import { AnimatePresence, m, useMotionValue } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shortDateLabel } from '../../domain/week'
import { dateKey, minutesOfDay } from '../../domain/time'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { EXIT_STAGES, cleanAt, continueAt } from '../dayscape/choreography'
import { Dayscape, type DayscapeStage } from '../dayscape/Dayscape'
import { DayscapeAtmosphere } from '../dayscape/DayscapeAtmosphere'
import { buildDayscape } from '../dayscape/model'
import { viewForDate } from './dayView'

/**
 * SEMANA → the real DAYSCAPE of the chosen date. This only hosts the existing
 * DAYSCAPE (same model builder, same component, same choreography) the way
 * the daily entry does; nothing of the day is redrawn here.
 *
 *   today        CONTINUAR → the usual exit, landing on HOY's AHORA
 *   another day  ← SEMANA → the day comes apart into matter, the week returns
 */
interface WeekDayscapeProps {
  date: string
  dayName: string
  /** The day is going: SEMANA returns underneath while this fades. */
  onBack: () => void
  /** Today only: HOY should mount underneath now. */
  onHandoff: () => void
  /** Today only: the exit to HOY is over. */
  onDone: () => void
}

/** Reduced motion: crossfades only. */
const REDUCED_MS: Record<keyof typeof EXIT_STAGES, number> = { settle: 500, dematerialize: 900, gather: 800, handoff: 800 }

/** The field forms once SEMANA's matter has become atmosphere. */
const FIELD_AFTER_MS = 420

export function WeekDayscape({ date, dayName, onBack, onHandoff, onDone }: WeekDayscapeProps) {
  const { view, now } = useDay()
  const { level } = useMotion()
  const reduced = level === 'reducido'
  const today = date === dateKey(now)
  // A snapshot of the moment the day was opened. Another date is read at this same time of day.
  const [model] = useState(() => {
    const minute = minutesOfDay(now)
    return buildDayscape(today ? view : viewForDate(date, Math.floor(minute)), minute)
  })
  const [landsOnMatrix] = useState(() => today && (view.current.status === 'activo' || view.current.status === 'en-focus'))
  const [stage, setStage] = useState<DayscapeStage>('reveal')
  const [field, setField] = useState(false)
  const [showContinue, setShowContinue] = useState(false)
  const [leaving, setLeaving] = useState<null | 'week' | 'today'>(null)
  const [gone, setGone] = useState(false)

  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const pan = useMemo(() => ({ x: panX, y: panY }), [panX, panY])
  const atmosphere = useMotionValue(1)

  const timers = useRef<number[]>([])
  const later = useCallback((ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms)), [])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const callbacks = useRef({ onBack, onHandoff, onDone })
  callbacks.current = { onBack, onHandoff, onDone }

  // The day forms, then stays open to exploration; CONTINUAR follows the day, as in the entry.
  useEffect(() => {
    later(FIELD_AFTER_MS, () => setField(true))
    later(FIELD_AFTER_MS + (cleanAt(model.activities) + 0.25) * 1000, () => setStage((s) => (s === 'reveal' ? 'explore' : s)))
    later(FIELD_AFTER_MS + continueAt(model.activities) * 1000, () => setShowContinue(true))
  }, [later, model])

  const ms: Record<keyof typeof EXIT_STAGES, number> = reduced ? REDUCED_MS : EXIT_STAGES
  const leave = useCallback(
    (to: 'week' | 'today') => {
      if (leaving) return
      setLeaving(to)
      setShowContinue(false)
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
      setField(true)
      setStage('settle')
      later(ms.settle, () => setStage('dematerialize'))
      if (to === 'week') {
        // The day comes apart into matter; the ground lets the week through.
        later(ms.settle + ms.dematerialize * 0.55, () => {
          setGone(true)
          callbacks.current.onBack()
        })
        return
      }
      later(ms.settle + ms.dematerialize, () => setStage('gather'))
      later(ms.settle + ms.dematerialize + ms.gather, () => {
        setStage('handoff')
        callbacks.current.onHandoff()
      })
      later(ms.settle + ms.dematerialize + ms.gather + ms.handoff, () => callbacks.current.onDone())
    },
    [leaving, later, ms],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave('week')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])

  const exploring = stage === 'reveal' || stage === 'explore'
  return (
    <m.div
      role="dialog"
      aria-label={`${dayName} · ${shortDateLabel(date)}`}
      data-stage={stage}
      className="dayscape tone-ink fixed inset-0 z-30 grid place-items-center px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      initial={{ opacity: 1 }}
      animate={{ opacity: gone ? 0 : 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.9, ease: EASE }}
    >
      <DayscapeAtmosphere shown={!gone && stage !== 'handoff'} reduced={reduced} pan={pan} presence={atmosphere} fadeIn={1.1} fadeOut={1.5} />

      {field && (
        <Dayscape
          model={model}
          stage={stage}
          speed={1}
          revealScale={1}
          names
          reduced={reduced}
          pan={pan}
          atmosphere={atmosphere}
          landsOnMatrix={landsOnMatrix}
          onInteract={() => {}}
        />
      )}

      {/* Which day this is, and the way back to the week. */}
      <AnimatePresence>
        {exploring && !leaving && (
          <m.div
            key="head"
            className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex items-center justify-between px-5 sm:px-10"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 22px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
          >
            <button
              type="button"
              className="ds-action label-spaced pointer-events-auto -ml-2 px-2 py-3 text-ink-2 hover:text-ink"
              style={{ fontSize: 10.5 }}
              onClick={() => leave('week')}
            >
              <span aria-hidden>←</span> Semana
            </button>
            <span className="label-spaced text-ink-3" style={{ fontSize: 10, letterSpacing: '0.3em' }}>
              {dayName} <span className="text-ink-4">·</span> {shortDateLabel(date)}
            </span>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContinue && exploring && (
          <m.div
            key="continue"
            className="pointer-events-none absolute inset-x-0 z-[80] flex justify-center"
            style={{ bottom: 'max(env(safe-area-inset-bottom), 22px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            <button
              type="button"
              className="ds-action ds-continue label-spaced pointer-events-auto px-5 pt-3 pb-4 text-ink-2 hover:text-ink"
              style={{ fontSize: 10.5 }}
              onClick={() => leave(today ? 'today' : 'week')}
            >
              {today ? (
                <>
                  Continuar <span aria-hidden className="ds-continue-arrow">→</span>
                </>
              ) : (
                <>
                  <span aria-hidden>←</span> Volver a la semana
                </>
              )}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
