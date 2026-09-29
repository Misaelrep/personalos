import { AnimatePresence, m, useMotionValue } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Label } from '../../components/ui/Label'
import type { DailyMessage } from '../../data/dailyMessages'
import { dateKey, minutesOfDay } from '../../domain/time'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { EXIT_STAGES, FORM_S, HINT, cleanAt, continueAt } from '../dayscape/choreography'
import { DAYSCAPE_STAGES, Dayscape, type DayscapeStage } from '../dayscape/Dayscape'
import { DayscapeAtmosphere } from '../dayscape/DayscapeAtmosphere'
import { buildDayscape } from '../dayscape/model'
import { readFieldMode } from './entryPolicy'
import { loadEntryMemory, saveEntryMemory } from './entryStorage'

/**
 * DAILY ENTRY — the first real open of the day.
 *
 * MENSAJE → EL MENSAJE SE DISUELVE → DAYSCAPE (el día entero se forma por
 * oleadas; explorar sin límite) → CONTINUAR → FORMAS → FRAGMENTOS → CAMPO DE
 * PARTÍCULAS → CONVERGENCIA EN AHORA → HOY emerge de la misma atmósfera.
 */
export type EntryStage = 'atmosphere' | 'message' | 'dissolve' | DayscapeStage

const SEQUENCE: EntryStage[] = ['atmosphere', 'message', 'dissolve', ...DAYSCAPE_STAGES]

export const isFieldStage = (stage: EntryStage): stage is DayscapeStage => (DAYSCAPE_STAGES as EntryStage[]).includes(stage)

/** Time each stage lasts (ms). `message` and `reveal` depend on the content; `explore` has no end. */
type Timed = Exclude<EntryStage, 'message' | 'reveal' | 'explore'>
const STAGE_MS: Record<Timed, number> = {
  atmosphere: 1300,
  dissolve: 500,
  ...EXIT_STAGES,
}

/** Reduced motion: crossfades only. */
const REDUCED_MS: typeof STAGE_MS = {
  atmosphere: 900,
  dissolve: 450,
  settle: 500,
  dematerialize: 900,
  gather: 800,
  handoff: 800,
}

/** ?field=collapse: a short message, the day formed at once, straight to the exit at normal speed. */
const COLLAPSE_READING_MS = 1500
const COLLAPSE_REVEAL_SCALE = 0.2
const COLLAPSE_EXPLORE_MS = 1200

/** How long the message dissolves, overlapping the field's first moments (ms). */
const DISSOLVE_MS = 900

/** Time to read the message, scaled to its length. */
function readingMs(message: DailyMessage): number {
  const chars = message.lines.join(' ').length
  return Math.min(Math.max(3000 + chars * 25, 3500), 6500)
}

interface DailyEntryProps {
  message: DailyMessage
  onStage: (stage: EntryStage) => void
  /** HOY should mount now, underneath, to materialize. */
  onHandoff: () => void
  /** The ritual is over. */
  onDone: () => void
}

export function DailyEntry({ message, onStage, onHandoff, onDone }: DailyEntryProps) {
  const { view, now } = useDay()
  const { level } = useMotion()
  const reduced = level === 'reducido'
  const [mode] = useState(() => readFieldMode(window.location.search))
  const speed = mode.fast ? 0.35 : 1
  const revealScale = mode.collapse ? COLLAPSE_REVEAL_SCALE : 1
  const [stage, setStage] = useState<EntryStage>('atmosphere')

  // The day is a snapshot of the moment the entry began.
  const [model] = useState(() => buildDayscape(view, minutesOfDay(now)))
  const today = useMemo(() => dateKey(now), [now])
  const [hintSeen] = useState(() => loadEntryMemory().dayscapeHintDate === today)
  const clean = useMemo(() => cleanAt(model.activities), [model])
  const continueS = useMemo(() => continueAt(model.activities), [model])
  const revealMs = useMemo(
    () =>
      mode.collapse
        ? (Math.max(...model.activities.map((a) => a.revealAt)) * revealScale + FORM_S + 0.4) * 1000
        : (clean + 0.25) * 1000,
    [mode.collapse, model, revealScale, clean],
  )

  // Shared by the field and the atmosphere behind it.
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const pan = useMemo(() => ({ x: panX, y: panY }), [panX, panY])
  const atmosphere = useMotionValue(1)

  const timer = useRef(0)
  const timers = useRef<number[]>([])
  const callbacks = useRef({ onStage, onHandoff, onDone })
  callbacks.current = { onStage, onHandoff, onDone }
  const [showContinue, setShowContinue] = useState(false)
  const [hint, setHint] = useState(false)
  const touched = useRef(hintSeen)

  const durationOf = useCallback(
    (s: EntryStage): number | null => {
      if (s === 'message') return (mode.collapse ? COLLAPSE_READING_MS : readingMs(message)) * speed
      if (s === 'reveal') return revealMs * speed
      if (s === 'explore') return mode.collapse && !mode.hold ? COLLAPSE_EXPLORE_MS * speed : null
      return (reduced ? REDUCED_MS : STAGE_MS)[s] * speed
    },
    [message, reduced, speed, mode.collapse, mode.hold, revealMs],
  )

  const go = useCallback(
    (next: EntryStage) => {
      window.clearTimeout(timer.current)
      setStage(next)
      callbacks.current.onStage(next)
      if (next === 'reveal') {
        // CONTINUAR, quietly, from ~14 s; the hint once the field is clean.
        const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
        later((mode.collapse ? revealMs / 1000 : continueS) * 1000 * speed, () => setShowContinue(true))
        if (!touched.current && !mode.collapse) {
          later((clean + HINT.after) * 1000 * speed, () => !touched.current && setHint(true))
          later((clean + HINT.after + HINT.stay) * 1000 * speed, () => setHint(false))
        }
      }
      if (next === 'handoff') callbacks.current.onHandoff()
      const ms = durationOf(next)
      // Exploring has no end of its own: only CONTINUAR leaves.
      if (ms === null) return
      const after = SEQUENCE[SEQUENCE.indexOf(next) + 1]
      timer.current = window.setTimeout(() => (after ? go(after) : callbacks.current.onDone()), ms)
    },
    [durationOf, speed, mode.collapse, revealMs, clean, continueS],
  )

  // Starts once; later changes (e.g. the motion level) don't restart the ritual.
  const start = useRef(go)
  useEffect(() => {
    start.current('atmosphere')
    const pending = timers.current
    return () => {
      window.clearTimeout(timer.current)
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const stageRef = useRef(stage)
  stageRef.current = stage
  const onContinue = useCallback(() => {
    if (stageRef.current !== 'explore' && stageRef.current !== 'reveal') return
    setHint(false)
    setShowContinue(false)
    go('settle')
  }, [go])

  // The first touch of the field retires the hint for the rest of the day.
  const onInteract = useCallback(() => {
    setHint(false)
    if (touched.current) return
    touched.current = true
    saveEntryMemory({ dayscapeHintDate: today })
  }, [today])

  // A tap during the message moves the ritual along; in the field, taps explore.
  const advance = useCallback(() => {
    const s = stageRef.current
    if (s === 'atmosphere' || s === 'message') go('dissolve')
  }, [go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const s = stageRef.current
      if (s !== 'atmosphere' && s !== 'message') return
      e.preventDefault()
      advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  const weekday = now.toLocaleDateString('es', { weekday: 'long' })
  const date = now.toLocaleDateString('es', { day: 'numeric', month: 'long' })
  const showMessage = stage === 'message' || stage === 'dissolve' || stage === 'reveal'
  const dissolving = stage !== 'message'
  const exploring = stage === 'explore' || stage === 'reveal'
  // The atmosphere comes alive behind the last instants of the message and lets HOY emerge from it.
  const atmosphereShown = stage !== 'atmosphere' && stage !== 'handoff'
  const atmosphereDelay = stage === 'message' ? Math.max(0, (durationOf('message')! - 1400) / 1000) : 0

  return (
    <m.div
      role="dialog"
      aria-label="Entrada del día"
      data-stage={stage}
      className="dayscape tone-ink fixed inset-0 z-30 grid place-items-center px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      onClick={advance}
    >
      <DayscapeAtmosphere
        shown={atmosphereShown}
        reduced={reduced}
        pan={pan}
        presence={atmosphere}
        fadeIn={1.6 * speed}
        fadeOut={1.5 * speed}
        delay={atmosphereDelay}
      />

      <AnimatePresence>
        {showMessage && (
          <m.div
            key="message"
            aria-live="polite"
            className="relative w-full max-w-[34rem] text-center"
            initial={{ opacity: 0 }}
            animate={
              dissolving
                ? { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.06em', y: -6 }
                : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0em', y: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: dissolving ? (DISSOLVE_MS / 1000) * speed : 0.6, ease: EASE }}
          >
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: EASE }}>
              <Label className="text-ink-3">
                {weekday} <span className="text-ink-4">·</span> {date}
              </Label>
            </m.div>
            <p className="mt-8 font-display text-[clamp(25px,3.6vw,38px)] leading-[1.22] font-light tracking-[-0.03em] text-balance">
              {message.lines.map((line, i) => (
                <m.span
                  key={i}
                  className={`block ${i === 0 ? 'text-ink' : 'mt-2 text-ink-2'}`}
                  initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.9 * speed, ease: EASE, delay: (0.25 + i * 0.55) * speed }}
                >
                  {line}
                </m.span>
              ))}
            </p>
          </m.div>
        )}
      </AnimatePresence>

      {isFieldStage(stage) && (
        <Dayscape
          model={model}
          stage={stage}
          speed={speed}
          revealScale={revealScale}
          names={!mode.collapse}
          reduced={reduced}
          pan={pan}
          atmosphere={atmosphere}
          landsOnMatrix={view.current.status === 'activo' || view.current.status === 'en-focus'}
          onInteract={onInteract}
        />
      )}

      {/* Once the field is clean, a quiet word on how to explore it — with a small gesture, tap then drag.
          Gone at the first touch, for the day. */}
      <AnimatePresence>
        {hint && exploring && (
          <m.div
            key="hint"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-[80] flex flex-col items-center px-4"
            style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 26px) + 58px)' }}
            initial={{ opacity: 0, filter: 'blur(3px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(3px)' }}
            transition={{ duration: 1.1 * speed, ease: EASE }}
          >
            <span className="ds-gesture">
              <i />
            </span>
            <p className="ds-action label-spaced text-center text-ink-3" style={{ fontSize: 9.5, letterSpacing: '0.24em', lineHeight: 1.9 }}>
              <span className="whitespace-nowrap">Toca para explorar ·</span>{' '}
              <span className="whitespace-nowrap">Arrastra para recorrer</span>
            </p>
          </m.div>
        )}
      </AnimatePresence>

      {/* A quiet way on, recognizable as an action: a hairline breathes under it and its arrow leans forward.
          It never skips the transition. */}
      <AnimatePresence>
        {showContinue && exploring && (
          <m.div
            key="continue"
            className="pointer-events-none absolute inset-x-0 z-[80] flex justify-center"
            style={{ bottom: 'max(env(safe-area-inset-bottom), 22px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 * speed, ease: EASE }}
          >
            <button
              type="button"
              className="ds-action ds-continue label-spaced pointer-events-auto px-5 pt-[18px] pb-4 text-ink-2 hover:text-ink"
              style={{ fontSize: 10.5 }}
              onClick={(e) => {
                e.stopPropagation()
                onContinue()
              }}
            >
              Continuar <span aria-hidden className="ds-continue-arrow">→</span>
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
