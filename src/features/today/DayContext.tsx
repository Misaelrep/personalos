import { AnimatePresence, m } from 'framer-motion'
import { Label } from '../../components/ui/Label'
import { profile } from '../../data/profile'
import { ENERGY_LABEL } from '../../domain/energy'
import { formatClock, greeting, minutesOfDay } from '../../domain/time'
import { morph } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'

/** A · Contexto del día: where am I. */
export function DayContext() {
  const { now, view, isFallback } = useDay()
  const weekday = now.toLocaleDateString('es', { weekday: 'long' })
  const date = now.toLocaleDateString('es', { day: 'numeric', month: 'long' })

  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Label className="text-ink-2">{weekday}</Label>
          <span className="hidden text-[13px] text-ink-4 xs:inline">{date}</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <span className="tabular text-[13px] text-ink-3">{formatClock(minutesOfDay(now))}</span>
          <EnergyChip />
        </div>
      </div>

      <h1 className="mt-7 text-[clamp(30px,4.4vw,50px)] leading-[1.04] font-normal tracking-[-0.032em] text-ink sm:mt-10">
        {greeting(now)}, {profile.name}.
      </h1>
      <p className="mt-2.5 text-[16px] tracking-[-0.01em] text-ink-2 sm:mt-3 sm:text-[18px]">
        {view.routine.theme}
        {isFallback && <span className="text-ink-4"> · rutina del {view.routine.dayName.toLowerCase()}</span>}
      </p>
    </header>
  )
}

function EnergyChip() {
  const { view } = useDay()
  return (
    <div
      className="surface-quiet flex h-8 items-center gap-2.5 rounded-full pr-3.5 pl-3"
      title="Estado energético"
      aria-label={`Estado energético: ${ENERGY_LABEL[view.energy]}`}
    >
      <span className="size-1.5 rounded-full bg-accent" />
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={view.energy}
          variants={morph}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="text-[10.5px] font-medium tracking-[0.3em] text-ink-2 uppercase"
        >
          {ENERGY_LABEL[view.energy]}
        </m.span>
      </AnimatePresence>
    </div>
  )
}
