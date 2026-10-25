import { m } from 'framer-motion'
import { Fragment, useMemo } from 'react'
import { useMotion } from '../../../motion/MotionLevel'
import { EASE } from '../../../motion/tokens'

interface FragmentedTextProps {
  text: string
  /** 'in' = the phrase appears · 'out' = it defragments and leaves. */
  state: 'in' | 'out'
  className?: string
}

/** Same deterministic scatter DotWord uses, so the phrase leaves the way the dots do. */
function seeded(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The phrase of the day. It appears letter by letter (≈0.9 s) and, when the
 * ritual defragments, each letter drifts up and fades (≈1 s) — transform and
 * opacity only. With reduced motion it is one simple fade.
 */
export function FragmentedText({ text, state, className = '' }: FragmentedTextProps) {
  const { level } = useMotion()
  const { words, total } = useMemo(() => {
    let i = 0
    const words = text.split(' ').map((word) => [...word].map((ch) => ({ ch, i: i++, a: seeded(i), b: seeded(i + 101) })))
    return { words, total: Math.max(1, i) }
  }, [text])

  if (level === 'reducido') {
    return (
      <m.p className={className} initial={{ opacity: 0 }} animate={{ opacity: state === 'in' ? 1 : 0 }} transition={{ duration: state === 'in' ? 0.9 : 0.6, ease: EASE }}>
        {text}
      </m.p>
    )
  }

  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, wi) => (
          <Fragment key={wi}>
            {wi > 0 && ' '}
            <span className="inline-block whitespace-nowrap">
              {word.map(({ ch, i, a, b }) => (
                <m.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 6 }}
                  animate={state === 'in' ? { opacity: 1, x: 0, y: 0, scale: 1 } : { opacity: 0, x: (a - 0.5) * 36, y: -(10 + b * 30), scale: 0.85 }}
                  transition={state === 'in' ? { duration: 0.5, ease: EASE, delay: (i / total) * 0.4 } : { duration: 0.65, ease: EASE, delay: a * 0.35 }}
                >
                  {ch}
                </m.span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </p>
  )
}
