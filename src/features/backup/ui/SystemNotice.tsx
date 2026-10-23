import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useState } from 'react'
import { EASE } from '../../../motion/tokens'
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

  useEffect(() => {
    if (!restored) return
    const t = window.setTimeout(() => setRestored(undefined), 9000)
    return () => window.clearTimeout(t)
  }, [restored])

  const text = !health.ok ? health.message : restored ? `Copia restaurada · ${restored.written} ${restored.written === 1 ? 'dato escrito y verificado' : 'datos escritos y verificados'}` : undefined
  const failing = !health.ok

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
            onClick={failing ? onOpen : () => setRestored(undefined)}
            className="surface-quiet pointer-events-auto flex min-h-11 max-w-[560px] items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[13px] leading-snug text-ink"
          >
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${failing ? 'bg-[#e5484d]' : 'bg-accent'}`} />
            <span>{text}</span>
            {failing && <span className="shrink-0 text-ink-3">· Sistema</span>}
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
