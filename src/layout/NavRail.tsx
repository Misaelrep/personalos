import { m } from 'framer-motion'
import { DotMark } from '../components/dot/DotMark'
import { transition } from '../motion/tokens'
import { SECTIONS } from './sections'

/** Desktop navigation. Leaves the stage while entering Focus. */
export function NavRail({ hidden }: { hidden: boolean }) {
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
          const active = s.id === 'hoy'
          return (
            <li key={s.id}>
              <span
                aria-current={active ? 'page' : undefined}
                aria-disabled={!s.available || undefined}
                title={s.available ? undefined : 'Próximamente'}
                className={`flex flex-col items-center gap-2.5 rounded-2xl px-3 py-3.5 text-[10px] font-medium tracking-[0.22em] uppercase ${
                  active ? 'text-ink' : 'cursor-default text-ink-4 opacity-70'
                }`}
              >
                <span className={`size-1 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
                {s.label}
              </span>
            </li>
          )
        })}
      </ul>
    </m.nav>
  )
}
