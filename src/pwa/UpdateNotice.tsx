import { AnimatePresence, m } from 'framer-motion'
import { EASE } from '../motion/tokens'

/** A new version, offered in one quiet line. No modal, no toast. */
export function UpdateNotice({ visible, onApply }: { visible: boolean; onApply: () => void }) {
  return (
    <AnimatePresence>
      {visible && (
        <m.div
          key="update"
          className="update-notice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <button type="button" onClick={onApply}>
            <span className="text-ink-3">Nueva versión disponible</span>
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span className="text-ink">Actualizar</span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
