import { m } from 'framer-motion'
import { EASE } from '../../motion/tokens'

/**
 * The AHORA marker: a 3 × 3 module of points. ORDERED while a block is
 * active; GATHERING into its center when Focus is about to begin.
 */
const CELLS = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col })))

export function ActiveMatrix({ gathering = false }: { gathering?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0 overflow-visible">
      {CELLS.map(({ row, col }) => {
        const center = row === 1 && col === 1
        const corner = row !== 1 && col !== 1
        if (center) {
          return (
            <g key="c">
              <circle className="matrix-pulse" cx="9" cy="9" r="2.2" fill="var(--accent)" />
              <m.circle
                cx="9"
                cy="9"
                fill="var(--accent)"
                initial={false}
                animate={{ r: gathering ? 2.9 : 2.2 }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </g>
          )
        }
        return (
          <m.circle
            key={`${row}-${col}`}
            fill="currentColor"
            initial={false}
            animate={{
              cx: gathering ? 9 : 3 + col * 6,
              cy: gathering ? 9 : 3 + row * 6,
              r: corner ? 1 : 1.25,
              opacity: gathering ? 0 : corner ? 0.35 : 0.6,
            }}
            transition={{ duration: 0.55, ease: EASE, delay: gathering ? (corner ? 0.06 : 0) : 0 }}
          />
        )
      })}
    </svg>
  )
}
