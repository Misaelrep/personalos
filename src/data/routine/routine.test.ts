import { describe, expect, it } from 'vitest'
import { buildDayscape } from '../../features/dayscape/model'
import { RoutineMissingError, resolveDay, shiftDateKey, validateWeek, weekdayOf, type ResolveConfig } from '../../domain/routine'
import { buildDayView } from '../../domain/schedule'
import { toMinutes } from '../../domain/time'
import type { DayRoutine, RoutineBlock, Weekday } from '../../domain/types'
import { emptyDay } from '../../state/dayReducer'
import { SUNDAY_ROTATION, SUNDAY_ROTATION_ANCHOR, THURSDAYS_WITHOUT_GYM } from './config'
import { RESOLVE_CONFIG, SUNDAY_DEEP_ROTATION, WEEKLY_ROUTINE, routineForDate } from './index'
import { ROUTINE_RULES } from './rules'
import { sundayDeepRotation } from './sunday'
import { THURSDAY_WITHOUT_GYM } from './thursday'

/** A reference week: Monday 2026-09-28 … Sunday 2026-10-04. */
const DATE: Record<string, string> = {
  mon: '2026-09-28',
  tue: '2026-09-29',
  wed: '2026-09-30',
  thu: '2026-10-01',
  fri: '2026-10-02',
  sat: '2026-10-03',
  sun: '2026-10-04',
}

/** HOY as the app builds it: the date's routine with its neighbours. */
function viewAt(date: string, time: string) {
  const now = toMinutes(time)
  return buildDayView(routineForDate(date).routine, emptyDay(date), now, {
    yesterday: routineForDate(shiftDateKey(date, -1)).routine,
    tomorrow: routineForDate(shiftDateKey(date, 1)).routine,
  })
}

const day = (w: Weekday) => WEEKLY_ROUTINE[w] as DayRoutine
const range = (b: RoutineBlock) => `${b.start}–${b.end ?? ''}`
const allBlocks = () => ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).flatMap((w) => day(w).blocks)

describe('RUTINA MAESTRA V3 — one source of truth', () => {
  it('defines all seven days, consistently', () => {
    expect(validateWeek(WEEKLY_ROUTINE)).toEqual([])
    for (const [key, date] of Object.entries(DATE)) {
      const { routine } = routineForDate(date)
      expect(routine.weekday).toBe(weekdayOf(date))
      expect(routine.blocks[0].id.startsWith(key)).toBe(true)
    }
  })

  it('stable, readable ids', () => {
    const ids = new Set(allBlocks().map((b) => b.id))
    for (const id of ['mon-meditation-0600', 'tue-web-1000', 'wed-wellness-1000', 'fri-introspection-2030', 'sat-touchdesigner-1200', 'sun-wellness-1700']) {
      expect(ids.has(id)).toBe(true)
    }
    expect(ids.size).toBe(allBlocks().length)
  })

  it('every date resolves to its own weekday — eight weeks, no fallback', () => {
    for (let i = 0; i < 56; i++) {
      const date = shiftDateKey(DATE.mon, i)
      expect(routineForDate(date).routine.weekday).toBe(weekdayOf(date))
    }
  })
})

describe('§31 — each day resolves AHORA from the routine', () => {
  it.each([
    ['mon', '10:30', 'mon-wellness-1000', 'Nueva Marca Wellness'],
    ['tue', '10:14', 'tue-web-1000', 'Páginas Web'],
    ['wed', '14:30', 'wed-web-1400', 'Páginas Web'],
    ['thu', '14:00', 'thu-free-1200', 'Regeneración / libre'],
    ['fri', '08:30', 'fri-web-0800', 'Páginas Web'],
    ['sat', '12:30', 'sat-touchdesigner-1200', 'TouchDesigner'],
    ['sat', '13:35', 'sat-finances-1330', 'Finanzas personales'],
    ['sun', '11:00', 'sun-gym-1030', 'Gimnasio'],
    ['sun', '17:30', 'sun-wellness-1700', 'Nueva Marca Wellness'],
    ['sun', '19:15', 'sun-rest-1900', 'Descanso'],
    ['sun', '20:00', 'sun-wellness-1930', 'Nueva Marca Wellness'],
  ])('%s %s → %s', (key, time, id, title) => {
    const v = viewAt(DATE[key], time)
    expect(v.current.id).toBe(id)
    expect(v.current.title).toBe(title)
  })

  it('Saturday 12:30 carries Biotron only as the secondary option', () => {
    const v = viewAt(DATE.sat, '12:30')
    expect(v.current.secondaryOption?.title).toBe('Biotron')
    expect(v.current.focusEligible).toBe(true)
    expect(v.current.descriptor).toBe('Práctica técnica / creativa')
  })
})

describe('§35 — DAYSCAPE, HOY and FOCUS agree on the present', () => {
  const moments = Object.entries(DATE).flatMap(([key, date]) =>
    ['04:30', '06:10', '08:29', '10:30', '12:30', '13:35', '14:30', '17:30', '19:15', '20:00', '21:50', '23:00'].map((t) => [key, date, t]),
  )
  it.each(moments)('%s %s %s', (_key, date, time) => {
    const v = viewAt(date, time)
    const scape = buildDayscape(v, toMinutes(time))
    expect(scape.current.id).toBe(v.current.id)
    expect(scape.current.title).toBe(v.current.title)
    expect(scape.current.startMin).toBe(v.current.startMin)
    // Focus opens exactly the block HOY shows, and only when it is deep production.
    const focusable = v.timeline.find((b) => b.id === v.current.id)?.focusEligible ?? false
    expect(focusable).toBe(v.current.focusEligible)
  })
})

describe('Focus and progress follow the category', () => {
  it('Focus only for deep production: Web, Wellness, Newsletter, TouchDesigner (and Sunday’s rotating deep block)', () => {
    const focus = allBlocks().filter((b) => b.focusEligible)
    for (const b of focus) {
      const rotating = b.metadata?.rotation === SUNDAY_DEEP_ROTATION.id
      expect(rotating || ROUTINE_RULES.deepProjects.includes(b.project!)).toBe(true)
      expect(['deep_work', 'creative_practice']).toContain(b.category)
    }
    const never = /Llevar|Desayuno|Comida|Alimentación|Recuperación|Descanso|Gimnasio|Meditación|Merkaba|Breathwork|Dormir|Pausa|Cierre|Pantallas|Transición|Preparación|Caminata|Correo|Finanzas|Velocity|AI Polaris/
    for (const b of allBlocks().filter((x) => never.test(x.title))) expect(b.focusEligible, b.id).toBe(false)
  })

  it('transfers, meals, recovery, free time, transitions and sleep never count', () => {
    for (const b of allBlocks()) {
      if (['transition', 'recovery', 'free', 'sleep'].includes(b.category)) expect(b.countsForProgress, b.id).toBe(false)
    }
    const gap = viewAt(DATE.tue, '08:29').current
    expect(gap.synthetic && !gap.countsForProgress && !gap.focusEligible).toBe(true)
  })

  it('HOY offers Focus exactly where the block is focusEligible', () => {
    expect(viewAt(DATE.tue, '10:14').current.focusEligible).toBe(true)
    expect(viewAt(DATE.sun, '11:00').current.focusEligible).toBe(false)
    expect(viewAt(DATE.fri, '10:10').current.focusEligible).toBe(false)
    expect(viewAt(DATE.thu, '14:00').current.focusEligible).toBe(false)
  })
})

describe('global rules', () => {
  it('sleep at 22:00 closes every day; the day opens with meditation at 06:00 (Tuesday: Merkaba)', () => {
    for (const w of [0, 1, 2, 3, 4, 5, 6] as Weekday[]) {
      const blocks = day(w).blocks
      expect(blocks.at(-1)).toMatchObject({ start: '22:00', category: 'sleep' })
      expect(blocks[0]).toMatchObject({ start: '06:00', end: '06:30', category: 'ritual' })
      expect(blocks[0].title).toBe(w === 2 ? 'Merkaba' : 'Meditación')
    }
  })

  it('Breathwork relajante at 21:45 every day except Saturday; energizante is 3 min at 08:25', () => {
    for (const w of [0, 1, 2, 3, 4, 5, 6] as Weekday[]) {
      const relax = day(w).blocks.find((b) => b.title === 'Breathwork relajante')
      if (w === 6) expect(relax).toBeUndefined()
      else expect(relax && range(relax)).toBe('21:45–22:00')
    }
    for (const b of allBlocks().filter((x) => x.title === 'Breathwork energizante')) expect(range(b)).toBe('08:25–08:28')
  })

  it('Substack is published Mon, Tue, Wed and Sat — never Friday, never invented on Thu/Sun', () => {
    const publishing = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((w) =>
      day(w).blocks.some((b) => b.project === 'substack' && b.metadata?.publication === true),
    )
    expect(publishing).toEqual([1, 2, 3, 6])
    expect(publishing).toEqual(ROUTINE_RULES.substackPublishDays)
    expect(day(5).blocks.find((b) => b.id === 'fri-newsletter-1400')?.metadata?.publication).toBe(false)
  })

  it('gym: Mon–Thu 16–18, Fri 18–20, Sun 10:30–12:30, never Saturday', () => {
    const gym = (w: Weekday) => day(w).blocks.filter((b) => b.title === 'Gimnasio').map(range)
    expect([1, 2, 3, 4].map((w) => gym(w as Weekday))).toEqual([['16:00–18:00'], ['16:00–18:00'], ['16:00–18:00'], ['16:00–18:00']])
    expect(gym(5)).toEqual(['18:00–20:00'])
    expect(gym(6)).toEqual([])
    expect(gym(0)).toEqual(['10:30–12:30'])
  })

  it('AI Polaris: ~1 h inside Wellness on Mon and Wed, its own block Fri 10:00–10:20, nowhere else', () => {
    for (const w of [1, 3] as Weekday[]) {
      const wellness = day(w).blocks.find((b) => b.start === '10:00')!
      expect(wellness).toMatchObject({ project: 'wellness', end: '12:00', focusEligible: true })
      expect(wellness.includes).toEqual([{ title: 'AI Polaris', minutes: 60, project: 'polaris' }])
    }
    const own = allBlocks().filter((b) => b.project === 'polaris')
    expect(own.map((b) => `${b.id} ${range(b)}`)).toEqual(['fri-polaris-1000 10:00–10:20'])
  })

  it('SIN INPUTS 06:00–12:00 is informative; Sunday’s email 08:30–09:30 is the exception', () => {
    expect(ROUTINE_RULES.noInputs).toMatchObject({ from: '06:00', to: '12:00' })
    const email = day(0).blocks.find((b) => b.id === 'sun-email-0830')!
    expect(range(email)).toBe('08:30–09:30')
  })
})

describe('Thursday — regeneration', () => {
  const thu = day(4)

  it('no projects, no deep work, no Focus, no invented placeholders', () => {
    expect(thu.blocks.filter((b) => b.project)).toEqual([])
    expect(thu.blocks.filter((b) => b.focusEligible || b.category === 'deep_work')).toEqual([])
    expect(thu.blocks.some((b) => /PROTEGE|Derecho|Correo|Jets|Substack|Inglés/.test(b.title))).toBe(false)
    const free = thu.blocks.filter((b) => b.category === 'free')
    expect(free.every((b) => !b.countsForProgress && !b.defaultObjective)).toBe(true)
    expect(free.map((b) => toMinutes(b.end!) - toMinutes(b.start))).toEqual([210, 240, 170])
  })

  it('is the least dense day', () => {
    const counts = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((w) => day(w).blocks.length)
    expect(Math.min(...counts)).toBe(thu.blocks.length)
  })

  it('the monthly Thursday without gym is an override on explicit dates — none decided yet', () => {
    expect(THURSDAYS_WITHOUT_GYM).toEqual([])
    expect(routineForDate(DATE.thu).routine.blocks.some((b) => b.id === 'thu-gym-1600')).toBe(true)
    const config: ResolveConfig = { rotations: [], overrides: (d) => (d === DATE.thu ? [{ source: 'monthlyThursdayNoGym', override: THURSDAY_WITHOUT_GYM }] : []) }
    const { routine, notes } = resolveDay(WEEKLY_ROUTINE, DATE.thu, config)
    expect(routine.blocks.some((b) => b.category === 'body')).toBe(false)
    expect(routine.blocks.find((b) => b.id === 'thu-free-1200')).toMatchObject({ start: '12:00', end: '20:50' })
    expect(notes).toEqual([{ kind: 'override', source: 'monthlyThursdayNoGym' }])
    expect(validateWeek({ ...WEEKLY_ROUTINE, 4: routine })).toEqual([])
    // Only that date changes.
    expect(resolveDay(WEEKLY_ROUTINE, shiftDateKey(DATE.thu, 7), config).routine.blocks.some((b) => b.id === 'thu-gym-1600')).toBe(true)
  })
})

describe('Saturday — creative maximum', () => {
  const sat = day(6)

  it('TouchDesigner 12:00–13:20 is one primary block; Biotron is only its secondary option', () => {
    const td = sat.blocks.filter((b) => b.start >= '12:00' && b.start < '13:20')
    expect(td).toHaveLength(1)
    expect(td[0]).toMatchObject({ id: 'sat-touchdesigner-1200', end: '13:20', project: 'touchdesigner', focusEligible: true })
    expect(td[0].secondaryOption).toMatchObject({ title: 'Biotron', project: 'biotron' })
    expect(allBlocks().some((b) => b.project === 'biotron' || /Biotron/.test(b.title))).toBe(false)
  })

  it('DAYSCAPE draws one object for it, the main one', () => {
    const v = viewAt(DATE.sat, '12:30')
    const scape = buildDayscape(v, toMinutes('12:30'))
    const inWindow = scape.activities.filter((a) => a.startMin >= toMinutes('12:00') && a.startMin < toMinutes('13:20'))
    expect(inWindow.map((a) => a.id)).toEqual(['sat-touchdesigner-1200'])
    expect(scape.current).toMatchObject({ id: 'sat-touchdesigner-1200', role: 'major' })
    expect(scape.current.alternative).toBe('Alternativa: Biotron · sesión creativa / experimentación')
  })

  it('Finanzas personales 13:30–13:45 lasts 15 minutes', () => {
    const f = sat.blocks.find((b) => b.id === 'sat-finances-1330')!
    expect(toMinutes(f.end!) - toMinutes(f.start)).toBe(15)
  })
})

describe('Sunday — depth', () => {
  it('17:00–21:00 is one deep period with a single rest at 19:00–19:30', () => {
    const v = viewAt(DATE.sun, '12:00')
    const window = v.timeline.filter((b) => b.startMin >= toMinutes('17:00') && b.startMin < toMinutes('21:00'))
    expect(window.map((b) => `${b.id} ${b.category}`)).toEqual([
      'sun-wellness-1700 deep_work',
      'sun-rest-1900 recovery',
      'sun-wellness-1930 deep_work',
    ])
  })

  it('an unset anchor would leave the block neutral — nothing invented', () => {
    const config: ResolveConfig = { ...RESOLVE_CONFIG, rotations: [{ rotation: SUNDAY_DEEP_ROTATION, anchor: null }] }
    const { routine, notes } = resolveDay(WEEKLY_ROUTINE, DATE.sun, config)
    const block = routine.blocks.find((b) => b.id === 'sun-rotation-1300')!
    expect(block.project).toBeUndefined()
    expect(block.descriptor).toBe('Variante de esta semana sin definir')
    expect(notes).toEqual([{ kind: 'rotation-unresolved', rotation: 'sunday-deep', blockId: 'sun-rotation-1300' }])
  })
})

describe('V3.1 — Sunday 13:00–16:00 rotation, anchored', () => {
  const rotating = (date: string) => routineForDate(date).routine.blocks.find((b) => b.id === 'sun-rotation-1300')!

  it('anchor 2026-09-27 = Newsletter, then alternating Newsletter ⇄ Páginas Web', () => {
    expect(SUNDAY_ROTATION_ANCHOR).toBe('2026-09-27')
    expect(SUNDAY_ROTATION).toEqual(['newsletter', 'web'])
    expect(routineForDate('2026-09-27').notes).toEqual([{ kind: 'rotation', rotation: 'sunday-deep', variant: 'newsletter' }])
  })

  // §6 — AHORA at 13:30, and DAYSCAPE = HOY = FOCUS on the resolved variant.
  it.each([
    ['2026-09-27', 'Newsletter', 'newsletter'],
    ['2026-10-04', 'Páginas Web', 'web'],
    ['2026-10-11', 'Newsletter', 'newsletter'],
    ['2026-10-18', 'Páginas Web', 'web'],
  ])('%s 13:30 → AHORA %s', (date, title, project) => {
    const v = viewAt(date, '13:30')
    expect(v.current).toMatchObject({
      id: 'sun-rotation-1300',
      title,
      descriptor: 'Trabajo profundo',
      project,
      category: 'deep_work',
      focusEligible: true,
      dayscapeRole: 'major',
      startMin: toMinutes('13:00'),
      endMin: toMinutes('16:00'),
    })
    const scape = buildDayscape(v, toMinutes('13:30'))
    expect(scape.current).toMatchObject({ id: v.current.id, title, natureLabel: 'Trabajo profundo', role: 'major' })
    // FOCUS opens the block HOY shows: same id, same title, eligible.
    const focus = v.timeline.find((b) => b.id === v.current.id)!
    expect([focus.title, focus.focusEligible]).toEqual([title, true])
  })

  it('resolved Sundays never read "rotativo" or "sin definir"', () => {
    for (let i = -8; i <= 8; i++) {
      const b = rotating(shiftDateKey('2026-09-27', 7 * i))
      const text = [b.title, b.shortTitle, b.subtitle, b.descriptor].join(' ')
      expect(text).not.toMatch(/rotativo|sin definir/i)
    }
  })

  // §7 — before the anchor: no negative-modulo failure, the alternation continues backwards.
  it.each([
    ['2026-09-20', 'Páginas Web'],
    ['2026-09-13', 'Newsletter'],
    ['2025-12-28', 'Páginas Web'],
    ['2025-12-21', 'Newsletter'],
  ])('%s (before the anchor) → %s', (date, title) => {
    expect(rotating(date).title).toBe(title)
  })

  it('same block id every week: records stay attached to date + block', () => {
    expect(new Set(['2026-09-27', '2026-10-04'].map((d) => rotating(d).id))).toEqual(new Set(['sun-rotation-1300']))
  })

  it('swapping the order in config inverts the cycle', () => {
    const inverted: ResolveConfig = {
      ...RESOLVE_CONFIG,
      rotations: [{ rotation: sundayDeepRotation(['web', 'newsletter']), anchor: '2026-09-27' }],
    }
    const title = (date: string) => resolveDay(WEEKLY_ROUTINE, date, inverted).routine.blocks.find((b) => b.id === 'sun-rotation-1300')!.title
    expect([title('2026-09-27'), title('2026-10-04')]).toEqual(['Páginas Web', 'Newsletter'])
  })
})

describe('V3.1 — Breathwork energizante only where scheduled', () => {
  const energizing = (date: string) => routineForDate(date).routine.blocks.filter((b) => b.title === 'Breathwork energizante')

  it('scheduled Mon, Tue, Wed, Thu and Sun — not Fri, not Sat — and the rule says so', () => {
    const days = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((w) => day(w).blocks.some((b) => b.title === 'Breathwork energizante'))
    expect(days).toEqual([0, 1, 2, 3, 4])
    expect(ROUTINE_RULES.breathworkEnergizing.scheduledDays).toEqual(days)
    expect(ROUTINE_RULES.breathworkEnergizing).toMatchObject({ at: '08:25', minutes: 3 })
  })

  it('Friday 08:25: Páginas Web runs 08:00–10:00 uninterrupted', () => {
    expect(energizing(DATE.fri)).toEqual([])
    const v = viewAt(DATE.fri, '08:25')
    expect(v.current).toMatchObject({ id: 'fri-web-0800', startMin: toMinutes('08:00'), endMin: toMinutes('10:00') })
    expect(viewAt(DATE.fri, '08:30').current.title).toBe('Páginas Web')
  })

  it('Saturday 08:25: no Breathwork added — Inglés has ended, Substack is next', () => {
    expect(energizing(DATE.sat)).toEqual([])
    const v = viewAt(DATE.sat, '08:25')
    expect(v.current.title).not.toMatch(/Breathwork/)
    expect(v.next?.id).toBe('sat-substack-0830')
  })

  it('Sunday 08:25: Breathwork energizante', () => {
    expect(viewAt(DATE.sun, '08:25').current).toMatchObject({ id: 'sun-breathwork-0825', title: 'Breathwork energizante' })
  })
})

describe('no fallback', () => {
  it('a missing day is a clear error, never another day', () => {
    const { 3: _wednesday, ...rest } = WEEKLY_ROUTINE
    expect(() => resolveDay(rest, DATE.wed, RESOLVE_CONFIG)).toThrow(RoutineMissingError)
    expect(() => resolveDay(rest, DATE.wed, RESOLVE_CONFIG)).toThrow(/wed.*2026-09-30/)
    expect(() => resolveDay({ ...WEEKLY_ROUTINE, 3: { ...day(3), blocks: [] } }, DATE.wed, RESOLVE_CONFIG)).toThrow(RoutineMissingError)
    expect(validateWeek(rest)).toContain('wed: missing day')
  })

  it('validation names what would make views disagree', () => {
    const broken: DayRoutine = {
      ...day(1),
      blocks: day(1).blocks.map((b) =>
        b.id === 'mon-gym-1600' ? { ...b, focusEligible: true } : b.id === 'mon-recovery-1800' ? { ...b, countsForProgress: true, id: 'mon-recovery-1801' } : b,
      ),
    }
    const issues = validateWeek({ ...WEEKLY_ROUTINE, 1: broken })
    expect(issues).toContain('mon-gym-1600: Focus on a body block')
    expect(issues).toContain('mon-recovery-1801: recovery never counts for progress')
    expect(issues).toContain('mon-recovery-1801: id time ≠ start 18:00')
  })
})
