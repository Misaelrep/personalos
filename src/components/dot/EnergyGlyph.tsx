import { m } from 'framer-motion'
import type { EnergyState } from '../../domain/types'
import { EASE } from '../../motion/tokens'

/**
 * Energy state as a five-point configuration — the dot system as a signature.
 *
 *   activación     points expanding outward
 *   focus          points converging on the center
 *   recuperación   soft, separated points
 *   producción     points ordered along a rising line
 *   cuerpo         a still, vertical column
 *   segundo pico   a slightly orbital arrangement
 *   cierre         points dissolving
 *
 * The same five points MORPH between states.
 */
export type Dot = { x: number; y: number; r: number; o: number }

export const ENERGY_CONFIG: Record<EnergyState, Dot[]> = {
  activacion: [
    { x: 8, y: 8, r: 1.7, o: 1 },
    { x: 2.5, y: 2.5, r: 1.1, o: 0.55 },
    { x: 13.5, y: 2.5, r: 1.1, o: 0.55 },
    { x: 2.5, y: 13.5, r: 1.1, o: 0.55 },
    { x: 13.5, y: 13.5, r: 1.1, o: 0.55 },
  ],
  focus: [
    { x: 8, y: 8, r: 2, o: 1 },
    { x: 8, y: 4, r: 1.15, o: 0.7 },
    { x: 12, y: 8, r: 1.15, o: 0.7 },
    { x: 8, y: 12, r: 1.15, o: 0.7 },
    { x: 4, y: 8, r: 1.15, o: 0.7 },
  ],
  recuperacion: [
    { x: 8, y: 7, r: 1.5, o: 0.9 },
    { x: 2.5, y: 9.5, r: 1.2, o: 0.45 },
    { x: 13.5, y: 9.5, r: 1.2, o: 0.45 },
    { x: 8, y: 7, r: 0.6, o: 0 },
    { x: 8, y: 7, r: 0.6, o: 0 },
  ],
  produccion: [
    { x: 8, y: 8, r: 1.5, o: 1 },
    { x: 2.5, y: 13.5, r: 1.1, o: 0.4 },
    { x: 5.25, y: 10.75, r: 1.2, o: 0.65 },
    { x: 10.75, y: 5.25, r: 1.2, o: 0.65 },
    { x: 13.5, y: 2.5, r: 1.1, o: 0.4 },
  ],
  cuerpo: [
    { x: 8, y: 8, r: 1.5, o: 1 },
    { x: 8, y: 2.5, r: 1.1, o: 0.4 },
    { x: 8, y: 5.25, r: 1.2, o: 0.65 },
    { x: 8, y: 10.75, r: 1.2, o: 0.65 },
    { x: 8, y: 13.5, r: 1.1, o: 0.4 },
  ],
  'segundo-pico': [
    { x: 8, y: 8, r: 1.6, o: 1 },
    { x: 8, y: 2.5, r: 1.05, o: 0.5 },
    { x: 13.2, y: 6.3, r: 1.45, o: 0.95 },
    { x: 11.2, y: 12.5, r: 1.05, o: 0.5 },
    { x: 3, y: 10.5, r: 1.05, o: 0.35 },
  ],
  cierre: [
    { x: 6, y: 7, r: 1.5, o: 0.9 },
    { x: 10, y: 5, r: 1.2, o: 0.6 },
    { x: 12.5, y: 9.5, r: 1, o: 0.38 },
    { x: 7.5, y: 11.5, r: 0.9, o: 0.25 },
    { x: 11, y: 13.5, r: 0.7, o: 0.12 },
  ],
}

export function EnergyGlyph({ energy, className = '' }: { energy: EnergyState; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-4 shrink-0 overflow-visible ${className}`}>
      {ENERGY_CONFIG[energy].map((d, i) => (
        <m.circle
          key={i}
          fill="currentColor"
          initial={false}
          animate={{ cx: d.x, cy: d.y, r: d.r, opacity: d.o }}
          transition={{ duration: 0.9, ease: EASE, delay: i * 0.04 }}
        />
      ))}
    </svg>
  )
}
