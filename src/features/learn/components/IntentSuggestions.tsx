import type { LearnRoute } from '../domain/types'

/** Light, actionable lines — not cards, not modules. Each one tells us the route explicitly. */
const SUGGESTIONS: { route: LearnRoute; text: string }[] = [
  { route: 'orient', text: 'No sé a qué darle prioridad' },
  { route: 'develop', text: 'Ya sé qué quiero poder hacer' },
  { route: 'explore', text: 'Solo quiero explorar algo' },
]

export function IntentSuggestions({ onPick }: { onPick: (route: LearnRoute) => void }) {
  return (
    <ul className="flex flex-col">
      {SUGGESTIONS.map((s) => (
        <li key={s.route}>
          <button
            type="button"
            onClick={() => onPick(s.route)}
            className="hit group flex min-h-11 w-full items-center gap-3 text-left text-[15px] tracking-[-0.005em] text-ink-2 hover:text-ink focus-visible:text-ink"
          >
            <span aria-hidden className="text-ink-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent">
              →
            </span>
            {s.text}
          </button>
        </li>
      ))}
    </ul>
  )
}
