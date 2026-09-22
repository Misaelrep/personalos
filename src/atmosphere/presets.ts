import type { EnergyState } from '../domain/types'

/**
 * LA ESTRUCTURA PERMANECE ESTABLE. LA ATMÓSFERA EVOLUCIONA.
 *
 * Each preset only changes light: base color, the four Astral Fade halos,
 * particle tint and a small accent. Layout never depends on the preset.
 */
export type Tone = 'light' | 'deep'

export interface AtmospherePreset {
  tone: Tone
  base: string
  /** Halo colors: [main light source, counter light, low accent, crossing beam]. */
  halos: [string, string, string, string]
  particle: string
  accent: string
}

export type AtmosphereKey = EnergyState | 'focus-session' | 'exhale'

export const PRESETS: Record<AtmosphereKey, AtmospherePreset> = {
  // blanco + azul frío
  activacion: {
    tone: 'light',
    base: '#F7F9FC',
    halos: ['rgba(105,165,255,0.34)', 'rgba(186,214,255,0.40)', 'rgba(255,216,183,0.20)', 'rgba(234,242,255,0.85)'],
    particle: 'rgba(58,130,246,0.55)',
    accent: '#3A82F6',
  },
  // azul profundo + azul eléctrico (en HOY se mantiene claro, con luz más intensa)
  focus: {
    tone: 'light',
    base: '#F4F7FC',
    halos: ['rgba(58,130,246,0.30)', 'rgba(16,39,70,0.10)', 'rgba(105,165,255,0.30)', 'rgba(210,228,255,0.80)'],
    particle: 'rgba(58,130,246,0.6)',
    accent: '#3A82F6',
  },
  // blanco + lavanda
  recuperacion: {
    tone: 'light',
    base: '#F9F8FD',
    halos: ['rgba(167,139,250,0.24)', 'rgba(220,210,255,0.45)', 'rgba(105,165,255,0.14)', 'rgba(244,240,255,0.9)'],
    particle: 'rgba(167,139,250,0.6)',
    accent: '#8B6CF0',
  },
  // blanco + azul limpio
  produccion: {
    tone: 'light',
    base: '#F7F9FC',
    halos: ['rgba(58,130,246,0.22)', 'rgba(105,165,255,0.26)', 'rgba(255,216,183,0.14)', 'rgba(234,242,255,0.9)'],
    particle: 'rgba(58,130,246,0.5)',
    accent: '#3A82F6',
  },
  // muy neutro / limpio
  cuerpo: {
    tone: 'light',
    base: '#F7F8FA',
    halos: ['rgba(112,128,154,0.14)', 'rgba(220,228,240,0.55)', 'rgba(105,165,255,0.10)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(112,128,154,0.5)',
    accent: '#5B6F8F',
  },
  // azul + violeta
  'segundo-pico': {
    tone: 'light',
    base: '#F6F7FD',
    halos: ['rgba(58,130,246,0.26)', 'rgba(167,139,250,0.30)', 'rgba(105,165,255,0.18)', 'rgba(236,232,255,0.85)'],
    particle: 'rgba(124,108,246,0.6)',
    accent: '#5B6CF0',
  },
  // azul profundo + naranja cálido extremadamente tenue
  cierre: {
    tone: 'deep',
    base: '#081A32',
    halos: ['rgba(58,130,246,0.22)', 'rgba(16,39,70,0.90)', 'rgba(255,147,77,0.10)', 'rgba(105,165,255,0.08)'],
    particle: 'rgba(255,216,183,0.55)',
    accent: '#FFB787',
  },
  // Focus activo: la atmósfera más profunda del sistema.
  'focus-session': {
    tone: 'deep',
    base: '#071629',
    halos: ['rgba(58,130,246,0.36)', 'rgba(16,39,70,0.85)', 'rgba(105,165,255,0.18)', 'rgba(58,130,246,0.10)'],
    particle: 'rgba(156,195,255,0.85)',
    accent: '#69A5FF',
  },
  // Salida de Focus: exhalación, luz clara y abierta.
  exhale: {
    tone: 'light',
    base: '#F7F9FC',
    halos: ['rgba(105,165,255,0.26)', 'rgba(167,139,250,0.20)', 'rgba(255,216,183,0.16)', 'rgba(255,255,255,0.9)'],
    particle: 'rgba(105,165,255,0.55)',
    accent: '#3A82F6',
  },
}
