import { describe, expect, it } from 'vitest'
import { FRONT, LAYERS, massLife, seeded } from './atmosphere'
import { SHAPES, type FormId } from './forms'
import { assignFates, emitMatter, moteLook, shardPoint, shardRange, stepMatter, type Matter, type Source } from './matter'

const source = (form: FormId, plane: Source['plane'] = 'fg', start = 1000): Source => ({
  form,
  fragments: SHAPES[form],
  visible: () => [0, 1],
  x: 200,
  y: 400,
  radius: 24,
  alpha: 0.9,
  side: 'future',
  plane,
  start,
})
const emit = (form: FormId, plane: Source['plane'] = 'fg') => {
  const out: Matter = { shards: [], motes: [] }
  emitMatter(out, source(form, plane), seeded(7))
  return out
}
const FORMS: FormId[] = ['cardinal', 'orbit', 'dissolving', 'axis', 'prism']

describe('Matter — forms → fragments → particles', () => {
  it('a form first opens into its own pieces, exactly where it was', () => {
    const { shards } = emit('cardinal')
    expect(shards.length).toBeGreaterThanOrEqual(4)
    for (const s of shards) {
      const [x, y] = shardPoint(s, (s.s0 + s.s1) / 2, s.born)
      expect(Math.hypot(x - 200, y - 400)).toBeLessThan(24 * 1.1)
    }
  })

  it('pieces drift apart and erode until nothing is left of them', () => {
    for (const form of FORMS) {
      for (const s of emit(form).shards) {
        const mid = (s.s0 + s.s1) / 2
        const [x0, y0] = shardPoint(s, mid, s.born)
        const [x1, y1] = shardPoint(s, mid, s.end)
        expect(Math.hypot(x1 - x0, y1 - y0)).toBeGreaterThan(2)
        const [a, b] = shardRange(s, s.end)
        expect(b - a).toBeLessThanOrEqual(1e-9)
        expect(s.end - s.born).toBeGreaterThan(700)
      }
    }
  })

  it('orbit pieces keep turning; axis pieces erode from the inner end', () => {
    expect(emit('orbit').shards.every((s) => Math.abs(s.spin) > (20 * Math.PI) / 180)).toBe(true)
    expect(emit('axis').shards.every((s) => s.erode === 'inner')).toBe(true)
    expect(emit('cardinal').shards.every((s) => s.erode === 'ends')).toBe(true)
  })

  it('pieces shed microfragments — short strokes that settle into points', () => {
    const { motes } = emit('prism')
    expect(motes.length).toBeGreaterThan(20)
    const m = motes.find((x) => x.len > 2)!
    expect(moteLook(m, m.born + 10).len).toBeGreaterThan(1.5)
    expect(moteLook(m, m.born + m.lenLife + 1).len).toBe(0)
    expect(moteLook(m, m.born + m.lenLife + 1).a).toBeGreaterThan(0)
  })

  it('richer near, sparser and smaller far: depth in the matter itself', () => {
    const near = emit('orbit', 'fg').motes
    const far = emit('orbit', 'bg').motes
    expect(near.length).toBeGreaterThan(far.length)
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean(far.map((m) => m.r))).toBeLessThan(mean(near.map((m) => m.r)))
  })

  it('a field of matter, not an explosion: slow speeds, softly damped', () => {
    const { motes } = emit('cardinal')
    expect(Math.max(...motes.map((m) => Math.hypot(m.vx, m.vy)))).toBeLessThan(45)
    const m = motes[0]
    const x0 = m.x
    for (let t = m.born; t < m.born + 1500; t += 16) stepMatter(motes, t, 16, { x: 200, y: 400 })
    expect(Math.abs(m.x - x0)).toBeLessThan(40)
  })

  it('a modest amount of matter per form: tens to about a hundred', () => {
    for (const form of FORMS) {
      const { shards, motes } = emit(form)
      expect(shards.length).toBeLessThanOrEqual(24)
      expect(motes.length).toBeGreaterThan(10)
      expect(motes.length).toBeLessThan(140)
    }
  })

  it('an already eroded past form only breaks what is still visible', () => {
    const out: Matter = { shards: [], motes: [] }
    emitMatter(out, { ...source('cardinal'), visible: () => [0.3, 0.6] }, seeded(3))
    for (const s of out.shards) {
      expect(s.s0).toBeGreaterThanOrEqual(0.3)
      expect(s.s1).toBeLessThanOrEqual(0.6)
    }
  })
})

describe('Matter — convergence on AHORA', () => {
  const anchor = { x: 200, y: 400 }
  const cells = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: anchor.x + sx * 9.6, y: anchor.y + sy * 9.6, r: 1.6, a: 0.35 })))

  it('four complete the module, about a quarter is absorbed, the rest dissolves', () => {
    const motes = [...emit('cardinal').motes, ...emit('orbit').motes]
    assignFates(motes, anchor, cells, seeded(5))
    expect(motes.filter((m) => m.fate === 'module')).toHaveLength(4)
    const rest = motes.length - 4
    expect(motes.filter((m) => m.fate === 'absorb').length).toBe(Math.round(rest * 0.25))
  })

  it('module points settle exactly on their cells and become solid', () => {
    const { motes } = emit('orbit')
    assignFates(motes, anchor, cells, seeded(5))
    const g = { start: 5000, anchor }
    for (let t = 5000; t <= 6400; t += 16) stepMatter(motes, t, 16, anchor, g)
    for (const m of motes.filter((x) => x.fate === 'module')) {
      expect(m.x).toBeCloseTo(m.cell!.x, 5)
      expect(m.y).toBeCloseTo(m.cell!.y, 5)
      expect(moteLook(m, 6400, g).solid).toBeCloseTo(1, 6)
    }
    for (const m of motes.filter((x) => x.fate !== 'module')) expect(moteLook(m, 6400, g).a).toBeLessThan(0.05)
  })
})

describe('Atmosphere — independent masses of light', () => {
  it('each life: appears, drifts, expands, loses definition and disappears', () => {
    const rand = seeded(9)
    for (const layer of [...LAYERS, FRONT]) {
      const life = massLife(layer, 390, 844, rand, false)
      expect(life.duration).toBeGreaterThanOrEqual(9)
      expect(life.duration).toBeLessThanOrEqual(24)
      const [first, , , last] = life.keyframes
      expect(first.opacity).toBe(0)
      expect(last.opacity).toBe(0)
      expect(Math.max(...life.keyframes.map((k) => k.opacity))).toBeGreaterThan(0.3)
      const scale = (k: { transform: string }) => Number(/scale\(([\d.]+)\)/.exec(k.transform)![1])
      expect(scale(last)).toBeGreaterThan(scale(first))
      expect(first.transform).not.toBe(last.transform)
    }
  })

  it('perceptibly alive within a few seconds: several px per second of drift', () => {
    const rand = seeded(4)
    const xy = (k: { transform: string }) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(k.transform)!.slice(1).map(Number)
    for (const layer of LAYERS) {
      const life = massLife(layer, 390, 844, rand, false)
      const [a, b] = [xy(life.keyframes[0]), xy(life.keyframes[3])]
      expect(Math.hypot(b[0] - a[0], b[1] - a[1]) / life.duration).toBeGreaterThan(2)
    }
  })

  it('reduced motion: only opacity changes, in place', () => {
    const life = massLife(LAYERS[0], 390, 844, seeded(2), true)
    const transforms = new Set(life.keyframes.map((k) => k.transform))
    expect(transforms.size).toBe(1)
    expect(life.keyframes.map((k) => k.opacity)).toContain(0)
  })

  it('drag moves the atmosphere only 2–10 %', () => {
    for (const layer of [...LAYERS, FRONT]) {
      expect(layer.drag[0]).toBeGreaterThanOrEqual(0.02)
      expect(layer.drag[1]).toBeLessThanOrEqual(0.1)
    }
  })
})
