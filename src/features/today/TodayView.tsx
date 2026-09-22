import { m } from 'framer-motion'
import { useEffect } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { fade, fadeGroup, transition } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { DayContext } from './DayContext'
import { DayPath } from './DayPath'
import { MeditationPrompt } from './MeditationPrompt'
import { NextUp } from './NextUp'
import { NowCard } from './NowCard'

interface TodayViewProps {
  onStartFocus: (blockId: string) => void
  /**
   * HOY → FOCUS progress. 0 idle · 1 secondary surfaces fade ·
   * 2 AHORA takes over · 3 everything yields to the atmosphere.
   */
  step: number
}

/**
 * HOY. Mobile: AHORA → SIGUIENTE → CAMINO in one column.
 * Desktop: the same order on the left; the path sits quietly on the right.
 */
export function TodayView({ onStartFocus, step }: TodayViewProps) {
  const { view } = useDay()
  const wide = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    document.title = `Hoy · ${view.current.title}`
  }, [view.current.title])

  const secondary = { opacity: step >= 1 ? 0 : 1 }
  const secondaryTransition = { duration: 0.25, ease: transition.micro.ease }

  return (
    <m.main
      className="tone-ink relative z-10 mx-auto w-full max-w-[1180px] px-5 pt-[max(env(safe-area-inset-top),28px)] pb-16 sm:px-10 sm:pt-12 lg:pr-14 lg:pl-[140px] lg:pt-16"
      variants={fadeGroup(0.09, 0.05)}
      initial="hidden"
      animate="visible"
      style={{ pointerEvents: step > 0 ? 'none' : undefined }}
    >
      <m.div variants={fade}>
        <m.div animate={secondary} transition={secondaryTransition}>
          <DayContext />
        </m.div>
      </m.div>

      <div className="mt-9 grid gap-5 sm:mt-12 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-16 xl:gap-x-24">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <m.div variants={fade}>
            <m.div
              animate={{ opacity: step >= 3 ? 0 : 1, scale: step >= 2 ? 1.015 : 1 }}
              transition={step >= 3 ? { duration: 0.35, ease: transition.micro.ease } : transition.state}
            >
              <NowCard onStartFocus={onStartFocus} focusing={step >= 2} />
            </m.div>
          </m.div>

          {view.meditationPrompt && (
            <m.div variants={fade}>
              <m.div animate={secondary} transition={secondaryTransition}>
                <MeditationPrompt />
              </m.div>
            </m.div>
          )}

          <m.div variants={fade}>
            <m.div animate={secondary} transition={secondaryTransition}>
              <NextUp />
            </m.div>
          </m.div>
        </div>

        <m.aside variants={fade} className="mt-6 lg:mt-2">
          <m.div animate={secondary} transition={secondaryTransition}>
            <DayPath key={wide ? 'wide' : 'narrow'} defaultOpen={wide} />
          </m.div>
        </m.aside>
      </div>
    </m.main>
  )
}
