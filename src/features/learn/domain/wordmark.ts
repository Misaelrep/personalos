/**
 * The APRENDER wordmark in the dot system of FOCUS: eight letters on the same
 * 5 × 7 matrix, two columns between letters (the construction DotWord uses).
 */
export const WORDMARK = 'APRENDER'

const GLYPH_COLS = 5
const LETTER_GAP = 2
const SIDE_PAD = 20
const MAX_PITCH = 15

export const WORDMARK_COLS = WORDMARK.length * GLYPH_COLS + (WORDMARK.length - 1) * LETTER_GAP

/**
 * Distance between dot centers, in px, so the whole word fits the viewport
 * with a side margin. At 320 px it is ≈ 5.2 px (a 3.3 px dot): the smallest
 * size at which the word was checked to read clearly on a phone.
 */
export function wordmarkPitch(viewportWidth: number): number {
  return Math.min(MAX_PITCH, (viewportWidth - SIDE_PAD * 2) / WORDMARK_COLS)
}
