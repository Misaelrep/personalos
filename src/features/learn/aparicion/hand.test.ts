import { describe, expect, it } from 'vitest'
import { HAND_MIST, HAND_PARTS, handSample, handSdf, type HandColors } from './hand'

const colors: HandColors = {
  body: [20, 36, 56],
  cool: [60, 110, 150],
  white: [255, 255, 255],
  warm: [255, 140, 90],
  deepWarm: [255, 74, 40],
  glow: [244, 185, 160],
  nail: [234, 241, 249],
  mist: [210, 225, 240],
}

describe('the finger’s form', () => {
  it('is finite everywhere: inside the finger, outside it, and far away', () => {
    for (const [x, y] of [[0, 0], [-100, 10], [-300, 60], [500, 500], [-900, -900]]) expect(Number.isFinite(handSdf(x, y))).toBe(true)
  })

  it('has the fingertip at the origin, with a body behind it and nothing in front of it', () => {
    expect(handSdf(-4, 0)).toBeLessThan(0)
    expect(handSdf(-150, 14)).toBeLessThan(0)
    expect(handSdf(60, 0)).toBeGreaterThan(20)
    expect(handSdf(-4, -80)).toBeGreaterThan(40)
  })

  it('is an index finger and nothing else: no thumb, no folded fingers, no palm', () => {
    expect(Object.keys(HAND_PARTS)).toEqual(['index1', 'index2', 'index3'])
    expect(handSdf(-130, 90)).toBeGreaterThan(20) // where the thumb was
    expect(handSdf(-200, 130)).toBeGreaterThan(20) // the folded fingers
    expect(handSdf(-480, 128)).toBeGreaterThan(40) // the palm
  })
})

describe('the finger’s shading', () => {
  const at = (lx: number, ly: number) => handSample(lx, ly, colors, 2)

  it('is opaque inside the finger and clear outside it', () => {
    expect(at(-150, 14)[3]).toBe(255)
    expect(at(40, -100)[3]).toBe(0)
    expect(at(-130, 90)[3]).toBe(0)
  })

  it('goes into the mist at its far end: more transparent the farther it is, gone at the far mark', () => {
    const a = (lx: number) => at(lx, 28 + (lx + 240) * -0.2)[3]
    expect(a(HAND_MIST.near + 10)).toBeGreaterThan(200)
    expect(a(-270)).toBeLessThan(a(HAND_MIST.near + 10))
    expect(a(-310)).toBeLessThan(a(-270))
    expect(at(HAND_MIST.far - 5, 60)[3]).toBe(0)
  })

  it('is brightest at the tip, where the light is', () => {
    const tip = at(-8, 0)
    const body = at(-170, 18)
    expect(tip[0] + tip[1] + tip[2]).toBeGreaterThan(body[0] + body[1] + body[2] + 150)
  })

  it('is darker in the middle of the finger than at its edges: the middle is turned away, the edge catches the light', () => {
    const sum = (c: number[]) => c[0] + c[1] + c[2]
    expect(sum(at(-170, 18))).toBeLessThan(sum(at(-170, 18 - 28)))
  })
})
