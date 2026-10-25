import { m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Composer } from '../components/Composer'
import { DevelopFlow } from '../components/develop/DevelopFlow'
import { IntentSuggestions } from '../components/IntentSuggestions'
import { Reveal } from '../components/Reveal'
import { TemporaryRoutingFallback } from '../components/TemporaryRoutingFallback'
import { activeSkillsOf } from '../domain/capability/validate'
import { createObjective, objectiveOf } from '../domain/capability/commands'
import { shortSkill } from '../domain/capability/language'
import type { CapabilityObjective, ObjectiveStatus } from '../domain/capability/model'
import type { LearnState } from '../domain/state'
import type { LearnRoute } from '../domain/types'
import { newId, type CapabilityApi } from '../hooks/useCapability'

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
  /** The intention was handed on to DESARROLLAR. */
  onClear: () => void
  /** DESARROLLAR's records and flow (Phase B1). */
  cap: CapabilityApi
}

const ROUTE_LABEL: Record<LearnRoute, string> = { orient: 'Orientarme', develop: 'Desarrollar', explore: 'Explorar' }
const NO_CAPABILITY = 'Todavía no hay una capacidad activa.'
const STATUS_LABEL: Record<ObjectiveStatus, string> = { DRAFT: 'Borrador', ACTIVE: 'Activa', PAUSED: 'En pausa', ARCHIVED: 'Archivada' }

/**
 * AHORA — the home of APRENDER. It holds the composer, keeps the intention, and lets the person begin again.
 * DESARROLLAR (Phase B1) opens here: choosing it — by its suggestion, or by the temporary routing fallback — hands the
 * written words to a new capability objective and opens its flow; the capabilities already begun are listed under the
 * composer. ORIENTARME and EXPLORAR keep Phase A's behavior.
 */
export function AhoraScreen({ state, reveal, skipped, locked, onDraft, onCommit, onRestart, onClear, cap }: AhoraScreenProps) {
  // TEMPORARY_ROUTING_FALLBACK: free text was sent; the route is still to be chosen by hand.
  const [awaitingRoute, setAwaitingRoute] = useState(false)
  const [refused, setRefused] = useState(false)
  const { intention } = state

  /** DESARROLLAR begins: the words become the objective's rawIntent — nothing else is filled in from them. */
  const develop = (text: string) => {
    const id = newId('objective')
    const r = cap.run((d, now) => createObjective(d, { id, rawIntent: text, now }), { objectiveId: id, step: 'intent' })
    setRefused(!r.ok)
    return r.ok
  }
  const commit = (route: LearnRoute, text: string) => {
    if (route !== 'develop') return onCommit(route, text)
    if (develop(text)) onDraft('')
  }
  // An intention saved for DESARROLLAR before Phase B1 is handed on the same way, once (the ref keeps a re-run of the effect from doing it twice).
  const handed = useRef(false)
  useEffect(() => {
    if (handed.current || intention?.route !== 'develop' || cap.readOnly) return
    handed.current = true
    if (develop(intention.text)) onClear()
  }, [intention?.route])

  const open = cap.flow.objectiveId ? objectiveOf(cap.data, cap.flow.objectiveId) : undefined
  const begun = cap.data.objectives.filter((o) => o.status !== 'ARCHIVED').sort((a, b) => b.updatedAt - a.updatedAt)

  if (open && open.status !== 'ARCHIVED') {
    return (
      <m.div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 py-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
        <Reveal shown={reveal.prompt} skipped={skipped} locked={locked}>
          <DevelopFlow cap={cap} onExit={() => cap.go({})} />
        </Reveal>
      </m.div>
    )
  }

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
              <TemporaryRoutingFallback onChoose={(route) => commit(route, state.draft)} />
            ) : (
              <IntentSuggestions onPick={(route) => commit(route, state.draft)} />
            )}
          </Reveal>
          <Reveal shown={reveal.suggestions} skipped={skipped} locked={locked} delay={0.2}>
            {cap.readOnly ? (
              <p className="text-[13px] text-ink-3">Hay capacidades guardadas por una versión más nueva de ELYUM: aquí no se abren ni se modifican.</p>
            ) : begun.length ? (
              <Capabilities objectives={begun} cap={cap} />
            ) : (
              <p className="text-[13px] text-ink-3">{NO_CAPABILITY}</p>
            )}
            {cap.notice === 'repaired' && <p className="mt-2 text-[12.5px] text-ink-4">Algunos registros guardados no se podían leer: se apartaron sin tocar el resto.</p>}
            {refused && <p className="mt-2 text-[13px] text-(--learn-label)">No se pudo abrir DESARROLLAR.</p>}
          </Reveal>
        </>
      )}
    </m.div>
  )
}

/** The capabilities already begun, as quiet lines: what each one is, and its status in words. No progress. */
function Capabilities({ objectives, cap }: { objectives: CapabilityObjective[]; cap: CapabilityApi }) {
  return (
    <div>
      <p className="label-spaced text-ink-3" style={{ fontSize: 11 }}>
        Capacidades
      </p>
      <ul className="mt-1 flex flex-col">
        {objectives.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => cap.go({ objectiveId: o.id, step: o.status === 'ACTIVE' ? 'pick' : activeSkillsOf(cap.data, o.id).length ? 'skills' : o.action ? 'observable' : 'intent' })}
              className="hit group flex min-h-11 w-full items-baseline gap-3 py-1.5 text-left"
            >
              <span aria-hidden className="text-ink-4 group-hover:text-accent">
                →
              </span>
              <span className="flex-1 text-[15px] leading-snug text-ink-2 group-hover:text-ink">{o.action ? shortSkill(o) : o.rawIntent || 'Sin título'}</span>
              <span className="label-spaced shrink-0 text-ink-4" style={{ fontSize: 10 }}>
                {STATUS_LABEL[o.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
