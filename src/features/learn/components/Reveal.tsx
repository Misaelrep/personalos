import { m } from 'framer-motion'
import type { ReactNode } from 'react'
import { EASE } from '../../../motion/tokens'
import { SKIP_MS } from '../domain/ritual'

/**
 * A piece of the screen that is already in place, waiting to appear: it takes
 * no space from the layout when it shows and cannot be focused or tapped
 * before then (nor while `locked`: the tap that skipped is still in progress). After a skip it settles in SKIP_MS, all together.
 */
export function Reveal({ shown, skipped, locked = false, delay = 0, children, className }: { shown: boolean; skipped: boolean; locked?: boolean; delay?: number; children: ReactNode; className?: string }) {
  return (
    <m.div
      className={className}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
      transition={{ duration: skipped ? SKIP_MS / 1000 : 0.6, delay: skipped ? 0 : delay, ease: EASE }}
      inert={!shown || locked || undefined}
      aria-hidden={!shown || undefined}
    >
      {children}
    </m.div>
  )
}
