import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useProto } from './store'

/**
 * PROTOTYPE · Sequential appearance, after HOY's principles (src/motion/tokens.ts, read, not changed):
 * information comes in the order it has to be understood, with a small rise and the same
 * ease-out curve (EASE), staggered by ~100–180 ms. Here it is plain CSS (opacity + transform
 * only), so Safari composes it on the GPU.
 *
 * Rules:
 *  - Never obligatory: touching the screen during a sequence shows everything at once.
 *  - Not repeated: a screen that has already been revealed in this visit appears directly.
 *  - Reduced movement: everything is there from the start.
 *  - Presentation only: nothing here reads or writes states, priorities, dependencies or decisions.
 */

/** Seconds between related elements. */
export const GAP = 0.14

/** Screens already revealed in this visit (memory only; reloading starts over, like the rest of the prototype). */
const revealed = new Set<string>()

interface Seq {
  /** The sequence is playing right now. */
  running: boolean
  finish: () => void
}
const SeqContext = createContext<Seq>({ running: false, finish: () => {} })

/** Wraps one screen (or one level of the map). `length`: seconds until everything has appeared. */
export function Sequence({ id, length, children, className = '', testId }: { id: string; length: number; children: ReactNode; className?: string; testId?: string }) {
  const { s } = useProto()
  const [running, setRunning] = useState(() => s.motion === 'completo' && !revealed.has(id))
  useEffect(() => {
    revealed.add(id)
    if (!running) return
    const t = setTimeout(() => setRunning(false), length * 1000 + 450)
    return () => clearTimeout(t)
  }, [])
  // Reducing movement in the middle of a sequence ends it.
  useEffect(() => {
    if (s.motion === 'reducido') setRunning(false)
  }, [s.motion])
  const finish = () => setRunning(false)
  return (
    <SeqContext.Provider value={{ running, finish }}>
      <div className={className} data-sequence={running ? 'running' : 'done'} data-testid={testId} onPointerDownCapture={running ? finish : undefined}>
        {children}
      </div>
    </SeqContext.Provider>
  )
}

export const useSequence = () => useContext(SeqContext)

/** Whether a sequence would still play (for light that lives outside it, e.g. on the map above a task). */
export const wasRevealed = (id: string) => revealed.has(id)

/** Props for an element that appears at `at` seconds into the sequence. */
export function useReveal() {
  const { running } = useContext(SeqContext)
  return (at: number, className = ''): { className: string; style?: CSSProperties } =>
    running ? { className: `${className} pl-in`.trim(), style: { animationDelay: `${Math.round(at * 1000)}ms` } } : { className }
}

/** The same, as a wrapper. */
export function Step({ at, children, className = '', testId }: { at: number; children: ReactNode; className?: string; testId?: string }) {
  const reveal = useReveal()
  return (
    <div {...reveal(at, className)} data-testid={testId}>
      {children}
    </div>
  )
}

/** For sections whose children should simply come in one after another, in their own order. */
export function useStagger() {
  const { running } = useContext(SeqContext)
  return running ? 'pl-seq' : ''
}
