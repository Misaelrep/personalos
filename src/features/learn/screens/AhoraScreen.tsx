import { m } from 'framer-motion'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Composer } from '../components/Composer'
import { IntentSuggestions } from '../components/IntentSuggestions'
import { Reveal } from '../components/Reveal'
import { TemporaryRoutingFallback } from '../components/TemporaryRoutingFallback'
import type { LearnState } from '../domain/state'
import type { LearnRoute } from '../domain/types'

/** Which pieces of the screen the ritual has brought in so far. */
export interface Reveals {
  prompt: boolean
  field: boolean
  suggestions: boolean
}

interface AhoraScreenProps {
  state: LearnState
  reveal: Reveals
  /** The ritual was skipped: everything settles together, fast. */
  skipped: boolean
  /** The tap that skipped has not ended: nothing here can be pressed yet. */
  locked: boolean
  onDraft: (text: string) => void
  onCommit: (route: LearnRoute, text: string) => void
  onRestart: () => void
}

const ROUTE_LABEL: Record<LearnRoute, string> = { orient: 'Orientarme', develop: 'Desarrollar', explore: 'Explorar' }
const NO_CAPABILITY = 'Todavía no hay una capacidad activa.'

/**
 * AHORA — the home of APRENDER. While no capability is active (Phase A has no
 * goals or skills yet) it holds the composer, keeps the intention, and lets
 * the person begin again.
 */
export function AhoraScreen({ state, reveal, skipped, locked, onDraft, onCommit, onRestart }: AhoraScreenProps) {
  // TEMPORARY_ROUTING_FALLBACK: free text was sent; the route is still to be chosen by hand.
  const [awaitingRoute, setAwaitingRoute] = useState(false)
  const { intention } = state

  return (
    <m.div
      className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center gap-6 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {intention ? (
        <>
          <Reveal shown={reveal.prompt} skipped={skipped} locked={locked}>
            <p className="label-spaced text-ink-3" style={{ fontSize: 12 }}>
              Intención
            </p>
            {intention.text && (
              <p className="mt-4 font-display text-[clamp(22px,5.4vw,30px)] leading-snug font-normal tracking-[-0.03em] text-balance text-ink">{intention.text}</p>
            )}
            <p className="label-spaced mt-5 text-accent" style={{ fontSize: 11 }}>
              {ROUTE_LABEL[intention.route]}
            </p>
          </Reveal>
          <Reveal shown={reveal.field} skipped={skipped} locked={locked} delay={0.1}>
            <p className="text-[15px] text-ink-3">{NO_CAPABILITY}</p>
          </Reveal>
          <Reveal shown={reveal.suggestions} skipped={skipped} locked={locked} delay={0.1}>
            <Button variant="quiet" className="-ml-4" onClick={onRestart}>
              Empezar de nuevo
            </Button>
          </Reveal>
        </>
      ) : (
        <>
          <Reveal shown={reveal.prompt} skipped={skipped} locked={locked}>
            <h2 id="learn-prompt" className="label-spaced text-(--learn-label)" style={{ fontSize: 13 }}>
              ¿Qué tienes en mente?
            </h2>
          </Reveal>
          <Reveal shown={reveal.field} skipped={skipped} locked={locked}>
            <Composer
              value={state.draft}
              onChange={(text) => {
                setAwaitingRoute(false)
                onDraft(text)
              }}
              onSubmit={() => setAwaitingRoute(true)}
            />
          </Reveal>
          <Reveal shown={reveal.suggestions} skipped={skipped} locked={locked} delay={0.05}>
            {awaitingRoute ? (
              <TemporaryRoutingFallback onChoose={(route) => onCommit(route, state.draft)} />
            ) : (
              <IntentSuggestions onPick={(route) => onCommit(route, state.draft)} />
            )}
          </Reveal>
          <Reveal shown={reveal.suggestions} skipped={skipped} locked={locked} delay={0.2}>
            <p className="text-[13px] text-ink-3">{NO_CAPABILITY}</p>
          </Reveal>
        </>
      )}
    </m.div>
  )
}
