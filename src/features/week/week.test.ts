import { describe, expect, it } from 'vitest'
import { routineForDate } from '../../data/routine'
import { buildWeek } from '../../domain/week'
import { buildDayscape } from '../dayscape/model'
import { viewForDate } from './dayView'
import { archipelago, lensForm, network, planeOutline, viewLens } from './geometry'
import { selectedView } from './Lens'
import { WEEK_FLOW_START, weekFlow, type WeekFlowAction, type WeekFlowState } from './weekFlow'

const week = buildWeek('2026-09-30', routineForDate)
const forms = week.days.map((d, i) => lensForm(d, i))
const run = (actions: WeekFlowAction[], from: WeekFlowState = WEEK_FLOW_START) => actions.reduce(weekFlow, from)
const SAT = 5

describe('SEMANA: load lives in the glass, not in its size', () => {
  it('the seven share one scale', () => {
    const widths = forms.map((f) => f.widthK)
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.3)
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

describe('SEMANA: sculptural glass, never a disc, a pill or a circle', () => {
  const radii = (pts: [number, number][]) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    return pts.map(([x, y]) => Math.hypot(x - cx, y - cy))
  }

  it('each outline is irregular: one family, seven individuals', () => {
    const outlines = forms.map((f) => planeOutline(f))
    for (const o of outlines) {
      const r = radii(o)
      expect(Math.max(...r) / Math.min(...r)).toBeGreaterThan(1.2) // not a circle
    }
    // No two alike.
    const signature = (o: [number, number][]) => o.slice(0, 12).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(';')
    expect(new Set(outlines.map(signature)).size).toBe(7)
    expect(new Set(forms.map((f) => f.light.at.toFixed(3))).size).toBe(7)
  })

  it('seen at rest, the dome shows under the face; Saturday deepest, Thursday almost flat', () => {
    const drop = (i: number) => {
      const v = viewLens(planeOutline(forms[i]), 200, forms[i].view, forms[i].thickness)
      return v.bounds.bottom - v.bounds.faceBottom
    }
    expect(drop(SAT)).toBeGreaterThan(drop(0))
    expect(drop(3)).toBeLessThan(4)
  })

  it('chosen, Saturday is the same object turned toward us — larger face, never a circle', () => {
    const rest = viewLens(planeOutline(forms[SAT]), 200, forms[SAT].view, forms[SAT].thickness).bounds
    const chosen = selectedView(forms[SAT], 200).bounds
    const w = chosen.right - chosen.left
    expect(chosen.right - chosen.left).toBeCloseTo(rest.right - rest.left, 0)
    expect(chosen.faceBottom - chosen.top).toBeGreaterThan((rest.faceBottom - rest.top) * 1.5)
    expect((chosen.bottom - chosen.top) / w).toBeLessThan(0.9)
  })
})

describe('SEMANA: a small galaxy, never a row, a column or a list', () => {
  it('desktop: the week drifts left → right with an eddy; near and far, never a line', () => {
    const a = archipelago(1440, 900)
    const xs = a.items.map((p) => p.x)
    const ys = a.items.map((p) => p.y)
    expect(xs[0]).toBe(Math.min(...xs)) // Monday opens the field…
    expect(xs[6]).toBe(Math.max(...xs)) // …Sunday closes it
    expect(xs[3]).toBeLessThan(xs[2]) // Thursday falls back into open air
    // No shared rows or columns, no even spacing.
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++) expect(Math.abs(xs[i] - xs[j]) > 40 || Math.abs(ys[i] - ys[j]) > 40).toBe(true)
    const gaps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]))
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5)
    // Clear foreground, middle ground and background.
    const zs = a.items.map((p) => p.z)
    expect(zs.some((z) => z < 0.15)).toBe(true)
    expect(zs.some((z) => z > 0.35 && z < 0.65)).toBe(true)
    expect(zs.some((z) => z > 0.7)).toBe(true)
  })

  it('mobile: read top → bottom in loose pairs at different depths, never one day per line', () => {
    const a = archipelago(390, 612)
    const ys = a.items.map((p) => p.y)
    const xs = a.items.map((p) => p.x)
    expect(ys[0]).toBe(Math.min(...ys))
    expect(ys[6]).toBe(Math.max(...ys))
    // At least three pairs of days share a band of the screen, side by side.
    const pairs = [0, 2, 4].filter((i) => Math.abs(ys[i + 1] - ys[i]) < 612 * 0.12 && Math.abs(xs[i + 1] - xs[i]) > 390 * 0.3)
    expect(pairs.length).toBe(3)
    // Their depths differ.
    for (const i of [0, 2, 4]) expect(Math.abs(a.items[i].z - a.items[i + 1].z)).toBeGreaterThan(0.2)
    // Words sit on different sides of the glass.
    expect(new Set(a.items.map((p) => p.label)).size).toBeGreaterThan(1)
  })

  it('the network: open orbits through the shared field, a few relations — one splits, one never arrives', () => {
    const a = archipelago(1440, 900)
    const { fibers, sparks } = network(a, a.items.map(() => ({ rx: 80, ry: 30 })), 1232, 656)
    const orbits = fibers.filter((f) => f.kind === 'orbit')
    const relations = fibers.filter((f) => f.kind === 'relation')
    expect(orbits.length).toBeGreaterThanOrEqual(2)
    expect(orbits.every((f) => f.drawn < 1)).toBe(true) // never closed
    expect(relations.length).toBeGreaterThanOrEqual(2)
    expect(relations.length).toBeLessThan((7 * 6) / 2) // never all-to-all
    expect(fibers.some((f) => f.kind === 'branch')).toBe(true)
    expect(relations.some((f) => f.drawn < 0.7)).toBe(true)
    expect(fibers.some((f) => f.layer === 'mid')).toBe(true) // one crosses between far and near
    expect(sparks.length).toBeGreaterThan(3)
    for (const f of fibers) {
      expect(f.breathe).toBeGreaterThanOrEqual(20)
      expect(f.breathe).toBeLessThanOrEqual(60)
    }
    expect(new Set(fibers.map((f) => f.breathe.toFixed(1))).size).toBe(fibers.length)
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
