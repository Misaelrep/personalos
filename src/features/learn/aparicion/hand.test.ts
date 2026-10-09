import { describe, expect, it } from 'vitest'
import { HAND_BOX, HAND_PARTS, HAND_RES, HAND_TIP, handField, handGrid, handSdf, shadeHand, type HandColors } from './hand'

const colors: HandColors = {
  body: [20, 36, 56],
  cool: [60, 110, 150],
  white: [255, 255, 255],
  warm: [255, 140, 90],
  deepWarm: [255, 74, 40],
  glow: [244, 185, 160],
  nail: [234, 241, 249],
}

describe('the hand’s form', () => {
  it('is finite everywhere: inside the index, outside the hand, and far away', () => {
    for (const [x, y] of [[0, 0], [-100, 10], [-300, 60], [500, 500], [-900, -900]]) expect(Number.isFinite(handSdf(x, y))).toBe(true)
  })

  it('has the index fingertip at the origin, with a body behind it and nothing in front of it', () => {
    expect(handSdf(-4, 0)).toBeLessThan(0)
    expect(handSdf(-150, 14)).toBeLessThan(0)
    expect(handSdf(60, 0)).toBeGreaterThan(20)
    expect(handSdf(-4, -80)).toBeGreaterThan(40)
  })

  it('keeps the thumb apart from the index: the gap between them is open', () => {
    expect(handSdf(-130, 90)).toBeGreaterThan(0)
  })

  it('fits in its box, with room for the glare beyond the tip', () => {
    for (const [ax, ay, ar, bx, by, br] of Object.values(HAND_PARTS)) {
      for (const [x, y, r] of [[ax, ay, ar], [bx, by, br]]) {
        expect(HAND_TIP.x + x - r).toBeGreaterThanOrEqual(-80)
        expect(HAND_TIP.y + y + r).toBeLessThanOrEqual(HAND_BOX.height + 10)
        expect(HAND_TIP.y + y - r).toBeGreaterThanOrEqual(0)
      }
    }
    expect(HAND_BOX.width - HAND_TIP.x).toBeGreaterThanOrEqual(30)
  })
})

describe('the hand’s shading', () => {
  const field = handField()
  const px = shadeHand(field, colors)
  const { w, h } = handGrid()
  const at = (lx: number, ly: number) => {
    const gx = Math.round((HAND_TIP.x + lx) * HAND_RES)
    const gy = Math.round((HAND_TIP.y + ly) * HAND_RES)
    const i = (gy * w + gx) * 4
    return [px[i], px[i + 1], px[i + 2], px[i + 3]]
  }

  it('has one pixel per cell of the grid', () => {
    expect(px).toHaveLength(w * h * 4)
  })

  it('is opaque inside the hand and clear outside it', () => {
    expect(at(-150, 14)[3]).toBe(255)
    expect(at(-300, 60)[3]).toBe(255)
    expect(at(40, -100)[3]).toBe(0)
  })

  it('is brightest at the tip, where the light is', () => {
    const tip = at(-8, 0)
    const body = at(-300, 60)
    expect(tip[0] + tip[1] + tip[2]).toBeGreaterThan(body[0] + body[1] + body[2] + 200)
  })

  it('is darker in the body than at its edges: the middle is turned away, the edge catches the light', () => {
    const sum = (c: number[]) => c[0] + c[1] + c[2]
    expect(sum(at(-330, 60))).toBeLessThan(sum(at(-330, 60 - 36)))
  })
})
