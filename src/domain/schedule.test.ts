import { describe, expect, it } from 'vitest'
import { tuesday } from '../data/routines/tuesday'
import { dayReducer, emptyDay } from '../state/dayReducer'
import { buildDayView } from './schedule'
import { toMinutes } from './time'
import type { DayState } from './types'

const at = (time: string, state: DayState = emptyDay('2026-09-22')) =>
  buildDayView(tuesday, state, toMinutes(time))

describe('buildDayView — martes', () => {
  it('10:14 → Páginas Web is now, Velocity next, Marca Wellness after', () => {
    const v = at('10:14')
    expect(v.current.id).toBe('paginas-web')
    expect(v.current.status).toBe('activo')
    expect(v.current.objective).toBe('Terminar estructura de Landing V1')
    expect(v.next?.id).toBe('velocity')
    expect(v.after?.id).toBe('wellness-1')
    expect(v.energy).toBe('focus')
  })

  it.each([
    ['06:10', 'merkaba', 'activacion'],
    ['07:00', 'hermana', 'activacion'],
    ['08:26', 'breathwork-am', 'activacion'],
    ['08:31', 'substack', 'activacion'],
    ['12:05', 'velocity', 'recuperacion'],
    ['13:00', 'alimentacion', 'recuperacion'],
    ['15:00', 'wellness-1', 'produccion'],
    ['17:00', 'gimnasio', 'cuerpo'],
    ['19:30', 'wellness-2', 'segundo-pico'],
    ['21:00', 'cierre-digital', 'cierre'],
    ['21:50', 'breathwork-pm', 'cierre'],
    ['23:30', 'dormir', 'cierre'],
  ])('%s → %s (%s)', (time, id, energy) => {
    const v = at(time)
    expect(v.current.id).toBe(id)
    expect(v.energy).toBe(energy)
  })

  it('fills the 08:28–08:30 gap with a transition pointing at Substack', () => {
    const v = at('08:29')
    expect(v.current.synthetic).toBe(true)
    expect(v.current.kind).toBe('transition')
    expect(v.next?.id).toBe('substack')
  })

  it('before 06:00 it is still last night; next is Merkaba', () => {
    const v = at('04:00')
    expect(v.current.kind).toBe('sleep')
    expect(v.next?.id).toBe('merkaba')
    expect(v.nextIsTomorrow).toBe(false)
    expect(v.progress.done).toBe(0)
  })

  it('after 22:00 the next block is tomorrow', () => {
    const v = at('22:30')
    expect(v.nextIsTomorrow).toBe(true)
  })

  it('path hides transitions and counts progress without sleep', () => {
    const v = at('10:14')
    expect(v.path.map((b) => b.shortTitle ?? b.title)).toEqual([
      'Merkaba', 'Escritura', 'Breathwork', 'Substack', 'Inglés', 'Lectura', 'Páginas Web',
      'Velocity', 'Marca Wellness', 'Gimnasio', 'Marca Wellness', 'Cierre digital', 'Breathwork', 'Dormir',
    ])
    expect(v.progress.total).toBe(13)
  })

  it('past blocks are assumed completed; explicit records win', () => {
    let s = emptyDay('2026-09-22')
    s = dayReducer(s, { type: 'complete', blockId: 'merkaba' })
    s = dayReducer(s, { type: 'skip', blockId: 'ingles' })
    const v = at('10:14', s)
    const byId = Object.fromEntries(v.path.map((b) => [b.id, b]))
    expect(byId.escritura.status).toBe('completado')
    expect(byId.escritura.implicit).toBe(true)
    expect(byId.ingles.status).toBe('omitido')
    expect(byId['paginas-web'].status).toBe('activo')
    expect(byId.velocity.status).toBe('proximo')
    expect(v.progress.done).toBe(5)
  })
})

describe('meditation exception', () => {
  it('offers the rescue while the meditation is unresolved', () => {
    const v = at('07:10')
    expect(v.meditationPrompt?.rescue.id).toBe('lectura')
    expect(v.path.find((b) => b.id === 'merkaba')?.status).toBe('proximo')
  })

  it('no prompt once it was completed or omitted', () => {
    const done = dayReducer(emptyDay('d'), { type: 'complete', blockId: 'merkaba' })
    expect(at('07:10', done).meditationPrompt).toBeUndefined()
    const skipped = dayReducer(emptyDay('d'), { type: 'skip', blockId: 'merkaba' })
    expect(at('07:10', skipped).meditationPrompt).toBeUndefined()
  })

  it('moving it replaces Lectura at 09:30 without rescheduling Lectura', () => {
    const s = dayReducer(emptyDay('d'), { type: 'moveMeditation' })
    const v = at('09:40', s)
    expect(v.current.id).toBe('merkaba')
    expect(v.current.replaces).toBe('Lectura')
    expect(v.timeline.some((b) => b.id === 'lectura')).toBe(false)
    expect(v.meditationPrompt).toBeUndefined()
    expect(v.path.map((b) => b.id).slice(0, 6)).toEqual([
      'escritura', 'breathwork-am', 'substack', 'ingles', 'merkaba', 'paginas-web',
    ])
  })

  it('an unattended meditation counts as skipped after the rescue window', () => {
    const v = at('10:14')
    expect(v.meditationPrompt).toBeUndefined()
    expect(v.path.find((b) => b.id === 'merkaba')?.status).toBe('omitido')
  })
})

describe('focus + closing', () => {
  it('focus marks the block en-focus; closing partial stores the note', () => {
    let s = dayReducer(emptyDay('d'), { type: 'startFocus', blockId: 'paginas-web', at: 0 })
    expect(at('10:30', s).current.status).toBe('en-focus')
    s = dayReducer(s, { type: 'close', blockId: 'paginas-web', outcome: 'parcial', note: '  Falta el footer ' })
    expect(s.focus).toBeUndefined()
    const block = at('10:30', s).current
    expect(block.status).toBe('parcial')
    expect(block.record.pendingNote).toBe('Falta el footer')
    // Nothing is rescheduled.
    expect(at('14:30', s).current.id).toBe('wellness-1')
  })

  it('closing with "no" keeps the block completed with its outcome', () => {
    const s = dayReducer(emptyDay('d'), { type: 'close', blockId: 'paginas-web', outcome: 'no' })
    const block = at('10:30', s).current
    expect(block.status).toBe('completado')
    expect(block.record.outcome).toBe('no')
  })

  it('objectives are editable and can be cleared', () => {
    let s = dayReducer(emptyDay('d'), { type: 'setObjective', blockId: 'wellness-1', objective: 'Naming v1' })
    expect(at('14:10', s).current.objective).toBe('Naming v1')
    s = dayReducer(s, { type: 'setObjective', blockId: 'paginas-web', objective: '' })
    expect(at('10:10', s).current.objective).toBeUndefined()
  })

  it('reopen undoes a resolution but keeps the objective', () => {
    let s = dayReducer(emptyDay('d'), { type: 'setObjective', blockId: 'wellness-1', objective: 'Naming v1' })
    s = dayReducer(s, { type: 'skip', blockId: 'wellness-1' })
    s = dayReducer(s, { type: 'reopen', blockId: 'wellness-1' })
    const block = at('14:10', s).current
    expect(block.status).toBe('activo')
    expect(block.objective).toBe('Naming v1')
  })
})
