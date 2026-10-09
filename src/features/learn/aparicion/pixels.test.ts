import { describe, expect, it } from 'vitest'
import { LEARN_THEMES } from '../atmosphere/themes'
import { contactPoint } from './geometry'
import { handGrid } from './hand'
import { SKY_SCALE, TEXTURE_SCALE, horizonOf, makePixels, paletteOf, type Pixels } from './pixels'

const scene = LEARN_THEMES['learn-sunset'].scene!
const view = { w: 390, h: 844 }
const contact = contactPoint(view)

const at = (px: Pixels, u: number, v: number) => {
  const i = (Math.floor(v * (px.h - 1)) * px.w + Math.floor(u * (px.w - 1))) * 4
  return [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]]
}
const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

describe('the glass’s light', () => {
  const haze = makePixels({ kind: 'haze', scene, view, contact })

  it('is a low-resolution buffer of the screen’s proportions, fully opaque', () => {
    expect(haze.w).toBe(Math.round(view.w * TEXTURE_SCALE))
    expect(haze.h).toBe(Math.round(view.h * TEXTURE_SCALE))
    expect(haze.data).toHaveLength(haze.w * haze.h * 4)
    for (let i = 3; i < haze.data.length; i += 4) expect(haze.data[i]).toBe(255)
  })

  it('is the same every time', () => {
    expect(makePixels({ kind: 'haze', scene, view, contact }).data).toEqual(haze.data)
  })

  it('is not flat: it has shadow and light, and the glare is where the finger lands', () => {
    let lo = 1
    let hi = 0
    for (let v = 0.05; v < 1; v += 0.1) for (let u = 0.05; u < 1; u += 0.1) {
      const l = lum(at(haze, u, v))
      lo = Math.min(lo, l)
      hi = Math.max(hi, l)
    }
    expect(hi - lo).toBeGreaterThan(0.3)
    const glare = lum(at(haze, contact.x / view.w, contact.y / view.h))
    const away = lum(at(haze, 0.24, 0.8))
    expect(glare).toBeGreaterThan(away)
  })

  it('is cool: gray-blue and sky, never a flat warm fill', () => {
    let blue = 0
    let n = 0
    for (let v = 0.05; v < 1; v += 0.05) for (let u = 0.05; u < 0.6; u += 0.05) {
      const [r, , b] = at(haze, u, v)
      if (b >= r) blue++
      n++
    }
    expect(blue / n).toBeGreaterThan(0.85)
  })
})

describe('the sky and the water', () => {
  const sky = makePixels({ kind: 'sky', scene, view, contact })
  const H = horizonOf(view)

  it('is finer than the glass, and as opaque', () => {
    expect(sky.w).toBe(Math.round(view.w * SKY_SCALE))
    expect(sky.data).toHaveLength(sky.w * sky.h * 4)
    expect(at(sky, 0.5, 0.5)[3]).toBe(255)
  })

  it('keeps the horizon below the phrase, which is centered with the wordmark', () => {
    expect(H).toBeGreaterThanOrEqual(0.7)
    expect(H * view.h).toBeGreaterThanOrEqual(view.h / 2 + 158 - 1e-6)
    expect(horizonOf({ w: 320, h: 568 })).toBeLessThan(1)
  })

  it('is quiet where the words are: the band behind the wordmark and the phrase is dark', () => {
    for (const u of [0.2, 0.4, 0.5, 0.6]) for (const v of [0.4, 0.48, 0.56]) expect(lum(at(sky, u, v)), `${u},${v}`).toBeLessThan(0.14)
  })

  it('is bright at the sun and red-orange at the right, and cool and dark at the left', () => {
    const sun = at(sky, contact.x / view.w, contact.y / view.h)
    expect(lum(sun)).toBeGreaterThan(0.55)
    const right = at(sky, 0.97, 0.3)
    expect(right[0]).toBeGreaterThan(right[2] + 60)
    const leftMass = at(sky, 0.04, 0.4)
    expect(lum(leftMass)).toBeLessThan(0.12)
  })

  it('has water below the horizon with the sun’s reflection brighter than the water beside it', () => {
    const v = H + (1 - H) * 0.35
    const reflection = lum(at(sky, contact.x / view.w, v))
    const beside = lum(at(sky, 0.1, v))
    expect(reflection).toBeGreaterThan(beside)
  })
})

describe('the hand', () => {
  const hand = makePixels({ kind: 'hand', scene })

  it('is a sprite of the field’s grid', () => {
    const { w, h } = handGrid()
    expect(hand.w).toBe(w)
    expect(hand.h).toBe(h)
    expect(hand.data).toHaveLength(w * h * 4)
  })

  it('is transparent around the hand and opaque in it', () => {
    let clear = 0
    let solid = 0
    for (let i = 3; i < hand.data.length; i += 4) {
      if (hand.data[i] === 0) clear++
      if (hand.data[i] === 255) solid++
    }
    expect(clear).toBeGreaterThan(hand.w * hand.h * 0.3)
    expect(solid).toBeGreaterThan(hand.w * hand.h * 0.15)
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
