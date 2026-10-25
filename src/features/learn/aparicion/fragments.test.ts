import { describe, expect, it } from 'vitest'
import { BEATS, FRAGMENTS_END } from './beats'
import { SYSTEM_WORDS, fragmentAt, frontsIn, makeFragments, placeFragments } from './fragments'
import { FRONT_BIRTHS, frontSpeed, frontsAt } from './light'
import { bendPx, frontShape, frontShift } from './optics'
import { contactPoint, expectedWordmarkRect, wordmarkDots } from './geometry'

const VIEWS = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 1280, h: 800 },
]

function setup(view: { w: number; h: number }, count = 230) {
  const seeds = makeFragments(count)
  const contact = contactPoint(view)
  const placed = placeFragments(seeds, view, contact, wordmarkDots(expectedWordmarkRect(view)))
  return { seeds, contact, placed }
}

describe('the fragments are pieces of the system’s own words', () => {
  it('every one is a lowercase piece (1–4 letters) of aprender, explorar, conectar, comprender, recordar or aplicar — or one of those words whole', () => {
    for (const f of makeFragments(400)) {
      expect(f.text).toBe(f.text.toLowerCase())
      expect(f.text.length).toBeGreaterThanOrEqual(1)
      if (f.word) expect(SYSTEM_WORDS as readonly string[]).toContain(f.text)
      else expect(f.text.length).toBeLessThanOrEqual(4)
      expect(SYSTEM_WORDS.some((w) => w.includes(f.text)), f.text).toBe(true)
      expect(/\d/.test(f.text)).toBe(false) // no digits: it must not read as code
    }
  })

  it('mostly one or two letters, now and then a syllable or a whole word', () => {
    const f = makeFragments(1000)
    const short = f.filter((x) => !x.word && x.text.length <= 2).length / f.length
    expect(short).toBeGreaterThan(0.55)
    expect(f.some((x) => x.text.length >= 3)).toBe(true)
    const words = f.filter((x) => x.word).length / f.length
    expect(words).toBeGreaterThan(0.03)
    expect(words).toBeLessThan(0.12)
  })

  it('lie at three depths — far (small, out of focus), mid, near — and in five colors, the warm and the dark ones a minority', () => {
    const f = makeFragments(1500)
    const share = (pick: (x: (typeof f)[number]) => boolean) => f.filter(pick).length / f.length
    expect(share((x) => x.layer === 'far')).toBeGreaterThan(0.15)
    expect(share((x) => x.layer === 'mid')).toBeGreaterThan(0.4)
    expect(share((x) => x.layer === 'near')).toBeGreaterThan(0.15)
    expect(new Set(f.map((x) => x.tone)).size).toBe(5)
    expect(share((x) => x.tone === 'warm')).toBeGreaterThan(0.06)
    expect(share((x) => x.tone === 'warm')).toBeLessThan(0.2)
    expect(share((x) => x.tone === 'garnet')).toBeLessThan(0.2)
    expect(share((x) => x.tone === 'white')).toBeGreaterThan(0.4)
  })

  it('is deterministic: the same seed, the same sky', () => {
    expect(makeFragments(50, 3)).toEqual(makeFragments(50, 3))
    expect(makeFragments(50, 3)).not.toEqual(makeFragments(50, 4))
  })
})

describe('placement', () => {
  it('keeps every fragment on the glass, at every size of screen', () => {
    for (const view of VIEWS) {
      const { placed } = setup(view)
      for (const p of placed) {
        expect(p.sx).toBeGreaterThanOrEqual(0)
        expect(p.sx).toBeLessThanOrEqual(view.w)
        expect(p.sy).toBeGreaterThanOrEqual(0)
        expect(p.sy).toBeLessThanOrEqual(view.h)
      }
    }
  })

  it('gathers most of them around the point of contact', () => {
    const { placed, contact } = setup({ w: 390, h: 844 }, 300)
    const near = placed.filter((p) => Math.hypot(p.sx - contact.x, p.sy - contact.y) < 280).length / placed.length
    expect(near).toBeGreaterThan(0.45)
  })

  it('sets each one off from the convergence (while the last front is still crossing) and brings it in by the time the structure is stable', () => {
    for (const view of VIEWS) {
      for (const p of setup(view).placed) {
        expect(p.start).toBeGreaterThanOrEqual(BEATS.converge)
        expect(p.start).toBeLessThan(BEATS.propagated + 0.1)
        expect(p.dur).toBeGreaterThanOrEqual(0.45 - 1e-9)
        expect(p.start + p.dur).toBeLessThanOrEqual(BEATS.stable + 0.1 + 1e-9)
      }
    }
  })

  it('the nearer to the contact, the sooner it reacts', () => {
    const { placed, contact } = setup({ w: 390, h: 844 }, 300)
    const by = [...placed].sort((a, b) => Math.hypot(a.sx - contact.x, a.sy - contact.y) - Math.hypot(b.sx - contact.x, b.sy - contact.y))
    const first = by.slice(0, 40).reduce((s, p) => s + p.start, 0) / 40
    const last = by.slice(-40).reduce((s, p) => s + p.start, 0) / 40
    expect(first).toBeLessThan(last)
  })

  it('flows left to right: the order they rest in is the order of the dots they go to (paths do not cross)', () => {
    const { placed } = setup({ w: 390, h: 844 }, 200)
    const bySx = placed.filter((p) => p.converges).sort((a, b) => a.sx - b.sx)
    for (let i = 1; i < bySx.length; i++) expect(bySx[i].tx).toBeGreaterThanOrEqual(bySx[i - 1].tx - 1e-9)
  })

  it('every destination is a lit dot of the wordmark', () => {
    const view = { w: 390, h: 844 }
    const dots = wordmarkDots(expectedWordmarkRect(view))
    for (const p of setup(view).placed.filter((q) => q.converges)) expect(dots.some((d) => Math.abs(d.x - p.tx) < 1e-6 && Math.abs(d.y - p.ty) < 1e-6)).toBe(true)
  })
})

describe('a frame at any moment', () => {
  const view = { w: 390, h: 844 }
  const { placed, contact } = setup(view)

  it('before anything has happened there is nothing; then the fragments appear where they rest', () => {
    for (const p of placed) expect(fragmentAt(p, 0, contact, view).alpha).toBe(0)
    const shown = placed.map((p) => fragmentAt(p, BEATS.wave - 0.02, contact, view))
    expect(shown.filter((f) => f.alpha > 0.3).length / placed.length).toBeGreaterThan(0.8)
    // …and they hang in the glass: within a few pixels of where they rest.
    placed.forEach((p) => {
      const f = fragmentAt(p, 0.4, contact, view)
      expect(Math.hypot(f.x - p.sx, f.y - p.sy)).toBeLessThan(10)
    })
  })

  it('each front reaches a piece when it really gets there: at that moment the front, as it is drawn, is exactly where the piece is seen', () => {
    const speed = frontSpeed(view)
    for (const p of placed.slice(0, 120)) {
      const b = bendPx(p.sx, p.sy, view)
      p.hits.forEach((hit, index) => {
        const front = frontsAt(hit.at, view).find((f) => f.index === index)
        if (!front) return expect(hit.strength).toBeLessThan(0.02)
        const dx = p.sx - b.dx - contact.x - frontShift(b.slab, view) * front.refraction
        const dy = p.sy - b.dy - contact.y
        const drawn = front.radius * frontShape(Math.atan2(dy, dx), index * 3.7)
        expect(Math.abs(drawn - Math.hypot(dx, dy))).toBeLessThan(0.02 * speed) // within 20 ms of the front
        expect(hit.at).toBeGreaterThan(FRONT_BIRTHS[index])
      })
    }
  })

  it('before the front: untouched; as it passes: disturbed (warmed, split, pushed); after: left a little more in order — never all at once', () => {
    const near = [...placed].sort((a, b) => Math.hypot(a.sx - contact.x, a.sy - contact.y) - Math.hypot(b.sx - contact.x, b.sy - contact.y)).slice(10, 60)
    for (const p of near) {
      const first = p.hits[0]
      expect(fragmentAt(p, first.at - 0.4, contact, view).heat).toBe(0)
      expect(frontsIn(p, first.at - 0.4, view).order).toBe(0)
      expect(fragmentAt(p, first.at, contact, view).heat).toBeCloseTo(first.strength, 6)
      // The order it is left with grows only after each passage, and only a little (the convergence does the rest).
      let last = 0
      for (let t = first.at - 0.4; t < p.start; t += 0.02) {
        const { order } = frontsIn(p, t, view)
        expect(order).toBeGreaterThanOrEqual(last - 1e-12)
        last = order
      }
      expect(last).toBeGreaterThan(0.02)
      expect(last).toBeLessThan(0.2)
      // …and it is the start of its way to the structure: just before it sets off it is nearer its dot than where it rested.
      if (p.converges) {
        const f = fragmentAt(p, p.start, contact, view)
        expect(Math.hypot(f.x - p.tx, f.y - p.ty)).toBeLessThan(Math.hypot(p.sx - p.tx, p.sy - p.ty))
      }
    }
    // Most are strongly disturbed by the first front.
    expect(near.filter((p) => p.hits[0].strength > 0.6).length).toBeGreaterThan(near.length / 3)
  })

  it('the reaction travels with the fronts: the farther from the contact, the later a piece is first disturbed — at the fronts’ own speed', () => {
    const speed = frontSpeed(view)
    const by = [...placed].sort((a, b) => Math.hypot(a.sx - contact.x, a.sy - contact.y) - Math.hypot(b.sx - contact.x, b.sy - contact.y))
    const mean = (list: typeof placed) => list.reduce((s, p) => s + p.hits[0].at, 0) / list.length
    expect(mean(by.slice(0, 40))).toBeLessThan(mean(by.slice(-40)) - 1)
    for (const p of placed) {
      const d = Math.hypot(p.sx - contact.x, p.sy - contact.y)
      expect(p.hits[0].at).toBeGreaterThan(BEATS.wave + (0.8 * d - 30) / speed)
      expect(p.hits[0].at).toBeLessThan(BEATS.wave + (1.25 * d + 40) / speed)
    }
  })

  it('is turned and stretched only while it is being drawn in, disturbed or carried: upright and unstretched at rest, never upside down', () => {
    for (const p of placed) {
      const rest = fragmentAt(p, 0.3, contact, view)
      expect(rest.stretch).toBeCloseTo(1, 5)
      expect(rest.angle).toBeCloseTo(0, 5)
      for (let t = 0; t < FRAGMENTS_END; t += 0.05) {
        const f = fragmentAt(p, t, contact, view)
        expect(Math.abs(f.angle)).toBeLessThanOrEqual(Math.PI / 2)
        expect(f.stretch).toBeGreaterThanOrEqual(1)
        expect(f.stretch).toBeLessThan(2.3)
      }
    }
    // …and while it flies it is lined up with its path.
    const flyer = placed.find((p) => p.converges && Math.hypot(p.tx - p.sx, p.ty - p.sy) > 150)!
    const mid = fragmentAt(flyer, flyer.start + flyer.dur / 2, contact, view)
    expect(mid.stretch).toBeGreaterThan(1.15)
    expect(Math.abs(mid.angle)).toBeGreaterThan(0.01)
  })

  it('the paths bend all the same way: a field that turns around the contact, not noise', () => {
    for (const p of placed) expect(p.bend).toBeGreaterThanOrEqual(0)
    const long = placed.filter((p) => p.converges && Math.hypot(p.tx - p.sx, p.ty - p.sy) > 120)
    expect(long.length).toBeGreaterThan(30)
    for (const p of long) expect(p.bend / Math.hypot(p.tx - p.sx, p.ty - p.sy)).toBeGreaterThan(0.09)
  })

  it('each one that becomes a dot travels toward it and arrives, handing over to the dot of the wordmark', () => {
    for (const p of placed.filter((q) => q.converges)) {
      const dist = (t: number) => {
        const f = fragmentAt(p, t, contact, view)
        return Math.hypot(f.x - p.tx, f.y - p.ty)
      }
      expect(dist(p.start + p.dur)).toBeLessThan(0.5)
      expect(dist(p.start + p.dur * 0.5)).toBeLessThan(dist(p.start) + 1)
      expect(fragmentAt(p, FRAGMENTS_END, contact, view).alpha).toBeLessThan(0.02)
      expect(fragmentAt(p, p.start + p.dur - 0.2, contact, view).alpha).toBeGreaterThan(0.3)
    }
  })

  it('the far pieces and the whole words do not become dots: they are drawn toward the contact and are gone before the structure is stable', () => {
    const rest = placed.filter((p) => !p.converges)
    expect(rest.length).toBeGreaterThan(placed.length * 0.2)
    for (const p of rest) {
      expect(p.layer === 'far' || p.word).toBe(true)
      const here = fragmentAt(p, p.start, contact, view)
      const there = fragmentAt(p, p.start + p.dur, contact, view)
      expect(Math.hypot(there.x - contact.x, there.y - contact.y)).toBeLessThan(Math.hypot(here.x - contact.x, here.y - contact.y) + 1)
      expect(fragmentAt(p, BEATS.stable + 0.1, contact, view).alpha).toBeLessThan(0.15)
      expect(fragmentAt(p, FRAGMENTS_END, contact, view).alpha).toBeLessThan(0.02)
    }
  })

  it('the converging pieces are still visible while they are on their way (so the flow can be followed)', () => {
    const going = placed.filter((p) => p.converges)
    const mid = going.map((p) => fragmentAt(p, p.start + p.dur * 0.5, contact, view))
    expect(mid.filter((f) => f.alpha > 0.4).length / going.length).toBeGreaterThan(0.8)
  })

  it('around the contact the glass bulges: a piece there swells while the wave leaves and settles back', () => {
    const near = [...placed].sort((a, b) => Math.hypot(a.sx - contact.x, a.sy - contact.y) - Math.hypot(b.sx - contact.x, b.sy - contact.y)).slice(0, 12)
    const peak = Math.max(...near.map((p) => fragmentAt(p, 0.7, contact, view).scale))
    const quiet = Math.max(...near.map((p) => fragmentAt(p, 0.2, contact, view).scale))
    expect(peak).toBeGreaterThan(quiet * 1.1)
  })

  it('stays within the screen throughout', () => {
    for (let t = 0; t <= FRAGMENTS_END; t += 0.05) {
      for (const p of placed) {
        const f = fragmentAt(p, t, contact, view)
        expect(f.x).toBeGreaterThan(-40)
        expect(f.x).toBeLessThan(view.w + 40)
        expect(f.y).toBeGreaterThan(-40)
        expect(f.y).toBeLessThan(view.h + 40)
        expect(Number.isFinite(f.x + f.y + f.alpha + f.scale + f.heat)).toBe(true)
      }
    }
  })

  it('alpha is always within 0..1, and the canvas outlasts the last arrival', () => {
    for (let t = 0; t <= FRAGMENTS_END; t += 0.1) for (const p of placed) expect(fragmentAt(p, t, contact, view).alpha).toBeLessThanOrEqual(1)
    expect(FRAGMENTS_END).toBeGreaterThan(BEATS.stable + 0.2)
  })
})
