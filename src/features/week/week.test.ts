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
  it('the seven share one family scale', () => {
    const widths = forms.map((f) => f.widthK)
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.2)
  })

  it('Thursday is a membrane: the thinnest, clearest glass, almost no matter, its inner contour visible', () => {
    const thu = forms[3]
    for (const f of forms.filter((_, i) => i !== 3)) {
      expect(thu.thickness).toBeLessThan(f.thickness)
      expect(thu.frost).toBeLessThan(f.frost)
      expect(thu.fog).toBeLessThan(f.fog)
      expect(thu.ring).toBeGreaterThan(f.ring)
    }
    expect(thu.widthK).toBeGreaterThanOrEqual(1) // visible, not tiny
  })

  it('Saturday is the densest — the most fog and the most milky glass — but not the largest', () => {
    const sat = forms[SAT]
    for (const f of forms.filter((_, i) => i !== SAT)) {
      expect(sat.fog).toBeGreaterThan(f.fog)
      expect(sat.frost).toBeGreaterThan(f.frost)
    }
    expect(sat.widthK).toBeLessThan(forms[6].widthK)
  })

  it('Sunday is longer and deeper: one continuous interior, not a bigger Saturday', () => {
    const sun = forms[6]
    expect(sun.widthK).toBe(Math.max(...forms.map((f) => f.widthK)))
    expect(sun.depth).toBeGreaterThan(0)
    expect(forms.filter((f) => f.depth > 0)).toHaveLength(1)
    expect(sun.fog).toBeLessThan(forms[SAT].fog)
    const aspect = (i: number) => {
      const o = planeOutline(forms[i])
      const xs = o.map((p) => p[0])
      const ys = o.map((p) => p[1])
      return (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
    }
    for (let i = 0; i < 6; i++) expect(aspect(6)).toBeLessThan(aspect(i))
  })

  it('HOY, past and future come from the date', () => {
    expect(forms.map((f) => f.tense)).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future'])
  })

  it('light falls differently: not every piece gets the same reflection', () => {
    expect(new Set(forms.map((f) => `${f.light.kind}@${f.light.at}`)).size).toBe(7)
    expect(new Set(forms.map((f) => f.light.kind)).size).toBeGreaterThanOrEqual(3)
  })
})

describe('SEMANA: sculptural pebbles, never a disc, a saucer or a circle', () => {
  const outline = (i: number) => planeOutline(forms[i])

  it('seven real outlines of one family — not one shape rotated and scaled', () => {
    // Normalize each outline (center, width 1, no rotation) and compare: they must differ.
    const normalized = forms.map((f, i) => {
      const o = outline(i).map(([x, y]) => [x * Math.cos(-f.rot) - y * Math.sin(-f.rot), x * Math.sin(-f.rot) + y * Math.cos(-f.rot)])
      const xs = o.map((p) => p[0])
      const w = Math.max(...xs) - Math.min(...xs)
      return o.map(([x, y]) => [x / w, y / w])
    })
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++) {
        const d = normalized[i].reduce((s, p, k) => s + Math.hypot(p[0] - normalized[j][k][0], p[1] - normalized[j][k][1]), 0) / normalized[i].length
        expect(d).toBeGreaterThan(0.01)
      }
  })

  it('each is asymmetric: one end fuller than the other, top and bottom of different weight', () => {
    for (let i = 0; i < 7; i++) {
      if (i === 3) continue // Thursday is nearly even: a membrane
      const o = outline(i)
      const height = (side: number) => {
        const pts = o.filter(([x]) => Math.sign(x) === side && Math.abs(x) > 0.25 * forms[i].widthK)
        return Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))
      }
      expect(Math.abs(height(-1) - height(1)) / Math.max(height(-1), height(1))).toBeGreaterThan(0.04)
    }
  })

  it('seen at rest it is a pebble: its dome rises above the rim and its lower curve falls below it', () => {
    const f = forms[SAT]
    const plane = outline(SAT)
    const flat = viewLens(plane, 200, f.view, 0).bounds
    const thick = viewLens(plane, 200, f.view, f.thickness).bounds
    expect(thick.top).toBeLessThan(flat.top)
    expect(thick.bottom).toBeGreaterThan(flat.bottom)
    // Saturday deeper than Monday, Thursday almost flat.
    const depth = (i: number) => {
      const v = viewLens(outline(i), 200, forms[i].view, forms[i].thickness).bounds
      const z = viewLens(outline(i), 200, forms[i].view, 0).bounds
      return v.bottom - v.top - (z.bottom - z.top)
    }
    expect(depth(SAT)).toBeGreaterThan(depth(0))
    expect(depth(3)).toBeLessThan(4)
  })

  it('chosen, Saturday is the same piece turned toward us — larger face, never a circle', () => {
    const rest = viewLens(outline(SAT), 200, forms[SAT].view, forms[SAT].thickness).bounds
    const chosen = selectedView(forms[SAT], 200).bounds
    const w = chosen.right - chosen.left
    expect(chosen.right - chosen.left).toBeCloseTo(rest.right - rest.left, 0)
    expect(chosen.faceBottom - chosen.top).toBeGreaterThan((rest.faceBottom - rest.top) * 1.3)
    expect((chosen.bottom - chosen.top) / w).toBeLessThan(0.9)
  })
})

describe('SEMANA: a field, never a row, a ring or a list', () => {
  it('desktop: the reference composition — voids, a near pair, isolated pieces, three depths', () => {
    const a = archipelago(1440, 900)
    const xs = a.items.map((p) => p.x)
    const ys = a.items.map((p) => p.y)
    expect(xs[0]).toBe(Math.min(...xs)) // Monday opens the field…
    expect(xs[6]).toBe(Math.max(...xs)) // …Sunday closes it
    expect(xs[3]).toBeLessThan(xs[2]) // Thursday falls back into open air
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++) expect(Math.abs(xs[i] - xs[j]) > 40 || Math.abs(ys[i] - ys[j]) > 40).toBe(true)
    const gaps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]))
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5)
    // Two far, three in the middle, two near.
    const zs = a.items.map((p) => p.z)
    expect(zs.filter((z) => z >= 0.7).length).toBe(2)
    expect(zs.filter((z) => z > 0.3 && z < 0.7).length).toBe(3)
    expect(zs.filter((z) => z <= 0.3).length).toBe(2)
    // No center: the pieces do not sit around a common point.
    const cx = xs.reduce((s, x) => s + x, 0) / 7
    const cy = ys.reduce((s, y) => s + y, 0) / 7
    const d = a.items.map((p) => Math.hypot(p.x - cx, p.y - cy))
    expect(Math.max(...d) / Math.min(...d)).toBeGreaterThan(2)
  })

  it('mobile: a vertical field, not a list — the eye goes left, right, center', () => {
    const a = archipelago(390, 612)
    const col = (x: number) => (x < 390 * 0.34 ? 'L' : x > 390 * 0.66 ? 'R' : 'C')
    const cols = a.items.map((p) => col(p.x))
    expect(new Set(cols).size).toBe(3)
    // Never two in a row on the same side.
    for (let i = 1; i < 7; i++) expect(cols[i]).not.toBe(cols[i - 1])
    // Some days share a band of the screen, at different depths.
    const shared = [0, 1, 2, 3, 4, 5].filter((i) => Math.abs(a.items[i + 1].y - a.items[i].y) < 612 * 0.12)
    expect(shared.length).toBeGreaterThanOrEqual(2)
    for (const i of shared) expect(Math.abs(a.items[i].z - a.items[i + 1].z)).toBeGreaterThan(0.2)
    expect(new Set(a.items.map((p) => p.label)).size).toBeGreaterThan(1)
  })

  it('the network: open fibers, never orbits — they split, get lost, join regions without touching a piece', () => {
    for (const [w, h] of [
      [1232, 658],
      [366, 612],
    ]) {
      const a = archipelago(w, h)
      const { fibers, sparks } = network(a, w, h)
      const main = fibers.filter((f) => f.kind === 'fiber')
      expect(main.length).toBeGreaterThanOrEqual(4)
      expect(main.length).toBeLessThanOrEqual(6)
      expect(fibers.every((f) => f.drawn < 1)).toBe(true) // incomplete
      expect(fibers.some((f) => f.kind === 'branch')).toBe(true)
      expect(main.some((f) => f.near.length === 0)).toBe(true) // joins regions only
      expect(fibers.some((f) => f.layer === 'mid')).toBe(true)
      // Never closed: start and end are far apart.
      for (const f of main) {
        const n = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
        expect(Math.hypot(n[0] - n[n.length - 2], n[1] - n[n.length - 1])).toBeGreaterThan(Math.min(w, h) * 0.12)
      }
      expect(sparks.length).toBeGreaterThanOrEqual(4)
      expect(sparks.length).toBeLessThanOrEqual(8)
      for (const f of fibers) {
        expect(f.breathe).toBeGreaterThanOrEqual(20)
        expect(f.breathe).toBeLessThanOrEqual(60)
      }
    }
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
