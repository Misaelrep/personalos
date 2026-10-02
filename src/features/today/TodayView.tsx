import { m } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { fade, fadeGroup, fieldReveal, materialize, transition } from '../../motion/tokens'
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
  /**
   * How HOY first appears: `fade` normally, `materialize` after the micro entry,
   * `field` after the DAY FIELD (in order, from AHORA outward).
   */
  appear?: TodayAppear
}

export type TodayAppear = 'fade' | 'materialize' | 'field'

/**
 * HOY. Mobile: AHORA → SIGUIENTE → CAMINO in one column.
 * Desktop: the same order on the left; the path sits quietly on the right.
 */
export function TodayView({ onStartFocus, step, appear = 'fade' }: TodayViewProps) {
  // Fixed for this mount: swapping variants on mounted elements re-applies their hidden state.
  const [appearing] = useState(appear)
  const { view } = useDay()
  const item = appearing === 'field' ? fieldReveal : appearing === 'materialize' ? materialize : fade
  const wide = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    document.title = `Hoy · ${view.current.title}`
  }, [view.current.title])

  const secondary = { opacity: step >= 1 ? 0 : 1 }
  const secondaryTransition = { duration: 0.25, ease: transition.micro.ease }

  return (
    <m.main
      className="tone-ink relative z-10 mx-auto w-full max-w-[1180px] px-5 pt-[calc(env(safe-area-inset-top)+28px)] pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-10 sm:pt-12 lg:pr-14 lg:pl-[140px] lg:pt-16"
      variants={appearing === 'field' ? fadeGroup(0, 0) : appearing === 'materialize' ? fadeGroup(0.13, 0.05) : fadeGroup(0.09, 0.05)}
      initial="hidden"
      animate="visible"
      style={{ pointerEvents: step > 0 ? 'none' : undefined }}
    >
      <m.div variants={item} custom={1}>
        <m.div animate={secondary} transition={secondaryTransition}>
          <DayContext />
        </m.div>
      </m.div>

      <div className="mt-8 grid gap-5 sm:mt-11 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-16 xl:gap-x-24">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <m.div variants={item} custom={0}>
            <m.div
              animate={{ opacity: step >= 3 ? 0 : 1, scale: step >= 2 ? 1.015 : 1 }}
              transition={step >= 3 ? { duration: 0.35, ease: transition.micro.ease } : transition.state}
            >
              <NowCard onStartFocus={onStartFocus} focusing={step >= 2} />
            </m.div>
          </m.div>

          {view.meditationPrompt && (
            <m.div variants={item} custom={2}>
              <m.div animate={secondary} transition={secondaryTransition}>
                <MeditationPrompt />
              </m.div>
            </m.div>
          )}

          <m.div variants={item} custom={2}>
            <m.div animate={secondary} transition={secondaryTransition}>
              <NextUp />
            </m.div>
          </m.div>
        </div>

        <m.aside variants={item} custom={3} className="mt-6 lg:mt-2">
          <m.div animate={secondary} transition={secondaryTransition}>
            <DayPath key={wide ? 'wide' : 'narrow'} defaultOpen={wide} />
          </m.div>
        </m.aside>
      </div>
    </m.main>
  )
}
