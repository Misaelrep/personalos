import { useCallback, useEffect, useState } from 'react'
import { dailyMessages, type DailyMessage } from '../../data/dailyMessages'
import { dateKey } from '../../domain/time'
import { nowMs } from '../../state/clock'
import { messageForDate } from './dailyMessage'
import { decideEntry, readEntryOverride, type EntryKind } from './entryPolicy'
import { loadEntryMemory, saveEntryMemory } from './entryStorage'

const HEARTBEAT_MS = 30_000

export interface Entry {
  kind: EntryKind
  /** The entry is on screen. */
  active: boolean
  message: DailyMessage
  /** ENTRAR (full) or end of the micro entry. */
  complete: () => void
}

/**
 * Decides the entry once, at page load — a real new session. Afterwards it only
 * keeps `lastActiveAt` fresh while the app is visible, so the next real open
 * knows how long the user was away.
 */
export function useEntry(focusActive: boolean): Entry {
  const [session] = useState(() => {
    const memory = loadEntryMemory()
    const now = new Date(nowMs())
    const today = dateKey(now)
    const override = readEntryOverride(window.location.search)
    const kind = decideEntry({
      today,
      seenDate: memory.dailyEntrySeenDate,
      lastActiveAt: memory.lastActiveAt,
      now: Date.now(),
      override,
      focusActive,
    })
    return { kind, today, forced: Boolean(override), message: messageForDate(now, dailyMessages, memory.dailyMessage, dateKey) }
  })
  const [active, setActive] = useState(session.kind !== 'none')

  // Record which message this date uses.
  useEffect(() => {
    if (session.kind === 'full' && !session.forced) {
      saveEntryMemory({ dailyMessage: { date: session.today, id: session.message.id } })
    }
  }, [session])

  // Activity heartbeat. Visibility changes only record time — they never trigger an entry.
  useEffect(() => {
    const touch = () => saveEntryMemory({ lastActiveAt: Date.now() })
    const beat = () => {
      if (document.visibilityState === 'visible') touch()
    }
    touch()
    const timer = window.setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', touch)
    window.addEventListener('pagehide', touch)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', touch)
      window.removeEventListener('pagehide', touch)
    }
  }, [])

  const complete = useCallback(() => {
    // Seen only once ENTRAR is pressed: an interrupted ritual shows again.
    if (session.kind === 'full' && !session.forced) saveEntryMemory({ dailyEntrySeenDate: session.today })
    setActive(false)
  }, [session])

  return { kind: session.kind, active, message: session.message, complete }
}
