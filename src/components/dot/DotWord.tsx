import { m } from 'framer-motion'
import { useMemo } from 'react'
import { EASE } from '../../motion/tokens'
import { GLYPH_COLS, GLYPH_ROWS, glyph, type DotWordName } from './glyphs'

interface DotWordProps {
  word: DotWordName
  /** Distance between dot centers, in px. */
  pitch?: number
  /** 'in' = CONVERGE into letters · 'out' = DISSOLVE. */
  state: 'in' | 'out'
  /** Show the faint matrix behind the letters. */
  grid?: boolean
  className?: string
}

const LETTER_GAP = 2

function seeded(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function DotWord({ word, pitch = 14, state, grid = true, className }: DotWordProps) {
  const dots = useMemo(
    () =>
      [...word].flatMap((letter, li) =>
        glyph(letter).map((d) => ({ ...d, col: d.col + li * (GLYPH_COLS + LETTER_GAP) })),
      ),
    [word],
  )
  const cols = word.length * GLYPH_COLS + (word.length - 1) * LETTER_GAP
  const width = cols * pitch
  const height = GLYPH_ROWS * pitch
  const r = pitch * 0.32

  return (
    <svg
      role="img"
      aria-label={word}
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', maxWidth: '100%', height: 'auto' }}
    >
      {dots.map((d, i) => {
        const cx = d.col * pitch + pitch / 2
        const cy = d.row * pitch + pitch / 2
        const a = seeded(i)
        const b = seeded(i + 101)
        if (!d.on) {
          if (!grid) return null
          return (
            <m.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r * 0.55}
              fill="currentColor"
              initial={{ opacity: 0 }}
              animate={{ opacity: state === 'in' ? 0.08 : 0 }}
              transition={{ duration: state === 'in' ? 0.9 : 0.5, ease: EASE, delay: state === 'in' ? 0.2 : 0 }}
            />
          )
        }
        return (
          <m.circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="currentColor"
            initial={{ opacity: 0, x: (a - 0.5) * pitch * 14, y: (b - 0.5) * pitch * 10, scale: 0.3 }}
            animate={
              state === 'in'
                ? { opacity: 1, x: 0, y: 0, scale: 1 }
                : { opacity: 0, x: (a - 0.5) * pitch * 3, y: -b * pitch * 3, scale: 0.2 }
            }
            transition={
              state === 'in'
                ? { duration: 1.0, ease: EASE, delay: (d.col / cols) * 0.35 + a * 0.15 }
                : { duration: 0.75, ease: EASE, delay: a * 0.3 }
            }
          />
        )
      })}
    </svg>
  )
}
