import { m } from 'framer-motion'
import { DotWord } from '../../../components/dot/DotWord'
import { GLYPH_COLS, GLYPH_ROWS, glyph } from '../../../components/dot/glyphs'
import { useViewport } from '../../../hooks/useViewport'
import { useMotion } from '../../../motion/MotionLevel'
import { EASE } from '../../../motion/tokens'
import { WORDMARK, WORDMARK_COLS, wordmarkPitch } from '../domain/wordmark'

/** The dots take the color and glow of the atmosphere in force (set by the screen). */
const TINT = 'text-(--learn-mark) drop-shadow-[0_0_14px_var(--learn-mark-glow)]'
const LETTER_GAP = 2

/**
 * APRENDER in dots. The dots converge into the letters and, at the end,
 * dissolve (DotWord). With reduced motion the same dots simply fade, in place.
 */
export function Wordmark({ dissolving }: { dissolving: boolean }) {
  const { width } = useViewport()
  const { level } = useMotion()
  const pitch = wordmarkPitch(width)

  if (level !== 'reducido') {
    return (
      <div data-learn-wordmark="">
        <DotWord word={WORDMARK} pitch={pitch} state={dissolving ? 'out' : 'in'} className={TINT} />
      </div>
    )
  }

  const dots = [...WORDMARK].flatMap((letter, li) => glyph(letter).map((d) => ({ ...d, col: d.col + li * (GLYPH_COLS + LETTER_GAP) })))
  const w = WORDMARK_COLS * pitch
  const h = GLYPH_ROWS * pitch
  return (
    <m.div data-learn-wordmark="" initial={{ opacity: 0 }} animate={{ opacity: dissolving ? 0 : 1 }} transition={{ duration: 0.7, ease: EASE }}>
      <svg role="img" aria-label={WORDMARK} className={TINT} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', maxWidth: '100%', height: 'auto' }}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.col * pitch + pitch / 2} cy={d.row * pitch + pitch / 2} r={pitch * (d.on ? 0.32 : 0.176)} fill="currentColor" opacity={d.on ? 1 : 0.08} />
        ))}
      </svg>
    </m.div>
  )
}
