import { GLYPH_COLS, glyph } from '../../../components/dot/glyphs'
import { WORDMARK, WORDMARK_COLS, wordmarkPitch } from '../domain/wordmark'
import type { Point, View } from './fragments'

const LETTER_GAP = 2
const RAIL = 140

/** The horizontal middle of the content: on a large screen the side rail takes its share. */
export function contentCenter(view: View): number {
  return view.w >= 1024 ? RAIL + (view.w - RAIL) / 2 : view.w / 2
}

/**
 * The point where the finger touches the glass: right of center and above the
 * wordmark's band, so that the contact is read before — and never under — the word.
 */
export function contactPoint(view: View): Point {
  const wordmarkWidth = WORDMARK_COLS * wordmarkPitch(view.w)
  return {
    x: contentCenter(view) + wordmarkWidth * 0.18,
    y: Math.max(view.h * 0.14, view.h / 2 - 190),
  }
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** The lit dots of the wordmark, as DotWord builds them, in the page's coordinates. */
export function wordmarkDots(rect: Rect): Point[] {
  const pitch = rect.width / WORDMARK_COLS
  return [...WORDMARK].flatMap((letter, li) =>
    glyph(letter)
      .filter((d) => d.on)
      .map((d) => ({
        x: rect.left + (d.col + li * (GLYPH_COLS + LETTER_GAP)) * pitch + pitch / 2,
        y: rect.top + d.row * pitch + pitch / 2,
      })),
  )
}

/** Before the wordmark is measured: where it will be, with the same width rule and centered on the view. */
export function expectedWordmarkRect(view: View): Rect {
  const pitch = wordmarkPitch(view.w)
  const width = WORDMARK_COLS * pitch
  const height = 7 * pitch
  return { left: contentCenter(view) - width / 2, top: view.h * 0.42 - height / 2, width, height }
}
