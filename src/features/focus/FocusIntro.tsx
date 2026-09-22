import { m } from 'framer-motion'
import { DotWord } from '../../components/dot/DotWord'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/** Phase 4–5 of HOY → FOCUS: the word converges from points, then dissolves. */
export function FocusIntro({ dissolving }: { dissolving: boolean }) {
  const compact = useMediaQuery('(max-width: 640px)')
  return (
    <m.div
      className="pointer-events-none fixed inset-0 z-20 grid place-items-center px-8"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <DotWord
        word="FOCUS"
        pitch={compact ? 9 : 15}
        state={dissolving ? 'out' : 'in'}
        className="text-[#B9D4FF] drop-shadow-[0_0_14px_rgba(105,165,255,0.55)]"
      />
    </m.div>
  )
}
