import { describe, expect, it } from 'vitest'
import { ENTER_SECONDS, LIVE_SECONDS, advanceSeen, learnAtmosphere, type Seen } from './atmosphere'
import { LEARN_THEMES } from './themes'

describe('what the shared Atmosphere is given', () => {
  it('APRENDER’s own preset, in the "flow" scene (HOY’s light system stays out)', () => {
    for (const id of ['learn-day', 'learn-sunset', 'learn-night'] as const) {
      const props = learnAtmosphere(id, false)
      expect(props.preset).toBe(LEARN_THEMES[id].atmosphere)
      expect(props.scene).toBe('flow')
    }
  })

  it('arriving is quick; a change in front of the person is slow and soft', () => {
    expect(learnAtmosphere('learn-day', false).duration).toBe(ENTER_SECONDS)
    expect(learnAtmosphere('learn-day', true).duration).toBe(LIVE_SECONDS)
    expect(LIVE_SECONDS).toBeGreaterThan(ENTER_SECONDS * 2)
  })

  it('the preset is the same object every time, so the Atmosphere does not re-apply it on every render', () => {
    expect(learnAtmosphere('learn-night', false).preset).toBe(learnAtmosphere('learn-night', true).preset)
  })
})

describe('advanceSeen — has the atmosphere changed while APRENDER was open?', () => {
  it('closed: nothing is remembered', () => {
    expect(advanceSeen(null, false, 'learn-day')).toBeNull()
    expect(advanceSeen({ id: 'learn-day', live: true }, false, 'learn-day')).toBeNull()
  })

  it('opening: what it opens with is not a change', () => {
    expect(advanceSeen(null, true, 'learn-sunset')).toEqual({ id: 'learn-sunset', live: false })
  })

  it('the same atmosphere keeps the very same state (no re-render loop)', () => {
    const seen: Seen = { id: 'learn-day', live: false }
    expect(advanceSeen(seen, true, 'learn-day')).toBe(seen)
  })

  it('crossing a boundary while open: it is live, and stays live (day → sunset → night)', () => {
    const a = advanceSeen({ id: 'learn-day', live: false }, true, 'learn-sunset')
    expect(a).toEqual({ id: 'learn-sunset', live: true })
    expect(advanceSeen(a, true, 'learn-sunset')).toBe(a)
    expect(advanceSeen(a, true, 'learn-night')).toEqual({ id: 'learn-night', live: true })
  })

  it('leaving and coming back is an arrival again', () => {
    const closed = advanceSeen({ id: 'learn-sunset', live: true }, false, 'learn-sunset')
    expect(advanceSeen(closed, true, 'learn-sunset')).toEqual({ id: 'learn-sunset', live: false })
  })
})
