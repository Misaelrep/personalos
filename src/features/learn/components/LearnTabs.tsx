export type LearnView = 'ahora' | 'mapa' | 'modelos'

const TABS: { id: LearnView; label: string }[] = [
  { id: 'ahora', label: 'Ahora' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'modelos', label: 'Modelos' },
]

/**
 * AHORA · MAPA · MODELOS: the three views inside APRENDER. A quiet line of
 * words at the top — deliberately unlike the bottom navigation, which is where
 * the sections live. The routes (orientarme, desarrollar, explorar) are never here.
 */
export function LearnTabs({ view, onChange }: { view: LearnView; onChange: (view: LearnView) => void }) {
  return (
    <div role="tablist" aria-label="Aprender" className="-ml-4 flex">
      {TABS.map((t) => {
        const current = t.id === view
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current}
            id={`learn-tab-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`hit relative flex min-h-11 items-center px-4 text-[10px] font-medium tracking-[0.24em] uppercase ${current ? 'text-(--learn-tab-on)' : 'text-ink-4 hover:text-ink-2'}`}
          >
            {t.label}
            <span aria-hidden className={`absolute inset-x-4 bottom-1.5 h-px bg-current transition-opacity duration-300 ${current ? 'opacity-60' : 'opacity-0'}`} />
          </button>
        )
      })}
    </div>
  )
}
