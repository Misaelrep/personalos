import { describe, expect, it } from 'vitest'
import { LEARN_THEMES } from '../atmosphere/themes'
import { contactPoint } from './geometry'
import { SLABS } from './optics'
import { DEPTH_SCALE, TEXTURE_SCALE, makePixels, paletteOf, wetFrom, wordsFrom, type Pixels } from './pixels'

const scene = LEARN_THEMES['learn-sunset'].scene!
const view = { w: 390, h: 844 }
const contact = contactPoint(view)

const at = (px: Pixels, u: number, v: number) => {
  const i = (Math.floor(v * (px.h - 1)) * px.w + Math.floor(u * (px.w - 1))) * 4
  return [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]]
}
const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

describe('the light glass', () => {
  const glass = makePixels({ kind: 'glass', scene, view, contact })

  it('is a low-resolution buffer of the screen’s proportions, fully opaque', () => {
    expect(glass.w).toBe(Math.round(view.w * TEXTURE_SCALE))
    expect(glass.h).toBe(Math.round(view.h * TEXTURE_SCALE))
    expect(glass.data).toHaveLength(glass.w * glass.h * 4)
    for (let i = 3; i < glass.data.length; i += 4) expect(glass.data[i]).toBe(255)
  })

  it('is the same every time', () => {
    expect(makePixels({ kind: 'glass', scene, view, contact }).data).toEqual(glass.data)
  })

  it('is not flat: it has shadow and light, and the light is caught where the finger lands', () => {
    let lo = 1
    let hi = 0
    for (let v = 0.05; v < 1; v += 0.1) for (let u = 0.05; u < 1; u += 0.1) {
      const l = lum(at(glass, u, v))
      lo = Math.min(lo, l)
      hi = Math.max(hi, l)
    }
    expect(hi - lo).toBeGreaterThan(0.3)
    expect(lum(at(glass, contact.x / view.w, contact.y / view.h))).toBeGreaterThan(lum(at(glass, 0.24, 0.8)))
  })

  it('is cool: gray-blue and sky across the plates that hold no red — never a flat warm fill', () => {
    let blue = 0
    let n = 0
    for (let v = 0.05; v < 1; v += 0.05) for (let u = 0.05; u < 0.8; u += 0.05) {
      const [r, , b] = at(glass, u, v)
      if (b >= r) blue++
      n++
    }
    expect(blue / n).toBeGreaterThan(0.85)
  })

  it('the plates bend what is behind them: across an edge the field jumps more than it does anywhere else', () => {
    const row = Math.floor(0.4 * (glass.h - 1))
    const step = (x: number) => Math.abs(lum(at(glass, (x + 1) / (glass.w - 1), row / (glass.h - 1))) - lum(at(glass, x / (glass.w - 1), row / (glass.h - 1))))
    const edgeCols = SLABS.flatMap((s) => [Math.round(s.u * glass.w), Math.round((s.u + s.w) * glass.w)]).filter((x) => x > 1 && x < glass.w - 2)
    let all = 0
    for (let x = 1; x < glass.w - 2; x++) all += step(x)
    all /= glass.w - 3
    let near = 0
    for (const x of edgeCols) near += Math.max(step(x - 1), step(x), step(x + 1))
    near /= edgeCols.length
    expect(near).toBeGreaterThan(all * 1.5)
  })
})

describe('the same glass, gone deep', () => {
  const depth = makePixels({ kind: 'depth', scene, view, contact })
  const wf = wetFrom(view)

  it('is finer than the light glass, and as opaque', () => {
    expect(depth.w).toBe(Math.round(view.w * DEPTH_SCALE))
    expect(depth.data).toHaveLength(depth.w * depth.h * 4)
    expect(at(depth, 0.5, 0.5)[3]).toBe(255)
  })

  it('keeps the wet below the phrase, which is centered with the wordmark', () => {
    expect(wf).toBeGreaterThanOrEqual(0.7)
    expect(wf * view.h).toBeGreaterThanOrEqual(view.h / 2 + 158 - 1e-6)
    expect(wetFrom({ w: 320, h: 568 })).toBeLessThan(1)
  })

  it('is quiet where the words are: the band behind the wordmark and the phrase is dark', () => {
    for (const u of [0.2, 0.4, 0.5, 0.6]) for (const v of [0.4, 0.48, 0.56]) expect(lum(at(depth, u, v)), `${u},${v}`).toBeLessThan(0.15)
  })

  it('keeps the whole block of words quiet, at every size of phone: the dots of the wordmark keep ≥ 4.5:1 over it, and the phrase’s ink ≥ 7:1 (strong) and ≥ 4.5:1 (medium), across the width the words use', () => {
    const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
    const L = (c: number[]) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const theme = LEARN_THEMES['learn-sunset']
    const mark = hex(theme.mark.color)
    const strong = hex(theme.stage!.strong)
    const medium = hex(theme.stage!.medium)
    for (const v of [{ w: 390, h: 844 }, { w: 320, h: 568 }, { w: 375, h: 667 }, { w: 320, h: 480 }]) {
      const px = makePixels({ kind: 'depth', scene, view: v, contact: contactPoint(v) })
      expect(wordsFrom(v)).toBeCloseTo(0.5 - 112 / v.h, 9)
      const wordmarkEnd = wordsFrom(v) + 50 / v.h
      for (let y = wordsFrom(v) + 0.005; y < wetFrom(v) - 0.03; y += 0.01) for (let u = 0.06; u < 0.86; u += 0.02) {
        const bg = L(at(px, u, y)) + 0.05
        const where = `${v.w}x${v.h} ${u.toFixed(2)},${y.toFixed(2)}`
        if (y < wordmarkEnd) expect((L(mark) + 0.05) / bg, `dots ${where}`).toBeGreaterThanOrEqual(4.5)
        else {
          expect((L(strong) + 0.05) / bg, `strong ${where}`).toBeGreaterThanOrEqual(7)
          expect((L(medium) + 0.05) / bg, `medium ${where}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('is a surface, not a place: nothing in it is a sun, and it has no horizon', () => {
    let max = 0
    for (let v = 0.02; v < 1; v += 0.02) for (let u = 0.02; u < 1; u += 0.02) max = Math.max(max, lum(at(depth, u, v)))
    // The brightest the deep glass gets is a slender light along a plate — never a white-hot disc.
    expect(max).toBeLessThan(0.66)
    expect(lum(at(depth, contact.x / view.w, contact.y / view.h))).toBeLessThan(0.55)
    // The mean light of a row changes gradually across where the wet begins: there is no line where one thing ends and another begins.
    const rowMean = (v: number) => {
      let s = 0
      let n = 0
      for (let u = 0.02; u < 1; u += 0.02) {
        s += lum(at(depth, u, v))
        n++
      }
      return s / n
    }
    for (let v = 0.3; v < 0.96; v += 0.02) expect(Math.abs(rowMean(v + 0.02) - rowMean(v)), `${v}`).toBeLessThan(0.05)
  })

  it('holds the red only along the plate that holds it; elsewhere it is cool and dark', () => {
    let warm = -255
    for (let v = 0.05; v < 0.9; v += 0.01) for (let u = 0.95; u < 0.995; u += 0.01) {
      const [r, , b] = at(depth, u, v)
      warm = Math.max(warm, r - b)
    }
    expect(warm).toBeGreaterThan(40)
    for (const [u, v] of [[0.04, 0.4], [0.2, 0.2], [0.4, 0.7], [0.62, 0.5]]) {
      const [r, , b] = at(depth, u, v)
      expect(b, `${u},${v}`).toBeGreaterThanOrEqual(r)
    }
  })

  it('is shaken by the wet below the phrase: the field wanders sideways there as it does not above', () => {
    const wander = (v0: number, v1: number) => {
      let s = 0
      let n = 0
      for (let v = v0; v < v1; v += 0.01) for (let u = 0.02; u < 0.98; u += 0.01) {
        s += Math.abs(lum(at(depth, u + 0.01, v)) - lum(at(depth, u, v)))
        n++
      }
      return s / n
    }
    expect(wander(wf + 0.08, 0.98)).toBeGreaterThan(wander(0.38, 0.56) * 1.2)
  })
})

describe('the finger', () => {
  const hand = makePixels({ kind: 'hand', scene, view, contact })

  it('is as big as the screen’s own texture, shaded where the glass can bend it', () => {
    expect(hand.w).toBe(Math.round(view.w * TEXTURE_SCALE))
    expect(hand.h).toBe(Math.round(view.h * TEXTURE_SCALE))
    expect(hand.data).toHaveLength(hand.w * hand.h * 4)
  })

  it('is a fragment: most of the screen is clear, a finger and its touch are not, and the rest of a hand is not there', () => {
    let clear = 0
    let solid = 0
    for (let i = 3; i < hand.data.length; i += 4) {
      if (hand.data[i] === 0) clear++
      if (hand.data[i] > 200) solid++
    }
    expect(clear).toBeGreaterThan(hand.w * hand.h * 0.8)
    expect(solid).toBeGreaterThan(hand.w * hand.h * 0.03)
    expect(solid).toBeLessThan(hand.w * hand.h * 0.1)
    // Where a palm and a thumb would be (below the finger, on the left, and at the right): nothing.
    for (const [u, v] of [[0.1, 0.8], [0.3, 0.7], [0.6, 0.6], [0.9, 0.9], [0.05, 0.95]]) expect(at(hand, u, v)[3], `${u},${v}`).toBe(0)
  })

  it('touches the glass at the point of contact, and the tip is pale', () => {
    const tip = at(hand, (contact.x - 8) / view.w, (contact.y + 4) / view.h)
    expect(tip[3]).toBeGreaterThan(200)
    expect(lum(tip)).toBeGreaterThan(0.7)
  })
})

describe('the palette', () => {
  it('turns the theme’s hex colors into numbers, all eighteen', () => {
    const p = paletteOf(scene)
    expect(Object.keys(p)).toHaveLength(18)
    expect(p.white).toEqual([255, 255, 255])
    for (const rgb of Object.values(p)) for (const n of rgb) expect(n).toBeGreaterThanOrEqual(0)
  })
})
