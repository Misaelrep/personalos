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

/** A tone of the wordmark's dots and its share of them (0..1). */
export type MarkTone = readonly [color: string, share: number]

/**
 * The tone of the dot at `index` (its place among all the wordmark's dots, lit or not), when the dots are not all one color:
 * deterministic and evenly spread — the same dot always takes the same tone, on every screen and every entry.
 */
export function dotTone(index: number, tones: readonly MarkTone[]): string {
  const h = Math.abs(Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1
  let at = 0
  for (const [color, share] of tones) if (h < (at += share)) return color
  return tones[0][0]
}
