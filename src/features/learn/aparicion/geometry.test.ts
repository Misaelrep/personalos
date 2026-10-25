import { describe, expect, it } from 'vitest'
import { glyph } from '../../../components/dot/glyphs'
import { WORDMARK } from '../domain/wordmark'
import { contactPoint, contentCenter, expectedWordmarkRect, wordmarkDots } from './geometry'

const VIEWS = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
]

describe('where the finger touches', () => {
  it('is right of center and clear above the wordmark’s band, at every size', () => {
    for (const view of VIEWS) {
      const c = contactPoint(view)
      const word = expectedWordmarkRect(view)
      expect(c.x, `${view.w}×${view.h}`).toBeGreaterThan(contentCenter(view))
      expect(c.x).toBeLessThan(view.w)
      expect(c.y).toBeGreaterThan(0)
      expect(c.y + 24, `${view.w}×${view.h}: contact ${c.y} vs wordmark ${word.top}`).toBeLessThan(word.top)
    }
  })

  it('the content is centered on the screen, or on what the side rail leaves on a large one', () => {
    expect(contentCenter({ w: 390, h: 844 })).toBe(195)
    expect(contentCenter({ w: 1280, h: 800 })).toBe(140 + (1280 - 140) / 2)
  })
})

describe('the dots the fragments go to', () => {
  it('are the lit dots of APRENDER, as DotWord builds them, inside the wordmark', () => {
    for (const view of VIEWS) {
      const rect = expectedWordmarkRect(view)
      const dots = wordmarkDots(rect)
      expect(dots.length).toBe([...WORDMARK].reduce((n, l) => n + glyph(l).filter((d) => d.on).length, 0))
      for (const d of dots) {
        expect(d.x).toBeGreaterThanOrEqual(rect.left)
        expect(d.x).toBeLessThanOrEqual(rect.left + rect.width)
        expect(d.y).toBeGreaterThanOrEqual(rect.top)
        expect(d.y).toBeLessThanOrEqual(rect.top + rect.height)
      }
    }
  })

  it('the wordmark fits the screen with its margin', () => {
    for (const view of VIEWS) {
      const rect = expectedWordmarkRect(view)
      expect(rect.left).toBeGreaterThanOrEqual(view.w >= 1024 ? 140 : 18)
      expect(rect.left + rect.width).toBeLessThanOrEqual(view.w - 18)
    }
  })
})
