import type { ClockTime } from './types'

export const MINUTES_PER_DAY = 24 * 60

export function toMinutes(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 605 → "10:05". Wraps past midnight. */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function formatRange(startMin: number, endMin: number): string {
  return `${formatClock(startMin)}–${formatClock(endMin)}`
}

/** 20 → "20 minutos", 120 → "2 h", 100 → "1 h 40 min". */
export function formatDuration(minutes: number, long = false): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return long ? `${m} minutos` : `${m} min`
  if (m === 0) return long ? `${h} ${h === 1 ? 'hora' : 'horas'}` : `${h} h`
  return `${h} h ${m} min`
}

/** Milliseconds → "01:53:42". Negative values are shown as overtime with a leading "+". */
export function formatTimer(ms: number): string {
  const over = ms < 0
  const s = Math.floor(Math.abs(ms) / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${over ? '+' : ''}${hh}:${mm}:${ss}`
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

export function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Absolute timestamp for a minutes-of-day value on the same local day as `ref`. */
export function atMinutes(ref: Date, minutes: number): number {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  return d.getTime() + minutes * 60_000
}

export function greeting(date: Date): string {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}
