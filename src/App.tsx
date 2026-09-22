import { AnimatePresence } from 'framer-motion'
import { Atmosphere } from './atmosphere/Atmosphere'
import { FocusClosing } from './features/focus/FocusClosing'
import { FocusIntro } from './features/focus/FocusIntro'
import { FocusView } from './features/focus/FocusView'
import { useFocusFlow } from './features/focus/useFocusFlow'
import { TodayView } from './features/today/TodayView'
import { NavRail } from './layout/NavRail'
import { useDay } from './state/DayProvider'

export function App() {
  const { view, state } = useDay()
  const flow = useFocusFlow()
  const { phase, step } = flow

  const focusBlock = view.timeline.find((b) => b.id === (state.focus?.blockId ?? flow.closedBlockId))
  const showToday = phase === 'today' || phase === 'entering'
  const showFocus = focusBlock && ((phase === 'entering' && step >= 5) || phase === 'focus' || phase === 'exiting')
  const showClosing = focusBlock && (phase === 'result' || phase === 'next')

  return (
    <>
      <Atmosphere {...flow.atmosphere} />
      <NavRail hidden={!(phase === 'today' || (phase === 'entering' && step < 2))} />

      {showToday && <TodayView step={phase === 'entering' ? step : 0} onStartFocus={flow.start} />}

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
    </>
  )
}
