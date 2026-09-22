/**
 * DOT TYPOGRAPHY — letters built on a 5 × 7 modular matrix of points.
 * Our own construction: soft shoulders (corner points removed) so the
 * letters read round and quiet rather than LED-like.
 *
 * Tipografía convencional = información. Dot typography = estado / transición / identidad.
 */
export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7

const RAW: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
}

/** Words the system is designed to spell. */
export type DotWordName = 'FOCUS' | 'LEARN' | 'FLOW' | 'RESET' | 'DEEP'

export interface Dot {
  col: number
  row: number
  on: boolean
}

export function glyph(letter: string): Dot[] {
  const rows = RAW[letter]
  if (!rows) throw new Error(`Dot typography has no glyph for "${letter}"`)
  return rows.flatMap((line, row) => [...line].map((c, col) => ({ col, row, on: c === '1' })))
}
