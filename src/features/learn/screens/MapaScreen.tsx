import { m } from 'framer-motion'
import { EmptyState } from '../components/EmptyState'

/** MAPA — Phase A: only the empty state. No network drawn, no demo data. */
export function MapaScreen() {
  return (
    <m.div className="flex flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <EmptyState>Aquí aparecerán las conexiones entre lo que vayas comprendiendo.</EmptyState>
    </m.div>
  )
}
