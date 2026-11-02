import { m } from 'framer-motion'
import { DotMark } from '../components/dot/DotMark'
import { transition } from '../motion/tokens'
import { SECTIONS, type SectionId } from './sections'

interface NavProps {
  hidden: boolean
  active: SectionId
  onNavigate: (id: SectionId) => void
}

/** Desktop navigation. Leaves the stage while entering Focus or opening a day. */
export function NavRail({ hidden, active, onNavigate }: NavProps) {
  return (
    <m.nav
      aria-label="Secciones"
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, x: hidden ? -16 : 0 }}
      transition={transition.state}
      className="fixed inset-y-0 left-0 z-20 hidden w-[104px] flex-col items-center py-10 lg:flex"
      style={{ pointerEvents: hidden ? 'none' : undefined }}
      aria-hidden={hidden}
    >
      <DotMark size={20} className="text-ink" />
      <ul className="mt-20 flex flex-col items-center gap-1">
        {SECTIONS.map((s) => {
          const current = s.id === active
          const look = `flex flex-col items-center gap-2.5 rounded-2xl px-3 py-3.5 text-[10px] font-medium tracking-[0.22em] uppercase ${
            current ? 'text-ink' : s.available ? 'text-ink-3 transition-colors duration-300 hover:text-ink' : 'cursor-default text-ink-4 opacity-70'
          }`
          const dot = <span className={`size-1 rounded-full ${current ? (s.id === 'hoy' ? 'bg-accent' : 'bg-ink') : 'bg-transparent'}`} />
          return (
            <li key={s.id}>
              {s.available ? (
                <button type="button" aria-current={current ? 'page' : undefined} className={look} onClick={() => onNavigate(s.id)} tabIndex={hidden ? -1 : 0}>
                  {dot}
                  {s.label}
                </button>
              ) : (
                <span aria-disabled title="Próximamente" className={look}>
                  {dot}
                  {s.label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </m.nav>
  )
}

/** Mobile navigation: the available sections, quiet, at the bottom. */
export function BottomNav({ hidden, active, onNavigate }: NavProps) {
  return (
    <m.nav
      aria-label="Secciones"
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? 12 : 0 }}
      transition={transition.state}
      className="bottom-nav lg:hidden"
      aria-hidden={hidden}
    >
      {/* The sections share the width between the safe areas with even gaps: every label whole, no horizontal scroll. */}
      <ul
        className="flex w-full max-w-[420px] items-center justify-evenly"
        style={{ pointerEvents: hidden ? 'none' : 'auto', paddingLeft: 'max(env(safe-area-inset-left), 12px)', paddingRight: 'max(env(safe-area-inset-right), 12px)' }}
      >
        {SECTIONS.filter((s) => s.available).map((s) => {
          const current = s.id === active
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                tabIndex={hidden ? -1 : 0}
                onClick={() => onNavigate(s.id)}
                className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-2 px-2 pt-2 pb-1.5 text-[10px] font-medium tracking-[0.24em] whitespace-nowrap uppercase max-[359px]:tracking-[0.12em] ${
                  current ? 'text-ink' : 'text-ink-3'
                }`}
              >
                <span className={`size-1 rounded-full ${current ? (s.id === 'hoy' ? 'bg-accent' : 'bg-ink') : 'bg-transparent'}`} />
                {s.label}
              </button>
            </li>
          )
        })}
      </ul>
    </m.nav>
  )
}
