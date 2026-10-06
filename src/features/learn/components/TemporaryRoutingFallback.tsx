import { LEARN_ROUTES, type LearnRoute } from '../domain/types'

/**
 * TEMPORARY_ROUTING_FALLBACK
 *
 * When someone writes freely instead of tapping a suggestion, nothing yet
 * understands what they wrote (that needs the interpretation phase, with AI).
 * Until then they choose the route themselves. This is NOT the final design
 * and NOT a classifier: no keyword or text analysis happens anywhere — the
 * route is whatever is tapped here. Remove this whole file, and its single use
 * in AhoraScreen, when interpretation lands.
 */
const LABEL: Record<LearnRoute, string> = { orient: 'Orientarme', develop: 'Desarrollar', explore: 'Explorar' }

export function TemporaryRoutingFallback({ onChoose }: { onChoose: (route: LearnRoute) => void }) {
  return (
    <div data-temporary-routing-fallback="">
      <p className="text-[13px] text-ink-3">Por ahora, elige tú el camino.</p>
      <ul className="mt-1 flex flex-col">
        {LEARN_ROUTES.map((route) => (
          <li key={route}>
            <button type="button" onClick={() => onChoose(route)} className="hit label-spaced min-h-11 text-ink-2 transition-colors duration-200 hover:text-ink focus-visible:text-ink">
              {LABEL[route]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
