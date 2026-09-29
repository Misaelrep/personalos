import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * New versions without surprises. The service worker precaches each build; a
 * new deploy installs in the background and waits. The app offers it
 * ("Nueva versión disponible · Actualizar") only at rest — never in Focus —
 * and reloads only when asked. Left alone, the new version takes over the next
 * time the app is opened from scratch.
 *
 * Checks: on every launch, whenever the app comes back to the foreground, and
 * hourly while it stays open.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000
/** If the waiting worker never takes control (already gone), reload anyway. */
const APPLY_FALLBACK_MS = 3000

let waiting = false
let atRest = false
let reloadHeld = false
let skipWaiting: ((reload?: boolean) => Promise<void>) | undefined
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Register the service worker (production builds only). */
export function startUpdates(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  skipWaiting = registerSW({
    onNeedRefresh() {
      waiting = true
      listeners.forEach((l) => l())
    },
    // The new version took control (here or from another window): reload, but never in Focus.
    onNeedReload() {
      if (atRest) window.location.reload()
      else reloadHeld = true
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

/** Whether a new version can be offered now, and how to apply it. `rest`: see `isUpdateMoment`. */
export function useUpdates(rest: boolean): { offer: boolean; apply: () => void } {
  const ready = useSyncExternalStore(subscribe, () => waiting, () => false)
  useEffect(() => {
    atRest = rest
    if (rest && reloadHeld) window.location.reload()
  }, [rest])
  const apply = useCallback(() => {
    void skipWaiting?.(true)
    window.setTimeout(() => window.location.reload(), APPLY_FALLBACK_MS)
  }, [])
  return { offer: ready && rest, apply }
}
