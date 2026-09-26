import { describe, expect, it } from 'vitest'
import { monday } from '../data/routine/monday'
import { tuesday } from '../data/routine/tuesday'
import { wednesday } from '../data/routine/wednesday'
import { dayReducer, emptyDay } from '../state/dayReducer'
import { buildDayView } from './schedule'
import { toMinutes } from './time'
import type { DayState } from './types'

const TUESDAY = '2026-09-29'
const neighbours = { yesterday: monday, tomorrow: wednesday }
const at = (time: string, state: DayState = emptyDay(TUESDAY)) => buildDayView(tuesday, state, toMinutes(time), neighbours)

describe('buildDayView — martes', () => {
  it('10:14 → AHORA Páginas Web, SIGUIENTE Velocity, DESPUÉS Alimentación / recuperación', () => {
    const v = at('10:14')
    expect(v.current.id).toBe('tue-web-1000')
    expect([v.current.startMin, v.current.endMin]).toEqual([toMinutes('10:00'), toMinutes('12:00')])
    expect(v.current.status).toBe('activo')
    expect(v.next?.id).toBe('tue-velocity-1200')
    expect([v.next?.startMin, v.next?.endMin]).toEqual([toMinutes('12:00'), toMinutes('12:20')])
    expect(v.after?.id).toBe('tue-meal-1220')
    expect(v.after?.shortTitle).toBe('Alimentación / recuperación')
    expect([v.after?.startMin, v.after?.endMin]).toEqual([toMinutes('12:20'), toMinutes('14:00')])
    expect(v.energy).toBe('focus')
  })

  it('no objective is invented: deep blocks start without one', () => {
    expect(at('10:14').current.objective).toBeUndefined()
  })

  it.each([
    ['06:10', 'tue-merkaba-0600', 'activacion'],
    ['07:00', 'tue-transfer-0630', 'activacion'],
    ['08:26', 'tue-breathwork-0825', 'activacion'],
    ['08:31', 'tue-substack-0830', 'activacion'],
    ['12:05', 'tue-velocity-1200', 'recuperacion'],
    ['13:00', 'tue-meal-1220', 'recuperacion'],
    ['15:00', 'tue-wellness-1400', 'produccion'],
    ['17:00', 'tue-gym-1600', 'cuerpo'],
    ['19:30', 'tue-wellness-1900', 'segundo-pico'],
    ['21:00', 'tue-screens-off-2050', 'cierre'],
    ['21:50', 'tue-breathwork-relax-2145', 'cierre'],
    ['23:30', 'tue-sleep-2200', 'cierre'],
  ])('%s → %s (%s)', (time, id, energy) => {
    const v = at(time)
    expect(v.current.id).toBe(id)
    expect(v.energy).toBe(energy)
  })

  it('fills the 08:28–08:30 gap with a transition pointing at Substack', () => {
    const v = at('08:29')
    expect(v.current.synthetic).toBe(true)
    expect(v.current.category).toBe('transition')
    expect(v.current.focusEligible).toBe(false)
    expect(v.current.countsForProgress).toBe(false)
    expect(v.next?.id).toBe('tue-substack-0830')
  })

  it('path shows what is registered (plus the night); progress counts only countsForProgress', () => {
    const v = at('10:14')
    expect(v.path.map((b) => b.shortTitle ?? b.title)).toEqual([
      'Merkaba', 'Escritura', 'Breathwork', 'Substack', 'Inglés', 'Lectura', 'Páginas Web',
      'Velocity', 'Marca Wellness', 'Gimnasio', 'Marca Wellness', 'Breathwork relajante', 'Dormir',
    ])
    expect(v.progress.total).toBe(12)
    expect(v.path.every((b) => b.countsForProgress || b.category === 'sleep')).toBe(true)
  })

  it('past ≠ completed: passed blocks without a record are "sin registrar"; records win', () => {
    let s = emptyDay(TUESDAY)
    s = dayReducer(s, { type: 'complete', blockId: 'tue-merkaba-0600' })
    s = dayReducer(s, { type: 'skip', blockId: 'tue-english-0835' })
    const v = at('10:14', s)
    const byId = Object.fromEntries(v.timeline.map((b) => [b.id, b]))
    expect(byId['tue-writing-0800'].status).toBe('sin-registrar')
    expect(byId['tue-writing-0800'].record.status).toBeUndefined()
    expect(byId['tue-english-0835'].status).toBe('omitido')
    expect(byId['tue-web-1000'].status).toBe('activo')
    expect(byId['tue-velocity-1200'].status).toBe('proximo')
    expect(v.timeline.filter((b) => b.status === 'completado').map((b) => b.id)).toEqual(['tue-merkaba-0600'])
    expect(v.progress.done).toBe(1)
  })

  it('a whole day passed without records completes nothing', () => {
    const v = at('23:30')
    expect(v.progress.done).toBe(0)
    expect(v.timeline.some((b) => b.status === 'completado' || b.status === 'parcial')).toBe(false)
  })
})

describe('overnight — Dormir never breaks at midnight', () => {
  it('after 22:00 the night is AHORA and tomorrow’s first block is next', () => {
    const v = at('23:30')
    expect(v.current.id).toBe('tue-sleep-2200')
    expect(v.current.endMin).toBe(toMinutes('06:00') + 24 * 60)
    expect(v.nextIsTomorrow).toBe(true)
    expect(v.next?.id).toBe('wed-meditation-0600')
    expect(v.next?.startMin).toBe(toMinutes('06:00') + 24 * 60)
    expect(v.after).toBeUndefined()
  })

  it('after midnight it is still last night’s sleep, from yesterday’s routine', () => {
    const v = at('04:00')
    expect(v.current.id).toBe('mon-sleep-2200')
    expect(v.current.category).toBe('sleep')
    expect(v.current.startMin).toBe(toMinutes('22:00') - 24 * 60)
    expect(v.current.endMin).toBe(toMinutes('06:00'))
    expect(v.next?.id).toBe('tue-merkaba-0600')
    expect(v.nextIsTomorrow).toBe(false)
    expect(v.progress.done).toBe(0)
  })

  it('without neighbours it stays coherent: a distinct overnight id, no invented tomorrow', () => {
    const before = buildDayView(tuesday, emptyDay(TUESDAY), toMinutes('04:00'))
    expect(before.current.id).toBe('tue-sleep-2200-overnight')
    const after = buildDayView(tuesday, emptyDay(TUESDAY), toMinutes('23:00'))
    expect(after.next).toBeUndefined()
  })
})

describe('meditation exception (martes: Merkaba → Lectura 09:30)', () => {
  it('offers the rescue while the meditation is unresolved', () => {
    const v = at('07:10')
    expect(v.meditationPrompt?.rescue.id).toBe('tue-reading-0930')
    expect(v.timeline.find((b) => b.id === 'tue-merkaba-0600')?.status).toBe('proximo')
  })

  it('no prompt once it was completed or omitted', () => {
    const done = dayReducer(emptyDay(TUESDAY), { type: 'complete', blockId: 'tue-merkaba-0600' })
    expect(at('07:10', done).meditationPrompt).toBeUndefined()
    const skipped = dayReducer(emptyDay(TUESDAY), { type: 'skip', blockId: 'tue-merkaba-0600' })
    expect(at('07:10', skipped).meditationPrompt).toBeUndefined()
  })

  it('moving it replaces Lectura at 09:30 without rescheduling anything else', () => {
    const s = dayReducer(emptyDay(TUESDAY), { type: 'moveMeditation' })
    const v = at('09:40', s)
    expect(v.current.id).toBe('tue-merkaba-0600')
    expect(v.current.replaces).toBe('Lectura')
    expect(v.timeline.some((b) => b.id === 'tue-reading-0930')).toBe(false)
    expect(v.meditationPrompt).toBeUndefined()
    expect(v.path.map((b) => b.id).slice(0, 6)).toEqual([
      'tue-writing-0800', 'tue-breathwork-0825', 'tue-substack-0830', 'tue-english-0835', 'tue-merkaba-0600', 'tue-web-1000',
    ])
    expect(at('10:14', s).current.startMin).toBe(toMinutes('10:00'))
  })

  it('an unattended meditation counts as skipped after the rescue window', () => {
    const v = at('10:14')
    expect(v.meditationPrompt).toBeUndefined()
    expect(v.timeline.find((b) => b.id === 'tue-merkaba-0600')?.status).toBe('omitido')
  })
})

describe('focus + closing', () => {
  it('focus marks the block en-focus; closing partial stores the note', () => {
    let s = dayReducer(emptyDay(TUESDAY), { type: 'startFocus', blockId: 'tue-web-1000', at: 0 })
    expect(at('10:30', s).current.status).toBe('en-focus')
    s = dayReducer(s, { type: 'close', blockId: 'tue-web-1000', outcome: 'parcial', note: '  Falta el footer ' })
    expect(s.focus).toBeUndefined()
    const block = at('10:30', s).current
    expect(block.status).toBe('parcial')
    expect(block.record.pendingNote).toBe('Falta el footer')
    // Nothing is rescheduled.
    expect(at('14:30', s).current.id).toBe('tue-wellness-1400')
  })

  it('closing with "no" keeps the block completed with its outcome', () => {
    const s = dayReducer(emptyDay(TUESDAY), { type: 'close', blockId: 'tue-web-1000', outcome: 'no' })
    const block = at('10:30', s).current
    expect(block.status).toBe('completado')
    expect(block.record.outcome).toBe('no')
  })

  it('objectives are stored per date + block, editable and clearable', () => {
    let s = dayReducer(emptyDay(TUESDAY), { type: 'setObjective', blockId: 'tue-wellness-1400', objective: 'Naming v1' })
    expect(at('14:10', s).current.objective).toBe('Naming v1')
    s = dayReducer(s, { type: 'setObjective', blockId: 'tue-web-1000', objective: '' })
    expect(at('10:10', s).current.objective).toBeUndefined()
  })

  it('only Focus-eligible blocks carry an objective', () => {
    const s = dayReducer(emptyDay(TUESDAY), { type: 'setObjective', blockId: 'tue-english-0835', objective: 'x' })
    expect(at('08:40', s).current.objective).toBeUndefined()
  })

  it('reopen undoes a resolution but keeps the objective', () => {
    let s = dayReducer(emptyDay(TUESDAY), { type: 'setObjective', blockId: 'tue-wellness-1400', objective: 'Naming v1' })
    s = dayReducer(s, { type: 'skip', blockId: 'tue-wellness-1400' })
    s = dayReducer(s, { type: 'reopen', blockId: 'tue-wellness-1400' })
    const block = at('14:10', s).current
    expect(block.status).toBe('activo')
    expect(block.objective).toBe('Naming v1')
  })
})
