import { describe, expect, it } from 'vitest'
import { routineForDate } from '../../data/routine'
import { block as defineBlock } from '../../data/routine/define'
import { tuesday } from '../../data/routine/tuesday'
import { buildDayView } from '../../domain/schedule'
import { formatClock, toMinutes } from '../../domain/time'
import type { BlockCategory, DayRoutine, DayState } from '../../domain/types'
import { dayReducer, emptyDay } from '../../state/dayReducer'
import { CONTINUE_AT, EXIT, EXIT_STAGES, NAME, NAME_S, cleanAt, continueAt, exploreMorphs, nameAt, nameOpacity, releaseAtMs } from './choreography'
import { hitTest, layoutDayscape, placeNames, selectionPoses, targetOf, type Measure } from './layout'
import { buildDayscape, getVisualRole, stateLabel } from './model'

const scape = (time: string, state: DayState = emptyDay('2026-09-22'), routine: DayRoutine = tuesday) => {
  const now = toMinutes(time)
  return buildDayscape(buildDayView(routine, state, now), now)
}
const byId = (model: ReturnType<typeof scape>, id: string) => {
  const a = model.activities.find((x) => x.id === id)
  if (!a) throw new Error(`no activity ${id}`)
  return a
}
/** Close enough to Inter Tight for layout tests. */
const measure: Measure = (text, size, spacing) => text.length * size * (0.62 + spacing)

describe('DAYSCAPE — model', () => {
  it('all 18 Tuesday activities float at once, transitions included, synthetic gaps not', () => {
    const m = scape('10:14')
    expect(m.activities.map((a) => a.id)).toEqual(tuesday.blocks.map((b) => b.id))
    expect(m.activities).toHaveLength(18)
    expect(m.current.id).toBe('tue-web-1000')
  })

  it('derives the visual role of every block from its category; explicit roles win', () => {
    const view = buildDayView(tuesday, emptyDay('2026-09-22'), toMinutes('10:14'))
    const role = Object.fromEntries(view.timeline.map((b) => [b.id, getVisualRole(b, tuesday.meditation?.blockId)]))
    expect(role).toMatchObject({
      'tue-merkaba-0600': 'medium',
      'tue-breathwork-0825': 'micro',
      'tue-transfer-0630': 'space',
      'tue-meal-1220': 'space',
      'tue-web-1000': 'major',
      'tue-gym-1600': 'major',
      'tue-sleep-2200': 'endpoint',
    })
    const routine: DayRoutine = { ...tuesday, blocks: tuesday.blocks.map((b) => (b.id === 'tue-velocity-1200' ? { ...b, dayscapeRole: 'major' } : b)) }
    expect(byId(scape('10:14', undefined, routine), 'tue-velocity-1200').role).toBe('major')
  })

  it('time is depth: planes by distance, the past going back sooner than the future', () => {
    const m = scape('10:14')
    expect(byId(m, 'tue-reading-0930').plane).toBe('fg')
    expect(byId(m, 'tue-velocity-1200').plane).toBe('fg')
    expect(byId(m, 'tue-writing-0800').plane).toBe('mid')
    expect(byId(m, 'tue-wellness-1400').plane).toBe('mid')
    expect(byId(m, 'tue-merkaba-0600').plane).toBe('bg')
    expect(byId(m, 'tue-sleep-2200').plane).toBe('bg')
    expect(byId(m, 'tue-english-0835').z).toBeGreaterThan(byId(m, 'tue-reading-0930').z)
  })

  it('field labels are short and never two alike', () => {
    const m = scape('10:14')
    expect(byId(m, 'tue-transfer-0630').label).toBe('Llevar hermana')
    expect(byId(m, 'tue-breathwork-0825').label).toBe('Breathwork')
    expect(byId(m, 'tue-breathwork-relax-2145').label).toBe('Breathwork relajante')
    expect(byId(m, 'tue-wellness-1400').label).toBe('Marca Wellness')
    expect(byId(m, 'tue-wellness-1400').title).toBe('Nueva Marca Wellness')
  })

  it('passed time is never assumed completed; real records show, independent of time', () => {
    expect(stateLabel(byId(scape('10:14'), 'tue-english-0835'))).toBe('Sin registrar')
    expect(stateLabel(byId(scape('10:14'), 'tue-wellness-1400'))).toBe('Próximo')
    let s = emptyDay('2026-09-22')
    s = dayReducer(s, { type: 'complete', blockId: 'tue-writing-0800' })
    s = dayReducer(s, { type: 'close', blockId: 'tue-web-1000', outcome: 'parcial', note: 'Faltan pruebas' })
    s = dayReducer(s, { type: 'skip', blockId: 'tue-english-0835' })
    const before = JSON.stringify(s)
    const m = scape('15:00', s)
    expect(stateLabel(byId(m, 'tue-writing-0800'))).toBe('Completado')
    expect(stateLabel(byId(m, 'tue-web-1000'))).toBe('Parcial')
    expect(stateLabel(byId(m, 'tue-english-0835'))).toBe('Omitido')
    expect(byId(m, 'tue-web-1000').side).toBe('past')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('the five configurations coexist; the present is the Prism', () => {
    const m = scape('10:14')
    expect(m.current.form).toBe('prism')
    const near = m.activities.filter((a) => a.side !== 'current').sort((p, q) => p.delta - q.delta)
    expect(new Set(m.activities.map((a) => a.form)).size).toBe(5)
    expect(near.length).toBeGreaterThan(5)
  })

  it('before the day starts the present is last night, ahead of everything', () => {
    const m = scape('05:10')
    expect(m.current.side).toBe('current')
    expect(m.activities.filter((a) => a.side === 'past')).toHaveLength(0)
  })
})

describe('DAYSCAPE — progressive reveal', () => {
  const m = scape('10:14')
  const waveOf = (id: string) => byId(m, id).wave

  it('the day forms in six waves, morning first', () => {
    expect([waveOf('tue-merkaba-0600'), waveOf('tue-transfer-0630')]).toEqual([0, 0])
    expect(['tue-writing-0800', 'tue-breathwork-0825', 'tue-substack-0830'].map(waveOf)).toEqual([1, 1, 1])
    expect(['tue-english-0835', 'tue-pause-0915', 'tue-reading-0930'].map(waveOf)).toEqual([2, 2, 2])
    expect(['tue-web-1000', 'tue-velocity-1200', 'tue-meal-1220'].map(waveOf)).toEqual([3, 3, 3])
    expect(['tue-wellness-1400', 'tue-gym-1600', 'tue-shower-1800'].map(waveOf)).toEqual([4, 4, 4])
    expect(['tue-wellness-1900', 'tue-screens-off-2050', 'tue-breathwork-relax-2145', 'tue-sleep-2200'].map(waveOf)).toEqual([5, 5, 5, 5])
  })

  it('each wave stays inside its window and never forms in lockstep', () => {
    const windows = [[0, 2], [2, 3.5], [3.5, 5], [5, 7], [7, 9], [9, 11]]
    for (const a of m.activities) {
      const [s0, s1] = windows[a.wave]
      expect(a.revealAt).toBeGreaterThanOrEqual(s0)
      expect(a.revealAt).toBeLessThan(s1)
    }
    expect(new Set(m.activities.map((a) => a.revealAt.toFixed(3))).size).toBe(18)
  })

  it('each name is readable about 1.5–2 s, then dissolves in place', () => {
    const lectura = byId(m, 'tue-reading-0930')
    const readable = (a: typeof lectura) => {
      let s = 0
      for (let t = 0; t < 20; t += 0.01) if (nameOpacity(a, t) >= 0.5) s += 0.01
      return s
    }
    expect(readable(lectura)).toBeGreaterThan(1.5)
    expect(readable(lectura)).toBeLessThan(2.3)
    expect(nameOpacity(lectura, nameAt(lectura) + NAME_S + 0.01)).toBe(0)
    expect(nameAt(lectura)).toBeCloseTo(lectura.revealAt + NAME.after)
  })

  it('never all 18 names at once: waves overlap, the first go while the last arrive', () => {
    let most = 0
    for (let t = 0; t < 16; t += 0.05) most = Math.max(most, m.activities.filter((a) => nameOpacity(a, t) >= 0.5).length)
    expect(most).toBeLessThanOrEqual(7)
    const first = byId(m, 'tue-merkaba-0600')
    const last = byId(m, 'tue-sleep-2200')
    expect(nameOpacity(first, nameAt(last))).toBe(0)
    const secondWave = byId(m, 'tue-writing-0800')
    const fourthWave = byId(m, 'tue-web-1000')
    expect(nameAt(secondWave) + NAME_S).toBeGreaterThan(fourthWave.revealAt - 1.6)
  })

  it('AHORA never takes a temporary name; the field is clean before CONTINUAR appears', () => {
    expect(nameOpacity(m.current, 6)).toBe(0)
    expect(cleanAt(m.activities)).toBeGreaterThan(11)
    expect(cleanAt(m.activities)).toBeLessThan(CONTINUE_AT)
  })

  it('exploring, one slow morph at a time', () => {
    const plan = exploreMorphs(120)
    expect(plan.length).toBeGreaterThan(15)
    for (let i = 1; i < plan.length; i++) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at + plan[i - 1].duration)
  })

  it('leaving: far first, then middle, then near; the present last', () => {
    const at = (id: string) => releaseAtMs(byId(m, id))
    expect(at('tue-merkaba-0600')).toBeLessThan(at('tue-writing-0800') + 300)
    expect(Math.max(...m.activities.filter((a) => a.plane === 'bg').map(releaseAtMs))).toBeLessThan(EXIT.release.fg + EXIT.jitter)
    expect(at('tue-web-1000')).toBe(EXIT.nowBreak)
    expect(Math.max(...m.activities.filter((a) => a.side !== 'current').map(releaseAtMs))).toBeLessThan(EXIT.nowBreak)
    expect(EXIT.gather - EXIT.calm).toBeGreaterThanOrEqual(2000)
    expect(EXIT.gather - EXIT.calm).toBeLessThanOrEqual(3200)
  })

  it('the way to HOY reads as progress: compact, every step a distinct advance', () => {
    const steps = [EXIT.calm, EXIT.release.fg, EXIT.nowBreak, EXIT.gather, EXIT.module[0], EXIT.named, EXIT.handoff, EXIT.done]
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(100)
    expect(EXIT.done).toBeLessThanOrEqual(5500)
    // Diffuse → recognizable → structured → named, before HOY takes over.
    expect(EXIT.named).toBeGreaterThan(EXIT.module[0])
    expect(EXIT.module[1]).toBeLessThanOrEqual(EXIT.handoff)
    const { settle, dematerialize, gather, handoff } = EXIT_STAGES
    expect(settle + dematerialize + gather + handoff).toBe(EXIT.done)
  })
})

describe('DAYSCAPE — composition', () => {
  const m = scape('10:14')
  const phone = layoutDayscape(m, 390, 844)

  it('AHORA is the perceptual center: the largest, sharpest, fully present', () => {
    const now = phone.items.find((p) => p.a.side === 'current')!
    expect(now.x).toBeCloseTo(206)
    expect(now.y).toBeCloseTo(486)
    for (const p of phone.items) {
      if (p === now) continue
      expect(p.R).toBeLessThan(now.R)
      expect(p.opacity).toBeLessThan(1)
    }
    expect(now.blur).toBe(0)
  })

  it('the rest of the day stays in the atmosphere: present, never competing with AHORA', () => {
    for (const p of phone.items) {
      if (p.a.side === 'current') continue
      expect(p.opacity).toBeLessThanOrEqual(0.84)
      if (p.a.plane !== 'fg') expect(p.blur).toBeGreaterThanOrEqual(0.75)
    }
    const poses = selectionPoses(phone, 'tue-english-0835')
    expect(poses.get('tue-web-1000')!.opacity).toBeGreaterThanOrEqual(0.7)
  })

  it('three planes: far is smaller, softer and higher', () => {
    const mean = (plane: string, k: 'R' | 'blur' | 'y') => {
      const xs = phone.items.filter((p) => p.a.plane === plane && p.a.side !== 'current').map((p) => p[k])
      return xs.reduce((s, x) => s + x, 0) / xs.length
    }
    expect(mean('bg', 'R')).toBeLessThan(mean('mid', 'R'))
    expect(mean('mid', 'R')).toBeLessThan(mean('fg', 'R'))
    expect(mean('bg', 'blur')).toBeGreaterThan(mean('mid', 'blur'))
    expect(mean('bg', 'y')).toBeLessThan(mean('fg', 'y'))
  })

  it('no two forms overlap and everything stays on screen, from 320 to 1440 px', () => {
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1440, 900]]) {
      const l = layoutDayscape(m, w, h)
      for (const p of l.items) {
        expect(p.x - p.R).toBeGreaterThan(0)
        expect(p.x + p.R).toBeLessThan(w)
        expect(p.y - p.R).toBeGreaterThan(0)
        expect(p.y + p.R).toBeLessThan(h)
        for (const q of l.items) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((p.R + q.R) * 0.9)
      }
    }
  })

  it('delicate symbols, generous invisible targets: 44–52 px', () => {
    for (const p of phone.items) {
      expect(p.hit * 2).toBeGreaterThanOrEqual(44)
      expect(p.hit * 2).toBeLessThanOrEqual(52)
    }
    expect(phone.items.filter((p) => p.R * 2 < 30).length).toBeGreaterThan(8)
  })

  it('a tap goes to the nearest activity whose target contains it, or to none', () => {
    const items = phone.items.map((p) => ({ id: p.a.id, x: p.x, y: p.y, hit: p.hit }))
    const ingles = phone.items.find((p) => p.a.id === 'tue-english-0835')!
    expect(hitTest(items, ingles.x + 14, ingles.y - 12)).toBe('tue-english-0835')
    expect(hitTest(items, 200, 790)).toBeNull()
  })

  it('every temporary name sits next to its own form, never over another name', () => {
    const l = layoutDayscape(m, 390, 844)
    placeNames(l, measure, formatClock)
    const boxes = l.items.filter((p) => p.name).map((p) => ({ x: p.x + p.name!.dx, y: p.y + p.name!.dy, w: p.name!.w, h: p.name!.h, p }))
    expect(boxes).toHaveLength(17)
    for (const b of boxes) {
      const near = Math.hypot(Math.max(b.x - b.p.x, 0, b.p.x - (b.x + b.w)), Math.max(b.y - b.p.y, 0, b.p.y - (b.y + b.h)))
      expect(near).toBeLessThan(b.p.R + 40)
      for (const c of boxes) {
        if (b === c) continue
        const ox = Math.min(b.x + b.w, c.x + c.w) - Math.max(b.x, c.x)
        const oy = Math.min(b.y + b.h, c.y + c.h) - Math.max(b.y, c.y)
        expect(ox > 0 && oy > 0).toBe(false)
      }
    }
  })

  it('inspection: the activity comes forward, the rest steps back; neighbours in time stay more present', () => {
    const poses = selectionPoses(phone, 'tue-english-0835')
    const ingles = phone.items.find((p) => p.a.id === 'tue-english-0835')!
    const target = targetOf(phone, ingles)
    const own = poses.get('tue-english-0835')!
    expect(ingles.x + own.dx).toBeCloseTo(target.x)
    expect(own.grow).toBeGreaterThan(1.5)
    expect(own.opacity).toBe(1)
    expect(own.blur).toBe(0)
    const pausa = poses.get('tue-pause-0915')!
    const velocity = poses.get('tue-velocity-1200')!
    expect(pausa.opacity / phone.items.find((p) => p.a.id === 'tue-pause-0915')!.opacity).toBeGreaterThan(
      velocity.opacity / phone.items.find((p) => p.a.id === 'tue-velocity-1200')!.opacity,
    )
    const now = poses.get('tue-web-1000')!
    expect(now.opacity).toBeGreaterThan(0.5)
  })
})

describe('DAYSCAPE — any day', () => {
  const block = (id: string, start: string, end: string | undefined, category: BlockCategory = 'learning') =>
    defineBlock(id, start, end, `Actividad ${id}`, category, 'focus')
  const day = (blocks: DayRoutine['blocks'], time: string) => {
    const routine: DayRoutine = { weekday: 3, dayName: 'Miércoles', theme: '', blocks }
    const now = toMinutes(time)
    return buildDayscape(buildDayView(routine, emptyDay('2026-09-23'), now), now)
  }
  const sane = (m: ReturnType<typeof day>, w: number, h: number) => {
    const l = layoutDayscape(m, w, h)
    placeNames(l, measure, formatClock)
    for (const p of l.items) {
      for (const v of [p.x, p.y, p.R, p.opacity, p.blur]) expect(Number.isFinite(v)).toBe(true)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(w)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(h)
      if (p.name) {
        expect(p.x + p.name.dx).toBeGreaterThanOrEqual(0)
        expect(p.x + p.name.dx + p.name.w).toBeLessThanOrEqual(w)
      }
    }
    expect(Number.isFinite(cleanAt(m.activities))).toBe(true)
    expect(continueAt(m.activities)).toBeGreaterThan(cleanAt(m.activities))
    return l
  }

  it('a single activity: AHORA alone, formed quickly, CONTINUAR soon after', () => {
    const m = day([block('a', '10:00', '12:00', 'deep_work')], '10:14')
    expect(m.activities).toHaveLength(1)
    expect(m.current.id).toBe('a')
    expect(m.current.revealAt).toBeLessThan(3)
    expect(continueAt(m.activities)).toBeLessThan(6)
    sane(m, 390, 844)
  })

  it('nothing happening now (before the day): the night is the present', () => {
    const m = day([block('a', '09:00', '10:00'), block('b', '11:00', '12:00'), block('z', '22:00', undefined, 'sleep')], '06:30')
    expect(m.current.side).toBe('current')
    expect(m.activities.filter((a) => a.side === 'past')).toHaveLength(0)
    sane(m, 390, 844)
  })

  it('only sleep in the routine', () => {
    sane(day([block('z', '22:00', undefined, 'sleep')], '10:14'), 390, 844)
  })

  it('a crowded day (30 activities) keeps every form and name on screen, phone to desktop', () => {
    const blocks = Array.from({ length: 30 }, (_, i) => {
      const s = 6 * 60 + i * 30
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      return block(`b${i}`, hhmm(s), hhmm(s + 25), i % 4 === 0 ? 'deep_work' : 'learning')
    })
    const m = day(blocks, '12:40')
    expect(m.activities.length).toBeGreaterThanOrEqual(30)
    expect(cleanAt(m.activities)).toBeGreaterThan(cleanAt(scape('10:14').activities))
    for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) sane(m, w, h)
  })

  it('a transition happening now is AHORA too', () => {
    const m = scape('09:20')
    expect(m.current.id).toBe('tue-pause-0915')
    sane(m, 390, 844)
  })
})

describe('DAYSCAPE — the V3 week, from the same dataset', () => {
  const DATES = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
  const weekScape = (date: string, time: string) => {
    const now = toMinutes(time)
    return buildDayscape(buildDayView(routineForDate(date).routine, emptyDay(date), now), now)
  }

  it('every day composes on screen without overlaps, phone to desktop', () => {
    for (const date of DATES) {
      const m = weekScape(date, '12:30')
      expect(m.activities.map((a) => a.id).filter((id) => !id.startsWith('gap-'))).toEqual(
        routineForDate(date).routine.blocks.map((b) => b.id),
      )
      for (const [w, h] of [[320, 568], [390, 844], [1440, 900]]) {
        const l = layoutDayscape(m, w, h)
        placeNames(l, measure, formatClock)
        for (const p of l.items) {
          expect(p.x - p.R).toBeGreaterThan(0)
          expect(p.x + p.R).toBeLessThan(w)
          expect(p.y - p.R).toBeGreaterThan(0)
          expect(p.y + p.R).toBeLessThan(h)
          for (const q of l.items) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((p.R + q.R) * 0.9)
        }
      }
    }
  })

  it('Thursday is sparse: few objects, its open time drawn as space', () => {
    const thu = weekScape('2026-10-01', '14:00')
    const tue = weekScape('2026-09-29', '14:00')
    expect(thu.activities.length).toBeLessThan(tue.activities.length * 0.6)
    expect(thu.activities.filter((a) => a.category === 'free').every((a) => a.role === 'space')).toBe(true)
    expect(thu.activities.filter((a) => a.role === 'major').map((a) => a.id)).toEqual(['thu-gym-1600'])
  })

  it('Sunday afternoon and evening are its deep mass', () => {
    const sun = weekScape('2026-10-04', '17:30')
    expect(sun.activities.filter((a) => a.role === 'major').map((a) => a.id)).toEqual([
      'sun-gym-1030', 'sun-rotation-1300', 'sun-wellness-1700', 'sun-wellness-1930',
    ])
    expect(sun.current.id).toBe('sun-wellness-1700')
  })
})
