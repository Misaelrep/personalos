import { describe, expect, it } from 'vitest'
import { FINGER_LENGTH, backPath, bodyPath, creasePath, halfWidth, padPath, spine } from './fingerShape'

describe('the shape of the fingertip', () => {
  it('is a finger and not a tube: narrow at the tip, wider toward the base, always positive', () => {
    expect(halfWidth(0)).toBeLessThan(halfWidth(FINGER_LENGTH))
    expect(halfWidth(FINGER_LENGTH) - halfWidth(0)).toBeGreaterThan(18)
    for (let d = 0; d <= FINGER_LENGTH; d += 4) expect(halfWidth(d)).toBeGreaterThan(15)
  })

  it('swells over the knuckles and narrows at the joints', () => {
    for (const joint of [205, 335]) {
      expect(halfWidth(joint - 26)).toBeGreaterThan(halfWidth(joint) + 4)
      expect(halfWidth(joint - 26)).toBeGreaterThan(halfWidth(joint - 90))
    }
  })

  it('the spine bends gently and keeps bending the same way', () => {
    expect(spine(0)).toBe(0)
    let last = 0
    for (let d = 10; d <= FINGER_LENGTH; d += 10) {
      expect(spine(d)).toBeGreaterThan(last)
      last = spine(d)
    }
    expect(spine(FINGER_LENGTH)).toBeLessThan(45)
  })

  it('draws one closed outline of finite numbers, with the tip at the right and the body to the left', () => {
    const d = bodyPath()
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    expect(nums.length).toBeGreaterThan(100)
    expect(nums.every(Number.isFinite)).toBe(true)
    const xs = nums.filter((_, i) => i % 2 === 0)
    expect(Math.max(...xs)).toBeGreaterThan(15)
    expect(Math.max(...xs)).toBeLessThan(25)
    expect(Math.min(...xs)).toBeLessThan(-FINGER_LENGTH + 20)
  })

  it('the back, the pad and the creases lie along it', () => {
    for (const d of [backPath(40, 330, 0.5), padPath(180), creasePath(200)]) expect(d.startsWith('M ')).toBe(true)
    expect(padPath(180).split(' L ').length).toBeGreaterThan(10)
  })
})
