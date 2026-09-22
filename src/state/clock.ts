import { useEffect, useState } from 'react'

/**
 * App clock. `?t=HH:MM` starts the clock at that time of day (it keeps
 * ticking from there), which makes every moment of the routine reviewable.
 */
function readOffset(): number {
  if (typeof window === 'undefined') return 0
  const t = new URLSearchParams(window.location.search).get('t')
  const match = t?.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return 0
  const target = new Date()
  target.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return target.getTime() - Date.now()
}

const OFFSET = readOffset()

export function nowMs(): number {
  return Date.now() + OFFSET
}

/** Re-renders every `intervalMs`, aligned to the interval boundary. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date(nowMs()))
  useEffect(() => {
    let timer: number
    const tick = () => {
      const t = nowMs()
      setNow(new Date(t))
      timer = window.setTimeout(tick, intervalMs - (t % intervalMs))
    }
    timer = window.setTimeout(tick, intervalMs - (nowMs() % intervalMs))
    return () => window.clearTimeout(timer)
  }, [intervalMs])
  return now
}
