import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useState } from 'react'
import { EASE } from '../../../motion/tokens'
import { keyLabel } from '../domain/describe'
import { guardAction, ownRestores, readMarker, RESTORE_KEY } from '../storage/restore'
import { browserStorage } from '../storage/storage'
import { takeImportNotice, useStorageHealth, type ImportNotice } from './health'

interface SystemNoticeProps {
  /** Hidden while FOCUS, the entry or an open day hold the stage. */
  hidden: boolean
  onOpen: () => void
}

/**
 * One quiet line at the top, only when something about the data needs to be
 * known: the storage of this device is failing (persistent until it works
 * again), or a copy was just restored (a few seconds).
 */
export function SystemNotice({ hidden, onOpen }: SystemNoticeProps) {
  const { health } = useStorageHealth()
  const [restored, setRestored] = useState<ImportNotice | undefined>(() => takeImportNotice())

  const incomplete = Boolean(restored?.overwritten?.length)
  useEffect(() => {
    // A complete restore is announced for a few seconds; an incomplete one stays until it is read.
    if (!restored || incomplete) return
    const t = window.setTimeout(() => setRestored(undefined), 9000)
    return () => window.clearTimeout(t)
  }, [restored, incomplete])

  const text = !health.ok
    ? health.message
    : restored && incomplete
      ? `Restauración incompleta: otra pestaña cambió ${restored.overwritten!.map(keyLabel).join(', ')}. Cierra las demás pestañas y vuelve a importar la copia.`
      : restored
        ? `Copia restaurada · ${restored.written} ${restored.written === 1 ? 'dato escrito y verificado' : 'datos escritos y verificados'}`
        : undefined
  const failing = !health.ok || incomplete

  return (
    <AnimatePresence>
      {text && !hidden && (
        <m.div
          key={failing ? 'failing' : 'restored'}
          role={failing ? 'alert' : 'status'}
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex justify-center px-4"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <button
            type="button"
            onClick={!health.ok ? onOpen : () => setRestored(undefined)}
            className="surface-quiet pointer-events-auto flex min-h-11 max-w-[560px] items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[13px] leading-snug text-ink"
          >
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${failing ? 'bg-[#e5484d]' : 'bg-accent'}`} />
            <span>{text}</span>
            {!health.ok && <span className="shrink-0 text-ink-3">· Sistema</span>}
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * In every tab: when another tab restores a copy, this one stops at once — a
 * full-screen veil that takes every touch and key, so nothing here can save an
 * old state over the restored data — and reloads when the restore ends (or is
 * abandoned). It also catches a restore that happened while this tab was in
 * the background, when it comes back.
 */
export function RestoreGuard() {
  const [atLoad] = useState(() => {
    const storage = browserStorage()
    return storage ? readMarker(storage) : undefined
  })
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const storage = browserStorage()
    if (!storage) return
    const check = () => {
      const action = guardAction(readMarker(storage), atLoad, ownRestores, Date.now())
      if (action === 'none') {
        // Blocked by a restore that is no longer being written (e.g. abandoned): reload from what is stored.
        if (blocked) window.location.reload()
        return
      }
      setBlocked(true)
      if (action === 'reload') window.location.reload()
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === RESTORE_KEY || e.key === null) check()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    // While blocked, also watch for the end (or abandonment) of the restore.
    const poll = blocked ? window.setInterval(check, 1000) : undefined
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      if (poll) window.clearInterval(poll)
    }
  }, [atLoad, blocked])

  useEffect(() => {
    if (!blocked) return
    const stop = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', stop, true)
    return () => window.removeEventListener('keydown', stop, true)
  }, [blocked])

  if (!blocked) return null
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Restauración en otra pestaña"
      data-restore-guard=""
      className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--atmo-base,#eef2f6)_82%,transparent)] px-6 backdrop-blur-md"
      onPointerDownCapture={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="max-w-[420px] text-center">
        <p className="text-[17px] leading-snug text-ink">Se está restaurando una copia en otra pestaña.</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">ELYUM se recargará con los datos restaurados. Esta pestaña no guarda nada mientras tanto.</p>
      </div>
    </div>
  )
}
