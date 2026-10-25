import { m } from 'framer-motion'
import { EmptyState } from '../components/EmptyState'

/** MODELOS — Phase A: only the empty state. */
export function ModelosScreen() {
  return (
    <m.div className="flex flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <EmptyState>Los modelos que construyas a partir de tus conocimientos aparecerán aquí.</EmptyState>
    </m.div>
  )
}
