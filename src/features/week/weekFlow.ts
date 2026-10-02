/**
 * SEMANA's four visual states as a pure state machine.
 *
 *   general    the seven days
 *   selected   one day forward, facing us, its matter organized
 *   opening    the glass loses cohesion; the matter cools and separates
 *   day        the real DAYSCAPE of that date
 *   returning  (in between) the day comes apart; the week returns at rest
 *
 * Anything else is ignored: a day cannot be chosen while another is opening.
 */
export type WeekPhase = 'general' | 'selected' | 'opening' | 'day' | 'returning'

export interface WeekFlowState {
  phase: WeekPhase
  /** Day facing us (index in the week). */
  selected: number | null
  /** Day being opened: it stays known while the week returns underneath. */
  opened: number | null
  /** Its DAYSCAPE is mounted. */
  dayOpen: boolean
}

export type WeekFlowAction =
  | { type: 'select'; index: number }
  | { type: 'release' }
  /** VER DÍA, or the chosen day tapped again. */
  | { type: 'open' }
  /** The day's DAYSCAPE mounts over the suspended matter. */
  | { type: 'mountDay' }
  /** The week gives way to the day. */
  | { type: 'dayShown' }
  /** Leaving the day: the week returns underneath. */
  | { type: 'back' }
  | { type: 'returned' }

export const WEEK_FLOW_START: WeekFlowState = { phase: 'general', selected: null, opened: null, dayOpen: false }

export function weekFlow(state: WeekFlowState, action: WeekFlowAction): WeekFlowState {
  switch (action.type) {
    case 'select':
      if (state.phase !== 'general' && state.phase !== 'selected') return state
      return { ...state, phase: 'selected', selected: action.index }
    case 'release':
      if (state.phase !== 'selected') return state
      return { ...state, phase: 'general', selected: null }
    case 'open':
      if (state.phase !== 'selected' || state.selected === null) return state
      return { ...state, phase: 'opening', opened: state.selected }
    case 'mountDay':
      if (state.phase !== 'opening') return state
      return { ...state, dayOpen: true }
    case 'dayShown':
      if (state.phase !== 'opening' || !state.dayOpen) return state
      return { ...state, phase: 'day' }
    case 'back':
      if (!state.dayOpen || (state.phase !== 'day' && state.phase !== 'opening')) return state
      return { ...state, phase: 'returning', selected: null }
    case 'returned':
      if (state.phase !== 'returning') return state
      return WEEK_FLOW_START
  }
}
