import { AnimatePresence, m } from 'framer-motion'
import { EnergyGlyph } from '../../components/dot/EnergyGlyph'
import { Label } from '../../components/ui/Label'
import { profile } from '../../data/profile'
import { ENERGY_LABEL } from '../../domain/energy'
import { formatClock, greeting, minutesOfDay } from '../../domain/time'
import { morph } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'

/** A · Contexto del día: where am I. */
export function DayContext() {
  const { now, view } = useDay()
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

      {/* Editorial greeting: a quiet first line, the name as the signature, ending on a point. */}
      <h1 aria-label={`${greeting(now)}, ${profile.name}.`} className="mt-7 font-display sm:mt-10">
        <span aria-hidden className="block text-[21px] leading-none font-light tracking-[-0.02em] text-ink-3 sm:text-[26px]">
          {greeting(now)},
        </span>
        <span
          aria-hidden
          className="display-reflection mt-2 block text-[clamp(36px,4.2vw,52px)] leading-[0.98] font-[440] tracking-[-0.05em] sm:mt-2.5"
        >
          {profile.name}
          <span className="greeting-dot" />
        </span>
      </h1>
      <p className="mt-4 text-[15px] tracking-[-0.005em] text-ink-2 sm:mt-5 sm:text-[17px]">
        {view.routine.theme}
      </p>
    </header>
  )
}

function EnergyChip() {
  const { view } = useDay()
  return (
    <div
      className="surface-quiet flex h-8 items-center gap-2 rounded-full pr-3.5 pl-2.5"
      title="Estado energético"
      aria-label={`Estado energético: ${ENERGY_LABEL[view.energy]}`}
    >
      <EnergyGlyph energy={view.energy} className="text-accent" />
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
