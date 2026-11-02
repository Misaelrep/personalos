import type { Estimate, EstimatePeriod, SourceRefs } from './types'

/**
 * Mechanical readings of a dossier's literal text. Each keeps the literal and
 * adds only what the text says plainly; anything else is left undefined —
 * never guessed.
 */

const PERIODS: [RegExp, EstimatePeriod][] = [
  [/\/\s*sem(ana)?\b|por semana/i, 'semana'],
  [/revisi[oó]n/i, 'revision'],
  [/sesi[oó]n/i, 'sesion'],
]

/**
 * "20–35 min" → 20..35 · "1 h" → 60..60 · "15–25 min/sem" → per week ·
 * "30–60 min sesión" → per session. Unreadable text keeps only its literal.
 */
export function parseEstimate(literal: string): Estimate {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:[–—-]\s*(\d+(?:[.,]\d+)?))?\s*(min|minutos?|h|horas?)\b(.*)$/i.exec(literal)
  if (!m) return { literal }
  const unit = m[3].toLowerCase().startsWith('h') ? 60 : 1
  const num = (s: string) => Math.round(Number(s.replace(',', '.')) * unit)
  const min = num(m[1])
  const max = m[2] !== undefined ? num(m[2]) : min
  if (!(min >= 0) || !(max >= min)) return { literal }
  const per = PERIODS.find(([re]) => re.test(m[4]))?.[1]
  return { literal, minMinutes: min, maxMinutes: max, ...(per ? { per } : {}) }
}

/** "F2 §9.14; F4" → keys F2, F4 (in order, once each). The literal is kept whole. */
export function parseSourceRefs(literal: string, pattern = /\bF\d+\b/g): SourceRefs {
  return { literal, keys: [...new Set(literal.match(pattern) ?? [])] }
}
