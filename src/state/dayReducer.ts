import type { BlockRecord, DayState, Outcome } from '../domain/types'

export type DayAction =
  | { type: 'complete'; blockId: string }
  | { type: 'skip'; blockId: string }
  /** Close a deep block with its result. */
  | { type: 'close'; blockId: string; outcome: Outcome; note?: string }
  /** Undo a resolution (keeps the objective). */
  | { type: 'reopen'; blockId: string }
  | { type: 'setObjective'; blockId: string; objective: string }
  | { type: 'startFocus'; blockId: string; at: number }
  | { type: 'leaveFocus' }
  | { type: 'moveMeditation' }
  | { type: 'load'; state: DayState }

export function emptyDay(date: string): DayState {
  return { date, records: {} }
}

function patch(state: DayState, blockId: string, update: (r: BlockRecord) => BlockRecord): DayState {
  return { ...state, records: { ...state.records, [blockId]: update(state.records[blockId] ?? {}) } }
}

function withoutFocusOn(state: DayState, blockId: string): DayState {
  return state.focus?.blockId === blockId ? { ...state, focus: undefined } : state
}

export function dayReducer(state: DayState, action: DayAction): DayState {
  switch (action.type) {
    case 'complete':
      return withoutFocusOn(
        patch(state, action.blockId, (r) => ({ ...r, status: 'completado', outcome: undefined, pendingNote: undefined })),
        action.blockId,
      )
    case 'skip':
      return withoutFocusOn(
        patch(state, action.blockId, (r) => ({ ...r, status: 'omitido', outcome: undefined, pendingNote: undefined })),
        action.blockId,
      )
    case 'close': {
      const note = action.outcome === 'parcial' ? action.note?.trim() || undefined : undefined
      return withoutFocusOn(
        patch(state, action.blockId, (r) => ({
          ...r,
          status: action.outcome === 'parcial' ? 'parcial' : 'completado',
          outcome: action.outcome,
          pendingNote: note,
        })),
        action.blockId,
      )
    }
    case 'reopen':
      return patch(state, action.blockId, (r) => ({ objective: r.objective }))
    case 'setObjective':
      return patch(state, action.blockId, (r) => ({ ...r, objective: action.objective }))
    case 'startFocus':
      return { ...state, focus: { blockId: action.blockId, startedAt: action.at } }
    case 'leaveFocus':
      return { ...state, focus: undefined }
    case 'moveMeditation':
      return { ...state, meditationMoved: true }
    case 'load':
      return action.state
  }
}
