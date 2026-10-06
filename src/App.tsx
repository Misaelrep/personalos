import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { Atmosphere } from './atmosphere/Atmosphere'
import { DailyEntry, isFieldStage, type EntryStage } from './features/entry/DailyEntry'
import { MicroEntry } from './features/entry/MicroEntry'
import { useEntry } from './features/entry/useEntry'
import { FocusClosing } from './features/focus/FocusClosing'
import { FocusIntro } from './features/focus/FocusIntro'
import { FocusView } from './features/focus/FocusView'
import { useFocusFlow } from './features/focus/useFocusFlow'
import { useLearnAtmosphere } from './features/learn/atmosphere'
import { Aprender } from './features/learn/screens/Aprender'
import { TodayView, type TodayAppear } from './features/today/TodayView'
import { Semana } from './features/week/Semana'
import { BottomNav, NavRail } from './layout/NavRail'
import type { SectionId } from './layout/sections'
import { useMotion } from './motion/MotionLevel'
import { isUpdateMoment } from './pwa/moment'
import { UpdateNotice } from './pwa/UpdateNotice'
import { useUpdates } from './pwa/updates'
import { useDay } from './state/DayProvider'

export function App() {
  const { view, state } = useDay()
  const flow = useFocusFlow()
  const { phase, step } = flow
  const { level } = useMotion()
  const entry = useEntry(Boolean(state.focus))
  const [entryStage, setEntryStage] = useState<EntryStage>('atmosphere')
  // The DAY FIELD asks for HOY underneath before the entry ends, so it can land on AHORA.
  const [handoff, setHandoff] = useState(false)
  // HOY's first appearance after an entry: materialized (micro) or in order from AHORA (full).
  const [appear, setAppear] = useState<TodayAppear>(
    entry.kind === 'full' ? (level === 'reducido' ? 'fade' : 'field') : entry.kind === 'micro' ? 'materialize' : 'fade',
  )
  useEffect(() => {
    if (phase !== 'today') setAppear('fade')
  }, [phase])

  // SEMANA and APRENDER open straight onto their screen (never a second daily entry).
  // `?section=semana` / `?section=aprender` for review.
  const [section, setSection] = useState<SectionId>(() => {
    const requested = new URLSearchParams(window.location.search).get('section')
    return entry.kind === 'none' && (requested === 'semana' || requested === 'aprender') ? requested : 'hoy'
  })
  // A day opening from SEMANA takes the whole stage; today's DAYSCAPE lands on HOY like the entry does.
  const [immersive, setImmersive] = useState(false)
  const [weekHandoff, setWeekHandoff] = useState(false)
  const navigate = useCallback((id: SectionId) => {
    setAppear('fade')
    setSection(id)
  }, [])

  const focusBlock = view.timeline.find((b) => b.id === (state.focus?.blockId ?? flow.closedBlockId))
  const inWeek = section === 'semana' && !entry.active && phase === 'today'
  const inLearn = section === 'aprender' && !entry.active && phase === 'today'
  const learnAtmosphere = useLearnAtmosphere(inLearn)
  const activeSection: SectionId = inWeek ? 'semana' : inLearn ? 'aprender' : 'hoy'
  const showToday = (!entry.active || handoff) && (phase === 'today' || phase === 'entering') && (!inWeek || weekHandoff) && !inLearn
  const navHidden = entry.active || immersive || !(phase === 'today' || (phase === 'entering' && step < 2))
  // The entry's floating points become the DAY FIELD's first nodes; they return once HOY is back.
  const particles = entry.active
    ? isFieldStage(entryStage)
      ? 'handed-off'
      : 'dispersed'
    : flow.atmosphere.particles
  const showFocus = focusBlock && ((phase === 'entering' && step >= 5) || phase === 'focus' || phase === 'exiting')
  const showClosing = focusBlock && (phase === 'result' || phase === 'next')
  // A new version waits until the app is at rest: never during Focus, the entry or an open day.
  const update = useUpdates(isUpdateMoment({ phase, focusOpen: Boolean(state.focus), entryActive: entry.active, immersive }))

  return (
    <>
      <Atmosphere
        {...flow.atmosphere}
        particles={particles}
        scene={phase === 'today' || (phase === 'entering' && step < 3) ? 'today' : 'flow'}
        gather={phase === 'entering' && step >= 2}
        {...(inLearn ? learnAtmosphere : undefined)}
      />
      <NavRail hidden={navHidden} active={activeSection} onNavigate={navigate} />
      <BottomNav hidden={navHidden} active={activeSection} onNavigate={navigate} />

      <AnimatePresence>
        {entry.active && entry.kind === 'full' && (
          <DailyEntry
            key="daily"
            message={entry.message}
            onStage={setEntryStage}
            onHandoff={() => setHandoff(true)}
            onDone={entry.complete}
          />
        )}
        {entry.active && entry.kind === 'micro' && <MicroEntry key="micro" onDone={entry.complete} />}
      </AnimatePresence>

      {showToday && (
        <TodayView step={phase === 'entering' ? step : 0} onStartFocus={flow.start} appear={appear} />
      )}

      <AnimatePresence>
        {inWeek && (
          <Semana
            key="semana"
            onImmersive={setImmersive}
            onTodayHandoff={() => {
              setAppear(level === 'reducido' ? 'fade' : 'field')
              setWeekHandoff(true)
            }}
            onTodayDone={() => {
              setSection('hoy')
              setWeekHandoff(false)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{inLearn && <Aprender key="aprender" onImmersive={setImmersive} />}</AnimatePresence>

      <AnimatePresence>
        {phase === 'entering' && step >= 4 && <FocusIntro key="intro" dissolving={step >= 5} />}
      </AnimatePresence>

      <AnimatePresence>
        {showFocus && (
          <FocusView
            key="focus"
            block={focusBlock}
            closing={phase === 'exiting'}
            onFinish={flow.finish}
            onLeave={flow.leave}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClosing && (
          <FocusClosing
            key="closing"
            phase={phase}
            block={focusBlock}
            onAnswer={flow.answer}
            onDone={flow.backToToday}
          />
        )}
      </AnimatePresence>

      <UpdateNotice visible={update.offer} onApply={update.apply} />
    </>
  )
}
