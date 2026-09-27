import { describe, expect, it } from 'vitest'
import { routineForDate } from '../../data/routine'
import { buildWeek } from '../../domain/week'
import { buildDayscape } from '../dayscape/model'
import { viewForDate } from './dayView'
import { archipelago, fibers, lensForm, FIBER_PAIRS } from './geometry'
import { WEEK_FLOW_START, weekFlow, type WeekFlowAction, type WeekFlowState } from './weekFlow'

const week = buildWeek('2026-09-30', routineForDate)
const forms = week.days.map((d, i) => lensForm(d, i))
const run = (actions: WeekFlowAction[], from: WeekFlowState = WEEK_FLOW_START) => actions.reduce(weekFlow, from)
const SAT = 5

describe('SEMANA: load lives in the glass, not in its size', () => {
  it('the seven share one scale', () => {
    const widths = forms.map((f) => f.widthK)
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.2)
  })

  it('Thursday is clear and hollow: the thinnest, clearest glass, almost no matter, a strong optical ring', () => {
    const thu = forms[3]
    for (const f of forms.filter((_, i) => i !== 3)) {
      expect(thu.thickness).toBeLessThan(f.thickness)
      expect(thu.frost).toBeLessThan(f.frost)
      expect(thu.fog).toBeLessThan(f.fog)
      expect(thu.ring).toBeGreaterThan(f.ring)
    }
    // Visible, not tiny.
    expect(thu.widthK).toBeGreaterThanOrEqual(1)
  })

  it('Saturday is the densest: thickest, most frosted, the most interior fog — not the biggest', () => {
    const sat = forms[SAT]
    for (const f of forms.filter((_, i) => i !== SAT)) {
      expect(sat.thickness).toBeGreaterThanOrEqual(f.thickness - 0.016) // Sunday's length adds a little edge
      expect(sat.fog).toBeGreaterThan(f.fog)
      expect(sat.frost).toBeGreaterThan(f.frost)
    }
    expect(sat.widthK).toBeLessThan(forms[6].widthK)
  })

  it('Sunday is longer and deeper: elongated, with one continuous interior', () => {
    const sun = forms[6]
    expect(sun.widthK).toBe(Math.max(...forms.map((f) => f.widthK)))
    expect(sun.aspect).toBe(Math.min(...forms.map((f) => f.aspect)))
    expect(sun.depth).toBeGreaterThan(0)
    expect(forms.filter((f) => f.depth > 0)).toHaveLength(1)
    expect(sun.fog).toBeLessThan(forms[SAT].fog)
  })

  it('HOY, past and future come from the date', () => {
    expect(forms.map((f) => f.tense)).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future'])
  })
})

describe('SEMANA: an archipelago, never a row, a column or a list', () => {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    it(`${w} × ${h}: no two days share a line; the order still reads`, () => {
      const a = archipelago(w, h)
      const xs = a.items.map((p) => p.x)
      const ys = a.items.map((p) => p.y)
      const main = a.mobile ? ys : xs
      const cross = a.mobile ? xs : ys
      // The week still reads Monday → Sunday along one axis…
      for (let i = 1; i < 7; i++) expect(main[i]).toBeGreaterThan(main[i - 1])
      // …but consecutive days always swing across the other.
      for (let i = 1; i < 7; i++) expect(Math.abs(cross[i] - cross[i - 1])).toBeGreaterThan((a.mobile ? w : h) * 0.2)
      expect(new Set(a.items.map((p) => p.z.toFixed(2))).size).toBeGreaterThan(4)
    })
  }

  it('the light network joins neighbours and two long arcs — never all-to-all', () => {
    const a = archipelago(1440, 900)
    const f = fibers(a, a.items.map(() => ({ rx: 80, ry: 30 })))
    expect(f).toHaveLength(FIBER_PAIRS.length)
    expect(f.length).toBeLessThan((7 * 6) / 2)
    for (const x of f) {
      expect(x.d.startsWith('M')).toBe(true)
      expect(x.drawn).toBeLessThan(1) // incomplete trajectories
      expect(x.breathe).toBeGreaterThanOrEqual(20)
      expect(x.breathe).toBeLessThanOrEqual(60)
    }
    // Never in step.
    expect(new Set(f.map((x) => x.breathe.toFixed(1))).size).toBe(f.length)
  })
})

describe('SEMANA: select Saturday → VER DÍA → its DAYSCAPE', () => {
  it('selects, opens and lands on the chosen date', () => {
    let s = run([{ type: 'select', index: SAT }])
    expect(s).toMatchObject({ phase: 'selected', selected: SAT })
    s = run([{ type: 'open' }, { type: 'mountDay' }, { type: 'dayShown' }], s)
    expect(s).toMatchObject({ phase: 'day', opened: SAT, dayOpen: true })
    expect(week.days[s.opened!].date).toBe('2026-10-03')
  })

  it('the DAYSCAPE is the real one for that date: same resolver, same model builder', () => {
    const date = week.days[SAT].date
    const view = viewForDate(date, 11 * 60)
    expect(view.routine.dayName).toBe('Sábado')
    expect(view.current.id).toBe('sat-web-1000')
    const model = buildDayscape(view, 11 * 60)
    expect(model.current.title).toBe('Páginas Web')
    expect(model.activities.map((a) => a.id)).toContain('sat-touchdesigner-1200')
    // Sunday's rotation resolves for the opened date, too.
    expect(viewForDate('2026-10-04', 14 * 60).current.title).toBe('Páginas Web')
    expect(viewForDate('2026-09-27', 14 * 60).current.title).toBe('Newsletter')
  })

  it('returns to the week at rest', () => {
    const s = run([{ type: 'select', index: SAT }, { type: 'open' }, { type: 'mountDay' }, { type: 'dayShown' }, { type: 'back' }])
    expect(s).toMatchObject({ phase: 'returning', selected: null, opened: SAT })
    expect(run([{ type: 'returned' }], s)).toEqual(WEEK_FLOW_START)
  })

  it('switches days while one is chosen; releases with a tap around it', () => {
    const s = run([{ type: 'select', index: SAT }, { type: 'select', index: 3 }])
    expect(s).toMatchObject({ phase: 'selected', selected: 3 })
    expect(run([{ type: 'release' }], s)).toMatchObject({ phase: 'general', selected: null })
  })

  it('ignores anything out of turn', () => {
    expect(run([{ type: 'open' }])).toEqual(WEEK_FLOW_START)
    const opening = run([{ type: 'select', index: SAT }, { type: 'open' }])
    expect(run([{ type: 'select', index: 1 }], opening)).toBe(opening)
    expect(run([{ type: 'release' }], opening)).toBe(opening)
    expect(run([{ type: 'dayShown' }], opening)).toBe(opening) // not before its DAYSCAPE is there
    expect(run([{ type: 'back' }], opening)).toBe(opening)
  })
})
