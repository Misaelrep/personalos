import { useCallback, useEffect, useState } from 'react'
import { nowMs } from '../../../state/clock'
import { commitIntention, restartIntention, setDraft, type LearnState } from '../domain/state'
import type { LearnRoute } from '../domain/types'
import { learnStore } from '../storage/learnStore'

/** APRENDER's state, kept in storage as it changes (so a reload never loses a draft). */
export function useLearn() {
  const [state, setState] = useState<LearnState>(() => learnStore.loadState())

  useEffect(() => learnStore.saveState(state), [state])

  const changeDraft = useCallback((text: string) => setState((s) => setDraft(s, text)), [])
  const commit = useCallback((route: LearnRoute, text: string) => setState((s) => commitIntention(s, route, text, nowMs())), [])
  const restart = useCallback(() => setState((s) => restartIntention(s)), [])

  return { state, changeDraft, commit, restart }
}
