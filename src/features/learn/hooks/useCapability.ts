import { useCallback, useEffect, useRef, useState } from 'react'
import { nowMs } from '../../../state/clock'
import type { CapabilityData } from '../domain/capability/model'
import type { Result } from '../domain/capability/commands'
import type { CapabilityFlow } from '../storage/capabilityCodec'
import { learnStore } from '../storage/learnStore'

/** A fresh id for a record (never derived from its content). */
export function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

/**
 * DESARROLLAR's records and where the person is in its flow, kept in storage as they change (a reload never loses an
 * attempt in progress). Every change goes through a pure command (domain/capability/commands.ts); a refused one changes
 * nothing and returns why. Nothing derived is kept here: the screens derive it from the records each time.
 */
export function useCapability() {
  const [load] = useState(() => learnStore.loadCapability())
  // Data from a newer version of the app: shown as unavailable, never written over.
  const readOnly = load.status === 'newer'
  const [stored, setStored] = useState(load.stored)
  // The latest value, synchronously: a command needs the data as it is now, and its answer at once.
  const current = useRef(load.stored)

  useEffect(() => {
    if (!readOnly && stored !== load.stored) learnStore.saveCapability(stored)
  }, [stored, readOnly, load.stored])

  /** Apply a command; on success optionally move the flow. */
  const run = useCallback(
    (command: (data: CapabilityData, now: number) => Result, flow?: CapabilityFlow | ((data: CapabilityData) => CapabilityFlow)): Result => {
      if (readOnly) return { ok: false, error: { code: 'BAD_STATUS' } }
      const r = command(current.current.data, nowMs())
      if (r.ok) {
        const next = { data: r.data, flow: flow === undefined ? current.current.flow : typeof flow === 'function' ? flow(r.data) : flow }
        current.current = next
        setStored(next)
      }
      return r
    },
    [readOnly],
  )

  const go = useCallback(
    (flow: CapabilityFlow) => {
      if (readOnly) return
      const next = { ...current.current, flow }
      current.current = next
      setStored(next)
    },
    [readOnly],
  )

  return { data: stored.data, flow: stored.flow, run, go, readOnly, notice: load.status === 'corrupt' || load.dropped > 0 ? ('repaired' as const) : load.status === 'newer' ? ('newer' as const) : undefined }
}

export type CapabilityApi = ReturnType<typeof useCapability>
